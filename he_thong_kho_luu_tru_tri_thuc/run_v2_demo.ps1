$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root
$logDir = Join-Path $root "var\logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

if (-not (Test-Path ".env")) {
    $demoExample = Join-Path $root "config\env\.env.demo.example"
    if (Test-Path $demoExample) {
        Copy-Item $demoExample ".env"
        Write-Host "Created .env from config\\env\\.env.demo.example. V2 services use local fallback until enabled."
    } else {
        throw "Missing environment template: $demoExample"
    }
}

Write-Host "Starting EduVault V2 backend (SQLite local demo mode)..."
Start-Process cmd.exe -ArgumentList "/c",(Join-Path $root "scripts\run_backend_sqlite_8080.cmd") -WorkingDirectory $root -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $logDir "v2-backend.stdout.log") `
    -RedirectStandardError (Join-Path $logDir "v2-backend.stderr.log")

Write-Host "Starting EduVault V2 frontend..."
Start-Process npm.cmd -ArgumentList "run","dev","--","-p","3000" -WorkingDirectory (Join-Path $root "frontend") -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $logDir "v2-frontend.stdout.log") `
    -RedirectStandardError (Join-Path $logDir "v2-frontend.stderr.log")

Write-Host ""
Write-Host "EduVault V2 demo is starting:"
Write-Host "  Frontend: http://127.0.0.1:3000"
Write-Host "  API:      http://127.0.0.1:8080/docs"
Write-Host "  Accounts: GV001, GVNEW, TBM01, ADMIN (password equals account code)"
Write-Host ""
Write-Host "For real MySQL/MinIO/Redis/Qdrant, run:"
Write-Host "  docker compose --env-file .env -f infra/compose/docker-compose.v2.yml up -d"
Write-Host "Then enable the V2 services in .env and restart this script."
