#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
TUNNEL_DIR="$REPO_ROOT/infra/tunnel/cloudflared"
ENV_FILE="${1:-$REPO_ROOT/.env}"
TEMPLATE_FILE="$TUNNEL_DIR/config.production.template.yml"
OUTPUT_FILE="$TUNNEL_DIR/config.production.generated.yml"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

set -a
source "$ENV_FILE"
set +a

: "${CLOUDFLARE_TUNNEL_ID:?Missing CLOUDFLARE_TUNNEL_ID}"
: "${CLOUDFLARE_CREDENTIALS_FILE:?Missing CLOUDFLARE_CREDENTIALS_FILE}"
: "${CLOUDFLARE_FRONTEND_HOSTNAME:?Missing CLOUDFLARE_FRONTEND_HOSTNAME}"
: "${CLOUDFLARE_BACKEND_HOSTNAME:?Missing CLOUDFLARE_BACKEND_HOSTNAME}"

sed \
  -e "s|__CLOUDFLARE_TUNNEL_ID__|$CLOUDFLARE_TUNNEL_ID|g" \
  -e "s|__CLOUDFLARE_CREDENTIALS_FILE__|$CLOUDFLARE_CREDENTIALS_FILE|g" \
  -e "s|__CLOUDFLARE_FRONTEND_HOSTNAME__|$CLOUDFLARE_FRONTEND_HOSTNAME|g" \
  -e "s|__CLOUDFLARE_BACKEND_HOSTNAME__|$CLOUDFLARE_BACKEND_HOSTNAME|g" \
  "$TEMPLATE_FILE" > "$OUTPUT_FILE"

echo "Generated: $OUTPUT_FILE"
