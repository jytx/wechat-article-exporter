#!/bin/bash
#
# Mac 微信 Credential 抓取一键脚本
#
# 用法：
#   bash scripts/start-credential-capture.sh
#
# 流程：生成证书 → 信任证书 → 设置系统代理 → 启动 mitmdump 加载插件
#       （抓完后 Ctrl+C，脚本会自动还原系统代理）
#
# 前置：已通过 pip 安装 mitmproxy
#   python3 -m pip install mitmproxy
#

set -e

# === 配置 ===
MITMDUMP="$HOME/Library/Python/3.9/bin/mitmdump"
PLUGIN="$HOME/Documents/github/wechat-article-exporter/scripts/credential.py"
CERT_DIR="$HOME/.mitmproxy"
CERT_FILE="$CERT_DIR/mitmproxy-ca-cert.pem"
PROXY_HOST="127.0.0.1"
PROXY_PORT="8100"
# Credential 插件的 HTTP 服务端口（默认 8088，被 nginx 占用时改为 8089）
CRED_API_PORT="8089"

# 确保插件存在
if [ ! -f "$PLUGIN" ]; then
  echo "❌ 找不到插件文件: $PLUGIN"
  echo "   请确认项目路径正确"
  exit 1
fi

# 确保 mitmdump 可用
if [ ! -f "$MITMDUMP" ]; then
  MITMDUMP=$(which mitmdump 2>/dev/null || true)
fi
if [ -z "$MITMDUMP" ]; then
  echo "❌ 未找到 mitmdump，请先安装：python3 -m pip install mitmproxy"
  exit 1
fi

echo "=========================================="
echo "  Mac 微信 Credential 抓取"
echo "=========================================="
echo ""

# === 第一步：生成证书（首次运行 mitmdump 会自动生成） ===
if [ ! -f "$CERT_FILE" ]; then
  echo "🔐 [1/4] 首次运行，生成 mitmproxy 证书..."
  "$MITMDUMP" --version >/dev/null 2>&1
  # 触发证书生成：快速启动后立即退出
  timeout 3 "$MITMDUMP" -q >/dev/null 2>&1 || true
fi

if [ ! -f "$CERT_FILE" ]; then
  echo "❌ 证书生成失败，请手动运行一次: $MITMDUMP"
  exit 1
fi
echo "✅ [1/4] 证书已存在: $CERT_FILE"

# === 第二步：安装并信任证书 ===
echo ""
echo "🔐 [2/4] 安装并信任证书（需要输入开机密码）..."
sudo security add-trusted-cert -d -p ssl -p basic \
  -k /Library/Keychains/System.keychain "$CERT_FILE" && echo "✅ [2/4] 证书已信任" || {
    echo "⚠️  证书信任失败。你可以手动操作："
    echo "   双击 $CERT_FILE → 钥匙串访问 → 找到 mitmproxy → 双击 → 信任 → 始终信任"
  }

# === 第三步：设置系统代理 ===
echo ""
echo "🌐 [3/4] 设置系统代理 $PROXY_HOST:$PROXY_PORT ..."
# 获取当前活动的网络服务名
NETWORK_SERVICE=$(networksetup -listallnetworkservices 2>/dev/null | grep -v "An asterisk" | grep -vi "VPN\|Bluetooth\|Thunderbolt\|iPhone\|Bridge" | head -2 | tail -1)
if [ -z "$NETWORK_SERVICE" ]; then
  NETWORK_SERVICE="Wi-Fi"
fi
echo "   网络服务: $NETWORK_SERVICE"

# 保存当前代理状态（用于还原）
OLD_HTTP=$(networksetup -getwebproxy "$NETWORK_SERVICE" 2>/dev/null | grep "Server" | awk -F': ' '{print $2}' || echo "")
OLD_STATE=$(networksetup -getwebproxy state "$NETWORK_SERVICE" 2>/dev/null || echo "")

networksetup -setwebproxy "$NETWORK_SERVICE" "$PROXY_HOST" "$PROXY_PORT" >/dev/null 2>&1 || true
networksetup -setsecurewebproxy "$NETWORK_SERVICE" "$PROXY_HOST" "$PROXY_PORT" >/dev/null 2>&1 || true
echo "✅ [3/4] 系统代理已设置"

# === 还原代理的清理函数 ===
cleanup() {
  echo ""
  echo "🧹 正在还原系统代理设置..."
  networksetup -setwebproxystate "$NETWORK_SERVICE" off >/dev/null 2>&1 || true
  networksetup -setsecurewebproxystate "$NETWORK_SERVICE" off >/dev/null 2>&1 || true
  echo "✅ 系统代理已关闭，可以正常上网了"
  echo ""
  echo "=========================================="
  echo "  Credential 抓取已结束"
  echo "=========================================="
}
trap cleanup EXIT INT TERM

# === 第四步：启动 mitmdump ===
echo ""
echo "🚀 [4/4] 启动 mitmproxy（加载 credential.py 插件）..."
echo ""
echo "=========================================="
echo "  启动后操作步骤："
echo ""
echo "  1. 看下方打印的「本次会话的密钥」并复制"
echo ""
echo "  2. 浏览器（应用页面）按 F12 打开控制台，执行："
echo "     localStorage.setItem('credential-api-host','http://127.0.0.1:${CRED_API_PORT}')"
echo "     （Credential 端口从 8088 改为 ${CRED_API_PORT}，避开 nginx 占用）"
echo ""
echo "  3. 回到页面 → 配置 Credential → mitmproxy 插件版"
echo "     API Key 粘贴密钥 → 认证 → 开始监控"
echo ""
echo "  4. 在 Mac 微信里打开公众号文章，每篇抓一个 Credential"
echo ""
echo "  抓完后按 Ctrl+C 结束（会自动还原代理）"
echo "=========================================="
echo ""

"$MITMDUMP" -s "$PLUGIN" -p "$PROXY_PORT"
