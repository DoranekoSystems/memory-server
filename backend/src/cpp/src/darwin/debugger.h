#ifndef DEBUGGER_H
#define DEBUGGER_H

#include <mach/mach.h>
#include <mach/mach_error.h>
#include <mach/mach_traps.h>
#include <mach/task.h>
#include <mach/thread_act.h>
#include <mach/vm_map.h>
#include <unistd.h>

#include <cstdint>
#include <cstring>
#include <iostream>
#include <map>
#include <string>
#include <thread>
#include <vector>

#include "../common/util.h"
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
    kern_return_t set_breakpoint(mach_vm_address_t address, int hit_count);
    kern_return_t remove_breakpoint(mach_vm_address_t address);
    kern_return_t handle_exception(mach_port_t exception_port, mach_port_t thread, mach_port_t task,
                                   exception_type_t exception, mach_exception_data_t code,
                                   mach_msg_type_number_t code_count);

private:
    static const int MAX_WATCHPOINTS = 4;   // Maximum number of watchpoints for ARM64
    static const int MAX_BREAKPOINTS = 16;  // Maximum number of breakpoints for ARM64
    pid_t pid_;
    mach_port_t task_port_;
    mach_port_t exception_port_;
    std::vector<bool> watchpoint_used;
    std::vector<mach_vm_address_t> watchpoint_addresses;
    std::vector<int> watchpoint_sizes;
    std::vector<bool> breakpoint_used;
    std::vector<mach_vm_address_t> breakpoint_addresses;
    std::vector<int> breakpoint_hit_counts;
    std::vector<int> breakpoint_target_counts;

    enum class SingleStepMode
    {
        None,
        Watchpoint,
        Breakpoint
    };

    SingleStepMode single_step_mode = SingleStepMode::None;
    int single_step_count = 0;
    int current_breakpoint_index = -1;

    kern_return_t handle_single_step(mach_port_t thread, arm_debug_state64_t& debug_state,
                                     arm_thread_state64_t& thread_state,
                                     arm_exception_state64_t& exception_state);
    kern_return_t complete_watchpoint_single_step(mach_port_t thread,
                                                  arm_debug_state64_t& debug_state,
                                                  arm_thread_state64_t& thread_state,
                                                  arm_exception_state64_t& exception_state);
    kern_return_t continue_breakpoint_single_step(mach_port_t thread,
                                                  arm_debug_state64_t& debug_state,
                                                  arm_thread_state64_t& thread_state,
                                                  arm_exception_state64_t& exception_state);
    kern_return_t handle_watchpoint_hit(mach_port_t thread, arm_debug_state64_t& debug_state,
                                        arm_thread_state64_t& thread_state,
                                        arm_exception_state64_t& exception_state,
                                        int watchpoint_index);
    kern_return_t handle_breakpoint_hit(mach_port_t thread, arm_debug_state64_t& debug_state,
                                        arm_thread_state64_t& thread_state,
                                        arm_exception_state64_t& exception_state,
                                        int breakpoint_index);
    int find_free_watchpoint();
    int find_watchpoint_index(mach_vm_address_t address);
    int find_free_breakpoint();
    int find_breakpoint_index(mach_vm_address_t address);
    int get_available_watchpoints(mach_port_t thread);
    kern_return_t set_watchpoint_on_thread(mach_port_t thread, mach_vm_address_t address, int size,
                                           WatchpointType type, int index);
    static std::string kern_return_to_string(kern_return_t kr);
};

// Global pointer to the Debugger instance
extern Debugger* g_debugger;

#endif  // DEBUGGER_H