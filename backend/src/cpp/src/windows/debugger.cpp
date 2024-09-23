#include "debugger.h"

extern "C"
{
    bool debugger_new(int pid)
    {
        return true;
    }

    int set_watchpoint_native(uint64_t address, int size, WatchpointType type)
    {
        return 0;
    }

    int remove_watchpoint_native(uint64_t address)
    {
        return 0;
    }

    int set_breakpoint_native(uint64_t address, int hit_count)
    {
        return 0;
    }

    int remove_breakpoint_native(uint64_t address)
    {
        return 0;
    }
}