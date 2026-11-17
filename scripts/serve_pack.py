#!/usr/bin/env python3
"""
Publish Pack Filler · 飞书直连本地桥接服务 (Feishu -> Finder + Plugin Sync + Creator Page)
默认监听 http://127.0.0.1:8765（仅本机回环，零外网暴露、零 CORS 通配泄露）。

核心能力：
1. 接收飞书多维表格公式链接点击：
   http://127.0.0.1:8765/open?path=<作品相对路径>&site=<xhs|wx|dy|bili|ks|mp|all|finder>[&pack=<成品包子路径>]
2. 自动解析成品包目录（如 成片/、04_发布与成片/、09_发布与交付/），调用 macOS Finder `open -R` 弹出并高亮主视频文件，方便鼠标直接拖入网页上传。
3. 将当前激活作品切换为该目录，并通过同源跳板页（或扩展后台通道）把《publish.pack.json / 发布包.md》与全部封面图直接透传进浏览器插件，随后自动跳转到对应创作者后台！
"""

from __future__ import annotations

import argparse
import html
import json
import mimetypes
import os
import subprocess
import sys
import time
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
LOCAL_CONFIG_PATH = REPO_ROOT / ".bridge.local.json"

DEFAULT_PACK_SUBDIRS = ["成片", "04_发布与成片", "09_发布与交付", "publish_pack", "07_导出/成片"]

SITE_URLS: dict[str, tuple[str, str]] = {
    "xhs": ("小红书", "https://creator.xiaohongshu.com/publish/publish?source=official"),
    "xiaohongshu": ("小红书", "https://creator.xiaohongshu.com/publish/publish?source=official"),
    "wx": ("微信视频号", "https://channels.weixin.qq.com/platform"),
    "weixin": ("微信视频号", "https://channels.weixin.qq.com/platform"),
    "weixin_channels": ("微信视频号", "https://channels.weixin.qq.com/platform"),
    "sph": ("微信视频号", "https://channels.weixin.qq.com/platform"),
    "dy": ("抖音", "https://creator.douyin.com/creator-micro/content/upload"),
    "douyin": ("抖音", "https://creator.douyin.com/creator-micro/content/upload"),
    "bili": ("B 站", "https://member.bilibili.com/platform/upload/video/frame"),
    "bilibili": ("B 站", "https://member.bilibili.com/platform/upload/video/frame"),
    "ks": ("快手", "https://cp.kuaishou.com/article/publish/video"),
    "kuaishou": ("快手", "https://cp.kuaishou.com/article/publish/video"),
    "mp": ("微信公众号/小绿书", "https://mp.weixin.qq.com/"),
    "weixin_mp": ("微信公众号/小绿书", "https://mp.weixin.qq.com/"),
    "zhihu": ("知乎专栏", "https://zhuanlan.zhihu.com/write"),
    "weibo": ("微博", "https://weibo.com/"),
    "yt": ("YouTube Studio", "https://studio.youtube.com/"),
    "youtube": ("YouTube Studio", "https://studio.youtube.com/"),
}

ALL_FOUR_URLS = [
    "https://creator.xiaohongshu.com/publish/publish?source=official",
    "https://channels.weixin.qq.com/platform",
    "https://creator.douyin.com/creator-micro/content/upload",
    "https://member.bilibili.com/platform/upload/video/frame",
]


