#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
docker compose --env-file "$ROOT_DIR/.env.demo" -f "$ROOT_DIR/infra/compose/docker-compose.demo.yml" down
docker compose --env-file "$ROOT_DIR/.env.demo" -f "$ROOT_DIR/infra/compose/docker-compose.demo.yml" build
docker compose --env-file "$ROOT_DIR/.env.demo" -f "$ROOT_DIR/infra/compose/docker-compose.demo.yml" up -d
docker compose --env-file "$ROOT_DIR/.env.demo" -f "$ROOT_DIR/infra/compose/docker-compose.demo.yml" ps
