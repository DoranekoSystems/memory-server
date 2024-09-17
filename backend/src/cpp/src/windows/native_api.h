#ifndef NATIVEAPI_H
#define NATIVEAPI_H

#include <windows.h>
//
#include <psapi.h>
#include <stdio.h>
#include <tlhelp32.h>

#include <cstdint>
#include <cstdio>
#include <cstring>
#include <iostream>
#include <vector>

enum LogLevel {
    LOG_TRACE,
    LOG_DEBUG,
    LOG_INFO,
    LOG_WARN,
    LOG_ERROR
};

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

extern "C" void native_log(int level, const char* message);
int debug_log(LogLevel level, const char *format, ...);
extern "C" int get_pid_native();
extern "C" SSIZE_T read_memory_native(int pid, uintptr_t address, size_t size,
                                      unsigned char *buffer);
extern "C" SSIZE_T write_memory_native(int pid, void *address, size_t size, unsigned char *buffer);
extern "C" void enumerate_regions_to_buffer(DWORD pid, char *buffer, size_t buffer_size);
extern "C" ProcessInfo *enumprocess_native(size_t *count);
extern "C" bool suspend_process(int pid);
extern "C" bool resume_process(int pid);
extern "C" ModuleInfo *enummodule_native(DWORD pid, size_t *count);
extern "C" int native_init(int mode);

#endif