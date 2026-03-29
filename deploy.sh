#!/bin/bash
set -e

# 部署配置
SERVER="root@115.191.22.22"
REMOTE_DIR="/opt/demoo"
LOCAL_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== 部署到 $SERVER:$REMOTE_DIR ==="

# 1. 在服务器上创建目录
echo "[1/4] 创建远程目录..."
ssh "$SERVER" "mkdir -p $REMOTE_DIR/data"

# 2. 同步代码（排除 node_modules、.venv 等）
echo "[2/4] 同步代码..."
rsync -avz --delete \
    --exclude 'node_modules' \
    --exclude '.venv' \
    --exclude '.venv-manim' \
    --exclude '__pycache__' \
    --exclude '.git' \
    --exclude '*.pyc' \
    --exclude '.ruff_cache' \
    --exclude 'apps/web/dist' \
    --exclude 'data/pipeline_runs.db' \
    "$LOCAL_DIR/" "$SERVER:$REMOTE_DIR/"

# 3. 同步环境变量文件（如果存在）
if [ -f "$LOCAL_DIR/.env" ]; then
    echo "[3/4] 同步 .env 文件..."
    rsync -avz "$LOCAL_DIR/.env" "$SERVER:$REMOTE_DIR/.env"
else
    echo "[3/4] 跳过 .env (不存在)"
fi

# 4. 在服务器上构建并启动
echo "[4/4] 构建并启动 Docker 容器..."
ssh "$SERVER" << 'ENDSSH'
cd /opt/demoo

# 拉取最新镜像基础
docker compose pull --ignore-buildable 2>/dev/null || true

# 构建并启动
docker compose build --no-cache
docker compose up -d

# 清理旧镜像
docker image prune -f

# 显示状态
docker compose ps
ENDSSH

echo "=== 部署完成 ==="
echo "前端: http://115.191.22.22:5173"
echo "后端: http://115.191.22.22:8000"