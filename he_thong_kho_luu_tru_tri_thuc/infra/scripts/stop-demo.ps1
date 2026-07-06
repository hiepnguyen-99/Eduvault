$ErrorActionPreference = "Stop"

$ScriptsDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent (Split-Path -Parent $ScriptsDir)
$ComposeFile = Join-Path $RepoRoot "infra\compose\docker-compose.demo.yml"
$EnvFile = Join-Path $RepoRoot ".env.demo"

docker compose --env-file $EnvFile -f $ComposeFile down
