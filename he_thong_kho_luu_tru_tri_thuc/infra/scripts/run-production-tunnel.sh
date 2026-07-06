#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
"$ROOT_DIR/infra/tunnel/cloudflared/render-production-config.sh" "${1:-$ROOT_DIR/.env}"
cloudflared tunnel --config "$ROOT_DIR/infra/tunnel/cloudflared/config.production.generated.yml" run
