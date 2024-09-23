#include "debugger.h"

extern "C"
{
    boolean_t exc_server(mach_msg_header_t* InHeadP, mach_msg_header_t* OutHeadP);
}

__attribute__((used)) extern "C" kern_return_t catch_exception_raise(
    mach_port_t exception_port, mach_port_t thread, mach_port_t task, exception_type_t exception,
    mach_exception_data_t code, mach_msg_type_number_t code_count)
{
    if (g_debugger)
    {
        return g_debugger->handle_exception(exception_port, thread, task, exception, code,
                                            code_count);
    }
    return KERN_FAILURE;
}

Debugger* g_debugger = nullptr;

Debugger::Debugger(pid_t pid)
    : pid_(pid),
      task_port_(MACH_PORT_NULL),
      exception_port_(MACH_PORT_NULL),
      watchpoint_used(MAX_WATCHPOINTS, false),
      watchpoint_addresses(MAX_WATCHPOINTS, 0),
      watchpoint_sizes(MAX_WATCHPOINTS, 0),
      breakpoint_used(MAX_BREAKPOINTS, false),
      breakpoint_addresses(MAX_BREAKPOINTS, 0),
      breakpoint_hit_counts(MAX_BREAKPOINTS, 0),
      breakpoint_target_counts(MAX_BREAKPOINTS, 0)
{
}

Debugger::~Debugger()
{
    if (exception_port_ != MACH_PORT_NULL)
    {
        mach_port_deallocate(mach_task_self(), exception_port_);
    }
    if (task_port_ != MACH_PORT_NULL)
    {
        mach_port_deallocate(mach_task_self(), task_port_);
    }
}

bool Debugger::initialize()
{
    kern_return_t kr;

    kr = task_for_pid(mach_task_self(), pid_, &task_port_);
    if (kr != KERN_SUCCESS)
    {
        debug_log(LOG_ERROR, "task_for_pid failed: %s", kern_return_to_string(kr).c_str());
        return false;
    }

    kr = mach_port_allocate(mach_task_self(), MACH_PORT_RIGHT_RECEIVE, &exception_port_);
    if (kr != KERN_SUCCESS)
    {
        debug_log(LOG_ERROR, "mach_port_allocate failed: %s", kern_return_to_string(kr).c_str());
        return false;
    }

    kr = mach_port_insert_right(mach_task_self(), exception_port_, exception_port_,
                                MACH_MSG_TYPE_MAKE_SEND);
    if (kr != KERN_SUCCESS)
    {
        debug_log(LOG_ERROR, "mach_port_insert_right failed: %s",
                  kern_return_to_string(kr).c_str());
        return false;
    }

    kr = task_set_exception_ports(task_port_, EXC_MASK_ALL, exception_port_, EXCEPTION_DEFAULT,
                                  ARM_THREAD_STATE64);
    if (kr != KERN_SUCCESS)
    {
        debug_log(LOG_ERROR, "task_set_exception_ports failed: %s",
                  kern_return_to_string(kr).c_str());
        return false;
    }

    debug_log(LOG_INFO, "Debugger initialized for process %d", pid_);
    return true;
}

void Debugger::run()
{
    kern_return_t kr = mach_msg_server(exc_server, 2048, exception_port_, MACH_MSG_OPTION_NONE);

    if (kr != KERN_SUCCESS)
    {
        debug_log(LOG_ERROR, "mach_msg_server failed: %s", kern_return_to_string(kr).c_str());
    }
    else
    {
        debug_log(LOG_INFO, "mach_msg_server succeeded.");
    }
}

