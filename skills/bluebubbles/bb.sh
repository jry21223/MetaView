#!/usr/bin/env bash
# BlueBubbles API helper script
# Usage: bb.sh <command> [args...]
#
# Environment:
#   BB_URL       - BlueBubbles server URL (required)
#   BB_PASSWORD  - BlueBubbles server password (required)
#   BB_DEFAULT_CHAT - Default chat GUID (optional)

set -euo pipefail

API="${BB_URL:?BB_URL not set}/api/v1"
PW="${BB_PASSWORD:?BB_PASSWORD not set}"

url_encode_guid() {
  echo "$1" | sed 's/;/%3B/g; s/+/%2B/g'
}

resolve_target() {
  local target="$1"
  if [[ "$target" == "default" ]]; then
    echo "${BB_DEFAULT_CHAT:?BB_DEFAULT_CHAT not set}"
  elif [[ "$target" == iMessage* ]] || [[ "$target" == SMS* ]]; then
    echo "$target"
  elif [[ "$target" == +* ]]; then
    echo "iMessage;-;$target"
  elif [[ "$target" == *@* ]]; then
    echo "iMessage;-;$target"
  else
    echo "iMessage;-;$target"
  fi
}

cmd="${1:-help}"
shift || true

case "$cmd" in
  ping)
    curl -s "$API/ping?password=$PW" | jq .
    ;;

  send)
    target="${1:?Usage: bb.sh send <target> <message>}"
    shift
    message="$*"
    chat_guid=$(resolve_target "$target")
    temp_guid="temp-$(date +%s)-$RANDOM"
    curl -s -X POST "$API/message/text?password=$PW" \
      -H "Content-Type: application/json" \
      -d "$(jq -n --arg cg "$chat_guid" --arg msg "$message" --arg tg "$temp_guid" \
        '{chatGuid: $cg, message: $msg, tempGuid: $tg}')" | jq .
    ;;

  read)
    target="${1:-${BB_DEFAULT_CHAT:?No chat specified and BB_DEFAULT_CHAT not set}}"
    limit="${2:-10}"
    chat_guid=$(resolve_target "$target")
    encoded=$(url_encode_guid "$chat_guid")
    curl -s "$API/chat/$encoded/message?password=$PW&limit=$limit&offset=0&sort=DESC" \
      | jq -r '.data[] | "\(if .isFromMe then "Me" else (.handle.address // "Unknown") end) [\(.dateCreated)]: \(.text // "(attachment)")"'
    ;;

  chats)
    limit="${1:-10}"
    curl -s -X POST "$API/chat/query?password=$PW" \
      -H "Content-Type: application/json" \
      -d "$(jq -n --argjson lim "$limit" '{limit: $lim, offset: 0, sort: "lastmessage", with: ["lastMessage"]}')" \
      | jq -r '.data[] | "\(.guid)\t\(.displayName // .chatIdentifier)\t\(.lastMessage.text // "(no messages)" | .[0:50])"'
    ;;

  status)
    target="${1:-${BB_DEFAULT_CHAT:-}}"
    branch=$(git branch --show-current 2>/dev/null || echo "N/A")
    modified=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
    last_commit=$(git log --oneline -1 2>/dev/null || echo "N/A")
    cwd=$(pwd)

    status_msg=$(cat <<EOF
📊 Claude Code Status
Branch: $branch
Modified files: $modified
Last commit: $last_commit
Directory: $cwd
EOF
)
    if [[ -n "$target" ]]; then
      chat_guid=$(resolve_target "$target")
      temp_guid="temp-$(date +%s)-$RANDOM"
      curl -s -X POST "$API/message/text?password=$PW" \
        -H "Content-Type: application/json" \
        -d "$(jq -n --arg cg "$chat_guid" --arg msg "$status_msg" --arg tg "$temp_guid" \
          '{chatGuid: $cg, message: $msg, tempGuid: $tg}')" | jq .
    else
      echo "$status_msg"
    fi
    ;;

  help|*)
    cat <<EOF
BlueBubbles CLI — iMessage via BlueBubbles API

Commands:
  ping                          Test server connectivity
  send <target> <message>       Send a text message
  read [target] [limit]         Read recent messages (default: 10)
  chats [limit]                 List recent chats
  status [target]               Send CC status to chat (or display locally)

Target formats:
  +15551234567                  Phone number (auto-wrapped as iMessage)
  user@icloud.com               Email (auto-wrapped as iMessage)
  iMessage;-;+15551234567       Full chat GUID
  default                       Use \$BB_DEFAULT_CHAT

Environment:
  BB_URL          BlueBubbles server URL (required)
  BB_PASSWORD     Server password (required)
  BB_DEFAULT_CHAT Default chat GUID (optional)
EOF
    ;;
esac
