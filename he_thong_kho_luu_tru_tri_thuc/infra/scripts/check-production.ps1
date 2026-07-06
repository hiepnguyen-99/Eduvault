$ErrorActionPreference = "Stop"

$ScriptsDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent (Split-Path -Parent $ScriptsDir)
$ComposeFile = Join-Path $RepoRoot "infra\compose\docker-compose.production.yml"
$EnvFile = Join-Path $RepoRoot ".env"

Invoke-WebRequest "http://127.0.0.1:8080/api/health" | Out-Null
Invoke-WebRequest "http://127.0.0.1:3000" -Method Head | Out-Null
docker compose --env-file $EnvFile -f $ComposeFile ps
