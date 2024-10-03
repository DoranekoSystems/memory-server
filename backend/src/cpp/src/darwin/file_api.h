#ifndef FILEAPI_H
#define FILEAPI_H

#import <Foundation/Foundation.h>
#include "native_api.h"

@interface DirectoryExplorer : NSObject

+ (NSString *)exploreDirectory:(NSString *)path maxDepth:(int)maxDepth error:(NSError **)error;

@end

@interface FileReader : NSObject

+ (NSData *)readFile:(NSString *)path error:(NSError **)error;

@end

@interface ProcessInfoRetriever : NSObject

+ (NSDictionary *)getProcessInfo:(pid_t)pid;

@end

#define PROC_PIDPATHINFO_MAXSIZE (4 * MAXPATHLEN)
#define PROC_ALL_PIDS 1
#define PROC_PIDTBSDINFO 3
#define PROC_PIDTASKINFO 4

// C API Exports
extern "C" const char *explore_directory(const char *path, int maxDepth);
extern "C" const void *read_file(const char *path, size_t *size, char **error_message);
extern "C" const char *get_application_info_native(pid_t pid);

#endif