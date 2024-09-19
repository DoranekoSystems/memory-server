#include "debugger.h"

extern "C"
{
    boolean_t exc_server(mach_msg_header_t *InHeadP, mach_msg_header_t *OutHeadP);
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

Debugger::Debugger(pid_t pid)
    : pid_(pid),
      task_port_(MACH_PORT_NULL),
      exception_port_(MACH_PORT_NULL),
      watchpoint_used(MAX_WATCHPOINTS, false),
      watchpoint_addresses(MAX_WATCHPOINTS, 0)
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
        std::cerr << "task_for_pid failed: " << kern_return_to_string(kr) << std::endl;
        return false;
    }

    kr = mach_port_allocate(mach_task_self(), MACH_PORT_RIGHT_RECEIVE, &exception_port_);
    if (kr != KERN_SUCCESS)
    {
        std::cerr << "mach_port_allocate failed: " << kern_return_to_string(kr) << std::endl;
        return false;
    }

    kr = mach_port_insert_right(mach_task_self(), exception_port_, exception_port_,
                                MACH_MSG_TYPE_MAKE_SEND);
    if (kr != KERN_SUCCESS)
    {
        std::cerr << "mach_port_insert_right failed: " << kern_return_to_string(kr) << std::endl;
        return false;
    }

    kr = task_set_exception_ports(task_port_, EXC_MASK_ALL, exception_port_, EXCEPTION_DEFAULT,
                                  ARM_THREAD_STATE64);
    if (kr != KERN_SUCCESS)
    {
        std::cerr << "task_set_exception_ports failed: " << kern_return_to_string(kr) << std::endl;
        return false;
    }

    std::cout << "Debugger initialized for process " << pid_ << std::endl;
    return true;
}

void Debugger::run()
{
    kern_return_t kr = mach_msg_server(exc_server, 2048, exception_port_, MACH_MSG_OPTION_NONE);

    if (kr != KERN_SUCCESS)
    {
        std::cerr << "mach_msg_server failed: " << kern_return_to_string(kr) << std::endl;
    }
    else
    {
        std::cout << "mach_msg_server succeeded." << std::endl;
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
        std::cerr << "Failed to get threads: " << kern_return_to_string(kr) << std::endl;
        return kr;
    }

    int index = find_free_watchpoint();
    if (index == -1)
    {
        std::cerr << "No free watchpoints available." << std::endl;
        return KERN_NO_SPACE;
    }

    kr = set_watchpoint_on_thread(thread_list[0], address, size, type, index);
    if (kr == KERN_SUCCESS)
    {
        watchpoint_used[index] = true;
        watchpoint_addresses[index] = address;
        std::cout << "Watchpoint set successfully at address 0x" << std::hex << address << std::dec
                  << std::endl;
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
        std::cerr << "Failed to get threads: " << kern_return_to_string(kr) << std::endl;
        return kr;
    }

    int index = find_watchpoint_index(address);
    if (index == -1)
    {
        std::cerr << "Watchpoint not found for address: 0x" << std::hex << address << std::dec
                  << std::endl;
        return KERN_INVALID_ARGUMENT;
    }

    arm_debug_state64_t debug_state = {0};
    mach_msg_type_number_t count = ARM_DEBUG_STATE64_COUNT;
    kr = thread_get_state(thread_list[0], ARM_DEBUG_STATE64, (thread_state_t)&debug_state, &count);
    if (kr != KERN_SUCCESS)
    {
        std::cerr << "Failed to get debug state: " << kern_return_to_string(kr) << std::endl;
        return kr;
    }

    debug_state.__wcr[index] = 0;  // Disable the watchpoint
    kr = thread_set_state(thread_list[0], ARM_DEBUG_STATE64, (thread_state_t)&debug_state, count);
    if (kr == KERN_SUCCESS)
    {
        watchpoint_used[index] = false;
        watchpoint_addresses[index] = 0;
        std::cout << "Watchpoint removed successfully from address 0x" << std::hex << address
                  << std::dec << std::endl;
    }
    else
    {
        std::cerr << "Failed to remove watchpoint: " << kern_return_to_string(kr) << std::endl;
    }

    for (mach_msg_type_number_t i = 0; i < thread_count; i++)
    {
        mach_port_deallocate(mach_task_self(), thread_list[i]);
    }
    vm_deallocate(mach_task_self(), (vm_address_t)thread_list, thread_count * sizeof(thread_act_t));

    return kr;
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
        std::cerr << "Failed to get thread debug state: " << kern_return_to_string(kr) << std::endl;
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
            std::cerr << "Invalid watchpoint size" << std::endl;
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
        std::cerr << "thread_set_state failed: " << kern_return_to_string(kr) << std::endl;
    }

    return kr;
}

