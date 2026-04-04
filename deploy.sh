#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────
#  MetaView — 一键部署脚本
#
#  Usage:
#    ./deploy.sh              # 完整部署（同步代码 + 构建 + 启动）
#    ./deploy.sh quick        # 快速部署（仅同步代码 + 重启，不重建）
#    ./deploy.sh build        # 仅远程构建镜像（不重启）
#    ./deploy.sh restart      # 仅重启容器（不重新构建）
#    ./deploy.sh logs         # 查看远程容器日志
#    ./deploy.sh status       # 查看远程容器状态
#    ./deploy.sh stop         # 停止远程容器
#    ./deploy.sh clean        # 清理远程 Docker 缓存
#    ./deploy.sh backup       # 备份远程数据
#    ./deploy.sh rollback     # 回滚到上一版本
#    ./deploy.sh ssh          # SSH 登录到服务器
#    ./deploy.sh init         # 初始化远程环境（安装 Docker）
# ─────────────────────────────────────────────────────────
set -euo pipefail

# ── 配置 ────────────────────────────────────────────────
SERVER="root@115.191.22.22"
REMOTE_DIR="/opt/demoo"
LOCAL_DIR="$(cd "$(dirname "$0")" && pwd)"
VERSION_FILE="$REMOTE_DIR/.deploy_version"
BACKUP_DIR="$REMOTE_DIR/backups"

