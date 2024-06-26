#include <cstdio>
#include <cstring>
#include <dirent.h>
#include <dlfcn.h>
#include <errno.h>
#include <fstream>
#include <iostream>
#include <stdio.h>
#include <stdlib.h>
#include <sys/mman.h>
#include <sys/ptrace.h>
#include <sys/queue.h>
#include <sys/uio.h>
#include <sys/wait.h>
#include <unistd.h>

typedef struct {
  int pid;
  char *processname;
} ProcessInfo;

#ifdef TARGET_IS_ANDROID
typedef ssize_t (*process_vm_readv_func)(pid_t, const struct iovec *,
                                         unsigned long, const struct iovec *,
                                         unsigned long, unsigned long);
typedef ssize_t (*process_vm_writev_func)(pid_t, const struct iovec *,
                                          unsigned long, const struct iovec *,
                                          unsigned long, unsigned long);
static process_vm_readv_func PROCESS_VM_READV = nullptr;
static process_vm_writev_func PROCESS_VM_WRITEV = nullptr;

#endif

extern "C" pid_t get_pid_native() { return getpid(); }

extern "C" ssize_t read_memory_native(int pid, uintptr_t address, size_t size,
                                      unsigned char *buffer) {
#ifdef TARGET_IS_ANDROID
  if (!PROCESS_VM_READV) {
    void *handle = dlopen("libc.so", RTLD_NOW);
    if (!handle) {
      return -1;
    }

    PROCESS_VM_READV = (process_vm_readv_func)dlsym(handle, "process_vm_readv");
    if (!PROCESS_VM_READV) {
      dlclose(handle);
      return -1;
    }
  }

  struct iovec local_iov;
  struct iovec remote_iov;

  local_iov.iov_base = buffer;
  local_iov.iov_len = size;
  remote_iov.iov_base = reinterpret_cast<void *>(address);
  remote_iov.iov_len = size;

  ssize_t nread = PROCESS_VM_READV(pid, &local_iov, 1, &remote_iov, 1, 0);
#else
  struct iovec local_iov;
  struct iovec remote_iov;

  local_iov.iov_base = buffer;
  local_iov.iov_len = size;
  remote_iov.iov_base = reinterpret_cast<void *>(address);
  remote_iov.iov_len = size;

  ssize_t nread = process_vm_readv(pid, &local_iov, 1, &remote_iov, 1, 0);
#endif

  if (nread < 0) {
    return -errno;
  }

  return nread;
}

