#!/usr/bin/env python3
"""
Publish Pack Filler · 飞书直连本地调度与路径转化服务 (v1.4.1)
默认监听 http://127.0.0.1:8765（仅本机回环，零外网暴露、零 CORS 通配泄露）。

核心能力：
1. 本地作品目录智能三级寻址转化：
   支持飞书直接传纯作品目录名（如 `path=20261016_特斯拉飞行汽车短视频` 或 `dir=20261117_天津城市变迁`），
   自动按「品牌提示优先 -> 2 AH领域/*/04_作品 -> 1 AH项目 -> 01_选题库 -> 4 AH归档 -> 极空间挂载盘」定位真实路径，
   并同时兼容旧版相对长路径。
2. 「分发账号」字段智能识别平台与防串号提醒：
   支持飞书直接传 `&account=抖音·靖蜀黍`、`&account=视频号·靖蜀黍.`、`&account=小红书·万物皆有数`（或 `&site=xhs`），
   自动清理末尾句点/括号噪音，提取目标发布平台 URL 与品牌归属，并将目标账号名透传至浏览器插件防串号。
3. Finder 自动定位并高亮主视频 (`open -R`) + 发布包/封面零拖拽透传进插件。
"""

from __future__ import annotations

import argparse
import html
import json
import mimetypes
import os
import re
import subprocess
import sys
import time
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
LOCAL_CONFIG_PATH = REPO_ROOT / ".bridge.local.json"

DEFAULT_PACK_SUBDIRS = [
    "成片",
    "04_成片",
    "04_发布与成片",
    "09_发布与交付",
    "07_导出/成片",
    "publish_pack",
]

DEFAULT_BRAND_HINTS = {
    "万物": "万物有数",
    "靖蜀黍": "靖蜀黍",
    "flyloy": "靖蜀黍",
    "flylog": "靖蜀黍",
    "检测": "工程检测科普",
}

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

# 从飞书「分发账号」自然语言名称（如「抖音·靖蜀黍」「视频号·靖蜀黍.」「小红书·万物皆有数」）提取平台代号
PLATFORM_KEYWORD_RULES: list[tuple[tuple[str, ...], str]] = [
    (("小红书", "红书", "xhs", "xiaohongshu"), "xhs"),
    (("视频号", "微信视频", "sph", "channels", "weixin_channels"), "wx"),
    (("抖音", "douyin"), "dy"),
    (("b站", "哔哩", "bilibili", "bili"), "bili"),
    (("快手", "kuaishou"), "ks"),
    (("公众号", "小绿书", "服务号", "订阅号", "weixin_mp"), "mp"),
    (("知乎", "zhihu"), "zhihu"),
    (("微博", "weibo"), "weibo"),
    (("youtube", "油管"), "yt"),
]

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


def normalize_feishu_cell_text(raw: str) -> str:
    """清理由飞书关联字段 / 查找引用字段拼接产生的引号、方括号、换行或重复项（如 'a, a' -> 'a'）"""
    s = (raw or "").strip()
    s = re.sub(r'^[\[\]"\'\s]+|[\[\]"\'\s]+$', "", s)
    if "," in s:
        parts = [p.strip().strip('"\'') for p in s.split(",") if p.strip()]
        if len(parts) > 1 and len(set(parts)) == 1:
            s = parts[0]
    return s.strip()


