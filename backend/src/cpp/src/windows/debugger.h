#ifndef DEBUGGER_H
#define DEBUGGER_H

#include "native_api.h"

enum class WatchpointType
{
    READ = 1,
    WRITE = 2,
    READWRITE = 3
};

#endif