#include <Foundation/Foundation.h>
#include <dlfcn.h>
#include <errno.h>
#include <mach-o/dyld_images.h>
#include <mach-o/fat.h>
#include <mach-o/loader.h>
#include <mach/mach.h>
#include <mach/task.h>
#include <mach/vm_map.h>
#include <mach/vm_region.h>
#include <stdio.h>
#include <stdlib.h>
#include <sys/queue.h>
#include <sys/sysctl.h>
#include <iostream>
#include <string>
#include <vector>

typedef struct
{
    int pid;
    const char *processname;
} ProcessInfo;

typedef struct
{
    uintptr_t base;
    int size;
    bool is_64bit;
    char *modulename;
} ModuleInfo;

extern "C" kern_return_t mach_vm_read_overwrite(vm_map_t, mach_vm_address_t, mach_vm_size_t,
                                                mach_vm_address_t, mach_vm_size_t *);

extern "C" kern_return_t mach_vm_write(vm_map_t, mach_vm_address_t, vm_offset_t,
                                       mach_msg_type_number_t);

extern "C" kern_return_t mach_vm_protect(vm_map_t, mach_vm_address_t, mach_vm_size_t, boolean_t,
                                         vm_prot_t);

extern "C" kern_return_t mach_vm_region(vm_map_t, mach_vm_address_t *, mach_vm_size_t *,
                                        vm_region_flavor_t, vm_region_info_t,
                                        mach_msg_type_number_t *, mach_port_t *);

typedef int (*PROC_REGIONFILENAME)(int pid, uint64_t address, void *buffer, uint32_t buffersize);
PROC_REGIONFILENAME proc_regionfilename = nullptr;

int debug_log(const char *format, ...)
{
    va_list list;
    va_start(list, format);
    NSString *originalFormatString = [NSString stringWithUTF8String:format];
    NSString *taggedFormatString =
        [NSString stringWithFormat:@"[MEMORYSERVER] %@", originalFormatString];

    NSLogv(taggedFormatString, list);
    va_end(list);
    return 0;
}

extern "C" pid_t get_pid_native()
{
    return getpid();
}

extern "C" ssize_t read_memory_native(int pid, mach_vm_address_t address, mach_vm_size_t size,
                                      unsigned char *buffer)
{
    mach_port_t task;
    kern_return_t kr;
    if (pid == getpid())
    {
        task = mach_task_self();
    }
    else
    {
        kr = task_for_pid(mach_task_self(), pid, &task);
        if (kr != KERN_SUCCESS)
        {
            debug_log("Error: task_for_pid failed with error %d (%s)\n", kr, mach_error_string(kr));
            return -1;
        }
    }

    mach_vm_size_t out_size;
    kr = mach_vm_read_overwrite(task, address, size, (mach_vm_address_t)buffer, &out_size);
    if (kr != KERN_SUCCESS)
    {
        debug_log("Error: mach_vm_read_overwrite failed with error %d (%s)\n", kr,
                  mach_error_string(kr));
        return -1;
    }

    return static_cast<ssize_t>(out_size);
}

extern "C" ssize_t write_memory_native(int pid, mach_vm_address_t address, mach_vm_size_t size,
                                       unsigned char *buffer)
{
    task_t task;
    kern_return_t err;
    vm_prot_t original_protection;
    vm_region_basic_info_data_64_t info;
    mach_msg_type_number_t info_count = VM_REGION_BASIC_INFO_COUNT_64;
    mach_port_t object_name;
    bool is_embedded_mode = pid == getpid();

    if (is_embedded_mode)
    {
        task = mach_task_self();
    }
    else
    {
        err = task_for_pid(mach_task_self(), pid, &task);
        if (err != KERN_SUCCESS)
        {
            debug_log("Error: task_for_pid failed with error %d (%s)\n", err,
                      mach_error_string(err));
            return -1;
        }
    }

    if (!is_embedded_mode)
    {
        task_suspend(task);
    }

    mach_vm_address_t region_address = address;
    mach_vm_size_t region_size = size;
    // Get the current protection
    err = mach_vm_region(task, &region_address, &region_size, VM_REGION_BASIC_INFO_64,
                         (vm_region_info_t)&info, &info_count, &object_name);
    if (err != KERN_SUCCESS)
    {
        debug_log("Error: mach_vm_region failed with error %d (%s) at address "
                  "0x%llx, size 0x%llx\n",
                  err, mach_error_string(err), address, size);
        if (!is_embedded_mode)
        {
            task_resume(task);
        }
        return -1;
    }
    original_protection = info.protection;

    // Change the memory protection to allow writing
    err = mach_vm_protect(task, address, size, false, VM_PROT_READ | VM_PROT_WRITE);
    if (err != KERN_SUCCESS)
    {
        debug_log("Error: mach_vm_protect (write enable) failed with error %d (%s)\n", err,
                  mach_error_string(err));
        if (!is_embedded_mode)
        {
            task_resume(task);
        }
        return -1;
    }

    // Write to memory
    err = mach_vm_write(task, address, (vm_offset_t)buffer, size);
    if (err != KERN_SUCCESS)
    {
        debug_log("Error: mach_vm_write failed with error %d (%s) at address "
                  "0x%llx, size 0x%llx\n",
                  err, mach_error_string(err), address, size);
        mach_vm_protect(task, address, size, false,
                        original_protection);  // Attempt to restore protection
        if (!is_embedded_mode)
        {
            task_resume(task);
        }
        return -1;
    }

    // Reset the memory protection
    err = mach_vm_protect(task, address, size, false, original_protection);
    if (err != KERN_SUCCESS)
    {
        debug_log("Warning: mach_vm_protect (restore protection) failed with error "
                  "%d (%s)\n",
                  err, mach_error_string(err));
        if (!is_embedded_mode)
        {
            task_resume(task);
        }
        return -1;
    }

    if (!is_embedded_mode)
    {
        task_resume(task);
    }
    return static_cast<ssize_t>(size);
}

