#ifndef FILE_API_H
#define FILE_API_H

#include <dirent.h>
#include <errno.h>
#include <fcntl.h>
#include <limits.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <unistd.h>

#include <fstream>
#include <iostream>
#include <sstream>

#include "native_api.h"

extern "C" const char *explore_directory(const char *path, int maxDepth);
extern "C" const void *read_file(const char *path, size_t *size, char **error_message);
extern "C" const char *get_application_info(pid_t pid);

#endif