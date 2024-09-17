#include "native_api.h"

#ifdef TARGET_IS_ANDROID
#include <android/log.h>
#endif

#ifdef TARGET_IS_ANDROID
typedef ssize_t (*process_vm_readv_func)(pid_t, const struct iovec *, unsigned long,
                                         const struct iovec *, unsigned long, unsigned long);
typedef ssize_t (*process_vm_writev_func)(pid_t, const struct iovec *, unsigned long,
                                          const struct iovec *, unsigned long, unsigned long);
static process_vm_readv_func PROCESS_VM_READV = nullptr;
static process_vm_writev_func PROCESS_VM_WRITEV = nullptr;

#endif

int debug_log(LogLevel level, const char *format, ...)
{
    va_list args;
    va_start(args, format);

    char tagged_format[1024];

    char buffer[1024];
    snprintf(tagged_format, sizeof(tagged_format), "[NATIVE] %s", format);
    vsnprintf(buffer, sizeof(buffer), tagged_format, args);

    native_log(level, buffer);

#ifdef TARGET_IS_ANDROID
    __android_log_vprint(ANDROID_LOG_DEBUG, "MEMORYSERVER", tagged_format, args);
#endif

    va_end(args);
    return 0;
}

pid_t get_pid_native()
{
    return getpid();
}

ssize_t read_memory_native(int pid, uintptr_t address, size_t size, unsigned char *buffer)
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
        debug_log(LOG_DEBUG,
                  "Failed to read memory from process %d at address 0x%lx. Error: %d (%s)\n", pid,
                  address, errno, strerror(errno));
        return -errno;
    }

    if (static_cast<size_t>(nread) < size)
    {
        debug_log(LOG_WARN, "Partial read from process %d. Requested %zu bytes, read %zd bytes\n",
                  pid, size, nread);
    }

    return nread;
}

ssize_t write_memory_native(int pid, void *address, size_t size, unsigned char *buffer)
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
            debug_log(LOG_ERROR, "mprotect failed with error %d (%s)\n", errno, strerror(errno));
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
            debug_log(LOG_ERROR, "process_vm_writev failed with error %d (%s)\n", errno,
                      strerror(errno));
            return -1;
        }

        debug_log(LOG_DEBUG, "Successfully wrote %zd bytes to own process memory\n", written);
        return written;
    }
    else
    {
        // Writing to another process
        if (ptrace(PTRACE_ATTACH, pid, NULL, NULL) == -1)
        {
            debug_log(LOG_ERROR, "Failed to attach to process %d. Error: %d (%s)\n", pid, errno,
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
                    debug_log(LOG_ERROR, "ptrace PEEKDATA failed at offset %zu. Error: %d (%s)\n",
                              i, errno, strerror(errno));
                    ptrace(PTRACE_DETACH, pid, NULL, NULL);
                    return -1;
                }

                std::memcpy(&orig, reinterpret_cast<char *>(buffer) + i, size - i);

                if (ptrace(PTRACE_POKEDATA, pid, reinterpret_cast<char *>(address) + i, orig) == -1)
                {
                    debug_log(LOG_ERROR, "ptrace POKEDATA failed at offset %zu. Error: %d (%s)\n",
                              i, errno, strerror(errno));
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
                    debug_log(LOG_ERROR, "ptrace POKEDATA failed at offset %zu. Error: %d (%s)\n",
                              i, errno, strerror(errno));
                    ptrace(PTRACE_DETACH, pid, NULL, NULL);
                    return -1;
                }
                total_written += sizeof(long);
            }
        }

        if (ptrace(PTRACE_DETACH, pid, NULL, NULL) == -1)
        {
            debug_log(LOG_WARN, "Failed to detach from process %d. Error: %d (%s)\n", pid, errno,
                      strerror(errno));
        }

        return total_written;
    }
}

void enumerate_regions_to_buffer(pid_t pid, char *buffer, size_t buffer_size)
{
    char maps_file_path[64];
    snprintf(maps_file_path, sizeof(maps_file_path), "/proc/%d/maps", pid);

    std::ifstream maps_file(maps_file_path);
    if (!maps_file.is_open())
    {
        debug_log(LOG_ERROR, "Failed to open file: %s\n", maps_file_path);
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
        debug_log(LOG_ERROR, "Buffer size %zu was not enough to store all regions for pid %d\n",
                  buffer_size, pid);
    }

    buffer[buffer_index] = '\0';
}

ProcessInfo *enumprocess_native(size_t *count)
{
    DIR *proc_dir = opendir("/proc");
    if (!proc_dir)
    {
        debug_log(LOG_ERROR, "Failed to open /proc directory\n");
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
                    debug_log(LOG_ERROR, "Failed to allocate memory for process name (pid: %d)\n",
                              pid);
                    continue;
                }
                memcpy(process.processname, processname.c_str(), len);
                process.processname[len] = '\0';

                ProcessInfo *new_processes = static_cast<ProcessInfo *>(
                    realloc(processes, (*count + 1) * sizeof(ProcessInfo)));
                if (!new_processes)
                {
                    debug_log(LOG_ERROR, "Failed to reallocate memory for processes array\n");
                    free(process.processname);
                    break;
                }
                processes = new_processes;
                processes[*count] = process;
                (*count)++;
            }
            else
            {
                debug_log(LOG_WARN, "Failed to open comm file for pid %d\n", pid);
            }
        }
    }

    closedir(proc_dir);
    return processes;
}