kern_return_t Debugger::set_watchpoint(mach_vm_address_t address, int size, WatchpointType type)
{
    thread_act_array_t thread_list;
    mach_msg_type_number_t thread_count;
    kern_return_t kr;

    kr = task_threads(task_port_, &thread_list, &thread_count);
    if (kr != KERN_SUCCESS || thread_count == 0)
    {
        debug_log(LOG_ERROR, "Failed to get threads: ", kern_return_to_string(kr).c_str());
        return kr;
    }

    int index = find_free_watchpoint();
    if (index == -1)
    {
        debug_log(LOG_ERROR, "No free watchpoints available.");
        return KERN_NO_SPACE;
    }

    kr = set_watchpoint_on_thread(thread_list[0], address, size, type, index);
    if (kr == KERN_SUCCESS)
    {
        watchpoint_used[index] = true;
        watchpoint_addresses[index] = address;
        watchpoint_sizes[index] = size;
        debug_log(LOG_INFO, "Watchpoint set successfully at address 0x%llx", address);
    }

    for (mach_msg_type_number_t i = 0; i < thread_count; i++)
    {
        mach_port_deallocate(mach_task_self(), thread_list[i]);
    }
    vm_deallocate(mach_task_self(), (vm_address_t)thread_list, thread_count * sizeof(thread_act_t));

    return kr;
}

kern_return_t Debugger::remove_watchpoint(mach_vm_address_t address)
{
    thread_act_array_t thread_list;
    mach_msg_type_number_t thread_count;
    kern_return_t kr;

    kr = task_threads(task_port_, &thread_list, &thread_count);
    if (kr != KERN_SUCCESS || thread_count == 0)
    {
        debug_log(LOG_ERROR, "Failed to get threads: %s", kern_return_to_string(kr).c_str());
        return kr;
    }

    int index = find_watchpoint_index(address);
    if (index == -1)
    {
        debug_log(LOG_ERROR, "Watchpoint not found for address: 0x%llx", address);
        return KERN_INVALID_ARGUMENT;
    }

    arm_debug_state64_t debug_state = {0};
    mach_msg_type_number_t count = ARM_DEBUG_STATE64_COUNT;
    kr = thread_get_state(thread_list[0], ARM_DEBUG_STATE64, (thread_state_t)&debug_state, &count);
    if (kr != KERN_SUCCESS)
    {
        debug_log(LOG_ERROR, "Failed to get debug state: %s", kern_return_to_string(kr).c_str());
        return kr;
    }

    debug_state.__wcr[index] = 0;  // Disable the watchpoint
    kr = thread_set_state(thread_list[0], ARM_DEBUG_STATE64, (thread_state_t)&debug_state, count);
    if (kr == KERN_SUCCESS)
    {
        watchpoint_used[index] = false;
        watchpoint_addresses[index] = 0;
        watchpoint_sizes[index] = 0;
        debug_log(LOG_INFO, "Watchpoint removed successfully from address 0x%llx", address);
    }
    else
    {
        debug_log(LOG_ERROR, "Failed to remove watchpoint: %s", kern_return_to_string(kr).c_str());
    }

    for (mach_msg_type_number_t i = 0; i < thread_count; i++)
    {
        mach_port_deallocate(mach_task_self(), thread_list[i]);
    }
    vm_deallocate(mach_task_self(), (vm_address_t)thread_list, thread_count * sizeof(thread_act_t));

    return kr;
}

kern_return_t Debugger::set_breakpoint(mach_vm_address_t address, int hit_count)
{
    thread_act_array_t thread_list;
    mach_msg_type_number_t thread_count;
    kern_return_t kr;

    kr = task_threads(task_port_, &thread_list, &thread_count);
    if (kr != KERN_SUCCESS || thread_count == 0)
    {
        debug_log(LOG_ERROR, "Failed to get threads: %s", kern_return_to_string(kr).c_str());
        return kr;
    }

    int index = find_free_breakpoint();
    if (index == -1)
    {
        debug_log(LOG_ERROR, "No free breakpoints available.");
        return KERN_NO_SPACE;
    }

    arm_debug_state64_t debug_state = {0};
    mach_msg_type_number_t count = ARM_DEBUG_STATE64_COUNT;
    kr = thread_get_state(thread_list[0], ARM_DEBUG_STATE64, (thread_state_t)&debug_state, &count);
    if (kr != KERN_SUCCESS)
    {
        debug_log(LOG_ERROR, "Failed to get debug state: %s", kern_return_to_string(kr).c_str());
        return kr;
    }

    debug_state.__bvr[index] = address;
    debug_state.__bcr[index] = (1ULL << 0) | (2ULL << 1) | (1ULL << 5);  // Enable, EL1, all sizes
    debug_state.__mdscr_el1 |= (1ULL << 15);                             // Enable debug

    kr = thread_set_state(thread_list[0], ARM_DEBUG_STATE64, (thread_state_t)&debug_state, count);
    if (kr == KERN_SUCCESS)
    {
        breakpoint_used[index] = true;
        breakpoint_addresses[index] = address;
        breakpoint_hit_counts[index] = 0;
        breakpoint_target_counts[index] = hit_count;
        debug_log(LOG_INFO, "Breakpoint set successfully at address 0x%llx", address);
    }
    else
    {
        debug_log(LOG_ERROR, "Failed to set breakpoint: %s", kern_return_to_string(kr).c_str());
    }

    for (mach_msg_type_number_t i = 0; i < thread_count; i++)
    {
        mach_port_deallocate(mach_task_self(), thread_list[i]);
    }
    vm_deallocate(mach_task_self(), (vm_address_t)thread_list, thread_count * sizeof(thread_act_t));

    return kr;
}

