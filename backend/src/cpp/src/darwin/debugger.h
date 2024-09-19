#include <mach/mach.h>
#include <mach/mach_error.h>
#include <mach/mach_traps.h>
#include <mach/task.h>
#include <mach/thread_act.h>
#include <mach/vm_map.h>
#include <unistd.h>

#include <cstring>
#include <iostream>
#include <string>
#include <thread>
#include <vector>

#include "native_api.h"

#define EXCEPTION_DEFAULT_BEHAVIOR 0x0

enum class WatchpointType
{
    READ = 1,
    WRITE = 2,
    READWRITE = 3
};

class Debugger
{
public:
    Debugger(pid_t pid);
    ~Debugger();

    bool initialize();
    void run();
    kern_return_t set_watchpoint(mach_vm_address_t address, int size, WatchpointType type);
    kern_return_t remove_watchpoint(mach_vm_address_t address);
    kern_return_t handle_exception(mach_port_t exception_port, mach_port_t thread, mach_port_t task,
                                   exception_type_t exception, mach_exception_data_t code,
                                   mach_msg_type_number_t code_count);

private:
    static const int MAX_WATCHPOINTS = 4;  // Maximum number of watchpoints for ARM64

    pid_t pid_;
    mach_port_t task_port_;
    mach_port_t exception_port_;
    std::vector<bool> watchpoint_used;
    std::vector<mach_vm_address_t> watchpoint_addresses;

    kern_return_t handle_single_step(mach_port_t thread);
    int find_free_watchpoint();
    int find_watchpoint_index(mach_vm_address_t address);
    int get_available_watchpoints(mach_port_t thread);
    kern_return_t set_watchpoint_on_thread(mach_port_t thread, mach_vm_address_t address, int size,
                                           WatchpointType type, int index);

    static std::string kern_return_to_string(kern_return_t kr);
};

// Global pointer to the Debugger instance
Debugger *g_debugger = nullptr;

extern "C"
{
    bool debugger_new(pid_t pid)
    {
        if (g_debugger == nullptr)
        {
            g_debugger = new Debugger(pid);
            if (g_debugger->initialize())
            {
                std::thread([&]() { g_debugger->run(); }).detach();
                return true;
            }
            else
            {
                return false;
            }
        }
        return true;
    }

    kern_return_t set_watchpoint_native(mach_vm_address_t address, int size, WatchpointType type)
    {
        kern_return_t ret = g_debugger->set_watchpoint(address, size, type);
    }

    kern_return_t remove_watchpoint_native(mach_vm_address_t address)
    {
        return g_debugger->remove_watchpoint(address);
    }
}
