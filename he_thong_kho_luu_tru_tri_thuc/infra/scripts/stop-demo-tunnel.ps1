$ErrorActionPreference = "Stop"

$ScriptsDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent (Split-Path -Parent $ScriptsDir)
$PidFile = Join-Path $RepoRoot "var\tmp\cloudflared-demo.pid"

if (-not (Test-Path $PidFile)) {
    Write-Host "No demo tunnel PID file found."
    exit 0
}

$pidValue = (Get-Content $PidFile -Raw).Trim()
if (-not $pidValue) {
    Remove-Item $PidFile -Force
    Write-Host "Removed empty PID file."
    exit 0
}

$process = Get-Process -Id ([int]$pidValue) -ErrorAction SilentlyContinue
if ($process) {
    Stop-Process -Id $process.Id -Force
    Write-Host "Stopped cloudflared demo tunnel PID $pidValue"
} else {
    Write-Host "Process $pidValue is not running."
}

Remove-Item $PidFile -Force
