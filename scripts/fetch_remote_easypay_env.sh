#!/usr/bin/env bash
set -euo pipefail

SERVER="${SERVER:-root@115.191.22.22}"
REMOTE_DIR="${REMOTE_DIR:-/opt/demoo}"
REMOTE_ENV_FILE="${REMOTE_ENV_FILE:-.env}"
SSH_OPTS="${SSH_OPTS:--oBatchMode=yes -oStrictHostKeyChecking=no}"
OUTPUT_FORMAT="${OUTPUT_FORMAT:-summary}"
UNMASK="${UNMASK:-0}"
WRITE_TO="${WRITE_TO:-}"

usage() {
  cat <<'EOF_USAGE'
fetch_remote_easypay_env.sh

Usage:
  SERVER=... REMOTE_DIR=... REMOTE_ENV_FILE=... OUTPUT_FORMAT=summary|env|json UNMASK=0|1 ./scripts/fetch_remote_easypay_env.sh

Defaults:
  SERVER=root@115.191.22.22
  REMOTE_DIR=/opt/demoo
  REMOTE_ENV_FILE=.env
  OUTPUT_FORMAT=summary
  UNMASK=0
  WRITE_TO (optional output file path)
EOF_USAGE
}

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  usage
  exit 0
fi

case "$OUTPUT_FORMAT" in
  summary|env|json) ;;
  *)
    echo "OUTPUT_FORMAT must be one of: summary, env, json" >&2
    exit 2
    ;;
esac

set +e
remote_payload="$(ssh $SSH_OPTS "$SERVER" "bash -s" "$REMOTE_DIR" "$REMOTE_ENV_FILE" <<'REMOTE_BLOCK'
set -euo pipefail

remote_dir="$1"
env_hint="$2"

candidates=(
  "$env_hint"
  "$remote_dir/$env_hint"
  "$remote_dir/.env"
  "$remote_dir/.env.production"
  "$remote_dir/.env.local"
)

env_path=""
for f in "${candidates[@]}"; do
  if [ -f "$f" ]; then
    env_path="$f"
    break
  fi
done

if [ -z "$env_path" ]; then
  exit 11
fi

trim() {
  printf '%s' "$1" | sed -E 's/^[[:space:]]+|[[:space:]]+$//g'
}

parse_env() {
  local file="$1"
  local line key val
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    line="$(trim "$line")"
    [[ -z "$line" || "$line" == \#* ]] && continue

    if [[ "$line" == export[[:space:]]* ]]; then
      line="${line#export}"
      line="$(trim "$line")"
    fi

    [[ "$line" == *"="* ]] || continue
    key="${line%%=*}"
    val="${line#*=}"
    key="$(trim "$key")"
    val="$(trim "$val")"

    [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue

    if [ "${#val}" -ge 2 ] && [ "${val:0:1}" = '"' ] && [ "${val: -1}" = '"' ]; then
      val="${val:1:${#val}-2}"
    elif [ "${#val}" -ge 2 ] && [ "${val:0:1}" = "'" ] && [ "${val: -1}" = "'" ]; then
      val="${val:1:${#val}-2}"
    fi

    printf '%s=%s\n' "$key" "$val"
  done < "$file"
}

echo "SOURCE=$env_path"
parse_env "$env_path"
REMOTE_BLOCK
)"
status=$?
set -e

if [ "$status" -ne 0 ]; then
  if [ "$status" -eq 11 ]; then
    echo "未找到远端环境文件: ${REMOTE_DIR}/${REMOTE_ENV_FILE} 或常见候选项 .env/.env.production/.env.local" >&2
    exit 11
  fi
  echo "SSH 读取失败，返回码: $status" >&2
  exit "$status"
fi

source_file=""
metaview_submit_url=""
metaview_api_base=""
metaview_submit_path=""
metaview_pid=""
metaview_merchant_id=""
metaview_key=""
metaview_api_key=""
metaview_notify_url=""
metaview_return_url=""
easy_pid=""
easy_merchant_id=""
easy_key=""
easy_notify_url=""
easy_return_url=""

while IFS= read -r line || [ -n "$line" ]; do
  key="${line%%=*}"
  val="${line#*=}"

  case "$key" in
    SOURCE) source_file="$val" ;;
    METAVIEW_EPAY_SUBMIT_URL) metaview_submit_url="$val" ;;
    METAVIEW_EPAY_API_BASE) metaview_api_base="$val" ;;
    METAVIEW_EPAY_SUBMIT_PATH) metaview_submit_path="$val" ;;
    METAVIEW_EPAY_PID) metaview_pid="$val" ;;
    METAVIEW_EPAY_MERCHANT_ID) metaview_merchant_id="$val" ;;
    METAVIEW_EPAY_KEY) metaview_key="$val" ;;
    METAVIEW_EPAY_API_KEY) metaview_api_key="$val" ;;
    METAVIEW_EPAY_NOTIFY_URL) metaview_notify_url="$val" ;;
    METAVIEW_EPAY_RETURN_URL) metaview_return_url="$val" ;;
    EASY_PAY_PID) easy_pid="$val" ;;
    EASY_PAY_MERCHANT_ID) easy_merchant_id="$val" ;;
    EASY_PAY_KEY) easy_key="$val" ;;
    EASY_PAY_NOTIFY_URL) easy_notify_url="$val" ;;
    EASY_PAY_RETURN_URL) easy_return_url="$val" ;;
  esac
