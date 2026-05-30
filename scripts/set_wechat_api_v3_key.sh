#!/usr/bin/env bash
set -euo pipefail

SERVER="${SERVER:-root@115.191.22.22}"
REMOTE_DIR="${REMOTE_DIR:-/opt/demoo}"
ENV_KEY="METAVIEW_WECHAT_PAY_API_V3_KEY"

if [ -t 0 ]; then
  printf "Enter WeChat Pay APIv3 key (32 chars, hidden): "
  stty -echo
  read -r API_V3_KEY
  stty echo
  printf "\n"
else
  read -r API_V3_KEY
fi

if [ "${#API_V3_KEY}" -ne 32 ]; then
  printf "APIv3 key must be exactly 32 characters; got %s.\n" "${#API_V3_KEY}" >&2
  exit 2
fi

case "$API_V3_KEY" in
  *[!A-Za-z0-9]*)
    printf "APIv3 key should contain only letters and digits.\n" >&2
    exit 2
    ;;
esac

printf "Updating %s on %s:%s ...\n" "$ENV_KEY" "$SERVER" "$REMOTE_DIR"

{
  printf "%s\n" "$API_V3_KEY"
  cat <<'REMOTE'
set -euo pipefail

cd "$REMOTE_DIR"
mkdir -p backups
cp .env "backups/.env.before-api-v3-key-$(date +%Y%m%d-%H%M%S)"

tmp="$(mktemp)"
grep -v -E "^${ENV_KEY}=" .env > "$tmp" || true
printf "%s=%s\n" "$ENV_KEY" "$API_V3_KEY" >> "$tmp"
cat "$tmp" > .env
rm -f "$tmp"

docker-compose up -d api >/dev/null

for _ in 1 2 3 4 5; do
  if curl -fsS http://127.0.0.1:8000/health >/dev/null; then
    break
  fi
  sleep 1
done

curl -fsS -c /tmp/metaview-api-v3-key.cookie http://127.0.0.1:8000/api/v1/account/me \
  | python3 -c 'import json,sys; data=json.load(sys.stdin); print("payment_enabled=%s" % str(data.get("payment_enabled")).lower())'
REMOTE
} | ssh "$SERVER" "REMOTE_DIR='$REMOTE_DIR' ENV_KEY='$ENV_KEY' bash -c 'IFS= read -r API_V3_KEY; export API_V3_KEY; bash -s'"

printf "Done. The key was not written to a local file.\n"