def parse_dispatch_account(raw_account: str, raw_site: str, brand_hints_cfg: dict[str, str]) -> tuple[str, str, str]:
    """
    解析飞书「分发账号」或 site 参数：
    输入示例：raw_account='视频号·靖蜀黍.' 或 '抖音·靖蜀黍' 或 raw_site='xhs'
    返回：(site_key, clean_account_label, folder_brand_hint)
    """
    acct = normalize_feishu_cell_text(raw_account)
    # 清理账号末尾常见的误输句点，如「视频号·靖蜀黍.」->「视频号·靖蜀黍」
    acct_clean = re.sub(r"[.。·\s]+$", "", acct).strip()
    site_in = normalize_feishu_cell_text(raw_site).lower()

    # 1. 识别品牌目录提示词（用于同名目录优先定位）
    brand_folder_hint = ""
    merged_hints = {**DEFAULT_BRAND_HINTS, **(brand_hints_cfg or {})}
    probe_text = f"{acct_clean} {site_in}".lower()
    for kw, folder_kw in merged_hints.items():
        if kw.lower() in probe_text:
            brand_folder_hint = folder_kw
            break

    # 2. 若显式给了标准短码 site（如 xhs / dy / wx / bili / all / finder）优先识别
    if site_in in SITE_URLS or site_in in ("all", "finder", "none", "local"):
        return site_in, acct_clean, brand_folder_hint

    # 3. 从「分发账号」（或把中文账号传在了 site 参数里）识别目标平台
    combined = f"{acct_clean} {raw_site}".strip()
    if not combined:
        return "finder", "", brand_folder_hint

    lower_comb = combined.lower()
    if lower_comb in ("all", "全部", "四平台", "全平台"):
        return "all", acct_clean, brand_folder_hint

    for keywords, mapped_site in PLATFORM_KEYWORD_RULES:
        if any(k in lower_comb for k in keywords):
            return mapped_site, acct_clean or combined, brand_folder_hint

    # 未匹配到已知平台词时，若填了 site 短码兜底查表，否则退化为仅打开 Finder
    if site_in:
        return SITE_URLS.get(site_in, ("", ""))[0] and site_in or "finder", acct_clean, brand_folder_hint
    return "finder", acct_clean, brand_folder_hint


def find_explicit_pack_file(base_dir: Path) -> Path | None:
    """严格匹配真正的发布包文档（*.pack.json / publish*.json / 发布包*.md / *发布文案*.md / 发布.md）"""
    if not base_dir or not base_dir.is_dir():
        return None
    json_packs = sorted(base_dir.glob("*.pack.json")) + sorted(base_dir.glob("publish*.json"))
    if json_packs:
        return json_packs[-1]
    for pattern in ("发布包*.md", "*发布文案*.md", "发布.md"):
        md_packs = [p for p in sorted(base_dir.glob(pattern)) if not p.name.endswith(".preview.md")]
        if md_packs:
            return md_packs[-1]
    return None


def find_latest_pack_file(pack_dir: Path, project_dir: Path | None = None) -> Path | None:
    for d in (pack_dir, project_dir):
        if d and d.is_dir():
            explicit = find_explicit_pack_file(d)
            if explicit:
                return explicit
    if not pack_dir or not pack_dir.is_dir():
        return None
    ignore_names = {"readme.md", "agents.md", "claude.md", "changelog.md", "日志.md", "任务.md", "修改意见记录.md"}
    md_files = [
        p
        for p in sorted(pack_dir.glob("*.md"))
        if p.name.lower() not in ignore_names and not p.name.endswith(".preview.md")
    ]
    return md_files[-1] if md_files else None


def read_sub_markdowns(pack_dir: Path, project_dir: Path | None = None) -> dict[str, str]:
    result: dict[str, str] = {}
    for base in (pack_dir, project_dir):
        if not base or not base.is_dir():
            continue
        copy_dir = base / "文案"
        if copy_dir.is_dir():
            for p in sorted(copy_dir.glob("*.md")):
                if p.is_file():
                    result[f"文案/{p.name}"] = p.read_text(encoding="utf-8")
            if result:
                break
    return result


def list_media_image_rel_paths(pack_dir: Path) -> list[str]:
    exts = {".png", ".jpg", ".jpeg", ".webp"}
    rels: list[str] = []
    if not pack_dir or not pack_dir.is_dir():
        return rels
    for sub_name in ("封面", "covers", "slides", "images"):
        sub_dir = pack_dir / sub_name
        if sub_dir.is_dir():
            for p in sorted(sub_dir.iterdir()):
                if p.is_file() and p.suffix.lower() in exts:
                    rels.append(str(p.relative_to(pack_dir)).replace("\\", "/"))
    if not rels:
        for p in sorted(pack_dir.iterdir()):
            if p.is_file() and p.suffix.lower() in exts:
                rels.append(str(p.relative_to(pack_dir)).replace("\\", "/"))
    return rels


