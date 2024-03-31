@echo off

set ARGS=%*

echo Building frontend...
cd frontend
call build.bat %ARGS%
cd ..

echo Building backend...
cd backend
call build.bat %ARGS%
cd ..

echo Build process completed.

call target\\x86_64-pc-windows-msvc\\release\\memory-server.exe

