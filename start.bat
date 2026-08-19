@echo off
setlocal

rem Run from the script directory (project root)
cd /d "%~dp0"

rem Use managed Node 22.22.2 (same as build.ps1)
set "PATH=C:\Users\Einn Tzai\.workbuddy\binaries\node\versions\22.22.2;%PATH%"

rem Clear ELECTRON_RUN_AS_NODE, otherwise Electron runs in pure Node mode and cannot open a GUI window
set "ELECTRON_RUN_AS_NODE="

echo [start] electron-vite dev ...
npm run dev

exit /b %ERRORLEVEL%
