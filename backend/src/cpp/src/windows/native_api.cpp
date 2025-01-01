#include "native_api.h"

int debug_log(LogLevel level, const char *format, ...)
{
    va_list args;
    va_start(args, format);

    char tagged_format[256];
    _snprintf_s(tagged_format, sizeof(tagged_format), _TRUNCATE, "[NATIVE] %s", format);

    char buffer[1024];
    int result = _vsnprintf_s(buffer, sizeof(buffer), _TRUNCATE, tagged_format, args);

    if (result >= 0)
    {
        OutputDebugStringA(buffer);
        native_log(level, buffer);
    }

    va_end(args);
    return result;
}

int get_pid_native()
{
    return GetCurrentProcessId();
}

SSIZE_T read_memory_native(int pid, uintptr_t address, size_t size, unsigned char *buffer)
{
    HANDLE processHandle = OpenProcess(PROCESS_VM_READ, FALSE, pid);
    if (processHandle == NULL)
    {
        debug_log(LOG_ERROR, "Failed to open process %d for reading. Error code: %lu", pid,
                  GetLastError());
        return -1;
    }

    SIZE_T bytesRead;
    if (ReadProcessMemory(processHandle, (LPCVOID)address, buffer, size, &bytesRead))
    {
        CloseHandle(processHandle);
        return (SSIZE_T)bytesRead;
    }
    else
    {
        DWORD error = GetLastError();
        CloseHandle(processHandle);
        debug_log(LOG_DEBUG,
                  "Failed to read memory from process %d at address 0x%p. Error code: %lu", pid,
                  (void *)address, error);
        return -1;
    }
}

SSIZE_T write_memory_native(int pid, void *address, size_t size, unsigned char *buffer)
{
    HANDLE processHandle = OpenProcess(
        PROCESS_VM_WRITE | PROCESS_VM_OPERATION | PROCESS_QUERY_INFORMATION, FALSE, pid);
    if (processHandle == NULL)
    {
        debug_log(LOG_ERROR, "Failed to open process %d for writing. Error code: %lu", pid,
                  GetLastError());
        return -1;
    }

    DWORD oldProtect;
    if (!VirtualProtectEx(processHandle, address, size, PAGE_EXECUTE_READWRITE, &oldProtect))
    {
        DWORD error = GetLastError();
        debug_log(LOG_ERROR,
                  "VirtualProtectEx failed for process %d at address 0x%p. Error code: %lu", pid,
                  address, error);
        CloseHandle(processHandle);
        return -1;
    }

    SIZE_T bytesWritten;
    if (!WriteProcessMemory(processHandle, address, buffer, size, &bytesWritten))
    {
        DWORD error = GetLastError();
        debug_log(LOG_ERROR,
                  "WriteProcessMemory failed for process %d at address 0x%p. Error code: %lu", pid,
                  address, error);
        VirtualProtectEx(processHandle, address, size, oldProtect, &oldProtect);
        CloseHandle(processHandle);
        return -1;
    }

    DWORD tempProtect;
    if (!VirtualProtectEx(processHandle, address, size, oldProtect, &tempProtect))
    {
        debug_log(LOG_ERROR,
                  "Failed to restore memory protection for process %d at address 0x%p. Error "
                  "code: %lu",
                  pid, address, GetLastError());
    }

    CloseHandle(processHandle);
    return bytesWritten;
}

void setMemoryProtection(DWORD protect, DWORD type, char *permissions)
{
    permissions[0] = '-';
    permissions[1] = '-';
    permissions[2] = '-';
    permissions[3] = '-';

    switch (protect & 0xFF)
    {
        case PAGE_EXECUTE:
            permissions[2] = 'x';
            break;
        case PAGE_EXECUTE_READ:
            permissions[0] = 'r';
            permissions[2] = 'x';
            break;
        case PAGE_EXECUTE_READWRITE:
        case PAGE_EXECUTE_WRITECOPY:
            permissions[0] = 'r';
            permissions[1] = 'w';
            permissions[2] = 'x';
            break;
        case PAGE_NOACCESS:
            break;
        case PAGE_READONLY:
            permissions[0] = 'r';
            break;
        case PAGE_READWRITE:
        case PAGE_WRITECOPY:
            permissions[0] = 'r';
            permissions[1] = 'w';
            break;
    }

    if (type & MEM_PRIVATE || type & MEM_IMAGE)
    {
        permissions[3] = 'p';  // private
    }
    else if (type & MEM_MAPPED)
    {
        permissions[3] = 's';  // shared
    }
    else
    {
        permissions[3] = '-';
    }
}

