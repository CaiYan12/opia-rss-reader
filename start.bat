@echo off
setlocal

rem Run from the script directory (project root)
cd /d "%~dp0"

rem Clear ELECTRON_RUN_AS_NODE, otherwise Electron runs in pure Node mode and cannot open a GUI window
set "ELECTRON_RUN_AS_NODE="

rem Stop any leftover dev instance from a previous run (scoped to THIS project's electron,
rem so other Electron apps like VSCode/DSH are never touched), otherwise instances stack up.
powershell -NoProfile -Command "$p = Get-Process -Name electron -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '*opia-rss-reader*' }; if ($p) { $p | ForEach-Object { $_.CloseMainWindow() | Out-Null }; Start-Sleep -Seconds 3; $p2 = Get-Process -Name electron -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '*opia-rss-reader*' }; if ($p2) { $p2 | Stop-Process -Force -ErrorAction SilentlyContinue }; Write-Host ('[start] stopped ' + $p.Count + ' leftover dev instance(s)') }"

echo [start] electron-vite dev (Ctrl+C to stop) ...
rem npm is a .cmd on Windows; CALL returns here so exit reporting and PAUSE run.
call npm run dev
set "code=%ERRORLEVEL%"

rem Keep the result visible when launched by double-click, including an early exit 0.
echo.
echo [start] dev exited with code %code%
pause

exit /b %code%
