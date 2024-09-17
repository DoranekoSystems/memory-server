#import "file_api.h"
#import <mach/mach.h>
#import <sys/sysctl.h>

@implementation DirectoryExplorer

+ (NSString *)exploreDirectory:(NSString *)path maxDepth:(int)maxDepth error:(NSError **)error
{
    @try
    {
        NSFileManager *fileManager = [NSFileManager defaultManager];
        NSMutableString *result = [NSMutableString string];

        [self exploreDirectoryRecursive:path
                                  depth:0
                               maxDepth:maxDepth
                            fileManager:fileManager
                                 result:result
                                 indent:@""];

        return result;
    }
    @catch (NSException *exception)
    {
        if (error)
        {
            *error = [NSError
                errorWithDomain:@"DirectoryExplorerErrorDomain"
                           code:500
                       userInfo:@{
                           NSLocalizedDescriptionKey : [NSString
                               stringWithFormat:@"Exception occurred: %@", exception.reason]
                       }];
        }
        return nil;
    }
}

+ (void)exploreDirectoryRecursive:(NSString *)path
                            depth:(int)depth
                         maxDepth:(int)maxDepth
                      fileManager:(NSFileManager *)fileManager
                           result:(NSMutableString *)result
                           indent:(NSString *)indent
{
    if (depth > maxDepth) return;

    NSError *localError = nil;
    NSArray *contents = [fileManager contentsOfDirectoryAtPath:path error:&localError];

    if (localError)
    {
        [result appendFormat:@"%@error:%@\n", indent, localError.localizedDescription];
        return;
    }

    for (NSString *item in contents)
    {
        NSString *fullPath = [path stringByAppendingPathComponent:item];
        BOOL isDirectory;
        [fileManager fileExistsAtPath:fullPath isDirectory:&isDirectory];

        if (isDirectory)
        {
            [result appendFormat:@"%@dir:%@\n", indent, item];
            [self exploreDirectoryRecursive:fullPath
                                      depth:depth + 1
                                   maxDepth:maxDepth
                                fileManager:fileManager
                                     result:result
                                     indent:[indent stringByAppendingString:@"  "]];
        }
        else
        {
            NSDictionary *attributes = [fileManager attributesOfItemAtPath:fullPath error:nil];
            NSNumber *fileSize = attributes[NSFileSize];
            NSDate *lastOpenedDate = attributes[NSFileModificationDate];
            NSTimeInterval timestamp = [lastOpenedDate timeIntervalSince1970];

            [result appendFormat:@"%@file:%@,%lld,%lld\n", indent, item, [fileSize longLongValue],
                                 (long long)timestamp];
        }
    }
}

@end

@implementation FileReader

+ (NSData *)readFile:(NSString *)path error:(NSError **)error
{
    NSFileManager *fileManager = [NSFileManager defaultManager];

    if (![fileManager fileExistsAtPath:path])
    {
        if (error)
        {
            *error = [NSError errorWithDomain:@"FileReaderErrorDomain"
                                         code:404
                                     userInfo:@{NSLocalizedDescriptionKey : @"File not found"}];
        }
        return nil;
    }

    return [NSData dataWithContentsOfFile:path options:0 error:error];
}

@end

@implementation ProcessInfoRetriever

+ (NSDictionary *)getProcessInfo:(pid_t)pid
{
    NSMutableDictionary *info = [NSMutableDictionary dictionary];

    pid_t currentPid = getpid();
    debug_log(LOG_DEBUG, "Current PID: %d, Target PID: %d", currentPid, pid);

    if (pid == currentPid)
    {
        // debug_log("Fetching info for current process.");

        NSString *bundlePath = [[NSBundle mainBundle] bundlePath];
        info[@"BundlePath"] = bundlePath;
        debug_log(LOG_DEBUG, "Bundle path: %s", [bundlePath UTF8String]);

        NSArray *documentPaths =
            NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES);
        NSString *documentDirectory = [documentPaths firstObject];
        info[@"DocumentDirectory"] = documentDirectory;
        debug_log(LOG_DEBUG, "Document directory: %s", [documentDirectory UTF8String]);

        NSArray *libraryPaths =
            NSSearchPathForDirectoriesInDomains(NSLibraryDirectory, NSUserDomainMask, YES);
        NSString *libraryDirectory = [libraryPaths firstObject];
        info[@"LibraryDirectory"] = libraryDirectory;
        debug_log(LOG_DEBUG, "Library directory: %s", [libraryDirectory UTF8String]);

        NSArray *cachesPaths =
            NSSearchPathForDirectoriesInDomains(NSCachesDirectory, NSUserDomainMask, YES);
        NSString *cachesDirectory = [cachesPaths firstObject];
        info[@"CachesDirectory"] = cachesDirectory;
        debug_log(LOG_DEBUG, "Caches directory: %s", [cachesDirectory UTF8String]);
    }
    else
    {
        debug_log(LOG_DEBUG, "Fetching info for external process with PID: %d", pid);

        char pathbuf[PROC_PIDPATHINFO_MAXSIZE];
        int ret = proc_pidpath(pid, pathbuf, sizeof(pathbuf));

        if (ret > 0)
        {
            NSString *executablePath = [NSString stringWithUTF8String:pathbuf];
            if (executablePath != nil && executablePath.length > 0)
            {
                NSString *bundlePath = [executablePath stringByDeletingLastPathComponent];
                if ([bundlePath hasSuffix:@".app"])
                {
                    info[@"BundlePath"] = bundlePath;
                    debug_log(LOG_DEBUG, "External bundle path: %s", [bundlePath UTF8String]);

                    NSString *bundleIdentifier = [self bundleIdentifierForPath:bundlePath];
                    if (bundleIdentifier != nil)
                    {
                        debug_log(LOG_DEBUG, "Bundle Identifier: %s",
                                  [bundleIdentifier UTF8String]);

                        NSString *containerPath = @"/var/mobile/Containers/Data/Application";
                        NSArray *containerDirectories =
                            [[NSFileManager defaultManager] contentsOfDirectoryAtPath:containerPath
                                                                                error:nil];
                        // debug_log("Container directories: %@", containerDirectories);

                        for (NSString *directory in containerDirectories)
                        {
                            NSString *fullPath =
                                [containerPath stringByAppendingPathComponent:directory];
                            NSString *metadataPath = [fullPath
                                stringByAppendingPathComponent:
                                    @".com.apple.mobile_container_manager.metadata.plist"];
                            // debug_log("Checking metadata path: %s", [metadataPath UTF8String]);

                            NSDictionary *metadata =
                                [NSDictionary dictionaryWithContentsOfFile:metadataPath];
                            // debug_log("Metadata: %@", metadata);

                            if ([metadata[@"MCMMetadataIdentifier"]
                                    isEqualToString:bundleIdentifier])
                            {
                                info[@"DocumentDirectory"] =
                                    [fullPath stringByAppendingPathComponent:@"Documents"];
                                info[@"LibraryDirectory"] =
                                    [fullPath stringByAppendingPathComponent:@"Library"];
                                info[@"CachesDirectory"] =
                                    [fullPath stringByAppendingPathComponent:@"Library/Caches"];
                                debug_log(LOG_DEBUG, "Matched container directory: %s",
                                          [fullPath UTF8String]);
                                break;
                            }
                        }
                    }
                    else
                    {
                        debug_log(LOG_ERROR, "Failed to retrieve bundle identifier for path: %s",
                                  [bundlePath UTF8String]);
                    }
                }
                else
                {
                    debug_log(LOG_ERROR, "Unexpected path format: %s", [bundlePath UTF8String]);
                }
            }
            else
            {
                debug_log(LOG_ERROR, "Failed to convert path to NSString or empty string.");
            }
        }
        else
        {
            info[@"Error"] = @"Failed to retrieve bundle path.";
            debug_log(LOG_ERROR,
                      "Failed to retrieve bundle path for PID: %d, proc_pidpath returned: %d", pid,
                      ret);
        }
    }

    return info;
}

