# Registers the scheduled task "Bull Bridge": starts the bridge at boot as the current user
# (that user's Claude profiles and agentd), whether or not someone is logged on, and starts it
# again when it ends. Run once, in an elevated Windows PowerShell 5.1, as the user Bull runs as.
# Usage: powershell -File register-bridge-task.ps1 -Origin https://<BULL_HOST>
#        powershell -File register-bridge-task.ps1 -Remove
param(
  [string]$Origin,
  [int]$Port = 3060,
  [string]$Machines = '',
  [switch]$Remove
)
$ErrorActionPreference = 'Stop'
$name = 'Bull Bridge'

if ($Remove) {
  Unregister-ScheduledTask -TaskName $name -Confirm:$false
  Write-Host "Task '$name' removed"
  return
}
if (-not $Origin) { throw 'Name the page that serves Bull: -Origin https://<BULL_HOST>' }

$script = Join-Path $PSScriptRoot 'start-bridge.ps1'
$arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$script`" -Origin $Origin -Port $Port"
if ($Machines) { $arguments += " -Machines $Machines" }

$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arguments
$trigger = New-ScheduledTaskTrigger -AtStartup
# S4U: runs without a stored password and without a logged-on user, with no network credentials;
# the bridge only talks to localhost (and ssh with the user's key from stage 3 on).
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType S4U -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName $name
Write-Host "Task '$name' registered and started; log in $env:USERPROFILE\.nexron-chat\bridge.log"