# Docker Compose 命令（自动检测）
COMPOSE_CMD=""

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# ── 工具函数 ─────────────────────────────────────────────
info()  { echo -e "${CYAN}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
fail()  { echo -e "${RED}[FAIL]${NC}  $*"; exit 1; }
step()  { echo -e "\n${BOLD}── $* ──${NC}"; }

# 远程执行命令
remote_cmd() {
    ssh "$SERVER" "$@"
}

# 获取当前 git 信息
get_version() {
    local branch="$(git branch --show-current 2>/dev/null || echo 'unknown')"
    local commit="$(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')"
    local timestamp="$(date '+%Y%m%d-%H%M%S')"
    echo "$branch@$commit ($timestamp)"
}

# ── 前置检查 ─────────────────────────────────────────────
preflight() {
    command -v ssh   >/dev/null 2>&1 || fail "ssh 未安装"
    command -v rsync >/dev/null 2>&1 || fail "rsync 未安装"
    command -v git   >/dev/null 2>&1 || warn "git 未安装，版本标记将不可用"

    # 测试 SSH 连通性（3 秒超时）
    if ! ssh -o ConnectTimeout=3 -o BatchMode=yes "$SERVER" "true" 2>/dev/null; then
        fail "无法连接到 $SERVER，请检查 SSH 密钥和网络"
    fi
    ok "SSH 连接正常"

    # 检查远程 Docker 环境
    check_docker_env
}

# ── Docker 环境检查 ───────────────────────────────────────
check_docker_env() {
    step "检查远程 Docker 环境"

    if ! remote_cmd "command -v docker >/dev/null 2>&1"; then
        fail "远程服务器未安装 Docker，请运行: ./deploy.sh init"
    fi

    # 检测 Docker Compose 命令格式
    if remote_cmd "docker compose version >/dev/null 2>&1"; then
        COMPOSE_CMD="docker compose"
    elif remote_cmd "docker-compose version >/dev/null 2>&1"; then
        COMPOSE_CMD="docker-compose"
    else
        fail "远程服务器未安装 Docker Compose，请运行: ./deploy.sh init"
    fi

    ok "Docker 环境正常 (Compose: $COMPOSE_CMD)"

    # 磁盘空间检查（至少 5GB）
    local available
    available=$(remote_cmd "df -BG $REMOTE_DIR | tail -1 | awk '{print \$4}' | tr -d 'G'" 2>/dev/null || echo "0")
    if [ "$available" -lt 5 ]; then
        warn "磁盘空间不足 5GB (当前: ${available}GB)，构建可能失败"
    else
        ok "磁盘空间充足 (${available}GB)"
    fi
}

# ── 初始化远程环境 ───────────────────────────────────────
init_remote() {
    step "初始化远程服务器环境"

    remote_cmd bash -s <<'ENDSSH'
set -e

echo "检查 Docker..."
if ! command -v docker >/dev/null 2>&1; then
    echo "安装 Docker..."
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
    echo "Docker 安装完成"
else
    echo "Docker 已安装"
fi

echo "检查 Docker Compose..."
if ! docker compose version >/dev/null 2>&1; then
    echo "安装 Docker Compose 插件..."
    apt-get update -qq 2>/dev/null || true
    apt-get install -y -qq docker-compose-plugin 2>/dev/null || {
        echo "插件安装失败，尝试独立版本..."
        # 使用国内镜像
        COMPOSE_VERSION="v2.24.5"
        COMPOSE_URL="https://mirror.ghproxy.com/https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-$(uname -s)-$(uname -m)"
        curl -fsSL --connect-timeout 30 "$COMPOSE_URL" -o /usr/local/bin/docker-compose || {
            # 备用镜像
            COMPOSE_URL="https://gh-proxy.com/https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-$(uname -s)-$(uname -m)"
            curl -fsSL --connect-timeout 30 "$COMPOSE_URL" -o /usr/local/bin/docker-compose
        }
        chmod +x /usr/local/bin/docker-compose
    }
    echo "Docker Compose 安装完成"
else
    echo "Docker Compose 已安装"
fi

echo "创建目录..."
mkdir -p /opt/demoo/data
mkdir -p /opt/demoo/backups

echo "安装常用工具..."
apt-get install -y -qq curl rsync vim >/dev/null 2>&1 || true

echo "清理 apt 缓存..."
apt-get clean

echo "=== 初始化完成 ==="
docker --version
docker compose version
ENDSSH

    ok "远程环境初始化完成"
}

# ── 同步代码 ─────────────────────────────────────────────
sync_code() {
    step "同步代码到 $SERVER:$REMOTE_DIR"

    ssh "$SERVER" "mkdir -p $REMOTE_DIR/data $BACKUP_DIR"

    # 保存当前版本信息
    local version
    version=$(get_version)
    info "当前版本: $version"

    rsync -az --delete -e "ssh -o ConnectTimeout=30 -o ServerAliveInterval=15" \
        --exclude '.git' \
        --exclude '.github' \
        --exclude '.claude' \
        --exclude 'node_modules' \
        --exclude '.venv' \
        --exclude '.venv-manim' \
        --exclude '__pycache__' \
        --exclude '*.pyc' \
        --exclude '.ruff_cache' \
        --exclude '.pytest_cache' \
        --exclude '.mypy_cache' \
        --exclude 'apps/web/dist' \
        --exclude 'data/pipeline_runs.db' \
        --exclude 'data/media' \
        --exclude 'data/html_previews' \
        --exclude 'data/debug' \
        --exclude '*.sqlite3' \
        --exclude '.env' \
        --exclude 'GEMINI.md' \
        --exclude 'fix_*.py' \
        --exclude 'test_*.py' \
        --exclude 'backups' \
        --progress \
        "$LOCAL_DIR/" "$SERVER:$REMOTE_DIR/"

    # 写入版本标记
    remote_cmd "echo '$version' > $VERSION_FILE"

    ok "代码同步完成"
}

# ── 远程构建 ─────────────────────────────────────────────
remote_build() {
    step "远程构建 Docker 镜像"

    local build_log="/tmp/build_$$.log"

    # 构建并捕获日志
    if ! ssh "$SERVER" bash -s <<ENDSSH 2>&1 | tee "$build_log"
set -e
cd /opt/demoo

echo "构建 API 镜像..."
$COMPOSE_CMD build api 2>&1

echo "构建 Web 镜像..."
$COMPOSE_CMD build web 2>&1

echo "清理悬空镜像..."
docker image prune -f >/dev/null 2>&1

echo "=== 构建完成 ==="
docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}" | grep -E "demoo|REPOSITORY" | head -5
ENDSSH
    then
        fail "构建失败，完整日志已保存到: $build_log"
    fi

    rm -f "$build_log"
    ok "镜像构建完成"
}