kern_return_t Debugger::remove_breakpoint(mach_vm_address_t address)
{
    thread_act_array_t thread_list;
    mach_msg_type_number_t thread_count;
    kern_return_t kr;

    kr = task_threads(task_port_, &thread_list, &thread_count);
    if (kr != KERN_SUCCESS || thread_count == 0)
    {
        debug_log(LOG_ERROR, "Failed to get threads: %s", kern_return_to_string(kr).c_str());
        return kr;
    }

    int index = find_breakpoint_index(address);
    if (index == -1)
    {
        debug_log(LOG_ERROR, "Breakpoint not found for address: 0x%llx", address);
        return KERN_INVALID_ARGUMENT;
    }

    arm_debug_state64_t debug_state = {0};
    mach_msg_type_number_t count = ARM_DEBUG_STATE64_COUNT;
    kr = thread_get_state(thread_list[0], ARM_DEBUG_STATE64, (thread_state_t)&debug_state, &count);
    if (kr != KERN_SUCCESS)
    {
        debug_log(LOG_ERROR, "Failed to get debug state: %s", kern_return_to_string(kr).c_str());
        return kr;
    }

    debug_state.__bcr[index] = 0;  // Disable the breakpoint
    kr = thread_set_state(thread_list[0], ARM_DEBUG_STATE64, (thread_state_t)&debug_state, count);
    if (kr == KERN_SUCCESS)
    {
        breakpoint_used[index] = false;
        breakpoint_addresses[index] = 0;
        breakpoint_hit_counts[index] = 0;
        breakpoint_target_counts[index] = 0;
        debug_log(LOG_INFO, "Breakpoint removed successfully from address 0x%llx", address);
    }
    else
    {
        debug_log(LOG_ERROR, "Failed to remove breakpoint: %s", kern_return_to_string(kr).c_str());
    }

    for (mach_msg_type_number_t i = 0; i < thread_count; i++)
    {
        mach_port_deallocate(mach_task_self(), thread_list[i]);
    }
    vm_deallocate(mach_task_self(), (vm_address_t)thread_list, thread_count * sizeof(thread_act_t));

    return kr;
}

