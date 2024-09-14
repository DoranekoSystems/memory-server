#ifndef NATIVEAPI_H
#define NATIVEAPI_H

#include <dirent.h>
#include <dlfcn.h>
#include <elf.h>
#include <errno.h>
#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <sys/mman.h>
#include <sys/ptrace.h>
#include <sys/queue.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <sys/uio.h>
#include <sys/wait.h>
#include <unistd.h>

#include <cstdarg>
#include <cstdio>
#include <cstring>
#include <fstream>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

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

extern "C" int debug_log(const char *format, ...);
extern "C" pid_t get_pid_native();
extern "C" ssize_t read_memory_native(int pid, uintptr_t address, size_t size,
                                      unsigned char *buffer);
extern "C" ssize_t write_memory_native(int pid, void *address, size_t size, unsigned char *buffer);
extern "C" void enumerate_regions_to_buffer(pid_t pid, char *buffer, size_t buffer_size);
extern "C" ProcessInfo *enumprocess_native(size_t *count);
extern "C" bool suspend_process(pid_t pid);
extern "C" bool resume_process(pid_t pid);
extern "C" ModuleInfo *enummodule_native(pid_t pid, size_t *count);
extern "C" int native_init(int mode);

#endif