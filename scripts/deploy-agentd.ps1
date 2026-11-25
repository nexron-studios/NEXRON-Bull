# Puts agentd on another machine reachable over SSH, where Bull starts it.
# Windows: builds agentd here and copies it to %USERPROFILE%\.nexron-chat\agentd.exe.
# macOS and Linux: this PC cannot build for them, so the file given as -Binary is copied (a
# build from a Mac or a release asset). The release of Bull's own version is what
# Settings > Machines > Check > "Install agentd again" installs. It lands in
# ~/.nexron-chat/agentd, the previous one stays as agentd.old.
# Usage: powershell -File scripts/deploy-agentd.ps1 nexron-server [-Binary path\to\agentd]
# Close Bull tabs on that machine first: a running agentd is stopped (Windows: locked). The
# background server exits about 30 s after its last tab stopped and no app is connected.
param([Parameter(Mandatory = $true)][string]$Target, [string]$Binary)
$ErrorActionPreference = 'Stop'

# Windows' own OpenSSH: Git's ssh.exe mangles the cmd line for a PowerShell login shell.
$ssh = Join-Path $env:SystemRoot 'System32\OpenSSH\ssh.exe'
$scp = Join-Path $env:SystemRoot 'System32\OpenSSH\scp.exe'

# cmd and PowerShell do not know uname; macOS and Linux answer "Darwin arm64", "Linux x86_64".
# Their complaint on stderr would stop the script under 'Stop' in Windows PowerShell 5.1, so
# only the exit code and the output decide. A shell profile may print lines before the answer.
$ErrorActionPreference = 'Continue'
$unameLines = @(& $ssh -o BatchMode=yes $Target 'uname -sm' 2>$null)
$unameExit = $LASTEXITCODE
$ErrorActionPreference = 'Stop'
if ($unameExit -eq 255) { throw "cannot reach $Target" }
$uname = $unameLines | Where-Object { $_ -match '^(Darwin|Linux) \S+$' } | Select-Object -First 1

if ($unameExit -eq 0 -and $uname) {
  if (-not $Binary) { throw "${Target} runs ${uname}: pass -Binary, or use Install agentd again in Bull" }
  # No double quotes in these lines: PowerShell 5.1 strips nested ones on the way to ssh.
  $swap = 'cd ~/.nexron-chat && chmod 755 agentd.download && { [ ! -f agentd ] || cp -pf agentd agentd.old; } && mv -f agentd.download agentd'
  & $ssh -o BatchMode=yes $Target "sh -c 'pkill -u `$(id -u) -x agentd; mkdir -p ~/.nexron-chat'"
  & $scp -o BatchMode=yes $Binary "${Target}:.nexron-chat/agentd.download"
  if ($LASTEXITCODE) { throw 'copy failed' }
  & $ssh -o BatchMode=yes $Target "sh -c '$swap'"
  if ($LASTEXITCODE) { throw 'swap failed' }
  Write-Host "agentd deployed to ${Target} ($uname)"
  exit 0
}

cargo build --release --manifest-path "$PSScriptRoot\..\agentd\Cargo.toml"
if ($LASTEXITCODE) { throw 'agentd build failed' }

# SSH starts in the home folder. No quotes: PowerShell 5.1 strips nested ones on the way to ssh.
& $ssh -o BatchMode=yes $Target 'cmd /d /c if not exist .nexron-chat mkdir .nexron-chat'
if ($LASTEXITCODE) { throw "cannot reach $Target" }
& $scp -o BatchMode=yes "$PSScriptRoot\..\agentd\target\release\agentd.exe" "${Target}:.nexron-chat/agentd.exe"
if ($LASTEXITCODE) { throw 'copy failed (is agentd still running there?)' }
Write-Host "agentd deployed to ${Target}"
