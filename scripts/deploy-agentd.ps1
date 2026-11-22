# Builds agentd and copies it to a Windows machine reachable over SSH, into
# %USERPROFILE%\.nexron-chat\agentd.exe, where Bull starts it.
# Usage: powershell -File scripts/deploy-agentd.ps1 nexron-server
# Close Bull tabs on that machine first: a running agentd.exe is locked. The background
# server exits about 30 s after its last tab stopped and no app is connected.
param([Parameter(Mandatory = $true)][string]$Target)
$ErrorActionPreference = 'Stop'

# Windows' own OpenSSH: Git's ssh.exe mangles the cmd line for a PowerShell login shell.
$ssh = Join-Path $env:SystemRoot 'System32\OpenSSH\ssh.exe'
$scp = Join-Path $env:SystemRoot 'System32\OpenSSH\scp.exe'

cargo build --release --manifest-path "$PSScriptRoot\..\agentd\Cargo.toml"
if ($LASTEXITCODE) { throw 'agentd build failed' }

# SSH starts in the home folder. No quotes: PowerShell 5.1 strips nested ones on the way to ssh.
& $ssh -o BatchMode=yes $Target 'cmd /d /c if not exist .nexron-chat mkdir .nexron-chat'
if ($LASTEXITCODE) { throw "cannot reach $Target" }
& $scp -o BatchMode=yes "$PSScriptRoot\..\agentd\target\release\agentd.exe" "${Target}:.nexron-chat/agentd.exe"
if ($LASTEXITCODE) { throw 'copy failed (is agentd still running there?)' }
Write-Host "agentd deployed to ${Target}"
