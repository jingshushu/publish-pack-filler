#!/bin/zsh
# macOS 开机常驻后台服务管理脚本 (LaunchAgent: local.publishpack.bridge)
# 用法：
#   ./scripts/macos_service.sh install    # 安装并立即启动 127.0.0.1:8765 后台常驻服务
#   ./scripts/macos_service.sh status     # 查看服务运行状态
#   ./scripts/macos_service.sh restart    # 重启服务
#   ./scripts/macos_service.sh uninstall  # 停止并移除开机自启

set -e

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="local.publishpack.feishu-bridge"
PLIST_PATH="$HOME/Library/LaunchAgents/${LABEL}.plist"
LOG_DIR="${REPO_DIR}/logs"
PYTHON_BIN="$(command -v python3 || echo /usr/bin/python3)"

mkdir -p "$LOG_DIR" "$HOME/Library/LaunchAgents"

cmd="${1:-status}"

case "$cmd" in
  install)
    cat > "$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${PYTHON_BIN}</string>
    <string>${REPO_DIR}/scripts/serve_pack.py</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${REPO_DIR}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${LOG_DIR}/bridge.out.log</string>
  <key>StandardErrorPath</key>
  <string>${LOG_DIR}/bridge.err.log</string>
</dict>
</plist>
EOF
    launchctl unload "$PLIST_PATH" 2>/dev/null || true
    launchctl load "$PLIST_PATH"
    sleep 0.5
    echo "✅ 已注册并启动 macOS 后台服务 (${LABEL})"
    echo "🔗 监听地址：http://127.0.0.1:8765"
    echo "📄 日志位置：${LOG_DIR}/bridge.out.log"
    curl -s http://127.0.0.1:8765/ && echo ""
    ;;

  restart)
    launchctl unload "$PLIST_PATH" 2>/dev/null || true
    launchctl load "$PLIST_PATH"
    sleep 0.5
    echo "🔄 服务已重启："
    curl -s http://127.0.0.1:8765/ && echo ""
    ;;

  uninstall|stop)
    launchctl unload "$PLIST_PATH" 2>/dev/null || true
    rm -f "$PLIST_PATH"
    echo "🛑 已停止并移除后台常驻服务 (${LABEL})"
    ;;

  status|*)
    if curl -s --max-time 1.5 http://127.0.0.1:8765/ ; then
      echo "\n🟢 飞书本地桥接服务运行正常 (http://127.0.0.1:8765)"
    else
      echo "⚪ 服务当前未运行。执行 './scripts/macos_service.sh install' 可开启后台常驻。"
    fi
    ;;
esac