def find_primary_video_file(pack_dir: Path, project_dir: Path) -> Path | None:
    video_exts = (".mp4", ".mov", ".m4v")
    search_dirs = [
        pack_dir,
        project_dir / "成片",
        project_dir / "04_成片",
        project_dir / "07_导出" / "成片",
        project_dir / "04_发布与成片",
        project_dir,
    ]
    seen: set[Path] = set()
    for folder in search_dirs:
        if not folder.is_dir() or folder in seen:
            continue
        seen.add(folder)
        vids = [
            p
            for p in sorted(folder.iterdir())
            if p.is_file() and p.suffix.lower() in video_exts and not p.name.startswith(".")
        ]
        if vids:
            preferred = [v for v in vids if any(k in v.name for k in ("发布", "终版", "成片", "标准"))]
            return preferred[-1] if preferred else vids[-1]
    return None


def reveal_in_finder(pack_dir: Path, project_dir: Path) -> str:
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
    def __init__(
        self,
        workspace_root: Path,
        fallback_roots: list[Path],
        initial_pack_dir: Path | None,
        pack_subdirs: list[str],
        brand_hints: dict[str, str],
    ) -> None:
        self.workspace_root = workspace_root.resolve()
        self.fallback_roots = [r.resolve() for r in fallback_roots if r.is_dir()]
        self.active_pack_dir: Path | None = initial_pack_dir.resolve() if initial_pack_dir else None
        self.active_project_dir: Path | None = initial_pack_dir.parent.resolve() if initial_pack_dir else None
        self.active_target_account: str = ""
        self.pack_subdirs = pack_subdirs
        self.brand_hints = brand_hints
        self.pack_version = str(int(time.time() * 1000))
        self.last_finder_target = ""
        self.last_finder_ts = 0.0

    def all_allowed_roots(self) -> list[Path]:
        roots = [self.workspace_root]
        for r in self.fallback_roots:
            if r not in roots:
                roots.append(r)
        return roots

    def assert_inside_allowed_roots(self, candidate: Path) -> Path:
        resolved = candidate.resolve()
        for root in self.all_allowed_roots():
            try:
                resolved.relative_to(root)
                return resolved
            except ValueError:
                continue
        raise PermissionError(f"路径越界（不在允许的工作空间根目录内）：{candidate}")

    def set_active_context(self, project_dir: Path, pack_dir: Path, target_account: str = "") -> None:
        self.active_project_dir = project_dir.resolve()
        self.active_pack_dir = pack_dir.resolve()
        self.active_target_account = target_account
        self.pack_version = f"{int(time.time() * 1000)}_{self.active_pack_dir.name}"

    def resolve_work_directory(self, raw_dir_or_path: str, brand_hint: str = "") -> Path:
        """
        核心路径转化器：
        既支持纯作品目录名（如 `20261016_特斯拉飞行汽车短视频`），也支持相对路径（如 `2 AH领域·Areas/...`）。
        按「直接相对路径 -> 热区 04_作品 -> 1 AH项目 -> 01_选题库 -> 4 AH归档 -> 极空间挂载盘」三级寻址。
        """
        cleaned = normalize_feishu_cell_text(raw_dir_or_path).lstrip("/\\")
        if not cleaned:
            raise ValueError("本地作品目录参数 (dir / path) 不能为空")
        if ".." in Path(cleaned).parts:
            raise PermissionError("非法路径参数（禁止包含 ..）")

        for root in self.all_allowed_roots():
            # 1. 若本身就是已存在的相对路径，直接命中
            direct = (root / cleaned).resolve()
            if direct.exists():
                return self.assert_inside_allowed_roots(direct)

            # 若包含 '/' 但直接路径不存在，尝试取最后一段纯目录名继续智能寻址
            pure_name = Path(cleaned).name
            candidates: list[Path] = []

            # 2. 一级热区：2 AH领域·Areas/*/04_作品/<pure_name> 与 1 AH项目·Projects
            areas_dir = root / "2 AH领域·Areas"
            if areas_dir.is_dir():
                for acc_dir in sorted(areas_dir.iterdir()):
                    if not acc_dir.is_dir() or acc_dir.name.startswith("."):
                        continue
                    work_cand = acc_dir / "04_作品" / pure_name
                    if work_cand.is_dir():
                        candidates.append(work_cand)

            projects_dir = root / "1 AH项目·Projects"
            if projects_dir.is_dir():
                proj_direct = projects_dir / pure_name
                if proj_direct.is_dir():
                    candidates.append(proj_direct)
                for sub_proj in sorted(projects_dir.iterdir()):
                    if sub_proj.is_dir() and not sub_proj.name.startswith("."):
                        nested = sub_proj / pure_name
                        if nested.is_dir():
                            candidates.append(nested)

            # 3. 二级选题库：2 AH领域·Areas/*/01_选题库/<pure_name>（覆盖如 902/903 数字孪生专题）
            if not candidates and areas_dir.is_dir():
                for acc_dir in sorted(areas_dir.iterdir()):
                    if not acc_dir.is_dir() or acc_dir.name.startswith("."):
                        continue
                    topic_cand = acc_dir / "01_选题库" / pure_name
                    if topic_cand.is_dir():
                        candidates.append(topic_cand)

            # 4. 三级归档区：4 AH归档·Archives/**/<pure_name>（限深 3 层）
            archives_dir = root / "4 AH归档·Archives"
            if not candidates and archives_dir.is_dir():
                for pattern in (pure_name, f"*/{pure_name}", f"*/*/{pure_name}", f"*/*/*/{pure_name}"):
                    for matched in sorted(archives_dir.glob(pattern)):
                        if matched.is_dir():
                            candidates.append(matched)

            if candidates:
                # 若有品牌提示（如「抖音·靖蜀黍」-> 靖蜀黍），优先选路径包含该品牌的目录
                if brand_hint:
                    branded = [c for c in candidates if brand_hint.lower() in str(c).lower()]
                    if branded:
                        return self.assert_inside_allowed_roots(branded[0])
                return self.assert_inside_allowed_roots(candidates[0])

        raise FileNotFoundError(f"在工作空间与归档盘中均未找到作品目录：「{cleaned}」")

    def locate_pack_dir(self, project_or_pack_path: Path, explicit_pack_rel: str = "") -> tuple[Path, Path]:
        """返回 (project_dir, pack_dir)"""
        base = project_or_pack_path if project_or_pack_path.is_dir() else project_or_pack_path.parent

        if explicit_pack_rel.strip():
            sub_clean = normalize_feishu_cell_text(explicit_pack_rel).lstrip("/\\")
            if ".." in Path(sub_clean).parts:
                raise PermissionError("非法 pack 子路径")
            cand_rel_project = (base / sub_clean).resolve()
            if cand_rel_project.is_dir():
                return base, self.assert_inside_allowed_roots(cand_rel_project)

        # 若当前目录本身就是成片子目录（直接含封面子目录或标准发布包且无下级成片目录）
        existing_subs: list[Path] = []
        for sub in self.pack_subdirs:
            sub_dir = (base / sub).resolve()
            if sub_dir.is_dir():
                if find_explicit_pack_file(sub_dir) is not None:
                    return base, sub_dir
                existing_subs.append(sub_dir)

        if find_explicit_pack_file(base) is not None and not existing_subs:
            return base.parent, base

        if existing_subs:
            return base, existing_subs[0]

        return base, base