void enumerate_regions_to_buffer(DWORD pid, char *buffer, size_t buffer_size)
{
    HANDLE processHandle = OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, FALSE, pid);
    if (processHandle == NULL)
    {
        debug_log(LOG_ERROR, "Failed to open process %lu. Error code: %lu", pid, GetLastError());
        snprintf(buffer, buffer_size, "Failed to open process\n");
        return;
    }

    MEMORY_BASIC_INFORMATION memInfo;
    unsigned char *addr = 0;
    size_t offset = 0;

    while (VirtualQueryEx(processHandle, addr, &memInfo, sizeof(memInfo)))
    {
        char permissions[5] = "----";
        if (memInfo.State == MEM_COMMIT)
        {
            setMemoryProtection(memInfo.Protect, memInfo.Type, permissions);
        }
        else
        {
        }
        char mappedFileName[MAX_PATH] = {0};
        if (memInfo.Type == MEM_MAPPED)
        {
            if (!GetMappedFileNameA(processHandle, addr, mappedFileName, sizeof(mappedFileName)))
            {
                debug_log(LOG_DEBUG,
                          "Failed to get mapped file name for address %p. Error code: %lu", addr,
                          GetLastError());
            }
        }

        char start_address[17], end_address[17];
        snprintf(start_address, sizeof(start_address), "%p", addr);
        snprintf(end_address, sizeof(end_address), "%p",
                 (unsigned char *)addr + memInfo.RegionSize - 1);

        int written = snprintf(buffer + offset, buffer_size - offset, "%s-%s %s %s _ _ %s\n",
                               start_address, end_address, permissions,
                               memInfo.State == MEM_COMMIT    ? "committed"
                               : memInfo.State == MEM_RESERVE ? "reserved"
                                                              : "free",
                               mappedFileName);

        if (written <= 0 || written >= buffer_size - offset)
        {
            debug_log(LOG_ERROR, "Buffer full or write error. Stopping enumeration.");
            break;
        }

        offset += written;
        addr = (unsigned char *)memInfo.BaseAddress + memInfo.RegionSize;
    }
    CloseHandle(processHandle);
}

ProcessInfo *enumprocess_native(size_t *count)
{
    HANDLE hSnapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
    if (hSnapshot == INVALID_HANDLE_VALUE)
    {
        debug_log(LOG_ERROR, "Failed to create process snapshot. Error code: %lu", GetLastError());
        *count = 0;
        return nullptr;
    }

    PROCESSENTRY32W pe32;
    pe32.dwSize = sizeof(PROCESSENTRY32W);

    if (!Process32FirstW(hSnapshot, &pe32))
    {
        debug_log(LOG_ERROR, "Failed to get first process. Error code: %lu", GetLastError());
        CloseHandle(hSnapshot);
        *count = 0;
        return nullptr;
    }

    std::vector<ProcessInfo> processes;

    do
    {
        ProcessInfo info;
        info.pid = pe32.th32ProcessID;
        info.processname = new char[MAX_PATH];

        if (wcstombs(info.processname, pe32.szExeFile, MAX_PATH) == (size_t)-1)
        {
            debug_log(LOG_DEBUG, "Failed to convert process name for PID %lu", info.pid);
            strcpy(info.processname, "Unknown");
        }

        processes.push_back(info);
    } while (Process32NextW(hSnapshot, &pe32));

    CloseHandle(hSnapshot);

    ProcessInfo *retArray = new ProcessInfo[processes.size()];
    for (size_t i = 0; i < processes.size(); i++)
    {
        retArray[i] = processes[i];
    }

    *count = processes.size();
    return retArray;
}

bool suspend_process(int pid)
{
    HANDLE hThreadSnap = CreateToolhelp32Snapshot(TH32CS_SNAPTHREAD, 0);
    if (hThreadSnap == INVALID_HANDLE_VALUE)
    {
        debug_log(LOG_ERROR, "Failed to create snapshot of threads for process %d. Error code: %lu",
                  pid, GetLastError());
        return false;
    }

    THREADENTRY32 te32;
    te32.dwSize = sizeof(THREADENTRY32);

    if (!Thread32First(hThreadSnap, &te32))
    {
        debug_log(LOG_ERROR, "Failed to get first thread for process %d. Error code: %lu", pid,
                  GetLastError());
        CloseHandle(hThreadSnap);
        return false;
    }

    bool suspended_any = false;
    do
    {
        if (te32.th32OwnerProcessID == pid)
        {
            HANDLE hThread = OpenThread(THREAD_SUSPEND_RESUME, FALSE, te32.th32ThreadID);
            if (hThread == NULL)
            {
                debug_log(LOG_ERROR, "Failed to open thread %lu for process %d. Error code: %lu",
                          te32.th32ThreadID, pid, GetLastError());
                continue;
            }

            if (SuspendThread(hThread) == (DWORD)-1)
            {
                debug_log(LOG_ERROR, "Failed to suspend thread %lu for process %d. Error code: %lu",
                          te32.th32ThreadID, pid, GetLastError());
                CloseHandle(hThread);
                continue;
            }

            suspended_any = true;
            CloseHandle(hThread);
        }
    } while (Thread32Next(hThreadSnap, &te32));

    CloseHandle(hThreadSnap);

    if (suspended_any)
    {
        return true;
    }
    else
    {
        debug_log(LOG_ERROR, " No threads were suspended for process %d", pid);
        return false;
    }
}