bool suspend_process(pid_t pid)
{
    if (kill(pid, SIGSTOP) == -1)
    {
        debug_log(LOG_ERROR, "Failed to suspend process %d. Error: %d (%s)\n", pid, errno,
                  strerror(errno));
        return false;
    }
    return true;
}

bool resume_process(pid_t pid)
{
    if (kill(pid, SIGCONT) == -1)
    {
        debug_log(LOG_ERROR, "Failed to resume process %d. Error: %d (%s)\n", pid, errno,
                  strerror(errno));
        return false;
    }
    return true;
}

bool is_elf64(const char *filename)
{
    int fd = open(filename, O_RDONLY);
    if (fd < 0)
    {
        return false;
    }

    unsigned char e_ident[EI_NIDENT];
    if (read(fd, e_ident, EI_NIDENT) != EI_NIDENT)
    {
        close(fd);
        return false;
    }

    close(fd);

    return (e_ident[EI_CLASS] == ELFCLASS64);
}

bool read_elf_header_from_memory(int pid, uintptr_t base_address, Elf64_Ehdr *elf_header)
{
    if (read_memory_native(pid, base_address, sizeof(Elf64_Ehdr),
                           reinterpret_cast<unsigned char *>(elf_header)) != sizeof(Elf64_Ehdr))
    {
        return false;
    }
    return true;
}

bool read_elf_header_from_file(const char *filename, Elf64_Ehdr *elf_header)
{
    int fd = open(filename, O_RDONLY);
    if (fd < 0)
    {
        return false;
    }

    if (read(fd, elf_header, sizeof(Elf64_Ehdr)) != sizeof(Elf64_Ehdr))
    {
        close(fd);
        return false;
    }

    close(fd);
    return true;
}

bool compare_elf_headers(int pid, uintptr_t base_address, const char *filename)
{
    Elf64_Ehdr mem_elf_header;
    Elf64_Ehdr file_elf_header;

    if (!read_elf_header_from_memory(pid, base_address, &mem_elf_header))
    {
        // debug_log("Error: Failed to read ELF header from memory at address 0x%lx for PID %d\n",
        //           base_address, pid);
        return false;
    }

    if (!read_elf_header_from_file(filename, &file_elf_header))
    {
        // debug_log("Error: Failed to read ELF header from file %s\n", filename);
        return false;
    }
    return std::memcmp(&mem_elf_header, &file_elf_header, sizeof(Elf64_Ehdr)) == 0;
}

ModuleInfo *enummodule_native(pid_t pid, size_t *count)
{
    std::vector<ModuleInfo> modules;
    std::ostringstream maps_path;
    maps_path << "/proc/" << pid << "/maps";

    std::ifstream maps_file(maps_path.str());
    if (!maps_file.is_open())
    {
        *count = 0;
        return nullptr;
    }

    std::string line;
    while (std::getline(maps_file, line))
    {
        std::istringstream iss(line);
        uintptr_t start, end;
        char perms[5], dev[6], module_path[PATH_MAX];
        unsigned long inode;
        unsigned long offset;

        iss >> std::hex >> start;
        iss.ignore(1, '-');
        iss >> std::hex >> end;
        iss >> perms;
        iss >> std::hex >> offset;
        iss >> dev >> inode;
        iss >> module_path;

        if (perms[0] == 'r' && !std::string(module_path).empty())
        {
            if (compare_elf_headers(pid, start, module_path))
            {
                ModuleInfo info;
                info.base = start;
                info.size = static_cast<int>(end - start);
                info.is_64bit = is_elf64(module_path);

                size_t nameLength = strlen(module_path) + 1;
                info.modulename = new char[nameLength];
                strcpy(info.modulename, module_path);

                modules.push_back(info);
            }
        }
    }

    maps_file.close();

    *count = modules.size();
    ModuleInfo *result = new ModuleInfo[*count];
    std::copy(modules.begin(), modules.end(), result);

    return result;
}

int native_init(int mode)
{
#ifdef TARGET_IS_ANDROID
    void *handle = dlopen("libc.so", RTLD_NOW);
    if (!handle)
    {
        debug_log(LOG_ERROR, "Failed to open libc.so. Error: %s\n", dlerror());
        return -1;
    }

    PROCESS_VM_READV = (process_vm_readv_func)dlsym(handle, "process_vm_readv");
    if (!PROCESS_VM_READV)
    {
        debug_log(LOG_ERROR, "Failed to find process_vm_readv symbol. Error: %s\n", dlerror());
        dlclose(handle);
        return -1;
    }

    PROCESS_VM_WRITEV = (process_vm_writev_func)dlsym(handle, "process_vm_writev");
    if (!PROCESS_VM_WRITEV)
    {
        debug_log(LOG_ERROR, "Failed to find process_vm_writev symbol. Error: %s\n", dlerror());
        dlclose(handle);
        return -1;
    }

    dlclose(handle);
#endif
    return 1;
}