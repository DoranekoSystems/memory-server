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
