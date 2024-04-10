#include <windows.h>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <psapi.h>
#include <stdio.h>
#include <tlhelp32.h>
#include <vector>

typedef struct {
  int pid;
  char *processname;
} ProcessInfo;

extern "C" int get_pid_native() { return GetCurrentProcessId(); }

extern "C" SSIZE_T read_memory_native(int pid, uintptr_t address, size_t size,
                                      unsigned char *buffer) {
  // Open the process with read permissions
  HANDLE processHandle = OpenProcess(PROCESS_VM_READ, FALSE, pid);
  if (processHandle == NULL) {
    // Failed to open process
    return -1;
  }

  // Read the memory from the process
  SIZE_T bytesRead;
  if (ReadProcessMemory(processHandle, (LPCVOID)address, buffer, size,
                        &bytesRead)) {
    // Successfully read memory
    CloseHandle(processHandle);
    return (SSIZE_T)bytesRead;
  } else {
    // Failed to read memory
    CloseHandle(processHandle);
    return -1;
  }
}

extern "C" SSIZE_T write_memory_native(int pid, void *address, size_t size, unsigned char *buffer) {
    HANDLE processHandle = OpenProcess(PROCESS_VM_WRITE | PROCESS_VM_OPERATION, FALSE, pid);
    if (processHandle == NULL) {
        printf("OpenProcess failed: %lu\n", GetLastError());
        return -1;
    }

    SIZE_T bytesWritten;
    BOOL result = WriteProcessMemory(processHandle, address, buffer, size, &bytesWritten);
    if (!result) {
        printf("WriteProcessMemory failed: %lu\n", GetLastError());
        CloseHandle(processHandle);
        return -1;
    }

    CloseHandle(processHandle);

    return bytesWritten;
}



extern "C" void enumerate_regions_to_buffer(DWORD pid, char *buffer,
                                            size_t buffer_size) {
  HANDLE processHandle =
      OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, FALSE, pid);
  if (processHandle == NULL) {
    snprintf(buffer, buffer_size, "Failed to open process\n");
    return;
  }

  MEMORY_BASIC_INFORMATION memInfo;
  unsigned char *addr = 0;
  size_t offset = 0;

  while (VirtualQueryEx(processHandle, addr, &memInfo, sizeof(memInfo))) {
    const char *state = memInfo.State == MEM_COMMIT    ? " "
                        : memInfo.State == MEM_RESERVE ? "r"
                                                       : " ";

    // The permissions are approximated as Linux-like permissions, but not
    // exactly the same.
    char permissions[5] = "----";
    if (memInfo.Protect & (PAGE_EXECUTE | PAGE_EXECUTE_READ |
                           PAGE_EXECUTE_READWRITE | PAGE_EXECUTE_WRITECOPY))
      permissions[2] = 'x';
    if (memInfo.Protect & (PAGE_READWRITE | PAGE_READONLY | PAGE_EXECUTE_READ |
                           PAGE_EXECUTE_READWRITE))
      permissions[0] = 'r';
    if (memInfo.Protect & (PAGE_READWRITE | PAGE_WRITECOPY |
                           PAGE_EXECUTE_READWRITE | PAGE_EXECUTE_WRITECOPY))
      permissions[1] = 'w';

    char mappedFileName[MAX_PATH] = {0};
    if (memInfo.Type == MEM_MAPPED) {
      GetMappedFileNameA(processHandle, addr, mappedFileName,
                         sizeof(mappedFileName));
    }

    int written = snprintf(
        buffer + offset, buffer_size - offset, "%p-%p %s %s %s %s\n", addr,
        (unsigned char *)addr + memInfo.RegionSize, state, permissions,
        (memInfo.Type == MEM_MAPPED ? "p" : " "), mappedFileName);
    if (written <= 0 || written >= buffer_size - offset) {
      break;
    }

    offset += written;
    addr = (unsigned char *)memInfo.BaseAddress + memInfo.RegionSize;
  }

  CloseHandle(processHandle);
}

extern "C" ProcessInfo *enumprocess_native(size_t *count) {
  // Take a snapshot of all processes in the system.
  HANDLE hSnapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
  if (hSnapshot == INVALID_HANDLE_VALUE) {
    *count = 0;
    return nullptr;
  }

  PROCESSENTRY32W pe32;
  pe32.dwSize = sizeof(PROCESSENTRY32W);

  // Retrieve information about the first process,
  // and exit if unsuccessful
  if (!Process32FirstW(hSnapshot, &pe32)) {
    CloseHandle(hSnapshot);
    *count = 0;
    return nullptr;
  }

  std::vector<ProcessInfo> processes;

  do {
    ProcessInfo info;
    info.pid = pe32.th32ProcessID;
    info.processname = new char[MAX_PATH];

    // Convert from wide characters to multi-byte characters
    wcstombs(info.processname, pe32.szExeFile, MAX_PATH);

    processes.push_back(info);
  } while (Process32NextW(hSnapshot, &pe32));

  CloseHandle(hSnapshot);

  // Allocate and populate the return array
  ProcessInfo *retArray = new ProcessInfo[processes.size()];
  for (size_t i = 0; i < processes.size(); i++) {
    retArray[i] = processes[i];
  }

  // Set the count and return the array
  *count = processes.size();
  return retArray;
}