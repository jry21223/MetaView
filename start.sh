#!/bin/bash
set -e

echo "=> 检查 MetaView 环境..."

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

echo "=> 启动前后端联调环境..."
echo "   API  → http://127.0.0.1:8000"
echo "   Web  → http://127.0.0.1:5173"
echo "========================================="

make dev