kern_return_t Debugger::handle_exception(mach_port_t exception_port, mach_port_t thread,
                                         mach_port_t task, exception_type_t exception,
                                         mach_exception_data_t code,
                                         mach_msg_type_number_t code_count)
{
    if (exception != EXC_BREAKPOINT && exception != EXC_GUARD)
    {
        return KERN_FAILURE;
    }

    arm_thread_state64_t thread_state;
    mach_msg_type_number_t thread_state_count = ARM_THREAD_STATE64_COUNT;
    kern_return_t kr = thread_get_state(thread, ARM_THREAD_STATE64, (thread_state_t)&thread_state,
                                        &thread_state_count);
    if (kr != KERN_SUCCESS)
    {
        debug_log(LOG_ERROR, "Failed to get thread state: %s", mach_error_string(kr));
        return kr;
    }

    arm_debug_state64_t debug_state;
    mach_msg_type_number_t debug_state_count = ARM_DEBUG_STATE64_COUNT;
    kr = thread_get_state(thread, ARM_DEBUG_STATE64, (thread_state_t)&debug_state,
                          &debug_state_count);
    if (kr != KERN_SUCCESS)
    {
        debug_log(LOG_ERROR, "Failed to get debug state: %s", mach_error_string(kr));
        return kr;
    }

    arm_exception_state64_t exception_state;
    mach_msg_type_number_t exception_state_count = ARM_EXCEPTION_STATE64_COUNT;
    kr = thread_get_state(thread, ARM_EXCEPTION_STATE64, (thread_state_t)&exception_state,
                          &exception_state_count);
    if (kr != KERN_SUCCESS)
    {
        debug_log(LOG_ERROR, "Failed to get exception state: %s", mach_error_string(kr));
        return kr;
    }

    std::vector<std::map<std::string, uint64_t>> map_vector;
    for (int i = 0; i < 30; ++i)
    {
        map_vector.push_back({{"x" + std::to_string(i), thread_state.__x[i]}});
    }
    map_vector.push_back({{"lr", thread_state.__lr}});
    map_vector.push_back({{"fp", thread_state.__fp}});
    map_vector.push_back({{"sp", thread_state.__sp}});
    map_vector.push_back({{"pc", thread_state.__pc}});
    map_vector.push_back({{"cpsr", thread_state.__cpsr}});

    if (single_step_mode != SingleStepMode::None)
    {
        std::string register_json = map_vector_to_json_string(map_vector);
        send_register_json(register_json.c_str(), pid_);
        return handle_single_step(thread, debug_state, thread_state, exception_state);
    }

    uint32_t esr = exception_state.__esr;
    uint32_t ec = (esr >> 26) & 0x3F;  // Exception Class

    if (ec == 0x34 || ec == 0x35)
    {
        uint64_t far = exception_state.__far;
        map_vector.push_back({{"memory", far}});

        for (int i = 0; i < MAX_WATCHPOINTS; i++)
        {
            if (watchpoint_used[i] && far >= watchpoint_addresses[i] &&
                far < watchpoint_addresses[i] + watchpoint_sizes[i])
            {
                std::string register_json = map_vector_to_json_string(map_vector);
                send_register_json(register_json.c_str(), pid_);
                return handle_watchpoint_hit(thread, debug_state, thread_state, exception_state, i);
            }
        }
    }
    else if (ec == 0x30 || ec == 0x31)  // It's a breakpoint
    {
        for (int i = 0; i < MAX_BREAKPOINTS; i++)
        {
            if (breakpoint_used[i] && thread_state.__pc == breakpoint_addresses[i])
            {
                std::string register_json = map_vector_to_json_string(map_vector);
                send_register_json(register_json.c_str(), pid_);
                // onetime breakpoint
                debug_state.__bcr[i] = 0;  // Disable the breakpoint
                return handle_breakpoint_hit(thread, debug_state, thread_state, exception_state, i);
            }
        }
    }

    return KERN_SUCCESS;
}

kern_return_t Debugger::handle_single_step(mach_port_t thread, arm_debug_state64_t& debug_state,
                                           arm_thread_state64_t& thread_state,
                                           arm_exception_state64_t& exception_state)
{
    switch (single_step_mode)
    {
        case SingleStepMode::Watchpoint:
            return complete_watchpoint_single_step(thread, debug_state, thread_state,
                                                   exception_state);
        case SingleStepMode::Breakpoint:
            return continue_breakpoint_single_step(thread, debug_state, thread_state,
                                                   exception_state);
        default:
            return KERN_FAILURE;
    }
}

kern_return_t Debugger::complete_watchpoint_single_step(mach_port_t thread,
                                                        arm_debug_state64_t& debug_state,
                                                        arm_thread_state64_t& thread_state,
                                                        arm_exception_state64_t& exception_state)
{
    // Re-enable the watchpoint
    debug_state.__wcr[0] |= 1ULL << 0;

    // Disable single-step mode
    debug_state.__mdscr_el1 &= ~1ULL;

    kern_return_t kr = thread_set_state(thread, ARM_DEBUG_STATE64, (thread_state_t)&debug_state,
                                        ARM_DEBUG_STATE64_COUNT);
    if (kr != KERN_SUCCESS)
    {
        debug_log(LOG_ERROR, "Failed to restore debug state: %s", mach_error_string(kr));
        return kr;
    }

    single_step_mode = SingleStepMode::None;
    return KERN_SUCCESS;
}

