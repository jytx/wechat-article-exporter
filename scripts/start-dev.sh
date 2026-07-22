#!/bin/bash
#
# 项目一键启动脚本
#
# 用法：
#   bash scripts/start-dev.sh          # 启动开发服务器（默认）
#   bash scripts/start-dev.sh build    # 构建并预览生产版本
#   bash scripts/start-dev.sh stop     # 停止运行中的服务
#   bash scripts/start-dev.sh status   # 查看服务状态
#
# 功能：
#   - 检查 Node 版本（>=22）
#   - 检查依赖是否安装
#   - 启动 Nuxt dev server（日志输出到 logs/）
#   - 或构建生产版本并启动
#

set -e

# === 配置 ===
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"
PORT="${PORT:-3000}"
LOG_DIR="$PROJECT_ROOT/logs"
PID_FILE="$LOG_DIR/dev-server.pid"
LOG_FILE="$LOG_DIR/dev-server.log"

mkdir -p "$LOG_DIR"

# === 工具函数 ===

# 检查端口是否被占用，返回 PID
get_pid_on_port() {
  lsof -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null | head -1 || echo ""
}

# 检查服务是否在运行
is_running() {
  local pid
  pid=$(get_pid_on_port)
  [ -n "$pid" ]
}

# === 命令：启动 ===
start_dev() {
  if is_running; then
    local pid
    pid=$(get_pid_on_port)
    echo "⚠️  端口 $PORT 已被占用（PID: $pid），服务可能已在运行"
    echo "   查看日志: tail -f $LOG_FILE"
    echo "   停止服务: bash scripts/start-dev.sh stop"
    exit 0
  fi

  # 检查 Node 版本
  if ! command -v node &> /dev/null; then
    echo "❌ 未找到 Node.js，请先安装 Node >= 22"
    exit 1
  fi
  NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
  if [ "$NODE_VERSION" -lt 22 ]; then
    echo "❌ Node 版本过低（当前 $(node -v)），需要 >= 22"
    exit 1
  fi
  echo "✅ Node $(node -v)"

  # 检查依赖
  if [ ! -d "node_modules" ]; then
    echo "📦 安装依赖..."
    yarn install
  else
    echo "✅ 依赖已安装"
  fi

  # 启动 dev server（后台运行，日志写文件）
  echo "🚀 启动开发服务器（端口 $PORT）..."
  nohup yarn dev > "$LOG_FILE" 2>&1 &
  local dev_pid=$!
  echo "$dev_pid" > "$PID_FILE"

  # 等待服务就绪（最多 30 秒）
  echo "⏳ 等待服务启动..."
  for i in $(seq 1 30); do
    if is_running; then
      echo ""
      echo "✅ 服务已启动！"
      echo "   地址: http://localhost:$PORT"
      echo "   日志: tail -f $LOG_FILE"
      echo "   停止: bash scripts/start-dev.sh stop"
      exit 0
    fi
    sleep 1
    printf "."
  done

  echo ""
  echo "❌ 服务启动超时（30秒），请检查日志："
  echo "   tail -50 $LOG_FILE"
  exit 1
}

# === 命令：构建+预览 ===
start_build() {
  echo "📦 构建生产版本..."
  yarn build

  if is_running; then
    echo "⚠️  端口 $PORT 已被占用，先停止..."
    stop_service
  fi

  echo "🚀 启动生产服务器（端口 $PORT）..."
  nohup node .output/server/index.mjs > "$LOG_FILE" 2>&1 &
  local build_pid=$!
  echo "$build_pid" > "$PID_FILE"

  for i in $(seq 1 10); do
    if is_running; then
      echo ""
      echo "✅ 生产服务已启动！"
      echo "   地址: http://localhost:$PORT"
      echo "   日志: tail -f $LOG_FILE"
      exit 0
    fi
    sleep 1
    printf "."
  done

  echo ""
  echo "❌ 启动超时，请检查日志：tail -50 $LOG_FILE"
  exit 1
}

# === 命令：停止 ===
stop_service() {
  local pid
  pid=$(get_pid_on_port)
  if [ -n "$pid" ]; then
    echo "🛑 停止服务（PID: $pid）..."
    kill "$pid" 2>/dev/null || true
    sleep 2
    # 如果还没停，强制杀
    if is_running; then
      kill -9 "$pid" 2>/dev/null || true
    fi
    echo "✅ 已停止"
  else
    # 也检查 PID 文件
    if [ -f "$PID_FILE" ]; then
      local file_pid
      file_pid=$(cat "$PID_FILE")
      if kill -0 "$file_pid" 2>/dev/null; then
        kill "$file_pid" 2>/dev/null || true
        echo "✅ 已停止（PID: $file_pid）"
      fi
    else
      echo "ℹ️  没有运行中的服务"
    fi
  fi
  rm -f "$PID_FILE"
}

# === 命令：状态 ===
show_status() {
  if is_running; then
    local pid
    pid=$(get_pid_on_port)
    echo "✅ 服务运行中（PID: $pid）"
    echo "   地址: http://localhost:$PORT"
    echo "   日志: $LOG_FILE"

    # 检查数据库
    if [ -f "$PROJECT_ROOT/.data/wechat.db" ]; then
      echo "   数据库: ✅ 存在"
    else
      echo "   数据库: ❌ 不存在（首次启动会自动创建）"
    fi
  else
    echo "❌ 服务未运行"
    echo "   启动: bash scripts/start-dev.sh"
  fi
}

# === 主入口 ===
case "${1:-dev}" in
  dev|start)
    start_dev
    ;;
  build|prod)
    start_build
    ;;
  stop)
    stop_service
    ;;
  status)
    show_status
    ;;
  restart)
    stop_service
    sleep 1
    start_dev
    ;;
  *)
    echo "用法: bash scripts/start-dev.sh [dev|build|stop|status|restart]"
    echo ""
    echo "命令："
    echo "  dev（默认）  启动开发服务器"
    echo "  build        构建生产版本并启动"
    echo "  stop         停止服务"
    echo "  status       查看服务状态"
    echo "  restart      重启服务"
    exit 1
    ;;
esac
