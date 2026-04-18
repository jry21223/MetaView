#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────
#  MetaView — 一键部署脚本
#
#  Usage:
#    ./deploy.sh              # 完整部署（同步代码 + 构建 + 启动）
#    ./deploy.sh quick        # 快速部署（仅同步代码 + 重启，不重建）
#    ./deploy.sh build        # 仅同步代码 + 构建镜像（不重启）
#    ./deploy.sh restart      # 仅重启容器（不重新构建）
#    ./deploy.sh logs [svc]   # 查看容器日志
#    ./deploy.sh status       # 查看容器状态
#    ./deploy.sh stop         # 停止容器
#    ./deploy.sh clean        # 清理 Docker 缓存
#    ./deploy.sh backup       # 备份数据
#    ./deploy.sh rollback     # 回滚到上一版本
#    ./deploy.sh ssh          # SSH 登录服务器
#    ./deploy.sh init         # 初始化远程环境（安装 Docker/Nginx）
# ─────────────────────────────────────────────────────────
set -euo pipefail

# ── 配置 ────────────────────────────────────────────────
SERVER="root@metaview.top"
REMOTE_DIR="/opt/demoo"
LOCAL_DIR="$(cd "$(dirname "$0")" && pwd)"
VERSION_FILE="$REMOTE_DIR/.deploy_version"
BACKUP_DIR="$REMOTE_DIR/backups"
PUBLIC_HOST="${PUBLIC_HOST:-metaview.top}"
NGINX_SITE_PATH="/etc/nginx/conf.d/demoo.conf"
LEGACY_NGINX_SITE_PATH="/etc/nginx/sites-enabled/metaview.conf"

COMPOSE_CMD=""

# 颜色
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