def load_local_config() -> dict:
    if LOCAL_CONFIG_PATH.is_file():
        try:
            return json.loads(LOCAL_CONFIG_PATH.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


def detect_default_workspace_root(cfg: dict) -> Path:
    env_root = os.environ.get("PPF_WORKSPACE_ROOT")
    if env_root:
        return Path(env_root).expanduser().resolve()
    if cfg.get("workspaceRoot"):
        return Path(cfg["workspaceRoot"]).expanduser().resolve()
    aihub = Path.home() / "Desktop" / "AIHub"
    if aihub.is_dir():
        return aihub.resolve()
    return Path.home().resolve()


def find_explicit_pack_file(base_dir: Path) -> Path | None:
    """严格匹配真正的发布包文件（*.pack.json / publish*.json / 发布包*.md），绝不误吸项目根目录的 README.md 或 日志.md。"""
    if not base_dir or not base_dir.is_dir():
        return None
    json_packs = sorted(base_dir.glob("*.pack.json")) + sorted(base_dir.glob("publish*.json"))
    if json_packs:
        return json_packs[-1]
    md_packs = [p for p in sorted(base_dir.glob("发布包*.md")) if not p.name.endswith(".preview.md")]
    if md_packs:
        return md_packs[-1]
    return None


def find_latest_pack_file(base_dir: Path) -> Path | None:
    explicit = find_explicit_pack_file(base_dir)
    if explicit:
        return explicit
    if not base_dir or not base_dir.is_dir():
        return None
    ignore_names = {"readme.md", "agents.md", "changelog.md", "日志.md"}
    md_files = [
        p
        for p in sorted(base_dir.glob("*.md"))
        if p.name.lower() not in ignore_names and not p.name.endswith(".preview.md")
    ]
    return md_files[-1] if md_files else None


def read_sub_markdowns(base_dir: Path) -> dict[str, str]:
    """兼容「靖蜀黍」等分文件文案目录（文案/小红书_v01.md、抖音_v01.md 等）"""
    result: dict[str, str] = {}
    copy_dir = base_dir / "文案"
    if copy_dir.is_dir():
        for p in sorted(copy_dir.glob("*.md")):
            if p.is_file():
                result[f"文案/{p.name}"] = p.read_text(encoding="utf-8")
    return result


def list_media_image_rel_paths(base_dir: Path) -> list[str]:
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


def find_primary_video_file(pack_dir: Path, project_dir: Path) -> Path | None:
    video_exts = (".mp4", ".mov", ".m4v")
    search_dirs = [
        pack_dir,
        project_dir / "成片",
        project_dir / "07_导出" / "成片",
        project_dir / "04_发布与成片",
        project_dir,
    ]
    for folder in search_dirs:
        if not folder.is_dir():
            continue
        vids = [
            p
            for p in sorted(folder.iterdir())
            if p.is_file() and p.suffix.lower() in video_exts and not p.name.startswith(".")
        ]
        if vids:
            # 若存在多个视频，优先带「发布版 / 终版 / 成片」字样的文件，否则取体积最大/最新
            preferred = [v for v in vids if any(k in v.name for k in ("发布", "终版", "成片", "标准"))]
            return preferred[-1] if preferred else vids[-1]
    return None


def reveal_in_finder(pack_dir: Path, project_dir: Path) -> str:
    """在 macOS Finder 中打开目录，若存在主视频文件则直接 `open -R` 高亮选中该视频，方便一键拖拽上传。"""
    if sys.platform != "darwin":
        return "非 macOS 环境跳过 Finder 唤起"

    video_file = find_primary_video_file(pack_dir, project_dir)
    if video_file and video_file.is_file():
        subprocess.Popen(["open", "-R", str(video_file)])
        return f"Finder 已定位并选中视频：{video_file.name}"

    target_dir = pack_dir if pack_dir.is_dir() else project_dir
    subprocess.Popen(["open", str(target_dir)])
    return f"Finder 已打开目录：{target_dir.name}"


class BridgeState:
    def __init__(self, workspace_root: Path, initial_pack_dir: Path | None, pack_subdirs: list[str]) -> None:
        self.workspace_root = workspace_root.resolve()
        self.active_pack_dir: Path | None = initial_pack_dir.resolve() if initial_pack_dir else None
        self.pack_subdirs = pack_subdirs
        self.pack_version = str(int(time.time() * 1000))
        self.last_finder_target = ""
        self.last_finder_ts = 0.0

    def set_active_pack_dir(self, new_dir: Path) -> None:
        self.active_pack_dir = new_dir.resolve()
        self.pack_version = f"{int(time.time() * 1000)}_{self.active_pack_dir.name}"

    def resolve_safe_subpath(self, raw_rel: str) -> Path:
        cleaned = raw_rel.strip().lstrip("/\\")
        if not cleaned:
            raise ValueError("path 参数不能为空")
        candidate = (self.workspace_root / cleaned).resolve()
        # 严格限制在 workspace_root 内部，阻断 ../ 目录穿越
        try:
            candidate.relative_to(self.workspace_root)
        except ValueError as exc:
            raise PermissionError(f"路径越界（不在工作空间根目录 {self.workspace_root.name} 内）") from exc
        if not candidate.exists():
            raise FileNotFoundError(f"本地未找到路径：{cleaned}")
        return candidate

    def locate_pack_dir(self, project_or_pack_path: Path, explicit_pack_rel: str = "") -> tuple[Path, Path]:
        """返回 (project_dir, pack_dir)"""
        base = project_or_pack_path if project_or_pack_path.is_dir() else project_or_pack_path.parent

        # 1. 若飞书显式传入了 pack 子路径（相对 workspace_root 或相对当前作品目录）
        if explicit_pack_rel.strip():
            sub_clean = explicit_pack_rel.strip().lstrip("/\\")
            cand_rel_project = (base / sub_clean).resolve()
            if cand_rel_project.is_dir():
                cand_rel_project.relative_to(self.workspace_root)
                return base, cand_rel_project
            cand_rel_root = self.resolve_safe_subpath(sub_clean)
            if cand_rel_root.is_dir():
                return base, cand_rel_root

        # 2. 若当前传入目录本身直接包含标准发布包文件（publish.pack.json 或 发布包*.md），直接作为成品包目录
        if find_explicit_pack_file(base) is not None:
            return base.parent, base

        # 3. 优先探测包含标准发布包文件的固定成品包子目录（如 成片/、04_发布与成片/、09_发布与交付/）
        existing_subs: list[Path] = []
        for sub in self.pack_subdirs:
            sub_dir = (base / sub).resolve()
            if sub_dir.is_dir():
                if find_explicit_pack_file(sub_dir) is not None:
                    return base, sub_dir
                existing_subs.append(sub_dir)

        if existing_subs:
            return base, existing_subs[0]

        return base, base


def build_launchpad_html(
    *,
    folder_label: str,
    pack_file_name: str,
    cover_count: int,
    finder_msg: str,
    site_key: str,
    site_name: str,
    target_urls: list[str],
    pack_version: str,
) -> str:
    esc_folder = html.escape(folder_label)
    esc_pack = html.escape(pack_file_name or "未检测到发布包文档（仅打开目录）")
    esc_finder = html.escape(finder_msg)
    esc_site = html.escape(site_name)
    urls_json = json.dumps(target_urls, ensure_ascii=False)
    primary_url = target_urls[0] if target_urls else ""

    return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <title>正在准备发布包 · {esc_site}</title>
  <style>
    * {{ box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif; }}
    body {{ min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #f7f8fa; color: #1f2329; padding: 24px; }}
    .card {{ width: 100%; max-width: 480px; background: #fff; border-radius: 16px; padding: 28px; box-shadow: 0 12px 36px rgba(15,23,42,0.08); border: 1px solid rgba(31,35,41,0.08); }}
    .badge {{ display: inline-block; padding: 4px 10px; border-radius: 999px; background: #ff2442; color: #fff; font-size: 12px; font-weight: 600; margin-bottom: 14px; }}
    h1 {{ font-size: 18px; margin-bottom: 10px; line-height: 1.4; }}
    .meta {{ font-size: 13px; color: #4e5969; line-height: 1.75; background: #f8f9fb; padding: 12px 14px; border-radius: 10px; margin-bottom: 16px; }}
    .status {{ font-size: 13.5px; color: #059669; font-weight: 600; margin-bottom: 16px; }}
    .btns {{ display: flex; gap: 10px; flex-wrap: wrap; }}
    a.btn {{ display: inline-flex; align-items: center; justify-content: center; padding: 9px 16px; border-radius: 9px; background: #1f2329; color: #fff; text-decoration: none; font-size: 13px; font-weight: 600; }}
    a.btn-primary {{ background: #ff2442; }}
  </style>
</head>
<body>
  <div class="card" id="ppf-feishu-launchpad"
       data-site="{html.escape(site_key)}"
       data-pack-version="{html.escape(pack_version)}"
       data-target-urls='{html.escape(urls_json)}'>
    <span class="badge">飞书直连 · PublishPack</span>
    <h1>📂 {esc_folder}</h1>
    <div class="meta">
      <div>🖥️ <strong>{esc_finder}</strong></div>
      <div>📄 发布包：<strong>{esc_pack}</strong>（检测到 {cover_count} 张配图）</div>
      <div>🎯 目标平台：<strong>{esc_site}</strong></div>
    </div>
    <div class="status" id="ppf-sync-msg">
      ⏳ 正在将发布包与封面透传至浏览器插件...
    </div>
    <div class="btns">
      {f'<a class="btn btn-primary" href="{html.escape(primary_url)}">立即前往 {esc_site} 发布页 →</a>' if primary_url else ''}
    </div>
  </div>
  <script>
    // 若未安装 Chrome 扩展（例如使用 Tampermonkey 油猴脚本），550ms 后自动跳转目标平台，由油猴脚本在后台拉取最新激活包
    const urls = {urls_json};
    setTimeout(() => {{
      const el = document.getElementById('ppf-feishu-launchpad');
      if (el && el.getAttribute('data-ext-handled') === '1') return;
      if (urls.length === 1) {{
        window.location.replace(urls[0]);
      }} else if (urls.length > 1) {{
        document.getElementById('ppf-sync-msg').textContent = '✅ 本地发布包已就绪！请安装或启用 Chrome 插件以支持四端一键齐开。';
      }} else {{
        document.getElementById('ppf-sync-msg').textContent = '✅ Finder 已打开且本地桥接已切换至该作品！';
      }}
    }}, 650);
  </script>
</body>
</html>"""


def make_handler(state: BridgeState):
    class PackBridgeHandler(BaseHTTPRequestHandler):
        def log_message(self, fmt: str, *args) -> None:
            sys.stdout.write(f"[FeishuBridge] {self.address_string()} - {fmt % args}\n")

        def _send_json(self, payload: dict, status: int = 200) -> None:
            raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(raw)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(raw)

        def _send_html(self, html_str: str, status: int = 200) -> None:
            raw = html_str.encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(raw)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(raw)

        def do_GET(self) -> None:
            parsed = urllib.parse.urlparse(self.path)
            qs = urllib.parse.parse_qs(parsed.query)

            # 0. 向后兼容原 feishu-open-folder.py 的 /downloads 路由
            if parsed.path == "/downloads":
                dl_dir = Path.home() / "Downloads"
                if sys.platform == "darwin" and dl_dir.is_dir():
                    subprocess.Popen(["open", str(dl_dir)])
                self._send_html("<h3>✅ Finder 下载文件夹已打开</h3>")
                return

            # 1. 飞书表格超链接入口：/open?path=...[&site=xhs|wx|dy|bili|all][&pack=...][&finder=1]
            if parsed.path == "/open":
                raw_path = (qs.get("path") or [""])[0]
                raw_pack = (qs.get("pack") or [""])[0]
                # 若未传 site 参数，默认仅打开 Finder + 预载插件，不强制跳转平台（100% 兼容旧版 /open?path=... 链接）
                site_key = ((qs.get("site") or ["finder"])[0] or "finder").strip().lower()
                open_finder = ((qs.get("finder") or ["1"])[0] or "1").strip() not in ("0", "false", "no")

                try:
                    target_base = state.resolve_safe_subpath(raw_path)
                    project_dir, pack_dir = state.locate_pack_dir(target_base, raw_pack)
                except (ValueError, PermissionError, FileNotFoundError) as exc:
                    self._send_html(
                        f"<h2>⚠️ 无法打开指定作品目录</h2><p>{html.escape(str(exc))}</p>",
                        status=400,
                    )
                    return

                state.set_active_pack_dir(pack_dir)
                pack_file = find_latest_pack_file(pack_dir)
                covers = list_media_image_rel_paths(pack_dir)

                finder_msg = "已跳过 Finder 唤起"
                now = time.time()
                if open_finder:
                    # 12 秒内同一作品连续点不同平台链接时，避免重复狂弹多个相同 Finder 窗口
                    if state.last_finder_target == str(pack_dir) and (now - state.last_finder_ts) < 12.0:
                        finder_msg = f"Finder 已处于打开状态（{pack_dir.name}）"
                    else:
                        finder_msg = reveal_in_finder(pack_dir, project_dir)
                        state.last_finder_target = str(pack_dir)
                        state.last_finder_ts = now

                if site_key == "all":
                    site_name = "四平台齐开（小红书 / 视频号 / 抖音 / B站）"
                    target_urls = ALL_FOUR_URLS
                elif site_key in ("none", "finder", "local"):
                    site_name = "仅定位本地文件与同步插件"
                    target_urls = []
                else:
                    site_name, single_url = SITE_URLS.get(site_key, SITE_URLS["xhs"])
                    target_urls = [single_url]

                folder_label = (
                    f"{project_dir.name} / {pack_dir.name}"
                    if project_dir != pack_dir
                    else pack_dir.name
                )
                page_html = build_launchpad_html(
                    folder_label=folder_label,
                    pack_file_name=pack_file.name if pack_file else "",
                    cover_count=len(covers),
                    finder_msg=finder_msg,
                    site_key=site_key,
                    site_name=site_name,
                    target_urls=target_urls,
                    pack_version=state.pack_version,
                )
                self._send_html(page_html)
                return

            # 2. 轻量状态探针（供插件后台静默检查是否刚在飞书切换了作品）
            if parsed.path == "/api/status":
                base_dir = state.active_pack_dir
                pack_file = find_latest_pack_file(base_dir) if base_dir and base_dir.is_dir() else None
                self._send_json(
                    {
                        "ok": True,
                        "hasActivePack": bool(base_dir and pack_file),
                        "packVersion": state.pack_version,
                        "folderName": f"{base_dir.parent.name}/{base_dir.name}" if base_dir else "",
                        "packFile": pack_file.name if pack_file else "",
                    }
                )
                return

            # 3. 读取当前激活的发布包正文与配图列表
            if parsed.path == "/api/pack":
                base_dir = state.active_pack_dir
                if not base_dir or not base_dir.is_dir():
                    self._send_json({"error": "尚未通过飞书或命令行选定成品包目录"}, status=404)
                    return
                pack_file = find_latest_pack_file(base_dir)
                if not pack_file or not pack_file.is_file():
                    self._send_json({"error": f"未在 {base_dir.name} 找到 publish.pack.json 或 发布包*.md"}, status=404)
                    return
                content = pack_file.read_text(encoding="utf-8")
                is_json = pack_file.suffix.lower() == ".json"
                self._send_json(
                    {
                        "packVersion": state.pack_version,
                        "baseDir": str(base_dir),
                        "folderName": f"{base_dir.parent.name}/{base_dir.name}",
                        "packFile": pack_file.name,
                        "mdFile": pack_file.name,
                        "format": "json" if is_json else "markdown",
                        "content": content,
                        "markdown": "" if is_json else content,
                        "subMarkdowns": {} if is_json else read_sub_markdowns(base_dir),
                        "covers": list_media_image_rel_paths(base_dir),
                    }
                )
                return

            # 4. 读取当前激活成品包内的图片二进制流（严格防越界）
            if parsed.path == "/api/file":
                base_dir = state.active_pack_dir
                rel = (qs.get("path") or [""])[0]
                if not base_dir or not rel:
                    self._send_json({"error": "缺少激活目录或 path 参数"}, status=400)
                    return
                target = (base_dir / rel).resolve()
                try:
                    target.relative_to(base_dir.resolve())
                except ValueError:
                    self._send_json({"error": "越界访问被拒绝"}, status=403)
                    return
                if not target.is_file():
                    self._send_json({"error": "文件不存在"}, status=404)
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

            self._send_json(
                {
                    "service": "PublishPack Feishu Local Bridge",
                    "status": "running",
                    "workspaceRoot": str(state.workspace_root),
                    "activePackDir": str(state.active_pack_dir) if state.active_pack_dir else None,
                    "packVersion": state.pack_version,
                }
            )

    return PackBridgeHandler


def main() -> None:
    cfg = load_local_config()
    default_root = detect_default_workspace_root(cfg)
    default_port = int(cfg.get("port") or 8765)
    default_subdirs = list(cfg.get("packSubdirs") or DEFAULT_PACK_SUBDIRS)

    parser = argparse.ArgumentParser(description="启动飞书直连 + Finder 定位 + 插件透传本地服务")
    parser.add_argument(
        "pack_dir",
        nargs="?",
        default="",
        help="可选：初始激活的成品包目录路径",
    )
    parser.add_argument(
        "--root",
        default=str(default_root),
        help="飞书 [相对路径] 对应的本地工作空间根目录（默认读取 .bridge.local.json 或 ~/Desktop/AIHub）",
    )
    parser.add_argument("--port", type=int, default=default_port, help=f"本地监听端口（默认 {default_port}）")
    args = parser.parse_args()

    workspace_root = Path(args.root).expanduser().resolve()
    if not workspace_root.is_dir():
        print(f"❌ 工作空间根目录不存在: {workspace_root}", file=sys.stderr)
        sys.exit(1)

    initial_pack = Path(args.pack_dir).expanduser().resolve() if args.pack_dir else None
    state = BridgeState(workspace_root=workspace_root, initial_pack_dir=initial_pack, pack_subdirs=default_subdirs)

    print("=" * 68)
    print("🚀 PublishPack · 飞书直连 + Finder + 插件透传服务已启动")
    print(f"📁 工作空间根目录 : {state.workspace_root}")
    print(f"🔎 自动成品包子目录: {', '.join(state.pack_subdirs)}")
    if state.active_pack_dir:
        print(f"📦 初始激活成品包 : {state.active_pack_dir}")
    print(f"🔒 本机监听地址   : http://127.0.0.1:{args.port}")
    print(f"🔗 飞书公式示例   : http://127.0.0.1:{args.port}/open?path=<相对路径>&site=xhs")
    print("=" * 68)

    server = ThreadingHTTPServer(("127.0.0.1", args.port), make_handler(state))
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n👋 已停止飞书本地桥接服务。")


if __name__ == "__main__":
    main()
