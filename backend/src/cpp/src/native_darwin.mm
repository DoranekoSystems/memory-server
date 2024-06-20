#include <Foundation/Foundation.h>
#include <errno.h>
#include <mach-o/dyld_images.h>
#include <mach/mach.h>
#include <mach/vm_map.h>
#include <mach/vm_region.h>
#include <stdio.h>
#include <stdlib.h>
#include <sys/queue.h>
#include <sys/sysctl.h>

typedef struct {
  int pid;
  char *processname;
} ProcessInfo;

extern "C" kern_return_t mach_vm_read_overwrite(vm_map_t, mach_vm_address_t,
                                                mach_vm_size_t,
                                                mach_vm_address_t,
                                                mach_vm_size_t *);

extern "C" kern_return_t mach_vm_write(vm_map_t, mach_vm_address_t, vm_offset_t,
                                       mach_msg_type_number_t);

extern "C" kern_return_t mach_vm_protect(vm_map_t, mach_vm_address_t,
                                         mach_vm_size_t, boolean_t, vm_prot_t);

extern "C" kern_return_t mach_vm_region(vm_map_t, mach_vm_address_t *,
                                        mach_vm_size_t *, vm_region_flavor_t,
                                        vm_region_info_t,
                                        mach_msg_type_number_t *,
                                        mach_port_t *);

int debug_log(const char *format, ...) {
  va_list list;
  va_start(list, format);
  NSString *originalFormatString = [NSString stringWithUTF8String:format];
  NSString *taggedFormatString =
      [NSString stringWithFormat:@"[MEMORYSERVER] %@", originalFormatString];

  NSLogv(taggedFormatString, list);
  va_end(list);
  return 0;
}

extern "C" pid_t get_pid_native() { return getpid(); }

extern "C" ssize_t read_memory_native(int pid, mach_vm_address_t address,
                                      mach_vm_size_t size,
                                      unsigned char *buffer) {
  mach_port_t task;
  kern_return_t kr;
  if (pid == getpid()) {
    task = mach_task_self();
  } else {
    kr = task_for_pid(mach_task_self(), pid, &task);
    if (kr != KERN_SUCCESS) {
      return -1;
    }
  }

  mach_vm_size_t out_size;
  kr = mach_vm_read_overwrite(task, address, size, (mach_vm_address_t)buffer,
                              &out_size);
  if (kr != KERN_SUCCESS) {
    return -1;
  }

  return (ssize_t)out_size;
}

extern "C" ssize_t write_memory_native(int pid, mach_vm_address_t address,
                                       mach_vm_size_t size,
                                       unsigned char *buffer) {
  task_t task;
  kern_return_t err;
  vm_prot_t original_protection;
  vm_region_basic_info_data_64_t info;
  mach_msg_type_number_t info_count = VM_REGION_BASIC_INFO_COUNT_64;
  mach_port_t object_name;

  if (pid == getpid()) {
    task = mach_task_self();
  } else {
    err = task_for_pid(mach_task_self(), pid, &task);
    if (err != KERN_SUCCESS) {
      debug_log("Error: task_for_pid failed with error %d (%s)\n", err,
                mach_error_string(err));
      return -1;
    }
  }

  task_suspend(task);

  mach_vm_address_t region_address = address;
  mach_vm_size_t region_size = size;
  // Get the current protection
  err = mach_vm_region(task, &region_address, &region_size,
                       VM_REGION_BASIC_INFO_64, (vm_region_info_t)&info,
                       &info_count, &object_name);
  if (err != KERN_SUCCESS) {
    debug_log("Error: mach_vm_region failed with error %d (%s) at address "
              "0x%llx, size 0x%llx\n",
              err, mach_error_string(err), address, size);
    task_resume(task);
    return -1;
  }
  original_protection = info.protection;

  // Change the memory protection to allow writing
  err =
      mach_vm_protect(task, address, size, false, VM_PROT_READ | VM_PROT_WRITE);
  if (err != KERN_SUCCESS) {
    debug_log(
        "Error: mach_vm_protect (write enable) failed with error %d (%s)\n",
        err, mach_error_string(err));
    task_resume(task);
    return -1;
  }

  // Write to memory
  err = mach_vm_write(task, address, (vm_offset_t)buffer, size);
  if (err != KERN_SUCCESS) {
    debug_log("Error: mach_vm_write failed with error %d (%s) at address "
              "0x%llx, size 0x%llx\n",
              err, mach_error_string(err), address, size);
    mach_vm_protect(task, address, size, false,
                    original_protection); // Attempt to restore protection
    task_resume(task);
    return -1;
  }

  // Reset the memory protection
  err = mach_vm_protect(task, address, size, false, original_protection);
  if (err != KERN_SUCCESS) {
    debug_log("Warning: mach_vm_protect (restore protection) failed with error "
              "%d (%s)\n",
              err, mach_error_string(err));
    task_resume(task);
    return -1;
  }

  task_resume(task);
  return size;
}