info()  { echo -e "${CYAN}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
fail()  { echo -e "${RED}[FAIL]${NC}  $*"; exit 1; }
step()  { echo -e "\n${BOLD}── $* ──${NC}"; }

remote_cmd() { ssh "$SERVER" "$@"; }

# ── 前置检查 ─────────────────────────────────────────────
preflight() {
    command -v ssh   >/dev/null 2>&1 || fail "ssh 未安装"
    command -v rsync >/dev/null 2>&1 || fail "rsync 未安装"

    if ! ssh -o ConnectTimeout=5 -o BatchMode=yes "$SERVER" "true" 2>/dev/null; then
        fail "无法连接到 $SERVER"
    fi
    ok "SSH 连接正常"
    check_docker_env
}

# ── Docker 环境检测 ───────────────────────────────────────
check_docker_env() {
    step "检查远程 Docker 环境"
    remote_cmd "command -v docker >/dev/null 2>&1" || fail "远程未安装 Docker，请运行: ./deploy.sh init"

    if remote_cmd "docker compose version >/dev/null 2>&1"; then
        COMPOSE_CMD="docker compose"
    elif remote_cmd "docker-compose version >/dev/null 2>&1"; then
        COMPOSE_CMD="docker-compose"
    else
        fail "远程未安装 Docker Compose，请运行: ./deploy.sh init"
    fi
    ok "Docker 正常 (Compose: $COMPOSE_CMD)"

    local avail
    avail=$(remote_cmd "df -BG $REMOTE_DIR | tail -1 | awk '{print \$4}' | tr -d 'G'" 2>/dev/null || echo 0)
    [ "$avail" -lt 5 ] && warn "磁盘不足 5GB (${avail}GB)" || ok "磁盘充足 (${avail}GB)"
}

# ── 初始化远程环境 ───────────────────────────────────────
init_remote() {
    step "初始化远程服务器"
    remote_cmd bash -s <<'ENDSSH'
set -e
if ! command -v docker >/dev/null 2>&1; then
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker && systemctl start docker
fi
if ! docker compose version >/dev/null 2>&1; then
    apt-get update -qq && apt-get install -y -qq docker-compose-plugin 2>/dev/null || {
        VER="v2.24.5"
        curl -fsSL "https://mirror.ghproxy.com/https://github.com/docker/compose/releases/download/${VER}/docker-compose-$(uname -s)-$(uname -m)" \
            -o /usr/local/bin/docker-compose && chmod +x /usr/local/bin/docker-compose
    }
fi
apt-get install -y -qq curl rsync nginx >/dev/null 2>&1 || true
mkdir -p /opt/demoo/data /opt/demoo/backups
docker --version && docker compose version
ENDSSH
    configure_nginx
    ok "初始化完成"
}

# ── Nginx 配置 ───────────────────────────────────────────
validate_public_host() {
    [[ "$PUBLIC_HOST" =~ ^[A-Za-z0-9.-]+$ ]] || fail "PUBLIC_HOST 含非法字符: $PUBLIC_HOST"
}

configure_nginx() {
    step "配置 Nginx 反向代理 ($PUBLIC_HOST)"
    validate_public_host

    ssh "$SERVER" bash -s << ENDSSH
set -e
SITES_CONF="$LEGACY_NGINX_SITE_PATH"
CONFD_CONF="$NGINX_SITE_PATH"

# 若已有 SSL 受管配置，保留不动
if [ -f "\$SITES_CONF" ] && grep -Fq '# managed-by=demoo' "\$SITES_CONF"; then
    nginx -t && (systemctl reload nginx 2>/dev/null || systemctl restart nginx)
    echo "Nginx 已重载（SSL 配置保留）"
    exit 0
fi

mkdir -p "\$(dirname "\$CONFD_CONF")"
cat > "\$CONFD_CONF" << 'NGINXEOF'
# managed-by=demoo
server {
    listen 80;
    server_name $PUBLIC_HOST;
    client_max_body_size 32m;

    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    location /media/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /health {
        proxy_pass http://127.0.0.1:8000/health;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
    }

    location / {
        proxy_pass http://127.0.0.1:5173;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGINXEOF
nginx -t && (systemctl enable nginx >/dev/null 2>&1 || true) && (systemctl reload nginx 2>/dev/null || systemctl restart nginx)
echo "Nginx 配置完成"
ENDSSH
    ok "Nginx 已更新"
}

# ── 同步代码 ─────────────────────────────────────────────
sync_code() {
    step "同步代码 → $SERVER:$REMOTE_DIR"
    ssh "$SERVER" "mkdir -p $REMOTE_DIR/data $BACKUP_DIR"

    local version
    version="$(git branch --show-current 2>/dev/null || echo main)@$(git rev-parse --short HEAD 2>/dev/null || echo unknown) ($(date '+%Y%m%d-%H%M%S'))"
    info "版本: $version"

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
        --exclude 'apps/web/dist' \
        --exclude 'data/pipeline_runs.db' \
        --exclude 'data/media' \
        --exclude 'data/html_previews' \
        --exclude 'data/debug' \
        --exclude '.env' \
        --exclude 'backups' \
        --progress \
        "$LOCAL_DIR/" "$SERVER:$REMOTE_DIR/"

    remote_cmd "echo '$version' > $VERSION_FILE"
    ok "代码同步完成"
}

# ── 构建镜像 ─────────────────────────────────────────────
remote_build() {
    step "构建 Docker 镜像"
    ssh "$SERVER" bash -s <<ENDSSH
set -e
cd $REMOTE_DIR
$COMPOSE_CMD build api
$COMPOSE_CMD build web
docker image prune -f >/dev/null 2>&1
echo "=== 镜像 ==="
docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}" | grep -E "demoo|REPOSITORY"
ENDSSH
    ok "构建完成"
}

# ── 启动容器 ─────────────────────────────────────────────
remote_start() {
    step "启动容器"
    ssh "$SERVER" bash -s <<ENDSSH
set -e
cd $REMOTE_DIR
[ ! -f .env ] && [ -f .env.example ] && cp .env.example .env && echo "已从 .env.example 创建 .env"
$COMPOSE_CMD up -d --remove-orphans
echo "=== 容器状态 ==="
$COMPOSE_CMD ps
ENDSSH
    ok "容器已启动"
}

# ── 健康检查 ─────────────────────────────────────────────
health_check() {
    step "健康检查"
    for i in $(seq 1 15); do
        if remote_cmd "curl -sf http://localhost:8000/health >/dev/null 2>&1"; then
            ok "API 健康检查通过"
            remote_cmd "curl -sf http://localhost:5173/ >/dev/null 2>&1" && ok "Web 健康检查通过" || warn "Web 尚未就绪"
            remote_cmd "curl -sf http://localhost/health >/dev/null 2>&1" && ok "Nginx 代理正常" || warn "Nginx 尚未就绪"
            info "部署版本: $(remote_cmd "cat $VERSION_FILE 2>/dev/null || echo unknown")"
            return 0
        fi
        info "等待 API 启动... ($i/15)"; sleep 5
    done
    warn "健康检查超时，请手动确认: ./deploy.sh logs"
}

# ── 快速部署 ─────────────────────────────────────────────
quick_deploy() {
    step "快速部署（同步代码 + 重启）"
    preflight; sync_code
    ssh "$SERVER" "cd $REMOTE_DIR && $COMPOSE_CMD restart"
    configure_nginx
    health_check
}

# ── 查看日志 ─────────────────────────────────────────────
remote_logs() {
    local svc="${2:-}"
    [ -n "$svc" ] \
        && ssh "$SERVER" "cd $REMOTE_DIR && $COMPOSE_CMD logs --tail 200 -f $svc" \
        || ssh "$SERVER" "cd $REMOTE_DIR && $COMPOSE_CMD logs --tail 100 -f"
}

# ── 查看状态 ─────────────────────────────────────────────
remote_status() {
    ssh "$SERVER" "
        echo '=== 容器状态 ==='
        docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
        echo ''
        echo '=== 部署版本 ==='
        cat $VERSION_FILE 2>/dev/null || echo '未知'
        echo ''
        echo '=== 磁盘使用 ==='
        df -h $REMOTE_DIR | tail -1
    "
}

# ── 停止 ─────────────────────────────────────────────────
remote_stop() { ssh "$SERVER" "cd $REMOTE_DIR && $COMPOSE_CMD down"; ok "已停止"; }

# ── 清理 ─────────────────────────────────────────────────
remote_clean() {
    step "清理 Docker 缓存"
    ssh "$SERVER" bash -s <<ENDSSH
cd $REMOTE_DIR
$COMPOSE_CMD down --remove-orphans
docker image prune -a -f
docker builder prune -f
docker container prune -f
docker network prune -f
echo "=== 磁盘空间 ==="; df -h $REMOTE_DIR | tail -1
ENDSSH
    ok "清理完成"
}

# ── 备份 ─────────────────────────────────────────────────
remote_backup() {
    step "备份数据"
    local ts; ts="$(date '+%Y%m%d-%H%M%S')"
    ssh "$SERVER" bash -s <<ENDSSH
set -e; cd $REMOTE_DIR; mkdir -p backups
[ -f data/pipeline_runs.db ] && cp data/pipeline_runs.db backups/backup_${ts}.db && echo "DB: backups/backup_${ts}.db"
[ -d data/media ] && tar -czf backups/backup_${ts}_media.tar.gz data/media && echo "Media: backups/backup_${ts}_media.tar.gz"
ls -lh backups/ | tail -5
ENDSSH
    ok "备份完成"
}

# ── 回滚 ─────────────────────────────────────────────────
remote_rollback() {
    step "回滚到上一版本"
    local last; last=$(remote_cmd "ls -t $BACKUP_DIR/*.db 2>/dev/null | head -1")
    [ -z "$last" ] && fail "没有可用备份"
    info "恢复备份: $last"
    ssh "$SERVER" bash -s <<ENDSSH
set -e; cd $REMOTE_DIR
$COMPOSE_CMD down
cp $last data/pipeline_runs.db
$COMPOSE_CMD up -d
ENDSSH
    health_check
    ok "回滚完成"
}

# ── 完整部署 ─────────────────────────────────────────────
full_deploy() {
    echo -e "${BOLD}"
    echo "╔══════════════════════════════════════╗"
    echo "║     MetaView — 一键部署              ║"
    echo "║     Target: $SERVER      ║"
    echo "╚══════════════════════════════════════╝"
    echo -e "${NC}"

    local t=$SECONDS
    preflight
    sync_code
    remote_build
    remote_start
    configure_nginx
    health_check

    local elapsed=$(( SECONDS - t ))
    echo ""
    echo -e "${GREEN}${BOLD}=== 部署完成 (${elapsed}s) ===${NC}"
    echo -e "  前端: ${CYAN}http://metaview.top${NC}"
    echo -e "  后端: ${CYAN}http://metaview.top/api/${NC}"
    echo -e "  健康: ${CYAN}http://metaview.top/health${NC}"
    echo -e "  日志: ${YELLOW}./deploy.sh logs${NC}"
}

# ── 主入口 ────────────────────────────────────────────────
case "${1:-}" in
    init)      init_remote ;;
    quick)     quick_deploy ;;
    build)     preflight; sync_code; remote_build ;;
    restart)   preflight; remote_cmd "cd $REMOTE_DIR && $COMPOSE_CMD restart" && configure_nginx && ok "已重启" ;;
    logs)      remote_logs "$@" ;;
    status)    remote_status ;;
    stop)      remote_stop ;;
    clean)     remote_clean ;;
    backup)    remote_backup ;;
    rollback)  remote_rollback ;;
    ssh)       ssh "$SERVER" ;;
    help|-h|--help)
        grep '^#    ./deploy.sh' "$0" | sed 's/^#//'
        ;;
    *)         full_deploy ;;
esac
