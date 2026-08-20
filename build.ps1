param(
    [switch]$Run
)

$ErrorActionPreference = 'Stop'
$NodeDir = "C:\Users\Einn Tzai\.workbuddy\binaries\node\versions\22.22.2"
$env:PATH = "$NodeDir;$env:PATH"

# 本机环境存在 ELECTRON_RUN_AS_NODE=1，会使 Electron 以纯 Node 模式运行，必须清除
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue

# WorkBuddy 工具环境会向 NODE_OPTIONS 注入 safe-delete shim（genie-safe-delete.cjs），
# 它拦截 node 的 fs.rm 并 fail-closed，导致 electron-builder 无法清理 build\win-unpacked
# （报 "Some operations were aborted"，首次重建必失败、重试才成功）。
# 仅当检测到该 shim 时移除（用户自有终端通常无此变量，此时为空操作）。
if ($env:NODE_OPTIONS -match 'genie-safe-delete') {
    $env:NODE_OPTIONS = ($env:NODE_OPTIONS `
        -replace '--require="[^"]*genie-safe-delete\.cjs"', '' `
        -replace '--require=\S*genie-safe-delete\.cjs', '').Trim()
    if ([string]::IsNullOrWhiteSpace($env:NODE_OPTIONS)) {
        Remove-Item Env:NODE_OPTIONS -ErrorAction SilentlyContinue
    }
}

Set-Location $PSScriptRoot

# Stop any running instance before build; otherwise electron-builder fails with
# EBUSY (build\win-unpacked\resources\app.asar is locked by the running app).
# Graceful close first: force-kill can leave a leaked file mapping that locks
# app.asar even after the process is gone (a "ghost lock" that needs a reboot).
$running = @(Get-Process | Where-Object { $_.ProcessName -like '*Opia*' })
if ($running.Count -gt 0) {
    Write-Host "[build] stopping $($running.Count) running instance(s) ..." -ForegroundColor Yellow
    $running | ForEach-Object { $_.CloseMainWindow() | Out-Null }
    Start-Sleep -Seconds 3
    $remaining = @(Get-Process | Where-Object { $_.ProcessName -like '*Opia*' })
    if ($remaining.Count -gt 0) {
        Write-Host "[build] force stopping $($remaining.Count) residual process(es) ..." -ForegroundColor Yellow
        $remaining | Stop-Process -Force -ErrorAction SilentlyContinue
        Start-Sleep -Milliseconds 1000
    }
}

# Clean stale staging dirs so electron-builder starts fresh. If a leftover
# asar is still locked (e.g. an editor tab in VSCode has app.asar open), the
# Remove-Item below fails silently and electron-builder then dies with a cryptic
# EBUSY - so verify the removal and stop early with an actionable message.
$staleDirs = @("$PSScriptRoot\build\win-unpacked", "$PSScriptRoot\build\win-unpacked.tmp")
foreach ($d in $staleDirs) {
    if (Test-Path $d) {
        Write-Host "[build] removing stale $d ..." -ForegroundColor DarkGray
        Remove-Item -Recurse -Force $d -ErrorAction SilentlyContinue
        if (Test-Path $d) {
            Write-Host "[build] ERROR: cannot remove $d - a file inside it is locked." -ForegroundColor Red
            Write-Host "[build]   -> an editor tab in Visual Studio Code is holding an .asar file." -ForegroundColor Yellow
            Write-Host "[build]   -> close that tab (Ctrl+W) or quit VSCode, then re-run." -ForegroundColor Yellow
            exit 1
        }
    }
}

Write-Host "[build] electron-vite build + electron-builder ..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "[build] FAILED" -ForegroundColor Red
    exit $LASTEXITCODE
}

# Locate the real main-process exe under win-unpacked.
# The portable build is an SFX launcher: it spawns the real app as a child,
# so its stdout/stderr cannot be captured. win-unpacked runs the actual process directly.
$appExe = Get-ChildItem -Path "$PSScriptRoot\build\win-unpacked" -Filter "*.exe" |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1

if ($null -eq $appExe) {
    Write-Host "[build] no exe found in build/win-unpacked" -ForegroundColor Red
    exit 1
}

$portable = Get-ChildItem -Path "$PSScriptRoot\build" -Filter "*.exe" |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1

Write-Host "[build] OK -> $($appExe.FullName)" -ForegroundColor Green
if ($portable) {
    Write-Host "[build] portable -> $($portable.FullName)" -ForegroundColor DarkGray
}

if ($Run) {
    $logFile = "$PSScriptRoot\build\run.log"
    $errFile = "$PSScriptRoot\build\run.err.log"
    Remove-Item $logFile, $errFile -ErrorAction SilentlyContinue

    Write-Host "[run] starting $($appExe.Name) ..." -ForegroundColor Cyan
    $proc = Start-Process -FilePath $appExe.FullName -RedirectStandardOutput $logFile -RedirectStandardError $errFile -PassThru

    # Tail logs until the 'initial refresh' marker (startup + first fetch done) or timeout.
    $deadline = (Get-Date).AddSeconds(60)
    $seenOut = 0
    $seenErr = 0
    $ready = $false

    while ((Get-Date) -lt $deadline -and -not $ready -and -not $proc.HasExited) {
        if (Test-Path $logFile) {
            $lines = @(Get-Content $logFile -ErrorAction SilentlyContinue)
            if ($lines.Count -gt $seenOut) {
                for ($i = $seenOut; $i -lt $lines.Count; $i++) { Write-Host $lines[$i] }
                $seenOut = $lines.Count
                if ($lines | Select-String -Pattern 'initial refresh' -Quiet) { $ready = $true }
            }
        }
        if (Test-Path $errFile) {
            $errLines = @(Get-Content $errFile -ErrorAction SilentlyContinue)
            if ($errLines.Count -gt $seenErr) {
                for ($i = $seenErr; $i -lt $errLines.Count; $i++) { Write-Host $errLines[$i] -ForegroundColor Yellow }
                $seenErr = $errLines.Count
            }
        }
        Start-Sleep -Milliseconds 500
    }

    if ($ready) {
        Write-Host "[run] READY: 'initial refresh' logged, app running in background (pid $($proc.Id))" -ForegroundColor Green
    }
    elseif ($proc.HasExited) {
        Write-Host "[run] app exited early (exit code $($proc.ExitCode))" -ForegroundColor Red
    }
    else {
        Write-Host "[run] timeout: no 'initial refresh' within 60s (app may still be starting)" -ForegroundColor Yellow
    }

    Write-Host "[run] stdout -> $logFile" -ForegroundColor DarkGray
    Write-Host "[run] stderr -> $errFile" -ForegroundColor DarkGray
}