extern "C" void enumerate_regions_to_buffer(pid_t pid, char *buffer, size_t buffer_size)
{
    task_t task;
    kern_return_t err;
    vm_address_t address = 0;
    vm_size_t size = 0;
    natural_t depth = 1;

    if (pid == getpid())
    {
        task = mach_task_self();
    }
    else
    {
        err = task_for_pid(mach_task_self(), pid, &task);
        if (err != KERN_SUCCESS)
        {
            debug_log("Error: task_for_pid failed with error %d (%s)\n", err,
                      mach_error_string(err));
            snprintf(buffer, buffer_size, "Failed to get task for pid %d\n", pid);
            return;
        }
    }

    size_t pos = 0;
    while (true)
    {
        vm_region_submap_info_data_64_t info;
        mach_msg_type_number_t info_count = VM_REGION_SUBMAP_INFO_COUNT_64;

        if (vm_region_recurse_64(task, &address, &size, &depth, (vm_region_info_t)&info,
                                 &info_count) != KERN_SUCCESS)
        {
            break;
        }

        if (info.is_submap)
        {
            depth++;
        }
        else
        {
            char protection[4] = "---";
            if (info.protection & VM_PROT_READ) protection[0] = 'r';
            if (info.protection & VM_PROT_WRITE) protection[1] = 'w';
            if (info.protection & VM_PROT_EXECUTE) protection[2] = 'x';

            pos += snprintf(buffer + pos, buffer_size - pos, "%llx-%llx %s\n",
                            static_cast<unsigned long long>(address),
                            static_cast<unsigned long long>(address + size), protection);

            if (pos >= buffer_size - 1) break;

            address += size;
        }
    }
}

extern "C" ProcessInfo *enumprocess_native(size_t *count)
{
    int err;
    struct kinfo_proc *result;
    bool done;
    static const int name[] = {CTL_KERN, KERN_PROC, KERN_PROC_ALL, 0};
    size_t length;

    result = nullptr;
    done = false;

    do
    {
        length = 0;
        err = sysctl(const_cast<int *>(name), (sizeof(name) / sizeof(*name)) - 1, nullptr, &length,
                     nullptr, 0);
        if (err == -1)
        {
            err = errno;
        }

        if (err == 0)
        {
            result = static_cast<struct kinfo_proc *>(malloc(length));
            if (result == nullptr)
            {
                err = ENOMEM;
            }
        }

        if (err == 0)
        {
            err = sysctl(const_cast<int *>(name), (sizeof(name) / sizeof(*name)) - 1, result,
                         &length, nullptr, 0);
            if (err == -1)
            {
                err = errno;
            }
            if (err == 0)
            {
                done = true;
            }
            else if (err == ENOMEM)
            {
                free(result);
                result = nullptr;
                err = 0;
            }
        }
    } while (err == 0 && !done);

    if (err == 0 && result != nullptr)
    {
        *count = length / sizeof(struct kinfo_proc);
        ProcessInfo *processes = static_cast<ProcessInfo *>(malloc(*count * sizeof(ProcessInfo)));

        for (size_t i = 0; i < *count; i++)
        {
            processes[i].pid = result[i].kp_proc.p_pid;
            processes[i].processname = strdup(result[i].kp_proc.p_comm);
        }

        free(result);
        return processes;
    }
    else
    {
        if (result != nullptr)
        {
            free(result);
        }
        debug_log("Error: Failed to enumerate processes, error %d\n", err);
        return nullptr;
    }
}

