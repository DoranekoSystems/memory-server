#ifndef FILEAPI_H
#define FILEAPI_H

#include <ShlObj.h>

#include <iostream>
#include <sstream>
#include <string>
#include <algorithm>

#include "native_api.h"

extern "C" const char *explore_directory(const char *path, int maxDepth);
extern "C" const void *read_file(const char *path, size_t *size, char **error_message);
extern "C" const char *get_application_info_native(DWORD pid);

#endif