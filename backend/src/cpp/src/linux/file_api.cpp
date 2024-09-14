#include "file_api.h"

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

void explore_directory_recursive(const char *path, int depth, int maxDepth,
                                 std::ostringstream &result, const std::string &indent = "")
{
    if (depth > maxDepth) return;

    DIR *dir = opendir(path);
    if (!dir)
    {
        result << indent << "Error: Failed to open directory " << path
               << ". Error: " << strerror(errno) << "\n";
        return;
    }

    struct dirent *entry;

    while ((entry = readdir(dir)) != nullptr)
    {
        std::string itemName = entry->d_name;

        if (itemName == "." || itemName == "..") continue;

        std::string fullPath = std::string(path) + "/" + itemName;

        if (entry->d_type == DT_DIR)
        {
            result << indent << "dir:" << itemName << "\n";
            explore_directory_recursive(fullPath.c_str(), depth + 1, maxDepth, result,
                                        indent + "  ");
        }
        else
        {
            struct stat fileStat;
            if (stat(fullPath.c_str(), &fileStat) == 0)
            {
                result << indent << "file:" << itemName << "," << fileStat.st_size << ","
                       << fileStat.st_mtime << "\n";
            }
        }
    }

    closedir(dir);
}

const char *explore_directory(const char *path, int maxDepth)
{
    std::ostringstream result;
    explore_directory_recursive(path, 0, maxDepth, result);
    return strdup(result.str().c_str());
}

const void *read_file(const char *path, size_t *size, char **error_message)
{
    std::ifstream file(path, std::ios::binary | std::ios::ate);
    if (!file.is_open())
    {
        std::ostringstream error;
        error << "Error: Could not open file " << path << ". Error: " << strerror(errno);
        *error_message = strdup(error.str().c_str());
        *size = 0;
        return nullptr;
    }

    std::streamsize fileSize = file.tellg();
    file.seekg(0, std::ios::beg);

    unsigned char *buffer = (unsigned char *)malloc(fileSize);
    if (!buffer)
    {
        std::ostringstream error;
        error << "Error: Memory allocation failed for file " << path;
        *error_message = strdup(error.str().c_str());
        *size = 0;
        return nullptr;
    }

    if (!file.read((char *)buffer, fileSize))
    {
        std::ostringstream error;
        error << "Error: Failed to read file " << path;
        *error_message = strdup(error.str().c_str());
        *size = 0;
        free(buffer);
        return nullptr;
    }

    *size = fileSize;
    return buffer;
}

const char *get_application_info(pid_t pid)
{
    char exe_path[64];
    snprintf(exe_path, sizeof(exe_path), "/proc/%d/exe", pid);

    char binary_path[PATH_MAX];
    ssize_t len = readlink(exe_path, binary_path, sizeof(binary_path) - 1);

    if (len == -1)
    {
        char error_message[256];
        snprintf(error_message, sizeof(error_message),
                 "Error: Failed to retrieve binary path for PID %d. Error: %s", pid,
                 strerror(errno));
        return strdup(error_message);
    }

    binary_path[len] = '\0';

    char json_result[PATH_MAX + 50];
    snprintf(json_result, sizeof(json_result), "{\"BinaryPath\":\"%s\"}", binary_path);

    return strdup(json_result);
}
