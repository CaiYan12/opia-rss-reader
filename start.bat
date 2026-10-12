@echo off
setlocal

rem Run from the script directory (project root)
cd /d "%~dp0"

rem Clear ELECTRON_RUN_AS_NODE, otherwise Electron runs in pure Node mode and cannot open a GUI window
set "ELECTRON_RUN_AS_NODE="

rem Stop any leftover dev instance from a previous run (scoped to THIS project's electron,
rem so other Electron apps like VSCode/DSH are never touched), otherwise instances stack up.
powershell -NoProfile -Command "$p = Get-Process -Name electron -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '*opia-rss-reader*' }; if ($p) { $p | ForEach-Object { $_.CloseMainWindow() | Out-Null }; Start-Sleep -Seconds 3; $p2 = Get-Process -Name electron -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '*opia-rss-reader*' }; if ($p2) { $p2 | Stop-Process -Force -ErrorAction SilentlyContinue }; Write-Host ('[start] stopped ' + $p.Count + ' leftover dev instance(s)') }"

echo [start] electron-vite dev (close the window to stop) ...
rem npm is a .cmd on Windows; CALL returns here so the exit code below is npm's own.
call npm run dev
set "code=%ERRORLEVEL%"

rem Pause ONLY on failure. A normal run ends by closing the app window, which makes Electron
rem quit with code 0 -- in that case the console must close by itself, with no "press any key".
rem (electron-vite forwards the Electron exit code via ps.on('close', process.exit), so 0 here
rem really means "user closed the window".)
if not "%code%"=="0" (
    echo.
    echo [start] dev exited with code %code%
    echo [start] press any key to close ...
    pause >nul
)

exit /b %code%