extern "C" void enumerate_regions_to_buffer(pid_t pid, char *buffer,
                                            size_t buffer_size) {

  task_t task;
  kern_return_t err;
  vm_address_t address = 0;
  vm_size_t size = 0;
  natural_t depth = 1;

  if (pid == getpid()) {
    task = mach_task_self();
  } else {
    err = task_for_pid(mach_task_self(), pid, &task);
    if (err != KERN_SUCCESS) {
      snprintf(buffer, buffer_size, "Failed to get task for pid %d\n", pid);
      return;
    }
  }

  size_t pos = 0;
  while (true) {
    vm_region_submap_info_data_64_t info;
    mach_msg_type_number_t info_count = VM_REGION_SUBMAP_INFO_COUNT_64;

    if (vm_region_recurse_64(task, &address, &size, &depth,
                             (vm_region_info_t)&info,
                             &info_count) != KERN_SUCCESS) {
      break;
    }

    if (info.is_submap) {
      depth++;
    } else {
      char protection[4] = "---";
      if (info.protection & VM_PROT_READ)
        protection[0] = 'r';
      if (info.protection & VM_PROT_WRITE)
        protection[1] = 'w';
      if (info.protection & VM_PROT_EXECUTE)
        protection[2] = 'x';

      pos += snprintf(buffer + pos, buffer_size - pos, "%llx-%llx %s\n",
                      (unsigned long long)address,
                      (unsigned long long)(address + size), protection);

      if (pos >= buffer_size - 1)
        break;

      address += size;
    }
  }
}

extern "C" ProcessInfo *enumprocess_native(size_t *count) {
  int err;
  struct kinfo_proc *result;
  bool done;
  static const int name[] = {CTL_KERN, KERN_PROC, KERN_PROC_ALL, 0};
  size_t length;

  result = NULL;
  done = false;

  do {
    length = 0;
    err = sysctl((int *)name, (sizeof(name) / sizeof(*name)) - 1, NULL, &length,
                 NULL, 0);
    if (err == -1) {
      err = errno;
    }

    if (err == 0) {
      result = (struct kinfo_proc *)malloc(length);
      if (result == NULL) {
        err = ENOMEM;
      }
    }

    if (err == 0) {
      err = sysctl((int *)name, (sizeof(name) / sizeof(*name)) - 1, result,
                   &length, NULL, 0);
      if (err == -1) {
        err = errno;
      }
      if (err == 0) {
        done = true;
      } else if (err == ENOMEM) {
        free(result);
        result = NULL;
        err = 0;
      }
    }
  } while (err == 0 && !done);

  if (err == 0 && result != NULL) {
    *count = length / sizeof(struct kinfo_proc);
    ProcessInfo *processes =
        (ProcessInfo *)malloc(*count * sizeof(ProcessInfo));

    for (size_t i = 0; i < *count; i++) {
      processes[i].pid = result[i].kp_proc.p_pid;
      processes[i].processname = strdup(result[i].kp_proc.p_comm);
    }

    free(result);
    return processes;
  } else {
    if (result != NULL) {
      free(result);
    }
  }
}