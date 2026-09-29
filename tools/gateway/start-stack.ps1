# Starts the local ARO stack: llama-server (Bonsai), the gateway, and ComfyUI.
# Skips anything already listening. Logs go to C:\comfy\*.log.
# Run from a normal (non-elevated) PowerShell:  .\tools\gateway\start-stack.ps1
$ErrorActionPreference = "Stop"
$AroDir = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$BonsaiDir = "C:\Users\falcon\Bonsai-demo"
$LogDir = "C:\comfy"

function Test-Port($port) {
    [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
}

if (Test-Port 8090) {
    Write-Host "llama-server already running on 8090"
} else {
    Write-Host "Starting llama-server (context 32768, sleeps after 20 s idle so image jobs can use the GPU) ..."
    $env:BONSAI_CTX = "32768"
    Start-Process -FilePath powershell.exe -WindowStyle Hidden -WorkingDirectory $BonsaiDir `
        -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', '.\scripts\start_llama_server.ps1', '--sleep-idle-seconds', '20', '--alias', 'bonsai-2-27b' `
        -RedirectStandardOutput "$LogDir\llama.out" -RedirectStandardError "$LogDir\llama.err"
}

if (Test-Port 8787) {
    Write-Host "gateway already running on 8787"
} else {
    Write-Host "Starting gateway ..."
    Start-Process -FilePath node.exe -WindowStyle Hidden -WorkingDirectory $AroDir `
        -ArgumentList 'tools\gateway\server.mjs' `
        -RedirectStandardOutput "$LogDir\gateway.log" -RedirectStandardError "$LogDir\gateway.err"
}

if (Test-Port 8188) {
    Write-Host "ComfyUI already running on 8188"
} else {
    Write-Host "Starting ComfyUI ..."
    Start-Process -FilePath powershell.exe -WindowStyle Hidden `
        -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "$LogDir\start-comfyui.ps1" `
        -RedirectStandardOutput "$LogDir\comfyui.log" -RedirectStandardError "$LogDir\comfyui.err"
}

Write-Host ""
Write-Host "Model loading takes about a minute after a reboot. Check readiness with:"
Write-Host "  curl http://127.0.0.1:8090/health    (Bonsai)"
Write-Host "  curl http://127.0.0.1:8188/system_stats    (ComfyUI)"
Write-Host "The public tunnel (Tailscale Funnel) stays on across reboots."
