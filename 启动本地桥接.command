#!/bin/zsh
cd "$(dirname "$0")"
if [ -n "$1" ]; then
  python3 scripts/serve_pack.py "$1"
else
  python3 scripts/serve_pack.py
fi