kern_return_t Debugger::continue_breakpoint_single_step(mach_port_t thread,
                                                        arm_debug_state64_t& debug_state,
                                                        arm_thread_state64_t& thread_state,
                                                        arm_exception_state64_t& exception_state)
{
    single_step_count++;
    if (single_step_count >= breakpoint_target_counts[current_breakpoint_index] + 1)
    {
        single_step_mode = SingleStepMode::None;
        single_step_count = 0;
        breakpoint_used[current_breakpoint_index] = false;
        breakpoint_addresses[current_breakpoint_index] = 0;
        breakpoint_hit_counts[current_breakpoint_index] = 0;
        breakpoint_target_counts[current_breakpoint_index] = 0;
        return KERN_SUCCESS;
    }

    // Continue single-stepping
    debug_state.__mdscr_el1 |= 1ULL;
    kern_return_t kr = thread_set_state(thread, ARM_DEBUG_STATE64, (thread_state_t)&debug_state,
                                        ARM_DEBUG_STATE64_COUNT);
    if (kr != KERN_SUCCESS)
    {
        debug_log(LOG_ERROR, "Failed to set single-step mode: %s", mach_error_string(kr));
        return kr;
    }

    return KERN_SUCCESS;
}

kern_return_t Debugger::handle_watchpoint_hit(mach_port_t thread, arm_debug_state64_t& debug_state,
                                              arm_thread_state64_t& thread_state,
                                              arm_exception_state64_t& exception_state,
                                              int watchpoint_index)
{
    // Temporarily disable the watchpoint
    debug_state.__wcr[watchpoint_index] &= ~(1ULL << 0);

    // Enable single-step mode
    debug_state.__mdscr_el1 |= 1ULL;

    kern_return_t kr = thread_set_state(thread, ARM_DEBUG_STATE64, (thread_state_t)&debug_state,
                                        ARM_DEBUG_STATE64_COUNT);
    if (kr != KERN_SUCCESS)
    {
        debug_log(LOG_ERROR, "Failed to set debug state: %s", mach_error_string(kr));
        return kr;
    }

    single_step_mode = SingleStepMode::Watchpoint;
    return KERN_SUCCESS;
}

kern_return_t Debugger::handle_breakpoint_hit(mach_port_t thread, arm_debug_state64_t& debug_state,
                                              arm_thread_state64_t& thread_state,
                                              arm_exception_state64_t& exception_state,
                                              int breakpoint_index)
{
    breakpoint_hit_counts[breakpoint_index]++;

    if (breakpoint_hit_counts[breakpoint_index] < breakpoint_target_counts[breakpoint_index])
    {
        single_step_mode = SingleStepMode::Breakpoint;
        single_step_count = 0;
        current_breakpoint_index = breakpoint_index;

        // Enable single-step mode
        debug_state.__mdscr_el1 |= 1ULL;
        kern_return_t kr = thread_set_state(thread, ARM_DEBUG_STATE64, (thread_state_t)&debug_state,
                                            ARM_DEBUG_STATE64_COUNT);
        if (kr != KERN_SUCCESS)
        {
            debug_log(LOG_ERROR, "Failed to set single-step mode: %s", mach_error_string(kr));
            return kr;
        }
    }
    else
    {
        remove_breakpoint(breakpoint_addresses[breakpoint_index]);
    }

    return KERN_SUCCESS;
}

int Debugger::find_free_watchpoint()
{
    for (int i = 0; i < MAX_WATCHPOINTS; i++)
    {
        if (!watchpoint_used[i])
        {
            return i;
        }
    }
    return -1;
}

int Debugger::find_watchpoint_index(mach_vm_address_t address)
{
    for (int i = 0; i < MAX_WATCHPOINTS; i++)
    {
        if (watchpoint_used[i] && watchpoint_addresses[i] == address)
        {
            return i;
        }
    }
    return -1;
}

int Debugger::find_free_breakpoint()
{
    for (int i = 0; i < MAX_BREAKPOINTS; i++)
    {
        if (!breakpoint_used[i])
        {
            return i;
        }
    }
    return -1;
}

