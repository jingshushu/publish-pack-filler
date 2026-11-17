#!/usr/bin/env python3
"""
本地只读发布包桥接小助手 (Read-Only Local Bridge for Publish Pack Filler)
仅监听 127.0.0.1:18765，供油猴脚本通过沙箱级 GM_xmlhttpRequest 读取最新《发布包_v01.md》与封面图片。
完全不经过网页 fetch / XHR，不会在创作者中心页面留下任何网络痕迹，也不修改任何本地文件。
"""

from __future__ import annotations

import argparse
import json
import mimetypes
import sys
import urllib.parse
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

DEFAULT_PACK_DIR = Path.cwd()


def find_latest_pack_file(base_dir: Path) -> Path | None:
    json_packs = sorted(base_dir.glob("*.pack.json")) + sorted(base_dir.glob("publish*.json"))
    if json_packs:
        return json_packs[-1]
    candidates = sorted(base_dir.glob("发布包*.md"))
    if candidates:
        return candidates[-1]
    md_files = sorted(base_dir.glob("*.md"))
    return md_files[-1] if md_files else None


def list_cover_rel_paths(base_dir: Path) -> list[str]:
    exts = {".png", ".jpg", ".jpeg", ".webp"}
    rels: list[str] = []
    for sub_name in ("封面", "covers", "slides", "images"):
        sub_dir = base_dir / sub_name
        if sub_dir.is_dir():
            for p in sorted(sub_dir.iterdir()):
                if p.is_file() and p.suffix.lower() in exts:
                    rels.append(str(p.relative_to(base_dir)).replace("\\", "/"))
    if not rels:
        for p in sorted(base_dir.iterdir()):
            if p.is_file() and p.suffix.lower() in exts:
                rels.append(str(p.relative_to(base_dir)).replace("\\", "/"))
    return rels


def make_handler(base_dir: Path):
    class PackBridgeHandler(BaseHTTPRequestHandler):
        def log_message(self, fmt: str, *args) -> None:
            sys.stdout.write(f"[Bridge] {self.address_string()} - {fmt % args}\n")

        def _send_json(self, payload: dict, status: int = 200) -> None:
            raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(raw)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(raw)

        def do_GET(self) -> None:
            parsed = urllib.parse.urlparse(self.path)
            if parsed.path == "/api/pack":
                pack_file = find_latest_pack_file(base_dir)
                if not pack_file or not pack_file.is_file():
                    self._send_json({"error": f"未在 {base_dir} 找到 publish.pack.json 或 发布包*.md"}, status=404)
                    return
                content = pack_file.read_text(encoding="utf-8")
                is_json = pack_file.suffix.lower() == ".json"
                self._send_json(
                    {
                        "baseDir": str(base_dir),
                        "folderName": base_dir.parent.name + "/" + base_dir.name,
                        "packFile": pack_file.name,
                        "mdFile": pack_file.name,
                        "format": "json" if is_json else "markdown",
                        "content": content,
                        "markdown": "" if is_json else content,
                        "covers": list_cover_rel_paths(base_dir),
                    }
                )
                return

            if parsed.path == "/api/file":
                qs = urllib.parse.parse_qs(parsed.query)
                rel = (qs.get("path") or [""])[0]
                if not rel:
                    self._send_json({"error": "缺少 path 参数"}, status=400)
                    return
                target = (base_dir / rel).resolve()
                # 严格防目录穿越：只允许读取 base_dir 内部文件
                if not str(target).startswith(str(base_dir.resolve())) or not target.is_file():
                    self._send_json({"error": "文件不存在或越界访问"}, status=403)
                    return
                data = target.read_bytes()
                mime, _ = mimetypes.guess_type(str(target))
                self.send_response(200)
                self.send_header("Content-Type", mime or "application/octet-stream")
                self.send_header("Content-Length", str(len(data)))
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write(data)
                return

            self._send_json({"status": "ok", "baseDir": str(base_dir)})

    return PackBridgeHandler


def main() -> None:
    parser = argparse.ArgumentParser(description="启动发布包本地只读桥接服务")
    parser.add_argument(
        "pack_dir",
        nargs="?",
        default=str(DEFAULT_PACK_DIR),
        help="包含 发布包_v01.md 和 封面/ 的目录路径",
    )
    parser.add_argument("--port", type=int, default=18765, help="本地监听端口（默认 18765）")
    args = parser.parse_args()

    base_dir = Path(args.pack_dir).expanduser().resolve()
    if not base_dir.is_dir():
        print(f"❌ 目录不存在: {base_dir}", file=sys.stderr)
        sys.exit(1)

    pack_file = find_latest_pack_file(base_dir)
    covers = list_cover_rel_paths(base_dir)
    print("=" * 62)
    print("🚀 万物有数 · 发布包只读桥接服务已启动")
    print(f"📂 当前绑定目录 : {base_dir}")
    print(f"📄 发布包文件   : {pack_file.name if pack_file else '未找到'}")
    print(f"🖼️ 检测到封面   : {len(covers)} 张 ({', '.join(covers)})")
    print(f"🔒 监听地址     : http://127.0.0.1:{args.port} (仅本机回环只读)")
    print("💡 在浏览器悬浮面板点击右上角 🔄 即可同步全套文案与高清封面！")
    print("=" * 62)

    server = HTTPServer(("127.0.0.1", args.port), make_handler(base_dir))
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n👋 已停止桥接服务。")


if __name__ == "__main__":
    main()