extern "C" bool suspend_process(pid_t pid)
{
    task_t task;
    kern_return_t err;
    bool is_embedded_mode = pid == getpid();
    if (is_embedded_mode)
    {
        debug_log("Error: Cannot suspend self process\n");
        return false;
    }
    err = task_for_pid(mach_task_self(), pid, &task);
    if (err != KERN_SUCCESS)
    {
        debug_log("Error: task_for_pid failed with error %d (%s)\n", err, mach_error_string(err));
        return false;
    }
    err = task_suspend(task);
    if (err != KERN_SUCCESS)
    {
        debug_log("Error: task_suspend failed with error %d (%s)\n", err, mach_error_string(err));
        return false;
    }

    return true;
}

extern "C" bool resume_process(pid_t pid)
{
    task_t task;
    kern_return_t err;
    bool is_embedded_mode = pid == getpid();
    if (is_embedded_mode)
    {
        debug_log("Error: Cannot resume self process\n");
        return false;
    }
    err = task_for_pid(mach_task_self(), pid, &task);
    if (err != KERN_SUCCESS)
    {
        debug_log("Error: task_for_pid failed with error %d (%s)\n", err, mach_error_string(err));
        return false;
    }
    err = task_resume(task);
    if (err != KERN_SUCCESS)
    {
        debug_log("Error: task_resume failed with error %d (%s)\n", err, mach_error_string(err));
        return false;
    }

    return true;
}

static std::uint64_t get_image_size_64(int pid, mach_vm_address_t base_address)
{
    mach_header_64 header;
    if (read_memory_native(pid, base_address, sizeof(mach_header_64),
                           reinterpret_cast<unsigned char *>(&header)) <= 0)
    {
        debug_log("Error: Failed to read 64-bit Mach-O header\n");
        return 0;
    }

    std::uint64_t image_size = 0;
    mach_vm_address_t current_address = base_address + sizeof(mach_header_64);

    for (int i = 0; i < header.ncmds; i++)
    {
        load_command lc;
        if (read_memory_native(pid, current_address, sizeof(load_command),
                               reinterpret_cast<unsigned char *>(&lc)) <= 0)
        {
            debug_log("Error: Failed to read load command\n");
            return 0;
        }

        if (lc.cmd == LC_SEGMENT_64)
        {
            segment_command_64 seg;
            if (read_memory_native(pid, current_address, sizeof(segment_command_64),
                                   reinterpret_cast<unsigned char *>(&seg)) <= 0)
            {
                debug_log("Error: Failed to read segment command\n");
                return 0;
            }
            image_size += seg.vmsize;
        }

        current_address += lc.cmdsize;
    }

    return image_size;
}

static std::uint64_t get_image_size_32(int pid, mach_vm_address_t base_address)
{
    mach_header header;
    if (read_memory_native(pid, base_address, sizeof(mach_header),
                           reinterpret_cast<unsigned char *>(&header)) <= 0)
    {
        debug_log("Error: Failed to read 32-bit Mach-O header\n");
        return 0;
    }

    std::uint64_t image_size = 0;
    mach_vm_address_t current_address = base_address + sizeof(mach_header);

    for (int i = 0; i < header.ncmds; i++)
    {
        load_command lc;
        if (read_memory_native(pid, current_address, sizeof(load_command),
                               reinterpret_cast<unsigned char *>(&lc)) <= 0)
        {
            debug_log("Error: Failed to read load command\n");
            return 0;
        }

        if (lc.cmd == LC_SEGMENT)
        {
            segment_command seg;
            if (read_memory_native(pid, current_address, sizeof(segment_command),
                                   reinterpret_cast<unsigned char *>(&seg)) <= 0)
            {
                debug_log("Error: Failed to read segment command\n");
                return 0;
            }
            image_size += seg.vmsize;
        }

        current_address += lc.cmdsize;
    }

    return image_size;
}

static std::uint64_t get_module_size(int pid, mach_vm_address_t address, bool *is_64bit)
{
    std::uint32_t magic;
    if (read_memory_native(pid, address, sizeof(std::uint32_t),
                           reinterpret_cast<unsigned char *>(&magic)) <= 0)
    {
        debug_log("Error: Failed to read Mach-O magic number\n");
        return 0;
    }

    if (magic == MH_MAGIC_64)
    {
        *is_64bit = true;
        return get_image_size_64(pid, address);
    }
    else if (magic == MH_MAGIC)
    {
        *is_64bit = false;
        return get_image_size_32(pid, address);
    }
    else if (magic == FAT_MAGIC || magic == FAT_CIGAM)
    {
        fat_header fatHeader;
        if (read_memory_native(pid, address, sizeof(fat_header),
                               reinterpret_cast<unsigned char *>(&fatHeader)) <= 0)
        {
            debug_log("Error: Failed to read FAT header\n");
            return 0;
        }

        std::vector<fat_arch> archs(fatHeader.nfat_arch);
        if (read_memory_native(pid, address + sizeof(fat_header),
                               fatHeader.nfat_arch * sizeof(fat_arch),
                               reinterpret_cast<unsigned char *>(archs.data())) <= 0)
        {
            debug_log("Error: Failed to read FAT architectures\n");
            return 0;
        }

        for (const auto &arch : archs)
        {
            if (read_memory_native(pid, address + arch.offset, sizeof(std::uint32_t),
                                   reinterpret_cast<unsigned char *>(&magic)) <= 0)
            {
                debug_log("Error: Failed to read Mach-O magic number in FAT binary\n");
                continue;
            }
            if (magic == MH_MAGIC_64)
            {
                *is_64bit = true;
                return get_image_size_64(pid, address + arch.offset);
            }
            else if (magic == MH_MAGIC)
            {
                *is_64bit = false;
                return get_image_size_32(pid, address + arch.offset);
            }
        }
    }

    debug_log("Error: Unknown Mach-O format\n");
    return 0;
}

