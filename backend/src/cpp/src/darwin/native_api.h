#ifndef NATIVEAPI_H
#define NATIVEAPI_H

#include <mach/mach.h>
#include <mach/vm_map.h>
#include <mach/vm_region.h>
#include <sys/sysctl.h>

#include <string>
#include <vector>

enum LogLevel
{
    LOG_TRACE,
    LOG_DEBUG,
    LOG_INFO,
    LOG_WARN,
    LOG_ERROR
};

enum ServerMode
{
    NORMAL,
    EMBEDDED,
};

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

typedef struct
{
    int mode;
} ServerState;

ServerState global_server_state;

typedef int (*PROC_REGIONFILENAME)(int pid, uint64_t address, void *buffer, uint32_t buffersize);
extern PROC_REGIONFILENAME proc_regionfilename;
typedef int (*PROC_PIDPATH)(int pid, void *buffer, uint32_t buffersize);
extern PROC_PIDPATH proc_pidpath;

extern "C" kern_return_t mach_vm_read_overwrite(vm_map_t, mach_vm_address_t, mach_vm_size_t,
                                                mach_vm_address_t, mach_vm_size_t *);

extern "C" kern_return_t mach_vm_write(vm_map_t, mach_vm_address_t, vm_offset_t,
                                       mach_msg_type_number_t);

extern "C" kern_return_t mach_vm_protect(vm_map_t, mach_vm_address_t, mach_vm_size_t, boolean_t,
                                         vm_prot_t);

extern "C" kern_return_t mach_vm_region(vm_map_t, mach_vm_address_t *, mach_vm_size_t *,
                                        vm_region_flavor_t, vm_region_info_t,
                                        mach_msg_type_number_t *, mach_port_t *);

extern "C" int native_init(int mode);

extern "C" pid_t get_pid_native();

extern "C" ssize_t read_memory_native(int pid, mach_vm_address_t address, mach_vm_size_t size,
                                      unsigned char *buffer);

extern "C" ssize_t write_memory_native(int pid, mach_vm_address_t address, mach_vm_size_t size,
                                       unsigned char *buffer);

extern "C" void enumerate_regions_to_buffer(pid_t pid, char *buffer, size_t buffer_size);

extern "C" ProcessInfo *enumprocess_native(size_t *count);

extern "C" bool suspend_process(pid_t pid);

extern "C" bool resume_process(pid_t pid);

extern "C" ModuleInfo *enummodule_native(pid_t pid, size_t *count);

extern "C" void native_log(int level, const char *message);
int debug_log(LogLevel level, const char *format, ...);

#endif
