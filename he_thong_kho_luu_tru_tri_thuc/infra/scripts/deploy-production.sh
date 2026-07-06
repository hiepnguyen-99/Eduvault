#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
docker compose --env-file "$ROOT_DIR/.env" -f "$ROOT_DIR/infra/compose/docker-compose.production.yml" down
docker compose --env-file "$ROOT_DIR/.env" -f "$ROOT_DIR/infra/compose/docker-compose.production.yml" build
docker compose --env-file "$ROOT_DIR/.env" -f "$ROOT_DIR/infra/compose/docker-compose.production.yml" up -d
docker compose --env-file "$ROOT_DIR/.env" -f "$ROOT_DIR/infra/compose/docker-compose.production.yml" ps
