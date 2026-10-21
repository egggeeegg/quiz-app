#!/bin/bash
set -e

# ============================================================
# 刷题系统 — 一键安装脚本
# 用法: chmod +x install.sh && ./install.sh
# 前置条件: 服务器已安装 Docker + Docker Compose
# 整个 quiz-app/ 目录上传到服务器后，cd 到该目录执行此脚本
# ============================================================

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; }
step() { echo -e "\n${CYAN}━━━ $1 ━━━${NC}"; }

if [ "$EUID" -eq 0 ]; then
  warn "不建议以 root 直接运行，建议使用普通用户（有 sudo 权限）"
fi

# ─── 1. 检测环境 ───
step "检测环境"

if ! command -v docker &>/dev/null; then
  err "Docker 未安装"
  exit 1
fi
log "Docker $(docker --version | cut -d' ' -f3 | tr -d ',')"

if ! docker compose version &>/dev/null; then
  err "Docker Compose 不可用"
  exit 1
fi
log "Docker Compose OK"

# ─── 2. 环境变量 ───
step "配置环境变量"

if [ ! -f ".env" ]; then
  cp .env.example .env
  if command -v openssl &>/dev/null; then
    NEW_SECRET=$(openssl rand -hex 32)
  else
    NEW_SECRET=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')
  fi
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s|^JWT_SECRET=.*|JWT_SECRET=$NEW_SECRET|" .env
  else
    sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$NEW_SECRET|" .env
  fi
  log "JWT_SECRET 已自动生成"
  log ".env 文件已创建"
else
  log ".env 已存在，跳过"
  if ! grep -q '^JWT_SECRET=.\{24,\}' .env; then
    err ".env 中的 JWT_SECRET 缺失或过短（至少 24 位），后端将拒绝启动"
    exit 1
  fi
fi

# ─── 3. 题库检测 ───
step "题库检测"

if [ ! -f "questions.json" ]; then
  if [ -f "questions.demo.json" ]; then
    cp questions.demo.json questions.json
    log "未找到私有题库，已使用示例题库 questions.demo.json"
  else
    err "缺少 questions.json 和 questions.demo.json"
    exit 1
  fi
else
  COUNT=$(python3 -c "import json; print(len(json.load(open('questions.json'))))" 2>/dev/null || echo "?")
  log "questions.json 已就绪（$COUNT 道题）"
fi

# ─── 4. 构建并启动 ───
step "构建并启动 Docker 容器"

log "正在构建镜像..."
docker compose build --parallel 2>&1 | tail -5

log "正在启动服务..."
docker compose up -d 2>&1

echo -n "等待后端就绪"
for i in $(seq 1 30); do
  if curl -s http://localhost:3001/api/health >/dev/null 2>&1; then
    echo ""
    log "后端已启动（端口 3001）"
    break
  fi
  echo -n "."
  sleep 2
done

# ─── 5. 题库导入 ───
step "题库导入"

log "正在导入题库到数据库（questions.json 已通过 docker-compose volumes 挂载）..."
docker compose exec backend node src/seed.js 2>&1 || docker compose run --rm backend node src/seed.js 2>&1
log "题库导入完成"

# ─── 6. 验证 ───
step "验证"

if curl -s http://localhost:3001/api/health >/dev/null 2>&1; then
  log "后端 API: http://localhost:3001  ✅"
fi
if curl -s http://localhost:8080 >/dev/null 2>&1; then
  log "前端界面: http://localhost:8080  ✅"
fi

ADMIN_USER=$(grep -E '^ADMIN_USERNAME=' .env | cut -d= -f2-)
ADMIN_PASS=$(grep -E '^ADMIN_PASSWORD=' .env | cut -d= -f2-)
if [ -n "$ADMIN_USER" ] && [ -n "$ADMIN_PASS" ]; then
  ADMIN_CHECK=$(curl -s -X POST http://localhost:3001/api/auth/login \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASS\"}" 2>/dev/null)
  if echo "$ADMIN_CHECK" | grep -q '"token"'; then
    log "管理员账户 $ADMIN_USER 登录正常 ✅"
  else
    warn "管理员登录检测失败，请检查: docker compose logs backend"
  fi
else
  warn "未在 .env 中配置 ADMIN_PASSWORD，管理员密码见启动日志："
  warn "  docker compose logs backend | grep -A3 '管理员账户'"
fi

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║              安装完成！                            ║${NC}"
echo -e "${GREEN}╠══════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║${NC}  前端地址:  ${CYAN}http://你的服务器IP:8080${NC}"
echo -e "${GREEN}║${NC}  管理员:    .env 中的 ADMIN_USERNAME / ADMIN_PASSWORD"
echo -e "${GREEN}║${NC}             未配置密码时见 docker compose logs backend"
echo -e "${GREEN}║${NC}"
echo -e "${GREEN}║${NC}  管理员首次登录后 → ⚙️ 邀请码管理 → 生成邀请码"
echo -e "${GREEN}╚══════════════════════════════════════════════════════╝${NC}"