extern "C" ssize_t write_memory_native(int pid, void *address, size_t size,
                                       unsigned char *buffer) {
  if (pid == get_pid_native()) {
#ifdef TARGET_IS_ANDROID
    if (!PROCESS_VM_WRITEV) {
      void *handle = dlopen("libc.so", RTLD_NOW);
      if (!handle) {
        return -1;
      }

      PROCESS_VM_WRITEV =
          (process_vm_writev_func)dlsym(handle, "process_vm_writev");
    }
#endif
    // Writing to own process
    // Calculate the start and end addresses for memory protection
    uintptr_t start = reinterpret_cast<uintptr_t>(address);
    uintptr_t end = start + size;
    uintptr_t page_size = getpagesize();
    uintptr_t page_start = start & ~(page_size - 1);
    uintptr_t page_end = (end + page_size - 1) & ~(page_size - 1);
    size_t protected_size = page_end - page_start;

    // Change memory protection attributes
    int result = mprotect(reinterpret_cast<void *>(page_start), protected_size,
                          PROT_READ | PROT_WRITE | PROT_EXEC);
    if (result != 0) {
      perror("mprotect");
      return -1;
    }

    // Set up the iovec structures
    iovec local_iov;
    local_iov.iov_base = buffer;
    local_iov.iov_len = size;

    iovec remote_iov;
    remote_iov.iov_base = address;
    remote_iov.iov_len = size;

    // Write to memory
#ifdef TARGET_IS_ANDROID
    ssize_t written = PROCESS_VM_WRITEV(pid, &local_iov, 1, &remote_iov, 1, 0);
#else
    ssize_t written = process_vm_writev(pid, &local_iov, 1, &remote_iov, 1, 0);
#endif
    if (written == -1) {
      perror("process_vm_writev");
      // mprotect(reinterpret_cast<void *>(page_start), protected_size,
      // PROT_READ | PROT_EXEC);
      return -1;
    }

    // Restore memory protection attributes
    /* result = mprotect(reinterpret_cast<void *>(page_start), protected_size,
    PROT_READ | PROT_EXEC); if (result != 0) { perror("mprotect"); return -1;
    } */

    return written;
  } else {
    // Writing to another process
    // Attach to the process
    ptrace(PTRACE_ATTACH, pid, NULL, NULL);
    waitpid(pid, NULL, 0);

    // Write to the process's memory
    for (int i = 0; i < size; i += sizeof(long)) {
      if (size - i < sizeof(long)) {
        // Read the original memory
        long orig = ptrace(PTRACE_PEEKDATA, pid,
                           reinterpret_cast<char *>(address) + i, NULL);
        if (errno != 0) {
          perror("ptrace");
          ptrace(PTRACE_DETACH, pid, NULL, NULL);
          return -1;
        }

        // Prepare the data to be written
        std::memcpy(&orig, reinterpret_cast<char *>(buffer) + i, size - i);

        // Write the data to the process's memory
        ptrace(PTRACE_POKEDATA, pid, reinterpret_cast<char *>(address) + i,
               orig);
        if (errno != 0) {
          perror("ptrace");
          ptrace(PTRACE_DETACH, pid, NULL, NULL);
          return -1;
        }
      } else {
        long data;
        std::memcpy(&data, reinterpret_cast<char *>(buffer) + i, sizeof(long));
        ptrace(PTRACE_POKEDATA, pid, reinterpret_cast<char *>(address) + i,
               data);
        if (errno != 0) {
          perror("ptrace");
          ptrace(PTRACE_DETACH, pid, NULL, NULL);
          return -1;
        }
      }
    }
    // Detach from the process
    ptrace(PTRACE_DETACH, pid, NULL, NULL);
    if (errno != 0) {
      perror("ptrace");
      return -1;
    }
    return size;
  }
}

extern "C" void enumerate_regions_to_buffer(pid_t pid, char *buffer,
                                            size_t buffer_size) {
  char maps_file_path[64];
  snprintf(maps_file_path, sizeof(maps_file_path), "/proc/%d/maps", pid);

  std::ifstream maps_file(maps_file_path);
  if (!maps_file.is_open()) {
    snprintf(buffer, buffer_size, "Failed to open file: %s", maps_file_path);
    return;
  }

  size_t buffer_index = 0;
  std::string line;
  while (getline(maps_file, line) &&
         (buffer_index + line.length() + 1) < buffer_size) {
    size_t line_length = line.length();
    memcpy(buffer + buffer_index, line.c_str(), line_length);
    buffer_index += line_length;
    buffer[buffer_index++] = '\n';
  }

  // Null-terminate the buffer
  buffer[buffer_index] = '\0';
}

extern "C" ProcessInfo *enumprocess_native(size_t *count) {
  DIR *proc_dir = opendir("/proc");
  if (!proc_dir) {
    return nullptr;
  }

  ProcessInfo *processes = nullptr;
  *count = 0;

  struct dirent *entry;
  while ((entry = readdir(proc_dir)) != nullptr) {
    int pid = atoi(entry->d_name);
    if (pid > 0) {
      char comm_path[256];
      snprintf(comm_path, sizeof(comm_path), "/proc/%d/comm", pid);

      std::ifstream comm_file(comm_path);
      if (comm_file.is_open()) {
        ProcessInfo process;
        process.pid = pid;

        std::string processname;
        std::getline(comm_file, processname);

        size_t len = processname.length();
        process.processname = static_cast<char *>(malloc(len + 1));
        memcpy(process.processname, processname.c_str(), len);
        process.processname[len] = '\0';

        processes = static_cast<ProcessInfo *>(
            realloc(processes, (*count + 1) * sizeof(ProcessInfo)));
        processes[*count] = process;
        (*count)++;
      }
    }
  }

  closedir(proc_dir);
  return processes;
}

extern "C" bool suspend_process(pid_t pid) { return false; }
extern "C" bool resume_process(pid_t pid) { return false; }