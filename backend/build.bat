@echo off
setlocal enabledelayedexpansion

if "%1"=="--target" (
    if "%2"=="windows" (
        cargo build --target=x86_64-pc-windows-msvc --release
    ) else if "%2"=="android" (
        REM aarch64
        set TARGET=aarch64-linux-android
        set TARGET_CC=%NDK_BIN_PATH%\aarch64-linux-android33-clang.cmd
        set TARGET_CXX=%NDK_BIN_PATH%\aarch64-linux-android33-clang++.cmd
        set TARGET_AR=%NDK_BIN_PATH%\llvm-ar
        set TARGET_LINKER=%NDK_BIN_PATH%\aarch64-linux-android33-clang.cmd

        set CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER=!TARGET_LINKER!
        cargo build --target=!TARGET! --release

        REM armv7
        set TARGET=armv7-linux-androideabi
        set TARGET_CC=%NDK_BIN_PATH%\armv7a-linux-androideabi33-clang.cmd
        set TARGET_CXX=%NDK_BIN_PATH%\armv7a-linux-androideabi33-clang++.cmd
        set TARGET_AR=%NDK_BIN_PATH%\llvm-ar
        set TARGET_LINKER=%NDK_BIN_PATH%\armv7a-linux-androideabi33-clang.cmd

        set CARGO_TARGET_ARMV7_LINUX_ANDROIDEABI_LINKER=!TARGET_LINKER!
        cargo build --target=!TARGET! --release

        REM x86
        set TARGET=i686-linux-android
        set TARGET_CC=%NDK_BIN_PATH%\i686-linux-android33-clang.cmd
        set TARGET_CXX=%NDK_BIN_PATH%\i686-linux-android33-clang++.cmd
        set TARGET_AR=%NDK_BIN_PATH%\llvm-ar
        set TARGET_LINKER=%NDK_BIN_PATH%\i686-linux-android33-clang.cmd

        set CARGO_TARGET_I686_LINUX_ANDROID_LINKER=!TARGET_LINKER!
        cargo build --target=!TARGET! --release

        REM x86_64
        set TARGET=x86_64-linux-android
        set TARGET_CC=%NDK_BIN_PATH%\x86_64-linux-android33-clang.cmd
        set TARGET_CXX=%NDK_BIN_PATH%\x86_64-linux-android33-clang++.cmd
        set TARGET_AR=%NDK_BIN_PATH%\llvm-ar
        set TARGET_LINKER=%NDK_BIN_PATH%\x86_64-linux-android33-clang.cmd

        set CARGO_TARGET_X86_64_LINUX_ANDROID_LINKER=!TARGET_LINKER!
        cargo build --target=!TARGET! --release
    
    ) else (
        echo Unknown target: %2
    )
) else (
    echo Usage: build.bat --target ^<target^>
    echo Available targets: windows
)

endlocal
