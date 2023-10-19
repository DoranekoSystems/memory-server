#!/bin/bash

if [ "$1" == "--target" ]; then
    if [ "$2" == "android" ]; then
        # aarch64
        TARGET=aarch64-linux-android
        TARGET_CC=$NDK_BIN_PATH/aarch64-linux-android33-clang
        TARGET_CXX=$NDK_BIN_PATH/aarch64-linux-android33-clang++
        TARGET_AR=$NDK_BIN_PATH/llvm-ar
        TARGET_LINKER=$NDK_BIN_PATH/aarch64-linux-android33-clang

        sudo CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER=$TARGET_LINKER \
             TARGET_AR=$TARGET_AR \
             TARGET_CC=$TARGET_CC \
             TARGET_CXX=$TARGET_CXX \
             cargo build --target=$TARGET --release

        # armv7
        TARGET=armv7-linux-androideabi
        TARGET_CC=$NDK_BIN_PATH/armv7a-linux-androideabi33-clang
        TARGET_CXX=$NDK_BIN_PATH/armv7a-linux-androideabi33-clang++
        TARGET_AR=$NDK_BIN_PATH/llvm-ar
        TARGET_LINKER=$NDK_BIN_PATH/armv7a-linux-androideabi33-clang

        sudo CARGO_TARGET_ARMV7_LINUX_ANDROIDEABI_LINKER=$TARGET_LINKER \
             TARGET_AR=$TARGET_AR \
             TARGET_CC=$TARGET_CC \
             TARGET_CXX=$TARGET_CXX \
             cargo build --target=$TARGET --release

        # x86
        TARGET=i686-linux-android
        TARGET_CC=$NDK_BIN_PATH/i686-linux-android33-clang
        TARGET_CXX=$NDK_BIN_PATH/i686-linux-android33-clang++
        TARGET_AR=$NDK_BIN_PATH/llvm-ar
        TARGET_LINKER=$NDK_BIN_PATH/i686-linux-android33-clang

        sudo CARGO_TARGET_I686_LINUX_ANDROID_LINKER=$TARGET_LINKER \
             TARGET_AR=$TARGET_AR \
             TARGET_CC=$TARGET_CC \
             TARGET_CXX=$TARGET_CXX \
             cargo build --target=$TARGET --release

        # x86_64
        TARGET=x86_64-linux-android
        TARGET_CC=$NDK_BIN_PATH/x86_64-linux-android33-clang
        TARGET_CXX=$NDK_BIN_PATH/x86_64-linux-android33-clang++
        TARGET_AR=$NDK_BIN_PATH/llvm-ar
        TARGET_LINKER=$NDK_BIN_PATH/x86_64-linux-android33-clang

        sudo CARGO_TARGET_X86_64_LINUX_ANDROID_LINKER=$TARGET_LINKER \
             TARGET_AR=$TARGET_AR \
             TARGET_CC=$TARGET_CC \
             TARGET_CXX=$TARGET_CXX \
             cargo build --target=$TARGET --release

    elif [ "$2" == "ios" ]; then
        TARGET=aarch64-apple-ios
        TARGET_CC=$(xcrun --sdk iphoneos --find clang)
        TARGET_CXX=$(xcrun --sdk iphoneos --find clang++)
        TARGET_AR=$(xcrun --sdk iphoneos --find ar)
        TARGET_LINKER=$(xcrun --sdk iphoneos --find clang)

        sudo CARGO_TARGET_AARCH64_APPLE_IOS_LINKER=$TARGET_LINKER \
                TARGET_AR=$TARGET_AR \
                TARGET_CC=$TARGET_CC \
                TARGET_CXX=$TARGET_CXX \
                cargo build --target=$TARGET --release

    else
        echo "Unknown target: $2"
    fi
else
    echo "Usage: ./build.sh --target <target>"
    echo "Available targets: android, ios"
fi