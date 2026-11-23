# Runs the Bull bridge in the foreground; the scheduled task from register-bridge-task.ps1 calls
# it. Works with Windows PowerShell 5.1. Output goes to %USERPROFILE%\.nexron-chat\bridge.log.
# Usage: powershell -File start-bridge.ps1 -Origin https://<BULL_HOST> [-Port 3060] [-Machines a,b]
param(
  [Parameter(Mandatory = $true)][string]$Origin,
  [int]$Port = 3060,
  # ssh aliases of other machines the phone may reach (stage 3); empty: only this one
  [string]$Machines = ''
)
$ErrorActionPreference = 'Stop'

$bridge = Split-Path -Parent $PSScriptRoot
$log = Join-Path $env:USERPROFILE '.nexron-chat\bridge.log'
$env:BULL_BRIDGE_ORIGINS = $Origin
$env:BULL_BRIDGE_PORT = "$Port"
$env:BULL_BRIDGE_MACHINES = $Machines

Set-Location $bridge
# cmd for the redirection: PowerShell 5.1 would write the log as UTF-16 and wrap stderr lines.
& cmd /d /c "node --experimental-strip-types --disable-warning=ExperimentalWarning src\main.ts serve >> `"$log`" 2>&1"
exit $LASTEXITCODE
