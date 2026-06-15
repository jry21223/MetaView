#!/usr/bin/env bash
set -euo pipefail

NEWAPI_BASE_URL="${NEWAPI_BASE_URL:-http://localhost:3000}"
NEWAPI_USER_ID="${NEWAPI_USER_ID:-2}"
NEWAPI_COOKIE_FILE="${NEWAPI_COOKIE_FILE:-/tmp/newapi-metaview-test-cookie.txt}"
TOPUP_AMOUNT="${TOPUP_AMOUNT:-5}"
EXPECTED_CHECKOUT_ORIGIN="${EXPECTED_CHECKOUT_ORIGIN:-https://metaview.example.com}"
OPEN_BROWSER="${OPEN_BROWSER:-1}"
ASSERT_CHECKOUT="${ASSERT_CHECKOUT:-0}"

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf "Missing required command: %s\n" "$1" >&2
    exit 127
  fi
}

need curl
need python3

if [ ! -f "$NEWAPI_COOKIE_FILE" ]; then
  printf "Cookie file not found: %s\n" "$NEWAPI_COOKIE_FILE" >&2
  printf "Log in to local NewAPI once, or set NEWAPI_COOKIE_FILE to a valid cookie jar.\n" >&2
  exit 2
fi

case "$TOPUP_AMOUNT" in
  ''|*[!0-9]*)
    printf "TOPUP_AMOUNT must be a positive integer yuan amount; got %q.\n" "$TOPUP_AMOUNT" >&2
    exit 2
    ;;
esac

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

info_json="$tmp_dir/topup-info.json"
info_code="$(
  curl -sS \
    -b "$NEWAPI_COOKIE_FILE" \
    -H "New-Api-User: $NEWAPI_USER_ID" \
    -o "$info_json" \
    -w "%{http_code}" \
    "$NEWAPI_BASE_URL/api/user/topup/info"
)"

python3 - "$info_json" "$info_code" <<'PY'
import json
import sys

path, code = sys.argv[1], sys.argv[2]
if code != "200":
    raise SystemExit(f"NewAPI topup info HTTP {code}; expected 200")

with open(path, "r", encoding="utf-8") as handle:
    data = json.load(handle)

if data.get("success") is not True:
    raise SystemExit(f"NewAPI topup info failed: {data.get('message') or data}")

payload = data.get("data") or {}
if payload.get("enable_metaview_topup") is not True:
    raise SystemExit("NewAPI MetaView topup is not enabled")

methods = payload.get("pay_methods") or []
if not any(method.get("type") == "metaview_topup" for method in methods):
    raise SystemExit("NewAPI pay_methods does not include metaview_topup")

print("OK topup info: MetaView payment method enabled")
PY

start_json="$tmp_dir/topup-start.json"
start_code="$(
  curl -sS \
    -b "$NEWAPI_COOKIE_FILE" \
    -H "New-Api-User: $NEWAPI_USER_ID" \
    -H "Content-Type: application/json" \
    -d "{\"amount\":$TOPUP_AMOUNT}" \
    -o "$start_json" \
    -w "%{http_code}" \
    "$NEWAPI_BASE_URL/api/user/metaview/topup/start"
)"

jump_url="$(
  EXPECTED_CHECKOUT_ORIGIN="$EXPECTED_CHECKOUT_ORIGIN" \
  NEWAPI_USER_ID="$NEWAPI_USER_ID" \
  TOPUP_AMOUNT="$TOPUP_AMOUNT" \
  python3 - "$start_json" "$start_code" <<'PY'
import base64
import datetime as dt
import json
import os
import sys
from urllib.parse import parse_qs, urlparse

path, code = sys.argv[1], sys.argv[2]
if code != "200":
    raise SystemExit(f"NewAPI start HTTP {code}; expected 200")

with open(path, "r", encoding="utf-8") as handle:
    data = json.load(handle)

if data.get("success") is not True:
    raise SystemExit(f"NewAPI start failed: {data.get('message') or data}")

jump_url = ((data.get("data") or {}).get("jump_url") or "").strip()
if not jump_url:
    raise SystemExit("NewAPI start did not return data.jump_url")

parsed = urlparse(jump_url)
expected = urlparse(os.environ["EXPECTED_CHECKOUT_ORIGIN"])
if (parsed.scheme, parsed.netloc) != (expected.scheme, expected.netloc):
    raise SystemExit(f"Unexpected checkout origin: {parsed.scheme}://{parsed.netloc}")
if parsed.path != "/api/v1/newapi/topups/start":
    raise SystemExit(f"Unexpected checkout path: {parsed.path}")

query = parse_qs(parsed.query)
payload_token = (query.get("payload") or [""])[0]
sig = (query.get("sig") or [""])[0]
if not payload_token or not sig:
    raise SystemExit("Checkout URL is missing payload or sig")

padding = "=" * (-len(payload_token) % 4)
payload = json.loads(base64.urlsafe_b64decode((payload_token + padding).encode()).decode())

amount = int(os.environ["TOPUP_AMOUNT"])
expected_quota = amount * 500000
expected_user = int(os.environ["NEWAPI_USER_ID"])

checks = {
    "newapi_user_id": payload.get("newapi_user_id") == expected_user,
    "amount_cents": payload.get("amount_cents") == amount * 100,
    "quota_delta": payload.get("quota_delta") == expected_quota,
    "state": isinstance(payload.get("state"), str) and bool(payload.get("state")),
    "return_url": isinstance(payload.get("return_url"), str)
    and "newapi_user_id=" + str(expected_user) in payload.get("return_url"),
    "expires_at": isinstance(payload.get("expires_at"), str),
}
failed = [name for name, ok in checks.items() if not ok]
if failed:
    raise SystemExit("Invalid signed payload fields: " + ", ".join(failed))

expires_at = payload["expires_at"].replace("Z", "+00:00")
if dt.datetime.fromisoformat(expires_at) <= dt.datetime.now(dt.timezone.utc):
    raise SystemExit("Signed payload is already expired")

print(jump_url)
PY
)"

printf "OK start: NewAPI generated signed MetaView jump URL\n"
printf "OK payload: user=%s amount=¥%s quota=%s\n" \
  "$NEWAPI_USER_ID" "$TOPUP_AMOUNT" "$((TOPUP_AMOUNT * 500000))"

if [ "$ASSERT_CHECKOUT" = "1" ]; then
  checkout_html="$tmp_dir/checkout.html"
  checkout_code="$(curl -sS -L -o "$checkout_html" -w "%{http_code}" "$jump_url")"
  if [ "$checkout_code" != "200" ]; then
    printf "MetaView checkout HTTP %s; expected 200\n" "$checkout_code" >&2
    sed -n '1,20p' "$checkout_html" >&2
    exit 1
  fi
  if ! grep -q "MetaView NewAPI 充值收银台" "$checkout_html"; then
    printf "MetaView checkout page title not found.\n" >&2
    exit 1
  fi
  printf "OK checkout: real MetaView cashier returned HTTP 200\n"
fi

if [ "$OPEN_BROWSER" = "1" ]; then
  if command -v open >/dev/null 2>&1; then
    open "$jump_url"
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$jump_url" >/dev/null 2>&1 &
  else
    printf "Browser opener not found. Open this URL manually:\n%s\n" "$jump_url"
  fi
  printf "OK browser: opened MetaView checkout in the default browser\n"
else
  printf "OK browser: skipped because OPEN_BROWSER=0\n"
fi
