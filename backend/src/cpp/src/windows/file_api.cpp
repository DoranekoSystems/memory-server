#include "file_api.h"

std::string escape_json_string(const std::string &input)
{
    std::ostringstream escaped;
    for (char c : input)
    {
        switch (c)
        {
            case '"':
                escaped << "\\\"";
                break;
            case '\\':
                escaped << "\\\\";
                break;
            case '\b':
                escaped << "\\b";
                break;
            case '\f':
                escaped << "\\f";
                break;
            case '\n':
                escaped << "\\n";
                break;
            case '\r':
                escaped << "\\r";
                break;
            case '\t':
                escaped << "\\t";
                break;
            default:
                escaped << c;
                break;
        }
    }
    return escaped.str();
}

const char *explore_directory(const char *path, int maxDepth)
{
    WIN32_FIND_DATA findFileData;
    HANDLE hFind = FindFirstFile((std::string(path) + "\\*").c_str(), &findFileData);

    if (hFind == INVALID_HANDLE_VALUE)
    {
        std::ostringstream error;
        error << "Error: Failed to open directory " << path;
        debug_log(LOG_ERROR,"Failed to open directory %s. Error code: %lu", path, GetLastError());
        return strdup(error.str().c_str());
    }

    std::ostringstream result;
    int depth = 0;

    do
    {
        const std::string itemName = findFileData.cFileName;
        if (itemName == "." || itemName == "..") continue;

        std::string fullPath = std::string(path) + "\\" + itemName;

        if (findFileData.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY)
        {
            result << std::string(depth * 2, ' ') << "dir: " << itemName << "\n";
            if (depth < maxDepth)
            {
                result << explore_directory(fullPath.c_str(), maxDepth - 1);
            }
        }
        else
        {
            LARGE_INTEGER fileSize;
            fileSize.LowPart = findFileData.nFileSizeLow;
            fileSize.HighPart = findFileData.nFileSizeHigh;
            result << std::string(depth * 2, ' ') << "file: " << itemName << ","
                   << fileSize.QuadPart << "\n";
        }
    } while (FindNextFile(hFind, &findFileData) != 0);

    FindClose(hFind);
    return strdup(result.str().c_str());
}

const void *read_file(const char *path, size_t *size, char **error_message)
{
    HANDLE hFile =
        CreateFile(path, GENERIC_READ, 0, NULL, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, NULL);
    if (hFile == INVALID_HANDLE_VALUE)
    {
        std::ostringstream error;
        error << "Error: Could not open file " << path;
        *error_message = strdup(error.str().c_str());
        debug_log(LOG_ERROR,"Failed to open file %s. Error code: %lu", path, GetLastError());
        *size = 0;
        return NULL;
    }

    LARGE_INTEGER fileSize;
    if (!GetFileSizeEx(hFile, &fileSize))
    {
        std::ostringstream error;
        error << "Error: Could not get file size for " << path;
        *error_message = strdup(error.str().c_str());
        debug_log(LOG_ERROR,"Failed to get file size for file %s. Error code: %lu", path,
                  GetLastError());
        CloseHandle(hFile);
        *size = 0;
        return NULL;
    }

    std::vector<char> buffer(fileSize.QuadPart);
    DWORD bytesRead;
    if (!ReadFile(hFile, buffer.data(), static_cast<DWORD>(fileSize.QuadPart), &bytesRead, NULL))
    {
        std::ostringstream error;
        error << "Error: Could not read file " << path;
        *error_message = strdup(error.str().c_str());
        debug_log(LOG_ERROR,"Failed to read file %s. Error code: %lu", path, GetLastError());
        CloseHandle(hFile);
        *size = 0;
        return NULL;
    }

    CloseHandle(hFile);
    *size = fileSize.QuadPart;
    void *data = malloc(*size);
    memcpy(data, buffer.data(), *size);
    return data;
}

const char *get_application_info(DWORD pid)
{
    HANDLE hProcess = OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, FALSE, pid);
    if (hProcess == NULL)
    {
        std::ostringstream error;
        error << "{\"error\":\"Failed to open process " << pid << "\"}";
        debug_log(LOG_ERROR,"Failed to open process %d for reading. Error code: %lu", pid,
                  GetLastError());
        return strdup(error.str().c_str());
    }

    char processPath[MAX_PATH];
    if (!GetModuleFileNameEx(hProcess, NULL, processPath, MAX_PATH))
    {
        std::ostringstream error;
        error << "{\"error\":\"Could not retrieve process path for PID " << pid << "\"}";
        debug_log(LOG_ERROR,"Failed to retrieve process path for PID %d. Error code: %lu", pid,
                  GetLastError());
        CloseHandle(hProcess);
        return strdup(error.str().c_str());
    }

    char appDataPath[MAX_PATH];
    if (FAILED(SHGetFolderPath(NULL, CSIDL_LOCAL_APPDATA, NULL, 0, appDataPath)))
    {
        std::ostringstream error;
        error << "{\"error\":\"Could not retrieve AppData path\"}";
        debug_log(LOG_ERROR,"Failed to retrieve AppData path. Error code: %lu", GetLastError());
        CloseHandle(hProcess);
        return strdup(error.str().c_str());
    }

    CloseHandle(hProcess);

    std::ostringstream json;
    json << "{"
         << "\"BinaryPath\":\"" << escape_json_string(processPath) << "}";

    return strdup(json.str().c_str());
}