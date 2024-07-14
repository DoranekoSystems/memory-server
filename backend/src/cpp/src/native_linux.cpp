#include <dirent.h>
#include <dlfcn.h>
#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <sys/mman.h>
#include <sys/ptrace.h>
#include <sys/queue.h>
#include <sys/uio.h>
#include <sys/wait.h>
#include <unistd.h>

#include <cstdio>
#include <cstring>
#include <fstream>
#include <iostream>

#ifdef TARGET_IS_ANDROID
#include <android/log.h>
#endif

typedef struct
{
    int pid;
    char *processname;
} ProcessInfo;

typedef struct
{
    uintptr_t base;
    int size;
    bool is_64bit;
    char *modulename;
} ModuleInfo;

#ifdef TARGET_IS_ANDROID
typedef ssize_t (*process_vm_readv_func)(pid_t, const struct iovec *, unsigned long,
                                         const struct iovec *, unsigned long, unsigned long);
typedef ssize_t (*process_vm_writev_func)(pid_t, const struct iovec *, unsigned long,
                                          const struct iovec *, unsigned long, unsigned long);
static process_vm_readv_func PROCESS_VM_READV = nullptr;
static process_vm_writev_func PROCESS_VM_WRITEV = nullptr;

#endif

int debug_log(const char *format, ...)
{
    va_list args;
    va_start(args, format);

    char tagged_format[256];
    snprintf(tagged_format, sizeof(tagged_format), "[MEMORYSERVER] %s", format);

    vprintf(tagged_format, args);
    printf("\n");

#ifdef TARGET_IS_ANDROID
    __android_log_vprint(ANDROID_LOG_DEBUG, "MEMORYSERVER", tagged_format, args);
#endif

    va_end(args);
    return 0;
}

extern "C" pid_t get_pid_native()
{
    return getpid();
}

extern "C" ssize_t read_memory_native(int pid, uintptr_t address, size_t size,
                                      unsigned char *buffer)
{
    struct iovec local_iov;
    struct iovec remote_iov;

    local_iov.iov_base = buffer;
    local_iov.iov_len = size;
    remote_iov.iov_base = reinterpret_cast<void *>(address);
    remote_iov.iov_len = size;

#ifdef TARGET_IS_ANDROID
    ssize_t nread = PROCESS_VM_READV(pid, &local_iov, 1, &remote_iov, 1, 0);
#else
    ssize_t nread = process_vm_readv(pid, &local_iov, 1, &remote_iov, 1, 0);
#endif

    if (nread < 0)
    {
        debug_log("Error: Failed to read memory from process %d at address 0x%lx. Error: %d (%s)\n",
                  pid, address, errno, strerror(errno));
        return -errno;
    }

    if (static_cast<size_t>(nread) < size)
    {
        debug_log("Warning: Partial read from process %d. Requested %zu bytes, read %zd bytes\n",
                  pid, size, nread);
    }

    return nread;
}

extern "C" ssize_t write_memory_native(int pid, void *address, size_t size, unsigned char *buffer)
{
    if (pid == get_pid_native())
    {
        // Writing to own process
        uintptr_t start = reinterpret_cast<uintptr_t>(address);
        uintptr_t end = start + size;
        uintptr_t page_size = getpagesize();
        uintptr_t page_start = start & ~(page_size - 1);
        uintptr_t page_end = (end + page_size - 1) & ~(page_size - 1);
        size_t protected_size = page_end - page_start;

        int result = mprotect(reinterpret_cast<void *>(page_start), protected_size,
                              PROT_READ | PROT_WRITE | PROT_EXEC);
        if (result != 0)
        {
            debug_log("Error: mprotect failed with error %d (%s)\n", errno, strerror(errno));
            return -1;
        }

        iovec local_iov = {buffer, size};
        iovec remote_iov = {address, size};

#ifdef TARGET_IS_ANDROID
        ssize_t written = PROCESS_VM_WRITEV(pid, &local_iov, 1, &remote_iov, 1, 0);
#else
        ssize_t written = process_vm_writev(pid, &local_iov, 1, &remote_iov, 1, 0);
#endif
        if (written == -1)
        {
            debug_log("Error: process_vm_writev failed with error %d (%s)\n", errno,
                      strerror(errno));
            return -1;
        }

        debug_log("Successfully wrote %zd bytes to own process memory\n", written);
        return written;
    }
    else
    {
        // Writing to another process
        if (ptrace(PTRACE_ATTACH, pid, NULL, NULL) == -1)
        {
            debug_log("Error: Failed to attach to process %d. Error: %d (%s)\n", pid, errno,
                      strerror(errno));
            return -1;
        }
        waitpid(pid, NULL, 0);

        ssize_t total_written = 0;
        for (size_t i = 0; i < size; i += sizeof(long))
        {
            if (size - i < sizeof(long))
            {
                long orig =
                    ptrace(PTRACE_PEEKDATA, pid, reinterpret_cast<char *>(address) + i, NULL);
                if (errno != 0)
                {
                    debug_log("Error: ptrace PEEKDATA failed at offset %zu. Error: %d (%s)\n", i,
                              errno, strerror(errno));
                    ptrace(PTRACE_DETACH, pid, NULL, NULL);
                    return -1;
                }

                std::memcpy(&orig, reinterpret_cast<char *>(buffer) + i, size - i);

                if (ptrace(PTRACE_POKEDATA, pid, reinterpret_cast<char *>(address) + i, orig) == -1)
                {
                    debug_log("Error: ptrace POKEDATA failed at offset %zu. Error: %d (%s)\n", i,
                              errno, strerror(errno));
                    ptrace(PTRACE_DETACH, pid, NULL, NULL);
                    return -1;
                }
                total_written += size - i;
            }
            else
            {
                long data;
                std::memcpy(&data, reinterpret_cast<char *>(buffer) + i, sizeof(long));
                if (ptrace(PTRACE_POKEDATA, pid, reinterpret_cast<char *>(address) + i, data) == -1)
                {
                    debug_log("Error: ptrace POKEDATA failed at offset %zu. Error: %d (%s)\n", i,
                              errno, strerror(errno));
                    ptrace(PTRACE_DETACH, pid, NULL, NULL);
                    return -1;
                }
                total_written += sizeof(long);
            }
        }

        if (ptrace(PTRACE_DETACH, pid, NULL, NULL) == -1)
        {
            debug_log("Warning: Failed to detach from process %d. Error: %d (%s)\n", pid, errno,
                      strerror(errno));
        }

        return total_written;
    }
}

