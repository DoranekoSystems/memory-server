#import <Foundation/Foundation.h>

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

extern "C" const char *explore_directory(const char *path, int maxDepth)
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

@interface FileReader : NSObject

+ (NSData *)readFile:(NSString *)path error:(NSError **)error;

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

extern "C" const void *read_file(const char *path, size_t *size, char **error_message)
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