+ (NSString *)bundleIdentifierForPath:(NSString *)bundlePath
{
    // debug_log("Fetching bundle identifier for path: %s", [bundlePath UTF8String]);
    NSString *infoPlistPath = [bundlePath stringByAppendingPathComponent:@"Info.plist"];

    if ([[NSFileManager defaultManager] fileExistsAtPath:infoPlistPath])
    {
        NSDictionary *infoPlist = [NSDictionary dictionaryWithContentsOfFile:infoPlistPath];
        if (infoPlist != nil)
        {
            // debug_log("Info.plist contents: %@", infoPlist);
            return infoPlist[@"CFBundleIdentifier"];
        }
        else
        {
            debug_log(LOG_ERROR, "Failed to read Info.plist contents at path: %s",
                      [infoPlistPath UTF8String]);
        }
    }
    else
    {
        debug_log(LOG_ERROR, "Info.plist does not exist at path: %s", [infoPlistPath UTF8String]);
    }

    return nil;
}

@end

const char *explore_directory(const char *path, int maxDepth)
{
    @autoreleasepool
    {
        NSString *nsPath = [NSString stringWithUTF8String:path];
        NSError *error = nil;
        NSString *result = [DirectoryExplorer exploreDirectory:nsPath
                                                      maxDepth:maxDepth
                                                         error:&error];

        if (error)
        {
            NSString *errorString =
                [NSString stringWithFormat:@"Error: %@", [error localizedDescription]];
            return strdup([errorString UTF8String]);
        }

        return result ? strdup([result UTF8String]) : strdup("No results");
    }
}

const void *read_file(const char *path, size_t *size, char **error_message)
{
    @autoreleasepool
    {
        NSError *error = nil;
        NSString *nsPath = [NSString stringWithUTF8String:path];
        NSData *result = [FileReader readFile:nsPath error:&error];

        if (error)
        {
            NSString *errorString =
                [NSString stringWithFormat:@"Error: %@", [error localizedDescription]];
            *error_message = strdup([errorString UTF8String]);
            *size = 0;
            return NULL;
        }

        if (result)
        {
            *size = [result length];
            void *buffer = malloc(*size);
            memcpy(buffer, [result bytes], *size);
            return buffer;
        }
        else
        {
            *error_message = strdup("No content");
            *size = 0;
            return NULL;
        }
    }
}

const char *get_application_info(pid_t pid)
{
    @autoreleasepool
    {
        NSDictionary *info = [ProcessInfoRetriever getProcessInfo:pid];

        if (![NSJSONSerialization isValidJSONObject:info])
        {
            debug_log(LOG_ERROR, "info dictionary contains non-serializable objects");
            return strdup("Error: info dictionary contains non-serializable objects");
        }

        NSError *error = nil;
        NSData *jsonData = [NSJSONSerialization dataWithJSONObject:info options:0 error:&error];

        if (error)
        {
            NSString *errorString =
                [NSString stringWithFormat:@"Error: %@", [error localizedDescription]];
            return strdup([errorString UTF8String]);
        }

        NSString *jsonString = [[NSString alloc] initWithData:jsonData
                                                     encoding:NSUTF8StringEncoding];
        if (jsonString != nil)
        {
            return strdup([jsonString UTF8String]);
        }

        return strdup("Failed to generate JSON string");
    }
}