kern_return_t Debugger::handle_exception(mach_port_t exception_port, mach_port_t thread,
                                         mach_port_t task, exception_type_t exception,
                                         mach_exception_data_t code,
                                         mach_msg_type_number_t code_count)
{
    static bool is_single_stepping = false;

    if (is_single_stepping)
    {
        is_single_stepping = false;
        return handle_single_step(thread);
    }

    arm_thread_state64_t thread_state;
    mach_msg_type_number_t thread_state_count = ARM_THREAD_STATE64_COUNT;
    kern_return_t kr = thread_get_state(thread, ARM_THREAD_STATE64, (thread_state_t)&thread_state,
                                        &thread_state_count);
    if (kr != KERN_SUCCESS)
    {
        std::cerr << "Failed to get thread state: " << mach_error_string(kr) << std::endl;
        return kr;
    }

    arm_debug_state64_t debug_state;
    mach_msg_type_number_t count = ARM_DEBUG_STATE64_COUNT;
    kr = thread_get_state(thread, ARM_DEBUG_STATE64, (thread_state_t)&debug_state, &count);
    if (kr != KERN_SUCCESS)
    {
        std::cerr << "Failed to get debug state: " << mach_error_string(kr) << std::endl;
        return kr;
    }

    arm_exception_state64_t exception_state;
    mach_msg_type_number_t exception_state_count = ARM_EXCEPTION_STATE64_COUNT;
    kr = thread_get_state(thread, ARM_EXCEPTION_STATE64, (thread_state_t)&exception_state,
                          &exception_state_count);
    if (kr != KERN_SUCCESS)
    {
        std::cerr << "Failed to get exception state: " << mach_error_string(kr) << std::endl;
        return kr;
    }

    std::cout << "Watchpoint exception caught at PC: 0x" << std::hex << thread_state.__pc
              << std::dec << std::endl;
    std::cout << "Memory access at address: 0x" << std::hex << exception_state.__far << std::dec
              << std::endl;

    // Temporarily disable the watchpoint
    uint64_t original_wcr = debug_state.__wcr[0];
    debug_state.__wcr[0] &= ~(1ULL << 0);

    // Enable single-step mode
    debug_state.__mdscr_el1 |= 1;

    kr = thread_set_state(thread, ARM_DEBUG_STATE64, (thread_state_t)&debug_state, count);
    if (kr != KERN_SUCCESS)
    {
        std::cerr << "Failed to set debug state: " << mach_error_string(kr) << std::endl;
        return kr;
    }

    is_single_stepping = true;

    return KERN_SUCCESS;
}

kern_return_t Debugger::handle_single_step(mach_port_t thread)
{
    arm_debug_state64_t debug_state;
    mach_msg_type_number_t count = ARM_DEBUG_STATE64_COUNT;
    kern_return_t kr =
        thread_get_state(thread, ARM_DEBUG_STATE64, (thread_state_t)&debug_state, &count);
    if (kr != KERN_SUCCESS)
    {
        std::cerr << "Failed to get debug state after single step: " << mach_error_string(kr)
                  << std::endl;
        return kr;
    }

    // Disable single-step mode
    debug_state.__mdscr_el1 &= ~1ULL;

    // Re-enable the watchpoint
    debug_state.__wcr[0] |= 1ULL << 0;

    kr = thread_set_state(thread, ARM_DEBUG_STATE64, (thread_state_t)&debug_state, count);
    if (kr != KERN_SUCCESS)
    {
        std::cerr << "Failed to restore debug state: " << mach_error_string(kr) << std::endl;
        return kr;
    }

    std::cout << "Single step completed, watchpoint re-enabled." << std::endl;

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

std::string Debugger::kern_return_to_string(kern_return_t kr)
{
    return mach_error_string(kr);
}