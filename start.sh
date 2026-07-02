#!/bin/bash
set -e

usage() {
  cat <<'EOF'
用法:
  ./start.sh          启动自用版
  ./start.sh self     启动自用版
  ./start.sh op       启动运营版
  ./start.sh ops      启动运营版
EOF
}

if [ "$#" -gt 1 ]; then
  echo "=> 参数过多。"
  usage
  exit 2
fi

MODE="${1:-self}"
case "$MODE" in
  self)
    APP_EDITION="self"
    APP_EDITION_LABEL="自用版"
    ;;
  op|ops)
    APP_EDITION="ops"
    APP_EDITION_LABEL="运营版"
    ;;
  -h|--help|help)
    usage
    exit 0
    ;;
  *)
    echo "=> 未知启动模式: $MODE"
    usage
    exit 2
    ;;
esac

export METAVIEW_APP_EDITION="$APP_EDITION"
export VITE_APP_EDITION="$APP_EDITION"

echo "=> 检查 MetaView 环境（$APP_EDITION_LABEL）..."

is_metaview_process() {
  local pid="$1"
  local cmd
  cmd="$(ps -p "$pid" -o command= 2>/dev/null || true)"
  case "$cmd" in
    *"$PWD"*|*"apps/api"*|*"apps/web"*|*"vite"*|*"uvicorn app.main"*|*"uvicorn apps.api"*)
      printf '%s' "$cmd"
      return 0
      ;;
    *)
      printf '%s' "$cmd"
      return 1
      ;;
  esac
}

stop_known_metaview_processes() {
  local port="$1"
  local pids
  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  [ -z "$pids" ] && return 0

  for pid in $pids; do
    local cmd
    if cmd="$(is_metaview_process "$pid")"; then
      echo "=> 端口 $port 被 MetaView 相关进程占用（PID: $pid），正在温和终止..."
      kill "$pid" 2>/dev/null || true
      sleep 0.8
      if kill -0 "$pid" 2>/dev/null; then
        echo "=> PID $pid 仍在运行，请手动确认后再强制终止。命令: $cmd"
        exit 3
      fi
    else
      echo "=> 端口 $port 被非 MetaView 进程占用（PID: $pid）。"
      echo "   命令: ${cmd:-<unknown>}"
      echo "   请手动释放该端口，或调整服务端口后再启动。"
      exit 3
    fi
  done
}

for PORT in 8000 5173; do
  stop_known_metaview_processes "$PORT"
done

if [ ! -f .env ]; then
  echo "=> .env 文件不存在，从 .env.example 复制..."
  cp .env.example .env
fi

if [ ! -d node_modules ] || [ ! -d apps/web/node_modules ] || [ ! -d .venv ]; then
  echo "=> 安装依赖..."
  make bootstrap
else
  echo "=> 依赖已就绪，跳过安装。"
fi

echo "=> 启动前后端联调环境（$APP_EDITION_LABEL）..."
echo "   API  -> http://127.0.0.1:8000"
echo "   Web  -> http://127.0.0.1:5173"
echo "   Mode -> $APP_EDITION"
echo "========================================="

make dev