extern "C" void enumerate_regions_to_buffer(pid_t pid, char *buffer, size_t buffer_size)
{
    char maps_file_path[64];
    snprintf(maps_file_path, sizeof(maps_file_path), "/proc/%d/maps", pid);

    std::ifstream maps_file(maps_file_path);
    if (!maps_file.is_open())
    {
        debug_log("Error: Failed to open file: %s\n", maps_file_path);
        snprintf(buffer, buffer_size, "Failed to open file: %s", maps_file_path);
        return;
    }

    size_t buffer_index = 0;
    std::string line;
    while (getline(maps_file, line) && (buffer_index + line.length() + 1) < buffer_size)
    {
        size_t line_length = line.length();
        memcpy(buffer + buffer_index, line.c_str(), line_length);
        buffer_index += line_length;
        buffer[buffer_index++] = '\n';
    }

    if (!maps_file.eof())
    {
        debug_log("Warning: Buffer size %zu was not enough to store all regions for pid %d\n",
                  buffer_size, pid);
    }

    // Null-terminate the buffer
    buffer[buffer_index] = '\0';
}

extern "C" ProcessInfo *enumprocess_native(size_t *count)
{
    DIR *proc_dir = opendir("/proc");
    if (!proc_dir)
    {
        debug_log("Error: Failed to open /proc directory\n");
        return nullptr;
    }

    ProcessInfo *processes = nullptr;
    *count = 0;

    struct dirent *entry;
    while ((entry = readdir(proc_dir)) != nullptr)
    {
        int pid = atoi(entry->d_name);
        if (pid > 0)
        {
            char comm_path[256];
            snprintf(comm_path, sizeof(comm_path), "/proc/%d/comm", pid);

            std::ifstream comm_file(comm_path);
            if (comm_file.is_open())
            {
                ProcessInfo process;
                process.pid = pid;

                std::string processname;
                std::getline(comm_file, processname);

                size_t len = processname.length();
                process.processname = static_cast<char *>(malloc(len + 1));
                if (!process.processname)
                {
                    debug_log("Error: Failed to allocate memory for process name (pid: %d)\n", pid);
                    continue;
                }
                memcpy(process.processname, processname.c_str(), len);
                process.processname[len] = '\0';

                ProcessInfo *new_processes = static_cast<ProcessInfo *>(
                    realloc(processes, (*count + 1) * sizeof(ProcessInfo)));
                if (!new_processes)
                {
                    debug_log("Error: Failed to reallocate memory for processes array\n");
                    free(process.processname);
                    break;
                }
                processes = new_processes;
                processes[*count] = process;
                (*count)++;
            }
            else
            {
                debug_log("Warning: Failed to open comm file for pid %d\n", pid);
            }
        }
    }

    closedir(proc_dir);
    return processes;
}

extern "C" bool suspend_process(pid_t pid)
{
    if (kill(pid, SIGSTOP) == -1)
    {
        debug_log("Error: Failed to suspend process %d. Error: %d (%s)\n", pid, errno,
                  strerror(errno));
        return false;
    }
    return true;
}

extern "C" bool resume_process(pid_t pid)
{
    if (kill(pid, SIGCONT) == -1)
    {
        debug_log("Error: Failed to resume process %d. Error: %d (%s)\n", pid, errno,
                  strerror(errno));
        return false;
    }
    return true;
}

extern "C" ModuleInfo *enummodule_native(pid_t pid, size_t *count)
{
    return nullptr;
}

extern "C" int native_init()
{
#ifdef TARGET_IS_ANDROID
    void *handle = dlopen("libc.so", RTLD_NOW);
    if (!handle)
    {
        debug_log("Error: Failed to open libc.so. Error: %s\n", dlerror());
        return -1;
    }

    PROCESS_VM_READV = (process_vm_readv_func)dlsym(handle, "process_vm_readv");
    if (!PROCESS_VM_READV)
    {
        debug_log("Error: Failed to find process_vm_readv symbol. Error: %s\n", dlerror());
        dlclose(handle);
        return -1;
    }

    PROCESS_VM_WRITEV = (process_vm_writev_func)dlsym(handle, "process_vm_writev");
    if (!PROCESS_VM_WRITEV)
    {
        debug_log("Error: Failed to find process_vm_writev symbol. Error: %s\n", dlerror());
        dlclose(handle);
        return -1;
    }

    dlclose(handle);
#endif
    return 1;
}