@echo off
setlocal

if "%1"=="--target" (
    if "%2"=="windows" (
        cargo build --target=x86_64-pc-windows-msvc --release

    ) else (
        echo Unknown target: %2
    )
) else (
    echo Usage: build.bat --target ^<target^>
    echo Available targets: windows
)

endlocal