# ── 启动容器 ─────────────────────────────────────────────
remote_start() {
    step "启动容器"

    ssh "$SERVER" bash -s <<ENDSSH
set -e
cd /opt/demoo

# 确保 .env 存在
if [ ! -f .env ]; then
    if [ -f .env.example ]; then
        cp .env.example .env
        echo "已从 .env.example 创建 .env"
    fi
fi

$COMPOSE_CMD up -d --remove-orphans

echo ""
echo "=== 容器状态 ==="
$COMPOSE_CMD ps
ENDSSH

    ok "容器已启动"
}

# ── 健康检查 ─────────────────────────────────────────────
health_check() {
    step "健康检查"

    local retries=15
    local delay=5

    for i in $(seq 1 $retries); do
        if remote_cmd "curl -sf http://localhost:8000/health >/dev/null 2>&1"; then
            ok "API 健康检查通过"

            if remote_cmd "curl -sf http://localhost:5173/ >/dev/null 2>&1"; then
                ok "Web 健康检查通过"
            else
                warn "Web 尚未就绪（nginx 可能还在启动）"
            fi

            # 显示版本信息
            info "部署版本: $(remote_cmd "cat $VERSION_FILE 2>/dev/null || echo 'unknown'")"
            return 0
        fi

        info "等待 API 启动... ($i/$retries)"
        sleep $delay
    done

    warn "健康检查超时"
    warn "请手动检查: ./deploy.sh logs"
}

# ── 快速部署（不重建） ─────────────────────────────────────
quick_deploy() {
    step "快速部署（仅同步代码 + 重启）"

    preflight
    sync_code

    ssh "$SERVER" "cd $REMOTE_DIR && $COMPOSE_CMD restart"
    ok "容器已重启"

    health_check
}

# ── 查看日志 ─────────────────────────────────────────────
remote_logs() {
    local service="${2:-}"
    if [ -n "$service" ]; then
        ssh "$SERVER" "cd $REMOTE_DIR && $COMPOSE_CMD logs --tail 200 -f $service"
    else
        ssh "$SERVER" "cd $REMOTE_DIR && $COMPOSE_CMD logs --tail 100 -f"
    fi
}

# ── 查看状态 ─────────────────────────────────────────────
remote_status() {
    ssh "$SERVER" "cd $REMOTE_DIR && echo '=== 容器状态 ===' && docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' && echo '' && echo '=== 部署版本 ===' && cat .deploy_version 2>/dev/null || echo '未知' && echo '' && echo '=== 磁盘使用 ===' && df -h /opt/demoo | tail -1 && echo '' && echo '=== Docker 镜像 ===' && docker images --format 'table {{.Repository}}\t{{.Tag}}\t{{.Size}}' | head -5"
}

# ── 停止容器 ─────────────────────────────────────────────
remote_stop() {
    ssh "$SERVER" "cd $REMOTE_DIR && $COMPOSE_CMD down"
    ok "容器已停止"
}

# ── 清理缓存 ─────────────────────────────────────────────
remote_clean() {
    step "清理远程 Docker 缓存"

    ssh "$SERVER" bash -s <<ENDSSH
cd /opt/demoo

echo "停止容器..."
$COMPOSE_CMD down --remove-orphans

echo "清理未使用镜像..."
docker image prune -a -f

echo "清理构建缓存..."
docker builder prune -f

echo "清理未使用容器..."
docker container prune -f

echo "清理未使用网络..."
docker network prune -f

echo ""
echo "=== 清理完成，磁盘空间 ==="
df -h /opt/demoo | tail -1
ENDSSH

    ok "清理完成"
}

# ── 备份数据 ─────────────────────────────────────────────
remote_backup() {
    step "备份远程数据"

    local timestamp="$(date '+%Y%m%d-%H%M%S')"
    local backup_name="backup_$timestamp"

    ssh "$SERVER" bash -s <<ENDSSH
set -e
cd /opt/demoo

echo "创建备份目录..."
mkdir -p backups

echo "备份数据库..."
if [ -f data/pipeline_runs.db ]; then
    cp data/pipeline_runs.db backups/$backup_name.db
    echo "  -> backups/$backup_name.db"
fi

echo "备份媒体文件..."
if [ -d data/media ]; then
    tar -czf backups/$backup_name_media.tar.gz data/media
    echo "  -> backups/$backup_name_media.tar.gz"
fi

echo "备份版本信息..."
cp .deploy_version backups/$backup_name.version 2>/dev/null || true

echo ""
echo "=== 备份列表 ==="
ls -lh backups/ | tail -10
ENDSSH

    ok "备份完成: $backup_name"
}

