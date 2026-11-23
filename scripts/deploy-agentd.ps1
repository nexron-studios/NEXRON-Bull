# Puts agentd on another machine reachable over SSH, where Bull starts it.
# Windows: builds agentd here and copies it to %USERPROFILE%\.nexron-chat\agentd.exe.
# macOS and Linux: this PC cannot build for them, so the machine downloads the agentd of the
# version in package.json from the GitHub release, or gets the file given as -Binary (a build
# from a Mac, or a release asset of another version). It lands in ~/.nexron-chat/agentd, the
# previous one stays as agentd.old.
# Usage: powershell -File scripts/deploy-agentd.ps1 nexron-server [-Binary path\to\agentd]
# Close Bull tabs on that machine first: a running agentd is stopped (Windows: locked). The
# background server exits about 30 s after its last tab stopped and no app is connected.
param([Parameter(Mandatory = $true)][string]$Target, [string]$Binary)
$ErrorActionPreference = 'Stop'

# Windows' own OpenSSH: Git's ssh.exe mangles the cmd line for a PowerShell login shell.
$ssh = Join-Path $env:SystemRoot 'System32\OpenSSH\ssh.exe'
$scp = Join-Path $env:SystemRoot 'System32\OpenSSH\scp.exe'
$releases = 'https://github.com/nexron-studios/NEXRON-Bull/releases/download'

# cmd and PowerShell do not know uname; macOS and Linux answer "Darwin arm64", "Linux x86_64".
$uname = (& $ssh -o BatchMode=yes $Target 'uname -sm' 2>$null | Select-Object -First 1)
if ($LASTEXITCODE -eq 255) { throw "cannot reach $Target" }

if ($LASTEXITCODE -eq 0 -and $uname -match '^(Darwin|Linux) (\S+)') {
  $arch = if ($Matches[2] -match '^(arm64|aarch64)$') { 'aarch64' } else { $Matches[2] }
  $system = if ($Matches[1] -eq 'Darwin') { 'apple-darwin' } else { 'unknown-linux-musl' }
  # No double quotes in these lines: PowerShell 5.1 strips nested ones on the way to ssh.
  $swap = 'cd ~/.nexron-chat && chmod 755 agentd.download && { [ ! -f agentd ] || cp -pf agentd agentd.old; } && mv -f agentd.download agentd'
  & $ssh -o BatchMode=yes $Target "sh -c 'pkill -u `$(id -u) -x agentd; mkdir -p ~/.nexron-chat'"
  if ($Binary) {
    & $scp -o BatchMode=yes $Binary "${Target}:.nexron-chat/agentd.download"
    if ($LASTEXITCODE) { throw 'copy failed' }
  } else {
    $version = (Get-Content "$PSScriptRoot\..\package.json" -Raw | ConvertFrom-Json).version
    $url = "$releases/v$version/agentd-$arch-$system"
    & $ssh -o BatchMode=yes $Target "sh -c 'curl -fsSL -o ~/.nexron-chat/agentd.download $url'"
    if ($LASTEXITCODE) { throw "download of $url failed (is the release there yet?)" }
  }
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