bool resume_process(int pid)
{
    HANDLE hThreadSnap = CreateToolhelp32Snapshot(TH32CS_SNAPTHREAD, 0);
    if (hThreadSnap == INVALID_HANDLE_VALUE)
    {
        debug_log(LOG_ERROR, "Failed to create snapshot of threads for process %d. Error code: %lu",
                  pid, GetLastError());
        return false;
    }

    THREADENTRY32 te32;
    te32.dwSize = sizeof(THREADENTRY32);

    if (!Thread32First(hThreadSnap, &te32))
    {
        debug_log(LOG_ERROR, "Failed to get first thread for process %d. Error code: %lu", pid,
                  GetLastError());
        CloseHandle(hThreadSnap);
        return false;
    }

    bool resumed_any = false;
    do
    {
        if (te32.th32OwnerProcessID == pid)
        {
            HANDLE hThread = OpenThread(THREAD_SUSPEND_RESUME, FALSE, te32.th32ThreadID);
            if (hThread == NULL)
            {
                debug_log(LOG_ERROR, "Failed to open thread %lu for process %d. Error code: %lu",
                          te32.th32ThreadID, pid, GetLastError());
                continue;
            }

            if (ResumeThread(hThread) == (DWORD)-1)
            {
                debug_log(LOG_ERROR, "Failed to resume thread %lu for process %d. Error code: %lu",
                          te32.th32ThreadID, pid, GetLastError());
                CloseHandle(hThread);
                continue;
            }

            resumed_any = true;
            CloseHandle(hThread);
        }
    } while (Thread32Next(hThreadSnap, &te32));

    CloseHandle(hThreadSnap);

    if (resumed_any)
    {
        return true;
    }
    else
    {
        debug_log(LOG_ERROR, "No threads were resumed for process %d", pid);
        return false;
    }
}

bool IsPE64Bit(HANDLE hProcess, LPVOID baseAddress)
{
    IMAGE_DOS_HEADER dosHeader;
    IMAGE_NT_HEADERS ntHeaders;

    if (!ReadProcessMemory(hProcess, baseAddress, &dosHeader, sizeof(dosHeader), nullptr))
    {
        return false;
    }

    if (dosHeader.e_magic != IMAGE_DOS_SIGNATURE)
    {
        return false;
    }

    if (!ReadProcessMemory(hProcess, (LPVOID)((DWORD_PTR)baseAddress + dosHeader.e_lfanew),
                           &ntHeaders, sizeof(ntHeaders), nullptr))
    {
        return false;
    }

    if (ntHeaders.Signature != IMAGE_NT_SIGNATURE)
    {
        return false;
    }

    return ntHeaders.FileHeader.Machine == IMAGE_FILE_MACHINE_AMD64;
}

ModuleInfo *enummodule_native(DWORD pid, size_t *count)
{
    std::vector<ModuleInfo> modules;
    HANDLE hModuleSnap = INVALID_HANDLE_VALUE;
    MODULEENTRY32 me32;

    hModuleSnap = CreateToolhelp32Snapshot(TH32CS_SNAPMODULE | TH32CS_SNAPMODULE32, pid);
    if (hModuleSnap == INVALID_HANDLE_VALUE)
    {
        *count = 0;
        return nullptr;
    }

    me32.dwSize = sizeof(MODULEENTRY32);

    if (!Module32First(hModuleSnap, &me32))
    {
        CloseHandle(hModuleSnap);
        *count = 0;
        return nullptr;
    }

    HANDLE hProcess = OpenProcess(PROCESS_VM_READ, FALSE, pid);
    if (hProcess == NULL)
    {
        CloseHandle(hModuleSnap);
        *count = 0;
        return nullptr;
    }

    do
    {
        ModuleInfo info;
        info.base = reinterpret_cast<uintptr_t>(me32.modBaseAddr);
        info.size = static_cast<int>(me32.modBaseSize);

        info.is_64bit = IsPE64Bit(hProcess, me32.modBaseAddr);

        size_t nameLength = strlen(me32.szModule) + 1;
        info.modulename = new char[nameLength];
        strcpy_s(info.modulename, nameLength, me32.szModule);

        modules.push_back(info);
    } while (Module32Next(hModuleSnap, &me32));

    CloseHandle(hProcess);
    CloseHandle(hModuleSnap);

    *count = modules.size();
    ModuleInfo *result = new ModuleInfo[*count];
    std::copy(modules.begin(), modules.end(), result);

    return result;
}

int native_init(int mode)
{
    return 1;
}