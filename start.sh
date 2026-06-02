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

# 清理占用端口的进程
for PORT in 8000 5173; do
  PIDS=$(lsof -ti tcp:$PORT 2>/dev/null || true)
  if [ -n "$PIDS" ]; then
    echo "=> 端口 $PORT 被占用（PID: $PIDS），正在终止..."
    kill -9 $PIDS 2>/dev/null || true
    sleep 0.5
  fi
done

# 检查 .env 文件
if [ ! -f .env ]; then
  echo "=> .env 文件不存在，从 .env.example 复制..."
  cp .env.example .env
fi

# 按需安装依赖（已存在则跳过）
if [ ! -d node_modules ] || [ ! -d apps/web/node_modules ] || [ ! -d .venv ]; then
  echo "=> 安装依赖..."
  make bootstrap
else
  echo "=> 依赖已就绪，跳过安装。"
fi

echo "=> 启动前后端联调环境（$APP_EDITION_LABEL）..."
echo "   API  → http://127.0.0.1:8000"
echo "   Web  → http://127.0.0.1:5173"
echo "   Mode → $APP_EDITION"
echo "========================================="

make dev