def build_launchpad_html(
    *,
    folder_label: str,
    resolved_rel_path: str,
    pack_file_name: str,
    cover_count: int,
    finder_msg: str,
    site_key: str,
    site_name: str,
    account_label: str,
    target_urls: list[str],
    pack_version: str,
) -> str:
    esc_folder = html.escape(folder_label)
    esc_rel = html.escape(resolved_rel_path)
    esc_pack = html.escape(pack_file_name or "未检测到独立发布包文档（仅定位视频与目录）")
    esc_finder = html.escape(finder_msg)
    esc_site = html.escape(site_name)
    esc_acct = html.escape(account_label)
    urls_json = json.dumps(target_urls, ensure_ascii=False)
    primary_url = target_urls[0] if target_urls else ""

    acct_line = f"<div>👤 分发账号：<strong>{esc_acct}</strong>（请核对浏览器当前登录账号）</div>" if esc_acct else ""

    return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <title>正在调度发布 · {esc_acct or esc_site}</title>
  <style>
    * {{ box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif; }}
    body {{ min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #f7f8fa; color: #1f2329; padding: 24px; }}
    .card {{ width: 100%; max-width: 500px; background: #fff; border-radius: 16px; padding: 28px; box-shadow: 0 12px 36px rgba(15,23,42,0.08); border: 1px solid rgba(31,35,41,0.08); }}
    .badge {{ display: inline-block; padding: 4px 10px; border-radius: 999px; background: #ff2442; color: #fff; font-size: 12px; font-weight: 600; margin-bottom: 14px; }}
    h1 {{ font-size: 18px; margin-bottom: 8px; line-height: 1.4; }}
    .path-sub {{ font-size: 11.5px; color: #8f959e; margin-bottom: 12px; word-break: break-all; }}
    .meta {{ font-size: 13px; color: #4e5969; line-height: 1.8; background: #f8f9fb; padding: 12px 14px; border-radius: 10px; margin-bottom: 16px; }}
    .status {{ font-size: 13.5px; color: #059669; font-weight: 600; margin-bottom: 16px; }}
    .btns {{ display: flex; gap: 10px; flex-wrap: wrap; }}
    a.btn {{ display: inline-flex; align-items: center; justify-content: center; padding: 9px 16px; border-radius: 9px; background: #ff2442; color: #fff; text-decoration: none; font-size: 13px; font-weight: 600; }}
  </style>
</head>
<body>
  <div class="card" id="ppf-feishu-launchpad"
       data-site="{html.escape(site_key)}"
       data-account="{esc_acct}"
       data-pack-version="{html.escape(pack_version)}"
       data-target-urls='{html.escape(urls_json)}'>
    <span class="badge">飞书发布调度 · PublishPack</span>
    <h1>📂 {esc_folder}</h1>
    <div class="path-sub">📍 已转化路径：{esc_rel}</div>
    <div class="meta">
      {acct_line}
      <div>🎯 目标平台：<strong>{esc_site}</strong></div>
      <div>🖥️ <strong>{esc_finder}</strong></div>
      <div>📄 发布包：<strong>{esc_pack}</strong>（检测到 {cover_count} 张配图）</div>
    </div>
    <div class="status" id="ppf-sync-msg">
      ⏳ 正在将发布包与配图透传至浏览器插件...
    </div>
    <div class="btns">
      {f'<a class="btn" href="{html.escape(primary_url)}">立即前往 {esc_site} 发布页 →</a>' if primary_url else ''}
    </div>
  </div>
  <script>
    const urls = {urls_json};
    setTimeout(() => {{
      const el = document.getElementById('ppf-feishu-launchpad');
      if (el && el.getAttribute('data-ext-handled') === '1') return;
      if (urls.length === 1) {{
        window.location.replace(urls[0]);
      }} else if (urls.length > 1) {{
        document.getElementById('ppf-sync-msg').textContent = '✅ 本地发布包已就绪！请启用 Chrome 插件以支持四端齐开。';
      }} else {{
        document.getElementById('ppf-sync-msg').textContent = '✅ Finder 已定位打开作品目录！';
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

            # 1. 飞书调度入口：支持 ?dir=20261016_xxx&account=抖音·靖蜀黍 或 ?path=...&site=...
            if parsed.path == "/open":
                raw_dir = (qs.get("dir") or qs.get("path") or [""])[0]
                raw_pack = (qs.get("pack") or [""])[0]
                raw_account = (qs.get("account") or qs.get("acct") or [""])[0]
                raw_site = (qs.get("site") or [""])[0]
                open_finder = ((qs.get("finder") or ["1"])[0] or "1").strip() not in ("0", "false", "no")

                site_key, account_label, brand_hint = parse_dispatch_account(
                    raw_account=raw_account,
                    raw_site=raw_site,
                    brand_hints_cfg=state.brand_hints,
                )

                try:
                    target_base = state.resolve_work_directory(raw_dir, brand_hint=brand_hint)
                    project_dir, pack_dir = state.locate_pack_dir(target_base, raw_pack)
                except (ValueError, PermissionError, FileNotFoundError) as exc:
                    self._send_html(
                        f"<div style='font-family:sans-serif;padding:32px;'><h2>⚠️ 无法定位本地作品目录</h2><p style='margin-top:10px;color:#d93025;'>{html.escape(str(exc))}</p></div>",
                        status=400,
                    )
                    return

                state.set_active_context(project_dir=project_dir, pack_dir=pack_dir, target_account=account_label)
                pack_file = find_latest_pack_file(pack_dir, project_dir)
                covers = list_media_image_rel_paths(pack_dir)

                finder_msg = "已跳过 Finder 唤起"
                now = time.time()
                if open_finder:
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
                    site_name = "仅打开本地 Finder 目录（不跳转网页）"
                    target_urls = []
                else:
                    site_name, single_url = SITE_URLS.get(site_key, SITE_URLS["xhs"])
                    target_urls = [single_url]

                folder_label = (
                    f"{project_dir.name} / {pack_dir.name}"
                    if project_dir != pack_dir
                    else pack_dir.name
                )
                try:
                    rel_display = str(pack_dir.relative_to(state.workspace_root))
                except ValueError:
                    rel_display = str(pack_dir)

                page_html = build_launchpad_html(
                    folder_label=folder_label,
                    resolved_rel_path=rel_display,
                    pack_file_name=pack_file.name if pack_file else "",
                    cover_count=len(covers),
                    finder_msg=finder_msg,
                    site_key=site_key,
                    site_name=site_name,
                    account_label=account_label,
                    target_urls=target_urls,
                    pack_version=state.pack_version,
                )
                self._send_html(page_html)
                return

            # 2. 轻量状态探针
            if parsed.path == "/api/status":
                pack_dir = state.active_pack_dir
                proj_dir = state.active_project_dir
                pack_file = find_latest_pack_file(pack_dir, proj_dir) if pack_dir and pack_dir.is_dir() else None
                self._send_json(
                    {
                        "ok": True,
                        "hasActivePack": bool(pack_dir and pack_dir.is_dir()),
                        "packVersion": state.pack_version,
                        "targetAccount": state.active_target_account,
                        "folderName": f"{proj_dir.name}/{pack_dir.name}" if (proj_dir and pack_dir) else "",
                        "packFile": pack_file.name if pack_file else "",
                    }
                )
                return

            # 3. 读取当前激活的发布包正文与配图列表（即使目录暂未写发布文案，也正常透传封面与目标账号）
            if parsed.path == "/api/pack":
                pack_dir = state.active_pack_dir
                proj_dir = state.active_project_dir
                if not pack_dir or not pack_dir.is_dir():
                    self._send_json({"error": "尚未选定作品目录"}, status=404)
                    return
                pack_file = find_latest_pack_file(pack_dir, proj_dir)
                content = pack_file.read_text(encoding="utf-8") if (pack_file and pack_file.is_file()) else ""
                is_json = bool(pack_file and pack_file.suffix.lower() == ".json")
                self._send_json(
                    {
                        "packVersion": state.pack_version,
                        "targetAccount": state.active_target_account,
                        "baseDir": str(pack_dir),
                        "folderName": f"{proj_dir.name}/{pack_dir.name}" if (proj_dir and proj_dir != pack_dir) else pack_dir.name,
                        "packFile": pack_file.name if pack_file else "",
                        "mdFile": pack_file.name if pack_file else "",
                        "format": "json" if is_json else ("markdown" if pack_file else "empty"),
                        "content": content,
                        "markdown": "" if is_json else content,
                        "subMarkdowns": {} if is_json else read_sub_markdowns(pack_dir, proj_dir),
                        "covers": list_media_image_rel_paths(pack_dir),
                    }
                )
                return

            # 4. 读取当前激活成品包内的图片二进制流
            if parsed.path == "/api/file":
                pack_dir = state.active_pack_dir
                rel = (qs.get("path") or [""])[0]
                if not pack_dir or not rel:
                    self._send_json({"error": "缺少激活目录或 path 参数"}, status=400)
                    return
                target = (pack_dir / rel).resolve()
                try:
                    target.relative_to(pack_dir.resolve())
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
                    "version": "1.4.1",
                    "status": "running",
                    "workspaceRoot": str(state.workspace_root),
                    "fallbackRoots": [str(r) for r in state.fallback_roots],
                    "activePackDir": str(state.active_pack_dir) if state.active_pack_dir else None,
                    "activeTargetAccount": state.active_target_account,
                    "packVersion": state.pack_version,
                }
            )

    return PackBridgeHandler


def main() -> None:
    cfg = load_local_config()
    default_root = detect_default_workspace_root(cfg)
    fallback_roots = [Path(p).expanduser() for p in (cfg.get("fallbackRoots") or [])]
    default_port = int(cfg.get("port") or 8765)
    default_subdirs = list(cfg.get("packSubdirs") or DEFAULT_PACK_SUBDIRS)
    brand_hints = dict(cfg.get("brandFolderHints") or {})

    parser = argparse.ArgumentParser(description="启动飞书直连 + 本地目录智能寻址 + 分发账号路由服务")
    parser.add_argument("pack_dir", nargs="?", default="", help="可选：初始激活的成品包目录路径")
    parser.add_argument("--root", default=str(default_root), help="主工作空间根目录")
    parser.add_argument("--port", type=int, default=default_port, help=f"监听端口（默认 {default_port}）")
    args = parser.parse_args()

    workspace_root = Path(args.root).expanduser().resolve()
    if not workspace_root.is_dir():
        print(f"❌ 工作空间根目录不存在: {workspace_root}", file=sys.stderr)
        sys.exit(1)

    initial_pack = Path(args.pack_dir).expanduser().resolve() if args.pack_dir else None
    state = BridgeState(
        workspace_root=workspace_root,
        fallback_roots=fallback_roots,
        initial_pack_dir=initial_pack,
        pack_subdirs=default_subdirs,
        brand_hints=brand_hints,
    )

    print("=" * 70)
    print("🚀 PublishPack · 飞书直连调度服务已启动 (v1.4.1)")
    print(f"📁 主工作空间     : {state.workspace_root}")
    if state.fallback_roots:
        print(f"🗄️ 归档兜底盘     : {', '.join(str(r) for r in state.fallback_roots)}")
    print(f"🔒 本机监听地址   : http://127.0.0.1:{args.port}")
    print(f"🔗 发布表公式示例 : http://127.0.0.1:{args.port}/open?dir=20261016_特斯拉飞行汽车短视频&account=抖音·靖蜀黍")
    print("=" * 70)

    server = ThreadingHTTPServer(("127.0.0.1", args.port), make_handler(state))
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n👋 已停止飞书本地桥接服务。")


if __name__ == "__main__":
    main()
