$ErrorActionPreference = "Stop"

function Resolve-CloudflaredExe {
    $pathCommand = Get-Command cloudflared -ErrorAction SilentlyContinue
    if ($pathCommand -and $pathCommand.Source) {
        return $pathCommand.Source
    }

    foreach ($candidate in @(
        "C:\Program Files\cloudflared\cloudflared.exe",
        "C:\Program Files (x86)\cloudflared\cloudflared.exe"
    )) {
        if (Test-Path $candidate) {
            return $candidate
        }
    }

    throw "cloudflared.exe was not found."
}

$ScriptsDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent (Split-Path -Parent $ScriptsDir)
$EnvFile = if ($args.Count -gt 0) { $args[0] } else { Join-Path $RepoRoot ".env.demo" }
$LogDir = Join-Path $RepoRoot "var\tmp"
$StdOutLog = Join-Path $LogDir "cloudflared-demo.out.log"
$StdErrLog = Join-Path $LogDir "cloudflared-demo.err.log"
$PidFile = Join-Path $LogDir "cloudflared-demo.pid"
$RunScript = Join-Path $ScriptsDir "run-demo-tunnel.ps1"

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

if (Test-Path $PidFile) {
    $existingPid = (Get-Content $PidFile -Raw).Trim()
    if ($existingPid) {
        $existingProcess = Get-Process -Id ([int]$existingPid) -ErrorAction SilentlyContinue
        if ($existingProcess) {
            Write-Host "cloudflared demo tunnel is already running with PID $existingPid"
            exit 0
        }
    }
}

$cloudflaredExe = Resolve-CloudflaredExe
Write-Host "Using cloudflared: $cloudflaredExe"

$process = Start-Process `
    -FilePath "powershell.exe" `
    -ArgumentList @(
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-File", $RunScript,
        $EnvFile
    ) `
    -WorkingDirectory $RepoRoot `
    -RedirectStandardOutput $StdOutLog `
    -RedirectStandardError $StdErrLog `
    -WindowStyle Hidden `
    -PassThru

Set-Content -Path $PidFile -Value $process.Id
Write-Host "Started cloudflared demo tunnel in background. PID=$($process.Id)"
Write-Host "Stdout log: $StdOutLog"
Write-Host "Stderr log: $StdErrLog"