extern "C" ModuleInfo *enummodule_native(pid_t pid, size_t *count)
{
    task_t task;
    if (task_for_pid(mach_task_self(), pid, &task) != KERN_SUCCESS)
    {
        debug_log("Error: Failed to get task for pid %d\n", pid);
        *count = 0;
        return nullptr;
    }

    task_dyld_info dyld_info;
    mach_msg_type_number_t count_info = TASK_DYLD_INFO_COUNT;

    if (task_info(task, TASK_DYLD_INFO, reinterpret_cast<task_info_t>(&dyld_info), &count_info) !=
        KERN_SUCCESS)
    {
        debug_log("Error: Failed to get task info\n");
        *count = 0;
        return nullptr;
    }

    dyld_all_image_infos all_image_infos;
    if (read_memory_native(pid, dyld_info.all_image_info_addr, sizeof(dyld_all_image_infos),
                           reinterpret_cast<unsigned char *>(&all_image_infos)) <= 0)
    {
        debug_log("Error: Failed to read all_image_infos\n");
        *count = 0;
        return nullptr;
    }

    std::vector<dyld_image_info> image_infos(all_image_infos.infoArrayCount);
    if (read_memory_native(pid, reinterpret_cast<mach_vm_address_t>(all_image_infos.infoArray),
                           sizeof(dyld_image_info) * all_image_infos.infoArrayCount,
                           reinterpret_cast<unsigned char *>(image_infos.data())) <= 0)
    {
        debug_log("Error: Failed to read image_infos\n");
        *count = 0;
        return nullptr;
    }

    std::vector<ModuleInfo> moduleList;
    moduleList.reserve(all_image_infos.infoArrayCount);

    for (const auto &info : image_infos)
    {
        char fpath[PATH_MAX];
        if (read_memory_native(pid, reinterpret_cast<mach_vm_address_t>(info.imageFilePath),
                               PATH_MAX, reinterpret_cast<unsigned char *>(fpath)) > 0)
        {
            ModuleInfo module;
            if (strlen(fpath) == 0 && proc_regionfilename != nullptr)
            {
                char buffer[PATH_MAX];
                int ret =
                    proc_regionfilename(pid, reinterpret_cast<std::uint64_t>(info.imageLoadAddress),
                                        buffer, sizeof(buffer));
                module.modulename = strdup(ret > 0 ? buffer : "None");
            }
            else
            {
                module.modulename = strdup(fpath);
            }

            module.base = reinterpret_cast<std::uintptr_t>(info.imageLoadAddress);
            module.size = static_cast<std::int32_t>(get_module_size(
                pid, static_cast<mach_vm_address_t>(module.base), &module.is_64bit));

            moduleList.push_back(module);
        }
    }

    *count = moduleList.size();
    ModuleInfo *result = static_cast<ModuleInfo *>(malloc(*count * sizeof(ModuleInfo)));
    std::copy(moduleList.begin(), moduleList.end(), result);

    return result;
}

extern "C" int native_init(int mode)
{
    void *libsystem_kernel = dlopen("/usr/lib/system/libsystem_kernel.dylib", RTLD_NOW);
    if (!libsystem_kernel)
    {
        debug_log("Error: Failed to load libsystem_kernel.dylib: %s\n", dlerror());
        return -1;
    }

    // Clear any existing error
    dlerror();

    proc_regionfilename = (PROC_REGIONFILENAME)dlsym(libsystem_kernel, "proc_regionfilename");
    const char *dlsym_error = dlerror();
    if (dlsym_error)
    {
        debug_log("Error: Failed to load proc_regionfilename symbol: %s\n", dlsym_error);
        proc_regionfilename = nullptr;
    }

    if (proc_regionfilename == nullptr)
    {
        debug_log("Warning: proc_regionfilename is not available. Some "
                  "functionality may be limited.\n");
    }
    return 1;
}