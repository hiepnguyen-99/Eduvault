$ErrorActionPreference = "Stop"

$ScriptsDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent (Split-Path -Parent $ScriptsDir)
$PidFile = Join-Path $RepoRoot "var\tmp\cloudflared-demo.pid"
$StdOutLog = Join-Path $RepoRoot "var\tmp\cloudflared-demo.out.log"
$StdErrLog = Join-Path $RepoRoot "var\tmp\cloudflared-demo.err.log"

if (-not (Test-Path $PidFile)) {
    Write-Host "cloudflared demo tunnel is not running."
    exit 0
}

$pidValue = (Get-Content $PidFile -Raw).Trim()
if (-not $pidValue) {
    Write-Host "cloudflared demo tunnel PID file is empty."
    exit 0
}

$process = Get-Process -Id ([int]$pidValue) -ErrorAction SilentlyContinue
if ($process) {
    Write-Host "cloudflared demo tunnel is running with PID $pidValue"
    Write-Host "Stdout log: $StdOutLog"
    Write-Host "Stderr log: $StdErrLog"
} else {
    Write-Host "cloudflared demo tunnel PID file exists, but process $pidValue is not running."
    Write-Host "Stdout log: $StdOutLog"
    Write-Host "Stderr log: $StdErrLog"
}
