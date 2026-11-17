#!/bin/zsh
cd "$(dirname "$0")"
if [ -z "$1" ]; then
  echo "用法：将「成片」目录拖入终端跟在本脚本后面运行，例如："
  echo "  ./启动本地桥接.command \"/path/to/成片\""
  exit 1
fi
python3 scripts/serve_pack.py "$1"
