param(
    [switch]$Run
)

$ErrorActionPreference = 'Stop'
$NodeDir = "C:\Users\Einn Tzai\.workbuddy\binaries\node\versions\22.22.2"
$env:PATH = "$NodeDir;$env:PATH"

# 本机环境存在 ELECTRON_RUN_AS_NODE=1，会使 Electron 以纯 Node 模式运行，必须清除
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue

Set-Location $PSScriptRoot

Write-Host "[build] electron-vite build + electron-builder ..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "[build] FAILED" -ForegroundColor Red
    exit $LASTEXITCODE
}

$exe = Get-ChildItem -Path "$PSScriptRoot\build" -Filter "*.exe" |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1

if ($null -eq $exe) {
    Write-Host "[build] no exe found in build/" -ForegroundColor Red
    exit 1
}

Write-Host "[build] OK -> $($exe.FullName)" -ForegroundColor Green

if ($Run) {
    Write-Host "[build] starting $($exe.Name) ..." -ForegroundColor Cyan
    Start-Process $exe.FullName
}