int Debugger::find_breakpoint_index(mach_vm_address_t address)
{
    for (int i = 0; i < MAX_BREAKPOINTS; i++)
    {
        if (breakpoint_used[i] && breakpoint_addresses[i] == address)
        {
            return i;
        }
    }
    return -1;
}

int Debugger::get_available_watchpoints(mach_port_t thread)
{
    arm_debug_state64_t debug_state;
    mach_msg_type_number_t count = ARM_DEBUG_STATE64_COUNT;
    kern_return_t kr =
        thread_get_state(thread, ARM_DEBUG_STATE64, (thread_state_t)&debug_state, &count);
    if (kr != KERN_SUCCESS)
    {
        return MAX_WATCHPOINTS;
    }

    int available = 0;
    for (int i = 0; i < MAX_WATCHPOINTS; i++)
    {
        if ((debug_state.__wcr[i] & 1) == 0)
        {
            available++;
        }
    }
    return available;
}

kern_return_t Debugger::set_watchpoint_on_thread(mach_port_t thread, mach_vm_address_t address,
                                                 int size, WatchpointType type, int index)
{
    arm_debug_state64_t debug_state = {0};
    mach_msg_type_number_t count = ARM_DEBUG_STATE64_COUNT;

    kern_return_t kr =
        thread_get_state(thread, ARM_DEBUG_STATE64, (thread_state_t)&debug_state, &count);
    if (kr != KERN_SUCCESS)
    {
        debug_log(LOG_ERROR, "Failed to get thread debug state: %s",
                  kern_return_to_string(kr).c_str());
        return kr;
    }

    debug_state.__wvr[index] = address;

    uint64_t control = 0;
    switch (type)
    {
        case WatchpointType::READ:
            control = (1ULL << 0);
            break;  // Enable
        case WatchpointType::WRITE:
            control = (1ULL << 0) | (2ULL << 3);
            break;  // Enable + Write
        case WatchpointType::READWRITE:
            control = (1ULL << 0) | (3ULL << 3);
            break;  // Enable + Read/Write
    }

    // Set the LEN field based on the size
    uint64_t len_field = 0;
    switch (size)
    {
        case 1:
            len_field = 0;
            break;
        case 2:
            len_field = 1;
            break;
        case 4:
            len_field = 2;
            break;
        case 8:
            len_field = 3;
            break;
        default:
            debug_log(LOG_ERROR, "Invalid watchpoint size");
            return KERN_INVALID_ARGUMENT;
    }
    control |= (len_field << 5);

    // Set the security state bits
    control |= (2ULL << 1);  // Enable watchpoint for EL1 mode

    debug_state.__wcr[index] = control;

    // Set the MDSCR_EL1 bit (bit 15) to enable debug
    debug_state.__mdscr_el1 |= (1ULL << 15);

    kr = thread_set_state(thread, ARM_DEBUG_STATE64, (thread_state_t)&debug_state, count);
    if (kr != KERN_SUCCESS)
    {
        debug_log(LOG_ERROR, "thread_set_state failed: %s", kern_return_to_string(kr).c_str());
    }

    return kr;
}

std::string Debugger::kern_return_to_string(kern_return_t kr)
{
    return mach_error_string(kr);
}

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
                delete g_debugger;
                g_debugger = nullptr;
                return false;
            }
        }
        return true;
    }

    kern_return_t set_watchpoint_native(mach_vm_address_t address, int size, WatchpointType type)
    {
        if (g_debugger)
        {
            return g_debugger->set_watchpoint(address, size, type);
        }
        return KERN_FAILURE;
    }

    kern_return_t remove_watchpoint_native(mach_vm_address_t address)
    {
        if (g_debugger)
        {
            return g_debugger->remove_watchpoint(address);
        }
        return KERN_FAILURE;
    }

    kern_return_t set_breakpoint_native(mach_vm_address_t address, int hit_count)
    {
        if (g_debugger)
        {
            return g_debugger->set_breakpoint(address, hit_count);
        }
        return KERN_FAILURE;
    }

    kern_return_t remove_breakpoint_native(mach_vm_address_t address)
    {
        if (g_debugger)
        {
            return g_debugger->remove_breakpoint(address);
        }
        return KERN_FAILURE;
    }
}