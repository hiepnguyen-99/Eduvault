$ErrorActionPreference = "Stop"

$ScriptsDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent (Split-Path -Parent $ScriptsDir)
$ComposeFile = Join-Path $RepoRoot "infra\compose\docker-compose.production.yml"
$EnvFile = Join-Path $RepoRoot ".env"

docker compose --env-file $EnvFile -f $ComposeFile ps