# ── 回滚部署 ─────────────────────────────────────────────
remote_rollback() {
    step "回滚到上一版本"

    # 查找最近的备份
    local last_backup
    last_backup=$(remote_cmd "ls -t $BACKUP_DIR/*.db 2>/dev/null | head -1")

    if [ -z "$last_backup" ]; then
        fail "没有找到可用的备份"
    fi

    info "找到备份: $last_backup"

    remote_cmd bash -s <<ENDSSH
set -e
cd /opt/demoo

echo "停止服务..."
$COMPOSE_CMD down

echo "恢复数据库..."
cp $last_backup data/pipeline_runs.db

echo "恢复版本标记..."
backup_ver=\$(basename $last_backup .db).version
if [ -f backups/\$backup_ver ]; then
    cp backups/\$backup_ver .deploy_version
fi

echo "重启服务..."
$COMPOSE_CMD up -d
ENDSSH

    ok "回滚完成"
    health_check
}

# ── 完整部署 ─────────────────────────────────────────────
full_deploy() {
    echo -e "${BOLD}"
    echo "╔══════════════════════════════════════╗"
    echo "║     MetaView — 一键部署              ║"
    echo "║     Target: $SERVER       ║"
    echo "╚══════════════════════════════════════╝"
    echo -e "${NC}"

    local start_time=$SECONDS

    preflight
    sync_code
    remote_build
    remote_start
    health_check

    local elapsed=$(( SECONDS - start_time ))
    echo ""
    echo -e "${GREEN}${BOLD}=== 部署完成 (${elapsed}s) ===${NC}"
    echo -e "  前端: ${CYAN}http://115.191.22.22:5173${NC}"
    echo -e "  后端: ${CYAN}http://115.191.22.22:8000${NC}"
    echo -e "  健康: ${CYAN}http://115.191.22.22:8000/health${NC}"
    echo -e "  日志: ${YELLOW}./deploy.sh logs${NC}"
}

# ── 主入口 ────────────────────────────────────────────────
case "${1:-}" in
    init)     init_remote ;;
    quick)    quick_deploy ;;
    build)    preflight; sync_code; remote_build ;;
    restart)  preflight; remote_cmd "cd $REMOTE_DIR && $COMPOSE_CMD restart" && ok "已重启" ;;
    logs)     remote_logs "$@" ;;
    status)   remote_status ;;
    stop)     remote_stop ;;
    clean)    remote_clean ;;
    backup)   remote_backup ;;
    rollback) remote_rollback ;;
    ssh)      ssh "$SERVER" ;;
    help|-h|--help)
        echo "Usage: ./deploy.sh [command]"
        echo ""
        echo "Commands:"
        echo "  (none)    完整部署：同步代码 → 构建镜像 → 启动容器 → 健康检查"
        echo "  init      初始化远程服务器（安装 Docker/Compose）"
        echo "  quick     快速部署：仅同步代码 + 重启（不重建镜像）"
        echo "  build     同步代码并构建镜像（不重启）"
        echo "  restart   重启容器（不重新构建）"
        echo "  logs      查看容器日志（实时跟踪，可指定服务名）"
        echo "  status    查看容器运行状态 + 磁盘使用 + 版本"
        echo "  stop      停止所有容器"
        echo "  clean     清理 Docker 缓存（镜像/容器/网络/构建缓存）"
        echo "  backup    备份数据库和媒体文件"
        echo "  rollback  回滚到上一备份版本"
        echo "  ssh       SSH 登录到服务器"
        echo ""
        echo "Examples:"
        echo "  ./deploy.sh              # 首次部署或大改动后使用"
        echo "  ./deploy.sh quick        # 小改动（仅代码变更）快速上线"
        echo "  ./deploy.sh logs api     # 仅查看 API 服务日志"
        ;;
    *)        full_deploy ;;
esac
