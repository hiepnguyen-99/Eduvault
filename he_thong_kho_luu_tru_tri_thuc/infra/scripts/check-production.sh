#!/usr/bin/env bash
set -euo pipefail

curl -fsS http://127.0.0.1:8080/api/health
curl -fsSI http://127.0.0.1:3000
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
docker compose --env-file "$ROOT_DIR/.env" -f "$ROOT_DIR/infra/compose/docker-compose.production.yml" ps