done <<< "$remote_payload"

join_url() {
  local base="$1"
  local path="$2"
  if [ -z "$base" ]; then
    echo ""
    return
  fi
  if [ -z "$path" ]; then
    echo "$base"
    return
  fi
  echo "${base%/}/${path#/}"
}

mask_secret() {
  local s="$1"
  if [ "$UNMASK" = "1" ]; then
    printf "%s" "$s"
    return
  fi
  if [ -z "$s" ]; then
    printf "<未配置>"
    return
  fi
  if [ "${#s}" -le 8 ]; then
    printf "********"
    return
  fi
  printf "%s****%s" "${s:0:4}" "${s: -4}"
}

escape_json() {
  local s="$1"
  s="$(printf '%s' "$s" | sed -e 's/\\/\\\\/g' -e 's/\"/\\\"/g')"
  s="${s//$'\n'/\\n}"
  s="${s//$'\r'/\\r}"
  s="${s//$'\t'/\\t}"
  printf '%s' "$s"
}

submit_url="${metaview_submit_url:-}"
if [ -z "$submit_url" ]; then
  submit_url="$(join_url "${metaview_api_base-}" "${metaview_submit_path-}")"
fi

merchant_id="${metaview_pid:-${metaview_merchant_id:-${easy_pid:-${easy_merchant_id:-}}}}"
api_key="${metaview_key:-${metaview_api_key:-${easy_key:-}}}"
notify_url="${metaview_notify_url:-${easy_notify_url:-}}"
return_url="${metaview_return_url:-${easy_return_url:-}}"

output_file="$(mktemp)"
trap 'rm -f "$output_file"' EXIT

case "$OUTPUT_FORMAT" in
  summary)
    {
      printf '源文件: %s\n' "$source_file"
      printf '支付地址: %s\n' "${submit_url:-<未配置>}"
      printf '商户ID: %s\n' "${merchant_id:-<未配置>}"
      printf 'API密钥: %s\n' "$(mask_secret "$api_key")"
      printf '回调地址: %s\n' "${notify_url:-<未配置>}"
      printf '回跳地址: %s\n' "${return_url:-<未配置>}"
    } > "$output_file"
    ;;
  env)
    {
      printf 'METAVIEW_EPAY_SUBMIT_URL=%s\n' "$submit_url"
      printf 'METAVIEW_EPAY_MERCHANT_ID=%s\n' "$merchant_id"
      printf 'METAVIEW_EPAY_KEY=%s\n' "$api_key"
      printf 'METAVIEW_EPAY_NOTIFY_URL=%s\n' "$notify_url"
      printf 'METAVIEW_EPAY_RETURN_URL=%s\n' "$return_url"
    } > "$output_file"
    ;;
  json)
    {
      printf '{\n'
      printf '  "remote_source": "%s",\n' "$(escape_json "$source_file")"
      printf '  "submit_url": "%s",\n' "$(escape_json "$submit_url")"
      printf '  "merchant_id": "%s",\n' "$(escape_json "$merchant_id")"
      printf '  "api_key": "%s",\n' "$(escape_json "$api_key")"
      printf '  "notify_url": "%s",\n' "$(escape_json "$notify_url")"
      printf '  "return_url": "%s"\n' "$(escape_json "$return_url")"
      printf '}\n'
    } > "$output_file"
    ;;
esac

cat "$output_file"
if [ -n "$WRITE_TO" ]; then
  cat "$output_file" > "$WRITE_TO"
  echo "已写入: $WRITE_TO"
fi
