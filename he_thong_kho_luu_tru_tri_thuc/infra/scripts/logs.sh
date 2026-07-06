#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
docker compose --env-file "$ROOT_DIR/.env.demo" -f "$ROOT_DIR/infra/compose/docker-compose.demo.yml" logs -f frontend backend mysql minio qdrant
