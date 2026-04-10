#!/bin/bash
set -e

echo "=> 开始检查并初始化 MetaView 环境..."

# 检查 .env 文件是否存在
if [ ! -f .env ]; then
  echo "=> .env 文件不存在，从 .env.example 复制..."
  cp .env.example .env
fi

# 初始化后端和前端基础环境
echo "=> 安装依赖..."
make bootstrap

# 如果你想每次自动也配置 manim 渲染环境，可以取消注释下面这行
# make bootstrap-manim

echo "=> 初始化完成！启动前后端联调环境..."
echo "=> API 将在 http://127.0.0.1:8000 启动"
echo "=> Web 将在 http://127.0.0.1:5173 启动"
echo "================================================="

# 启动环境
make dev
