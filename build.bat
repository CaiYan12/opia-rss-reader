@echo off
setlocal

rem ============================================================
rem  build.bat - one-click release build (for GitHub Releases)
rem  1) electron-vite + electron-builder production build
rem  2) cleanup: trim locales / remove leftovers / pdb
rem  3) assemble full runnable app (exe+dll+assets) into release\
rem
rem  Outputs:
rem    release\OpiaRSSReader-v<VERSION>-win32-x64\          full app dir
rem    release\OpiaRSSReader-v<VERSION>-win32-x64.zip       zip archive
rem    release\OpiaRSSReader-<VERSION>-portable.exe         portable exe
rem  NOTE: keep this file ASCII-only. cmd on a GBK console
rem  mis-parses UTF-8 Chinese and < > in comments break it.
rem ============================================================

cd /d "%~dp0"

rem Managed Node (same as build.ps1 / start.bat)
set "PATH=C:\Users\Einn Tzai\.workbuddy\binaries\node\versions\22.22.2;%PATH%"

rem Clear ELECTRON_RUN_AS_NODE, otherwise Electron runs in pure Node mode
set "ELECTRON_RUN_AS_NODE="

rem VSCode lock warning: its AI extensions scan and lock build asar files
rem (see .workbuddy/memory). Ask before proceeding if VSCode is running.
tasklist /FI "IMAGENAME eq Code.exe" 2>nul | findstr /i "Code.exe" >nul
if not errorlevel 1 (
    echo [release] WARNING: VSCode is running. Its extensions may lock build files and break the build.
    choice /c YN /n /m "[release] Close VSCode first. Press Y to continue anyway, N to abort: "
    if errorlevel 2 (
        echo [release] Aborted.
        exit /b 1
    )
)

echo.
echo [release] === 1/4 production build (electron-vite + electron-builder) ===
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build.ps1"
set "buildCode=%ERRORLEVEL%"
if not "%buildCode%"=="0" (
    echo [release] Build failed ^(exit %buildCode%^), aborting.
    pause
    exit /b %buildCode%
)

echo.
echo [release] === 2/4 read version ===
for /f "delims=" %%V in ('powershell -NoProfile -Command "(Get-Content -Raw package.json | ConvertFrom-Json).version"') do set "APP_VERSION=%%V"
if "%APP_VERSION%"=="" set "APP_VERSION=0.0.0"
echo [release] version = %APP_VERSION%

set "SRC=%~dp0build\win-unpacked"
set "DST=%~dp0release\OpiaRSSReader-v%APP_VERSION%-win32-x64"

echo.
echo [release] === 3/4 cleanup ===

rem Trim locales: keep only en-US and zh-CN (saves ~45MB)
if exist "%SRC%\locales" (
    for /f "delims=" %%L in ('dir /b "%SRC%\locales"') do (
        if /i not "%%L"=="en-US.pak" if /i not "%%L"=="zh-CN.pak" del /q "%SRC%\locales\%%L"
    )
    echo [release] locales trimmed ^(en-US, zh-CN kept^)
)

rem Remove leftover Electron default asar if present
if exist "%SRC%\resources\default_app.asar" (
    del /q "%SRC%\resources\default_app.asar"
    echo [release] removed leftover default_app.asar
)

rem Remove debug symbols if any
del /q "%SRC%\*.pdb" 2>nul

echo.
echo [release] === 4/4 assemble release dir ===
if exist "%DST%" rmdir /s /q "%DST%"
if not exist "%~dp0release" mkdir "%~dp0release"
xcopy "%SRC%" "%DST%\" /e /i /y /q >nul
if errorlevel 1 (
    echo [release] Failed to copy app into release.
    pause
    exit /b 1
)

rem Copy portable single-file exe as well
if exist "%~dp0build\OpiaRSSReader-%APP_VERSION%-portable.exe" (
    copy /y "%~dp0build\OpiaRSSReader-%APP_VERSION%-portable.exe" "%~dp0release\" >nul
    echo [release] portable exe copied
)

rem Create zip for GitHub Releases
powershell -NoProfile -Command "Compress-Archive -Path '%DST%' -DestinationPath '%~dp0release\OpiaRSSReader-v%APP_VERSION%-win32-x64.zip' -Force"

echo.
echo [release] ============ BUILD COMPLETE ============
echo [release] release dir: %~dp0release
dir /b "%~dp0release"
echo.
pause
exit /b 0
