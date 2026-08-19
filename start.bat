@echo off
setlocal

rem Run from the script directory (project root)
cd /d "%~dp0"

rem Use managed Node 22.22.2 (same as build.ps1)
set "PATH=C:\Users\Einn Tzai\.workbuddy\binaries\node\versions\22.22.2;%PATH%"

rem Clear ELECTRON_RUN_AS_NODE, otherwise Electron runs in pure Node mode and cannot open a GUI window
set "ELECTRON_RUN_AS_NODE="

rem Stop any leftover dev instance from a previous run (scoped to THIS project's electron,
rem so other Electron apps like VSCode/DSH are never touched), otherwise instances stack up.
powershell -NoProfile -Command "$p = Get-Process -Name electron -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '*opia-rss-reader*' }; if ($p) { $p | ForEach-Object { $_.CloseMainWindow() | Out-Null }; Start-Sleep -Seconds 3; $p2 = Get-Process -Name electron -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '*opia-rss-reader*' }; if ($p2) { $p2 | Stop-Process -Force -ErrorAction SilentlyContinue }; Write-Host ('[start] stopped ' + $p.Count + ' leftover dev instance(s)') }"

echo [start] electron-vite dev (Ctrl+C to stop) ...
npm run dev
set "code=%ERRORLEVEL%"

if not "%code%"=="0" (
    echo [start] dev exited with error code %code%
    pause
)

exit /b %code%
