#!/usr/bin/env python3
"""
Publish Pack Filler · 全平台半自动发布助手本地文件桥接服务 (v2.0.0 · 100% 仓库内自包含)
默认监听 http://127.0.0.1:8765（仅本机回环，零外网暴露、零外部仓库/CLI 依赖）。

v2.0 架构职责（与插件后台飞书直连引擎解耦）：
1. 本地作品目录智能三级寻址 + 跨平台文件管理器定位（macOS Finder / Windows Explorer / Linux）。
2. NAS 延迟同步优雅降级：若另一台电脑本地尚未同步该作品目录，不再报 400 阻断，
   而是将纯目录标识 (workSlug) 与飞书排期行 ID (cid) 透传给浏览器插件，由插件自动拉取飞书云端兜底文案！
3. 纯 Python 标准库内置导出报表自动归档 (/api/archive-downloads)，彻底摆脱对任何外部私有脚本路径的依赖。
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import mimetypes
import os
import re
import secrets
import shutil
import subprocess
import sys
import threading
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
    "13_海报样张_v3",
    "publish_pack",
]

SITE_URLS: dict[str, tuple[str, str]] = {
    "xhs": ("小红书", "https://creator.xiaohongshu.com/publish/publish?source=official&from=menu&target=video"),
    "xiaohongshu": ("小红书", "https://creator.xiaohongshu.com/publish/publish?source=official&from=menu&target=video"),
    "wx": ("微信视频号", "https://channels.weixin.qq.com/platform/post/create"),
    "weixin": ("微信视频号", "https://channels.weixin.qq.com/platform/post/create"),
    "weixin_channels": ("微信视频号", "https://channels.weixin.qq.com/platform/post/create"),
    "sph": ("微信视频号", "https://channels.weixin.qq.com/platform/post/create"),
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
    "cutcheck": ("Cutcheck 在线审片", "https://cutcheck-alpha.vercel.app"),
}

CUTCHECK_HOSTED_URL = "https://cutcheck-alpha.vercel.app"
ALLOWED_CUTCHECK_ORIGINS = {
    "https://cutcheck-alpha.vercel.app",
    "http://127.0.0.1:8765",
    "http://localhost:8765",
}

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
    "https://creator.douyin.com/creator-micro/content/upload",
    "https://channels.weixin.qq.com/platform/post/create",
    "https://creator.xiaohongshu.com/publish/publish?source=official&from=menu&target=video",
    "https://member.bilibili.com/platform/upload/video/frame",
]

QUIET_POLL_PATHS = {"/api/collect", "/api/status", "/favicon.ico", "/sw.js"}


def load_local_config() -> dict:
    if LOCAL_CONFIG_PATH.is_file():
        try:
            return json.loads(LOCAL_CONFIG_PATH.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


def load_local_feishu_bootstrap(cfg: dict) -> dict:
    """可选：从本机 .bridge.local.json 或 ~/.aihub/.env 读取已有飞书凭证，辅助用户在插件设置页一键导入"""
    feishu_cfg = cfg.get("feishu") if isinstance(cfg.get("feishu"), dict) else {}
    app_id = str(feishu_cfg.get("appId") or os.environ.get("FEISHU_APP_ID") or "").strip()
    app_secret = str(feishu_cfg.get("appSecret") or os.environ.get("FEISHU_APP_SECRET") or "").strip()
    base_token = str(feishu_cfg.get("baseToken") or os.environ.get("FEISHU_BASE_TOKEN") or "").strip()

    env_file = Path.home() / ".aihub" / ".env"
    if env_file.is_file():
        for raw in env_file.read_text(encoding="utf-8", errors="ignore").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            k = k.strip()
            v = v.strip().strip('"').strip("'")
            if k == "FEISHU_APP_ID" and not app_id:
                app_id = v
            elif k == "FEISHU_APP_SECRET" and not app_secret:
                app_secret = v
            elif k == "FEISHU_BASE_TOKEN" and not base_token:
                base_token = v

    return {
        "found": bool(app_secret or (app_id and base_token)),
        "appId": app_id,
        "appSecret": app_secret,
        "baseToken": base_token,
    }


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
    s = (raw or "").strip()
    s = re.sub(r'^[\[\]"\'\s]+|[\[\]"\'\s]+$', "", s)
    if "," in s:
        parts = [p.strip().strip('"\'') for p in s.split(",") if p.strip()]
        if len(parts) > 1 and len(set(parts)) == 1:
            s = parts[0]
    return s.strip()


def extract_clean_slug(raw_dir: str) -> str:
    cleaned = normalize_feishu_cell_text(raw_dir).replace("\\", "/").strip("/")
    if not cleaned:
        return ""
    m = re.search(r"(\d{8}_[^/#?\s]+)", cleaned)
    if m:
        return m.group(1)
    parts = [p for p in cleaned.split("/") if p]
    if not parts:
        return ""
    last = parts[-1]
    sub_names = {"成片", "04_成片", "04_发布与成片", "09_发布与交付", "publish_pack", "封面", "covers", "slides", "images", "文案"}
    if last.lower() in {s.lower() for s in sub_names}:
        return parts[-2] if len(parts) >= 2 else ""
    return last


def parse_dispatch_account(raw_account: str, raw_site: str, brand_hints_cfg: dict[str, str]) -> tuple[str, str, str]:
    acct = normalize_feishu_cell_text(raw_account)
    acct_clean = re.sub(r"[.。·\s]+$", "", acct).strip()
    site_in = normalize_feishu_cell_text(raw_site).lower()

    brand_folder_hint = ""
    probe_text = f"{acct_clean} {site_in}".lower()
    for kw, folder_kw in (brand_hints_cfg or {}).items():
        if kw.lower() in probe_text:
            brand_folder_hint = folder_kw
            break
    if not brand_folder_hint and "·" in acct_clean:
        brand_folder_hint = acct_clean.split("·", 1)[1].strip()

    if site_in in SITE_URLS or site_in in ("all", "finder", "none", "local"):
        return site_in, acct_clean, brand_folder_hint

    combined = f"{acct_clean} {raw_site}".strip()
    if not combined:
        return "finder", "", brand_folder_hint

    lower_comb = combined.lower()
    if lower_comb in ("all", "全部", "四平台", "全平台"):
        return "all", acct_clean, brand_folder_hint

    for keywords, mapped_site in PLATFORM_KEYWORD_RULES:
        if any(k in lower_comb for k in keywords):
            return mapped_site, acct_clean or combined, brand_folder_hint

    if site_in:
        return SITE_URLS.get(site_in, ("", ""))[0] and site_in or "finder", acct_clean, brand_folder_hint
    return "finder", acct_clean, brand_folder_hint


def is_valid_publish_pack_json(path: Path) -> bool:
    """严格校验 JSON 是否为真正的 PublishPack 发布包（排除 publish_receipt.json / words.json / sources.json 等辅助文件）"""
    if not path or not path.is_file():
        return False
    lower_name = path.name.lower()
    skip_tokens = ("receipt", "state", "meta", "words", "sources", "config", "package", "manifest", "schema")
    if any(tok in lower_name for tok in skip_tokens):
        return False
    try:
        if path.stat().st_size > 2 * 1024 * 1024:
            return False
        obj = json.loads(path.read_text(encoding="utf-8"))
        return isinstance(obj, dict) and any(k in obj for k in ("specVersion", "platforms", "default"))
    except Exception:
        return False


def find_explicit_pack_file(base_dir: Path) -> Path | None:
    if not base_dir or not base_dir.is_dir():
        return None
    json_cands = sorted(base_dir.glob("*.pack.json")) + sorted(base_dir.glob("publish*.json"))
    valid_json_packs = [p for p in json_cands if is_valid_publish_pack_json(p)]
    if valid_json_packs:
        return valid_json_packs[-1]
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


def infer_video_version_label(video_path: Path) -> str:
    m = re.search(r"(?i)(?:^|[_\-\s.])v(\d{1,3})(?:\.(\d{1,3}))?(?=$|[_\-\s.\u4e00-\u9fa5])", video_path.stem)
    if not m:
        return ""
    major = int(m.group(1))
    minor = m.group(2)
    return f"v{major}.{int(minor)}" if minor is not None else f"v{major}"


def score_video_candidate(video_path: Path, is_delivery_dir: bool) -> tuple:
    """
    正片命名优先级排序规则（由高到低）：
    1. 排除预览/分块/分轨/草稿（is_full_film=1 优先于 720p/预览/chunk 等）；
    2. 正式成片交付目录优先于工程/根目录；
    3. 最大显式 vN 版本号优先（如 v3 > v2 > v1）；
    4. 正片主关键词优先（响度标准/终版/发布版 > 成片/标准/发布 > 普通命名）；
    5. 同等条件下取最新修改时间（mtime）。
    """
    stem_lower = video_path.stem.lower()
    preview_tokens = (
        "预览",
        "preview",
        "720p",
        "480p",
        "360p",
        "proxy",
        "chunk",
        "draft",
        "草稿",
        "分轨",
        "无字幕",
    )
    is_full_film = 0 if any(tok in stem_lower for tok in preview_tokens) else 1

    ver_matches = list(
        re.finditer(r"(?i)(?:^|[_\-\s.])v(\d{1,3})(?:\.(\d{1,3}))?(?=$|[_\-\s.\u4e00-\u9fa5])", video_path.stem)
    )
    if ver_matches:
        last_m = ver_matches[-1]
        ver_major = int(last_m.group(1))
        ver_minor = int(last_m.group(2)) if last_m.group(2) is not None else 0
    else:
        ver_major, ver_minor = 0, 0

    if any(k in stem_lower for k in ("响度标准", "终版", "发布版", "定稿", "master", "final")):
        master_tier = 3
    elif any(k in stem_lower for k in ("标准", "成片", "发布")):
        master_tier = 2
    else:
        master_tier = 0

    try:
        mtime = video_path.stat().st_mtime
    except OSError:
        mtime = 0.0

    return (is_full_film, 1 if is_delivery_dir else 0, ver_major, ver_minor, master_tier, mtime, video_path.name)


def find_primary_video_file(pack_dir: Path | None, project_dir: Path | None) -> Path | None:
    video_exts = {".mp4", ".mov", ".m4v", ".webm"}
    search_entries: list[tuple[Path, bool]] = []
    if pack_dir:
        is_deliv = pack_dir != project_dir
        search_entries.append((pack_dir, is_deliv))
    if project_dir:
        for rel, is_deliv in (
            ("04_发布与成片", True),
            ("成片", True),
            ("04_成片", True),
            ("07_导出/成片", True),
            ("09_发布与交付", True),
            ("03_工程", False),
            ("", False),
        ):
            cand_dir = (project_dir / rel) if rel else project_dir
            search_entries.append((cand_dir, is_deliv))

    seen_dirs: set[Path] = set()
    scored_videos: list[tuple[tuple, Path]] = []
    for folder, is_deliv in search_entries:
        if not folder or not folder.is_dir():
            continue
        resolved_folder = folder.resolve()
        if resolved_folder in seen_dirs:
            continue
        seen_dirs.add(resolved_folder)
        for p in sorted(resolved_folder.iterdir()):
            if p.is_file() and p.suffix.lower() in video_exts and not p.name.startswith("."):
                scored_videos.append((score_video_candidate(p, is_deliv), p))

    if not scored_videos:
        return None
    scored_videos.sort(key=lambda item: item[0])
    return scored_videos[-1][1]


def reveal_in_file_manager(pack_dir: Path, project_dir: Path) -> str:
    video_file = find_primary_video_file(pack_dir, project_dir)
    target_dir = pack_dir if pack_dir.is_dir() else project_dir

    try:
        if sys.platform == "darwin":
            if video_file and video_file.is_file():
                subprocess.Popen(["open", "-R", str(video_file)])
                return f"Finder 已定位并选中视频：{video_file.name}"
            subprocess.Popen(["open", str(target_dir)])
            return f"Finder 已打开目录：{target_dir.name}"

        if sys.platform == "win32":
            if video_file and video_file.is_file():
                subprocess.Popen(["explorer", f"/select,{video_file}"])
                return f"资源管理器已选中视频：{video_file.name}"
            subprocess.Popen(["explorer", str(target_dir)])
            return f"资源管理器已打开目录：{target_dir.name}"

        subprocess.Popen(["xdg-open", str(target_dir)])
        return f"已打开本地目录：{target_dir.name}"
    except Exception:
        return f"本地目录就绪：{target_dir.name}"


def archive_creator_downloads(workspace_root: Path, cfg: dict, hours: float = 24.0, move: bool = True) -> dict:
    """
    100% 纯标准库内置下载报表归档器（无外部 CLI 依赖）：
    扫描 ~/Downloads 下由插件重命名的 W<周>_<日期>导出_<平台>_<账号>_*.(xlsx|csv)，
    自动匹配工作空间下的账号目录 `05_数据复盘/数据导出/`（或可配置的 downloadsArchiveDir）归档去重。
    """
    dl_dir = Path.home() / "Downloads"
    if not dl_dir.is_dir():
        return {"ok": True, "archived_count": 0, "files": [], "dest_dir": ""}

    cutoff = time.time() - max(0.5, hours) * 3600.0
    pat = re.compile(r"^W\d{2}_\d{8}导出_([^_]+)_([^_]+)_(.+)\.(xlsx|csv)$", re.IGNORECASE)
    custom_archive_base = cfg.get("downloadsArchiveDir")

    def locate_dest_dir(acct_token: str) -> Path:
        if custom_archive_base:
            return Path(custom_archive_base).expanduser().resolve() / acct_token
        areas = workspace_root / "2 AH领域·Areas"
        if areas.is_dir():
            for sub in sorted(areas.iterdir()):
                if not sub.is_dir() or sub.name.startswith("."):
                    continue
                if acct_token.lower() in sub.name.lower() or (sub / "05_数据复盘").is_dir():
                    if acct_token.lower() in sub.name.lower():
                        return sub / "05_数据复盘" / "数据导出"
            # 若未精确命中子文件夹名，检查是否有唯一活跃账号目录
        return workspace_root / "数据导出" / acct_token

    archived_files: list[str] = []
    last_dest = ""

    for f in sorted(dl_dir.iterdir()):
        if not f.is_file() or f.name.startswith("."):
            continue
        try:
            if f.stat().st_mtime < cutoff:
                continue
        except OSError:
            continue

        m = pat.match(f.name)
        if not m:
            continue

        acct_token = m.group(2).strip()
        dest_dir = locate_dest_dir(acct_token)
        dest_dir.mkdir(parents=True, exist_ok=True)
        dest_path = dest_dir / f.name

        # 若目标已存在且哈希完全一致，直接清理下载目录副本
        if dest_path.is_file():
            h_src = hashlib.sha256(f.read_bytes()).hexdigest()
            h_dst = hashlib.sha256(dest_path.read_bytes()).hexdigest()
            if h_src == h_dst:
                if move:
                    f.unlink(missing_ok=True)
                continue

        if move:
            shutil.move(str(f), str(dest_path))
        else:
            shutil.copy2(str(f), str(dest_path))
        archived_files.append(dest_path.name)
        last_dest = str(dest_dir)

    return {
        "ok": True,
        "archived_count": len(archived_files),
        "files": archived_files,
        "dest_dir": last_dest,
    }


class BridgeState:
    def __init__(
        self,
        workspace_root: Path,
        fallback_roots: list[Path],
        initial_pack_dir: Path | None,
        pack_subdirs: list[str],
        brand_hints: dict[str, str],
        raw_cfg: dict,
    ) -> None:
        self.workspace_root = workspace_root.resolve()
        # 使用纯字符串规范化保存外置/NAS 兜底盘路径，避免断网挂载盘在启动时触发内核阻塞
        self.fallback_roots = [Path(os.path.abspath(str(r))) for r in fallback_roots if str(r).strip()]
        self.active_pack_dir: Path | None = initial_pack_dir.resolve() if initial_pack_dir else None
        self.active_project_dir: Path | None = initial_pack_dir.parent.resolve() if initial_pack_dir else None
        self.active_work_slug: str = initial_pack_dir.parent.name if initial_pack_dir else ""
        self.active_c_record_id: str = ""
        self.active_c_serial_no: str = ""
        self.active_b_record_id: str = ""
        self.active_local_missing: bool = False
        self.active_target_account: str = ""
        self.pack_subdirs = pack_subdirs
        self.brand_hints = brand_hints
        self.raw_cfg = raw_cfg
        self.pack_version = str(int(time.time() * 1000))
        self.last_finder_target = ""
        self.last_finder_ts = 0.0
        self.collect_queue: list[dict] = []
        self.review_tokens: dict[str, dict] = {}
        self._review_lock = threading.Lock()

    def register_review_video(self, video_path: Path, project_name: str = "", version: str = "", ttl: int = 7200) -> dict:
        checked = self.assert_inside_allowed_roots(video_path)
        if not checked.is_file():
            raise FileNotFoundError(f"视频文件不存在：{checked}")
        st = checked.stat()
        if st.st_size <= 0:
            raise ValueError("视频文件大小为 0，无法审阅")
        mime_map = {
            ".mp4": "video/mp4",
            ".m4v": "video/mp4",
            ".mov": "video/quicktime",
            ".webm": "video/webm",
        }
        mime = mime_map.get(checked.suffix.lower()) or mimetypes.guess_type(str(checked))[0] or "video/mp4"
        now = time.time()
        token = secrets.token_urlsafe(24)
        entry = {
            "token": token,
            "path": str(checked),
            "name": checked.name,
            "size": st.st_size,
            "mime": mime,
            "lastModified": int(st.st_mtime * 1000),
            "projectName": project_name,
            "version": version,
            "expiresAt": now + max(60, min(86400, int(ttl))),
        }
        with self._review_lock:
            expired = [k for k, v in self.review_tokens.items() if v.get("expiresAt", 0) < now]
            for k in expired:
                self.review_tokens.pop(k, None)
            self.review_tokens[token] = entry
        return entry

    def get_review_video_entry(self, token: str) -> dict | None:
        if not token or not re.fullmatch(r"[A-Za-z0-9_-]{24,48}", token):
            return None
        now = time.time()
        with self._review_lock:
            entry = self.review_tokens.get(token)
            if not entry or entry.get("expiresAt", 0) < now:
                self.review_tokens.pop(token, None)
                return None
            return dict(entry)

    def all_allowed_roots(self) -> list[Path]:
        roots = [self.workspace_root]
        for r in self.fallback_roots:
            if r not in roots:
                roots.append(r)
        return roots

    def assert_inside_allowed_roots(self, candidate: Path) -> Path:
        resolved = candidate.resolve()
        for idx, root in enumerate(self.all_allowed_roots()):
            root_cmp = root if idx > 0 else root.resolve()
            for base_probe in (root_cmp, Path(os.path.realpath(str(root_cmp))) if idx == 0 else root_cmp):
                try:
                    resolved.relative_to(base_probe)
                    return resolved
                except ValueError:
                    continue
        raise PermissionError(f"路径越界（不在允许的工作空间根目录内）：{candidate}")

    def set_active_context(
        self,
        project_dir: Path | None,
        pack_dir: Path | None,
        *,
        work_slug: str = "",
        target_account: str = "",
        c_record_id: str = "",
        c_serial_no: str = "",
        b_record_id: str = "",
        local_missing: bool = False,
    ) -> None:
        self.active_project_dir = project_dir.resolve() if project_dir else None
        self.active_pack_dir = pack_dir.resolve() if pack_dir else None
        self.active_work_slug = work_slug or (extract_clean_slug(project_dir.name) if project_dir else "")
        self.active_target_account = target_account
        self.active_c_record_id = c_record_id
        self.active_c_serial_no = c_serial_no
        self.active_b_record_id = b_record_id
        self.active_local_missing = local_missing
        suffix = self.active_work_slug or (self.active_pack_dir.name if self.active_pack_dir else "cloud")
        self.pack_version = f"{int(time.time() * 1000)}_{suffix}"

    def _search_single_root(self, root: Path, cleaned: str, brand_hint: str, is_fallback_mount: bool) -> Path | None:
        direct = (root / cleaned).resolve()
        if direct.exists():
            return self.assert_inside_allowed_roots(direct)

        pure_name = extract_clean_slug(cleaned) or Path(cleaned).name
        candidates: list[Path] = []

        # 1. 支持标准 AIHub 多领域结构（定向拼接）
        areas_dir = root / "2 AH领域·Areas"
        has_aihub_layout = areas_dir.is_dir()
        if has_aihub_layout:
            for acc_dir in sorted(areas_dir.iterdir()):
                if not acc_dir.is_dir() or acc_dir.name.startswith("."):
                    continue
                work_cand = acc_dir / "04_作品" / pure_name
                if work_cand.is_dir():
                    candidates.append(work_cand)

        projects_dir = root / "1 AH项目·Projects"
        if not candidates and projects_dir.is_dir():
            proj_direct = projects_dir / pure_name
            if proj_direct.is_dir():
                candidates.append(proj_direct)
            elif not is_fallback_mount:
                for sub_proj in sorted(projects_dir.iterdir()):
                    if sub_proj.is_dir() and not sub_proj.name.startswith("."):
                        nested = sub_proj / pure_name
                        if nested.is_dir():
                            candidates.append(nested)

        if not candidates and has_aihub_layout and not is_fallback_mount:
            for acc_dir in sorted(areas_dir.iterdir()):
                if not acc_dir.is_dir() or acc_dir.name.startswith("."):
                    continue
                topic_cand = acc_dir / "01_选题库" / pure_name
                if topic_cand.is_dir():
                    candidates.append(topic_cand)

        archives_dir = root / "4 AH归档·Archives"
        if not candidates and archives_dir.is_dir():
            patterns = (pure_name, f"*/{pure_name}") if is_fallback_mount else (pure_name, f"*/{pure_name}", f"*/*/{pure_name}")
            for pattern in patterns:
                for matched in sorted(archives_dir.glob(pattern)):
                    if matched.is_dir():
                        candidates.append(matched)

        # 通用任意文件夹结构兜底（仅在非 AIHub 布局的本机自定义工作区启用）
        if not candidates and not has_aihub_layout and not is_fallback_mount:
            for pattern in (f"*/{pure_name}", f"*/*/{pure_name}"):
                for matched in sorted(root.glob(pattern)):
                    if matched.is_dir() and not any(part.startswith(".") for part in matched.parts):
                        candidates.append(matched)

        if candidates:
            if brand_hint:
                branded = [c for c in candidates if brand_hint.lower() in str(c).lower()]
                if branded:
                    return self.assert_inside_allowed_roots(branded[0])
            return self.assert_inside_allowed_roots(candidates[0])
        return None

    def resolve_work_directory(self, raw_dir_or_path: str, brand_hint: str = "") -> Path:
        norm_raw = normalize_feishu_cell_text(raw_dir_or_path)
        if not norm_raw:
            raise ValueError("本地作品目录参数 (dir / path) 不能为空")
        if ".." in Path(norm_raw).parts:
            raise PermissionError("非法路径参数（禁止包含 ..）")

        # 优先兼容直接传入本机绝对路径（例如 /Users/.../04_作品/20261118_xxx/04_发布与成片）
        abs_cand = Path(norm_raw).expanduser()
        if abs_cand.is_absolute() and abs_cand.exists():
            return self.assert_inside_allowed_roots(abs_cand)

        cleaned = norm_raw.lstrip("/\\")

        for idx, root in enumerate(self.all_allowed_roots()):
            is_fallback_mount = idx > 0 or str(root).startswith("/Volumes/")
            if not is_fallback_mount:
                found = self._search_single_root(root, cleaned, brand_hint, False)
                if found is not None:
                    return found
            else:
                # 对外置归档盘 / NAS SMB 挂载点加 1.2s 硬超时守护：即使断网卡死也绝不阻塞打开发布页！
                holder: list[Path | Exception] = []

                def _worker(r: Path = root) -> None:
                    try:
                        res = self._search_single_root(r, cleaned, brand_hint, True)
                        if res is not None:
                            holder.append(res)
                    except Exception as e:
                        holder.append(e)

                t = threading.Thread(target=_worker, daemon=True)
                t.start()
                t.join(timeout=1.2)
                if holder:
                    if isinstance(holder[0], PermissionError):
                        raise holder[0]
                    if isinstance(holder[0], Path):
                        return holder[0]

        raise FileNotFoundError(f"本机暂未找到目录「{cleaned}」")

    def locate_pack_dir(self, project_or_pack_path: Path, explicit_pack_rel: str = "") -> tuple[Path, Path]:
        base = project_or_pack_path if project_or_pack_path.is_dir() else project_or_pack_path.parent

        if explicit_pack_rel.strip():
            sub_clean = normalize_feishu_cell_text(explicit_pack_rel).lstrip("/\\")
            if ".." in Path(sub_clean).parts:
                raise PermissionError("非法 pack 子路径")
            cand_rel_project = (base / sub_clean).resolve()
            if cand_rel_project.is_dir():
                return base, self.assert_inside_allowed_roots(cand_rel_project)

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
    work_slug: str,
    c_record_id: str,
    c_serial_no: str,
    b_record_id: str,
    local_missing: bool,
    target_urls: list[str],
    pack_version: str,
) -> str:
    esc_folder = html.escape(folder_label)
    esc_rel = html.escape(resolved_rel_path)
    esc_pack = html.escape(
        "☁️ 将在页面内由插件自动拉取飞书云端兜底文案"
        if local_missing
        else (pack_file_name or "仅定位视频与目录")
    )
    esc_finder = html.escape(finder_msg)
    esc_site = html.escape(site_name)
    esc_acct = html.escape(account_label)
    urls_json = json.dumps(target_urls, ensure_ascii=False)
    primary_url = target_urls[0] if target_urls else ""

    badge_color = "#d97706" if local_missing else "#ff2442"
    badge_text = "☁️ 飞书云端兜底调度（NAS 尚未同步至本机）" if local_missing else "飞书发布调度 · 全平台半自动发布助手"

    return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="referrer" content="no-referrer" />
  <title>正在调度发布 · {esc_acct or esc_site}</title>
  <style>
    * {{ box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif; }}
    body {{ min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #f7f8fa; color: #1f2329; padding: 24px; }}
    .card {{ width: 100%; max-width: 500px; background: #fff; border-radius: 16px; padding: 28px; box-shadow: 0 12px 36px rgba(15,23,42,0.08); border: 1px solid rgba(31,35,41,0.08); }}
    .badge {{ display: inline-block; padding: 4px 10px; border-radius: 999px; background: {badge_color}; color: #fff; font-size: 12px; font-weight: 600; margin-bottom: 14px; }}
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
       data-work-slug="{html.escape(work_slug)}"
       data-c-record-id="{html.escape(c_record_id)}"
       data-c-serial-no="{html.escape(c_serial_no)}"
       data-b-record-id="{html.escape(b_record_id)}"
       data-local-missing="{'1' if local_missing else '0'}"
       data-pack-version="{html.escape(pack_version)}"
       data-target-urls='{html.escape(urls_json)}'>
    <span class="badge">{badge_text}</span>
    <h1>📂 {esc_folder}</h1>
    <div class="path-sub">📍 {esc_rel}</div>
    <div class="meta">
      <div>🎯 目标平台：<strong>{esc_site}</strong></div>
      <div>🖥️ <strong>{esc_finder}</strong></div>
      <div>📄 文案与配图：<strong>{esc_pack}</strong>{'' if local_missing else f'（{cover_count} 张配图）'}</div>
    </div>
    <div class="status" id="ppf-sync-msg">
      ⏳ 正在将排期关联与素材信息透传至浏览器插件...
    </div>
    <div class="btns">
      {f'<a class="btn" id="ppf-fallback-link" href="{html.escape(primary_url)}" rel="noreferrer noopener" referrerpolicy="no-referrer">立即前往 {esc_site} 发布页 →</a>' if primary_url else ''}
    </div>
  </div>
  <script>
    const urls = {urls_json};
    setTimeout(() => {{
      const el = document.getElementById('ppf-feishu-launchpad');
      if (el && el.getAttribute('data-ext-handled') === '1') return;
      if (urls.length === 1) {{
        const a = document.createElement('a');
        a.href = urls[0];
        a.rel = 'noreferrer noopener';
        a.referrerPolicy = 'no-referrer';
        document.body.appendChild(a);
        a.click();
      }} else if (urls.length > 1) {{
        document.getElementById('ppf-sync-msg').textContent = '✅ 已就绪！请启用 Chrome 插件以支持四端齐开。';
      }} else {{
        document.getElementById('ppf-sync-msg').textContent = '✅ 本地操作已完成！';
      }}
    }}, 900);
  </script>
</body>
</html>"""


def build_cutcheck_launchpad_html(
    *,
    tok_info: dict,
    cutcheck_url: str,
    work_slug: str,
    b_record_id: str = "",
) -> str:
    size_mb = round(int(tok_info.get("size", 0)) / (1024 * 1024), 1)
    return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="referrer" content="no-referrer" />
  <title>正在打开 Cutcheck 在线审片...</title>
  <style>
    * {{ box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; }}
    body {{ margin: 0; background: #f5f5f2; color: #171a18; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 24px; }}
    .card {{ width: 100%; max-width: 560px; background: #fff; border-radius: 16px; border: 1px solid #d9dedb; box-shadow: 0 12px 32px rgba(17,31,25,0.08); padding: 26px 28px; }}
    .badge {{ display: inline-block; padding: 3px 9px; border-radius: 6px; font-size: 12px; font-weight: 700; background: #16624f; color: #fff; margin-bottom: 10px; }}
    h1 {{ font-size: 18px; margin: 0 0 12px; }}
    .meta {{ background: #f5f6f4; border-radius: 10px; padding: 12px 14px; font-size: 13px; line-height: 1.65; color: #4e5969; margin-bottom: 14px; word-break: break-all; }}
    .meta b {{ color: #171a18; }}
    .status {{ font-size: 13.5px; color: #16624f; font-weight: 600; }}
  </style>
</head>
<body>
  <div class="card" id="ppf-cutcheck-launchpad"
       data-review-token="{html.escape(tok_info['token'])}"
       data-video-path="{html.escape(tok_info['path'])}"
       data-video-name="{html.escape(tok_info['name'])}"
       data-video-size="{tok_info['size']}"
       data-video-mime="{html.escape(tok_info['mime'])}"
       data-last-modified="{tok_info['lastModified']}"
       data-project="{html.escape(tok_info.get('projectName', ''))}"
       data-version="{html.escape(tok_info.get('version', ''))}"
       data-work-slug="{html.escape(work_slug)}"
       data-b-record-id="{html.escape(b_record_id)}"
       data-target-url="{html.escape(cutcheck_url)}">
    <span class="badge">🎬 Cutcheck 在线审片直连</span>
    <h1>已锁定本机成片：{html.escape(tok_info['name'])}</h1>
    <div class="meta">
      <div><b>项目 / 版本：</b>{html.escape(tok_info.get('projectName') or work_slug or '—')} {f"({html.escape(tok_info['version'])})" if tok_info.get('version') else ""}</div>
      <div><b>视频大小：</b>{size_mb} MB（纯本机内存回环加载 · 0 字节上传外网）</div>
      <div><b>原始路径：</b>{html.escape(tok_info['path'])}</div>
    </div>
    <div class="status" id="ppf-cutcheck-msg">⏳ 正在唤起 Cutcheck 在线审片并自动注入视频...</div>
  </div>
  <script>
    setTimeout(() => {{
      const el = document.getElementById('ppf-cutcheck-launchpad');
      if (el && el.getAttribute('data-ext-handled') === '1') return;
      // 若浏览器未启用插件，自动在 Finder 高亮该视频并跳往线上 Cutcheck 供手动点选
      fetch('/api/open-finder?dir=' + encodeURIComponent({json.dumps(work_slug or tok_info['path'], ensure_ascii=False)})).catch(() => {{}});
      const a = document.createElement('a');
      a.href = {json.dumps(cutcheck_url, ensure_ascii=False)};
      a.rel = 'noreferrer noopener';
      a.referrerPolicy = 'no-referrer';
      document.body.appendChild(a);
      a.click();
    }}, 950);
  </script>
</body>
</html>"""


def make_handler(state: BridgeState):
    class PackBridgeHandler(BaseHTTPRequestHandler):
        def log_message(self, fmt: str, *args) -> None:
            parsed_path = urllib.parse.urlparse(self.path).path
            if parsed_path in QUIET_POLL_PATHS:
                return
            sys.stdout.write(f"[Bridge] {self.address_string()} - {fmt % args}\n")

        def _send_cors_headers(self) -> None:
            origin = (self.headers.get("Origin") or "").strip()
            if (
                origin in ALLOWED_CUTCHECK_ORIGINS
                or origin.startswith("chrome-extension://")
                or origin.startswith("http://127.0.0.1:")
                or origin.startswith("http://localhost:")
            ):
                self.send_header("Access-Control-Allow-Origin", origin)
                self.send_header("Vary", "Origin")
                self.send_header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
                self.send_header("Access-Control-Allow-Headers", "Range, Content-Type")
                self.send_header(
                    "Access-Control-Expose-Headers",
                    "Content-Length, Content-Range, Accept-Ranges, X-Video-Name, X-Video-Mtime",
                )
                self.send_header("Access-Control-Allow-Private-Network", "true")

        def do_OPTIONS(self) -> None:
            self.send_response(204)
            self._send_cors_headers()
            self.send_header("Content-Length", "0")
            self.end_headers()

        def _send_json(self, payload: dict, status: int = 200) -> None:
            raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self._send_cors_headers()
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
            self.send_header("Referrer-Policy", "no-referrer")
            self.end_headers()
            self.wfile.write(raw)

        def do_GET(self) -> None:
            parsed = urllib.parse.urlparse(self.path)
            qs = urllib.parse.parse_qs(parsed.query)

            if parsed.path == "/downloads":
                dl_dir = Path.home() / "Downloads"
                if dl_dir.is_dir():
                    reveal_in_file_manager(dl_dir, dl_dir)
                self._send_html("<h3>✅ 下载文件夹已打开</h3>")
                return

            if parsed.path == "/api/feishu-bootstrap":
                self._send_json(load_local_feishu_bootstrap(state.raw_cfg))
                return

            if parsed.path == "/api/prepare-review":
                raw_dir = (qs.get("dir") or qs.get("path") or [""])[0]
                raw_project = normalize_feishu_cell_text((qs.get("project") or qs.get("title") or [""])[0])
                raw_version = normalize_feishu_cell_text((qs.get("version") or [""])[0])
                raw_bid = normalize_feishu_cell_text((qs.get("bid") or [""])[0])
                clean_slug = extract_clean_slug(raw_dir)
                try:
                    target_base = state.resolve_work_directory(raw_dir)
                    proj_dir, pack_dir = state.locate_pack_dir(target_base, "")
                except PermissionError as exc:
                    self._send_json({"ok": False, "error": str(exc)}, status=403)
                    return
                except (ValueError, FileNotFoundError):
                    self._send_json({"ok": False, "error": f"本机磁盘/NAS 暂未同步目录：{raw_dir}"}, status=404)
                    return

                video_file = (
                    target_base
                    if (target_base.is_file() and target_base.suffix.lower() in (".mp4", ".mov", ".m4v", ".webm"))
                    else find_primary_video_file(pack_dir, proj_dir)
                )
                if not video_file or not video_file.is_file():
                    self._send_json({"ok": False, "error": f"目录《{proj_dir.name}》内暂未找到成片视频 (.mp4/.mov)"}, status=404)
                    return

                resolved_slug = extract_clean_slug(proj_dir.name) or clean_slug
                project_label = raw_project or resolved_slug or proj_dir.name
                version_label = raw_version or infer_video_version_label(video_file)
                tok_info = state.register_review_video(video_file, project_name=project_label, version=version_label, ttl=7200)
                hash_dict = {"file": str(video_file)}
                if project_label:
                    hash_dict["project"] = project_label
                if version_label:
                    hash_dict["version"] = version_label
                cutcheck_url = f"{CUTCHECK_HOSTED_URL}/#" + urllib.parse.urlencode(hash_dict)
                self._send_json(
                    {
                        "ok": True,
                        "token": tok_info["token"],
                        "videoPath": tok_info["path"],
                        "fileName": tok_info["name"],
                        "size": tok_info["size"],
                        "mime": tok_info["mime"],
                        "lastModified": tok_info["lastModified"],
                        "project": project_label,
                        "version": version_label,
                        "workSlug": resolved_slug,
                        "bRecordId": raw_bid,
                        "cutcheckUrl": cutcheck_url,
                    }
                )
                return

            if parsed.path == "/review" or (
                parsed.path == "/open" and normalize_feishu_cell_text((qs.get("site") or [""])[0]).lower() == "cutcheck"
            ):
                raw_dir = (qs.get("dir") or qs.get("path") or [""])[0]
                raw_project = normalize_feishu_cell_text((qs.get("project") or qs.get("title") or [""])[0])
                raw_version = normalize_feishu_cell_text((qs.get("version") or [""])[0])
                raw_bid = normalize_feishu_cell_text((qs.get("bid") or [""])[0])
                raw_time = (qs.get("t") or qs.get("time") or ["0"])[0]
                raw_host = (qs.get("host") or [CUTCHECK_HOSTED_URL])[0].strip().rstrip("/")
                if not raw_host.startswith(("https://cutcheck-alpha.vercel.app", "http://127.0.0.1:", "http://localhost:")):
                    raw_host = CUTCHECK_HOSTED_URL
                try:
                    start_time = max(0.0, float(raw_time))
                except ValueError:
                    start_time = 0.0

                clean_slug = extract_clean_slug(raw_dir)
                try:
                    target_base = state.resolve_work_directory(raw_dir)
                    proj_dir, pack_dir = state.locate_pack_dir(target_base, "")
                except PermissionError as exc:
                    self._send_html(
                        f"<div style='font-family:sans-serif;padding:32px;'><h2>⚠️ 非法路径被拦截</h2><p>{html.escape(str(exc))}</p></div>",
                        status=403,
                    )
                    return
                except (ValueError, FileNotFoundError):
                    self._send_html(
                        f"<!DOCTYPE html><html><head><meta charset='utf-8'><title>未找到本机作品目录</title></head>"
                        f"<body style='font-family:-apple-system,sans-serif;padding:36px;background:#f5f5f2;color:#171a18;'>"
                        f"<div style='max-width:560px;margin:0 auto;background:#fff;padding:24px 28px;border-radius:14px;border:1px solid #d9dedb;'>"
                        f"<h2 style='margin:0 0 12px;color:#a43d35;'>⚠️ 本机磁盘 / NAS 暂未同步该作品目录</h2>"
                        f"<p style='font-size:14px;line-height:1.6;'>未能在本机工作空间找到目录：<code>{html.escape(raw_dir or '（空）')}</code></p>"
                        f"<p style='font-size:13px;color:#65706b;'>请确认极空间/NAS 已同步该目录到本机，或直接进入 <a href='{CUTCHECK_HOSTED_URL}'>Cutcheck 在线版</a> 手动选片。</p>"
                        f"</div></body></html>",
                        status=404,
                    )
                    return

                video_file = (
                    target_base
                    if (target_base.is_file() and target_base.suffix.lower() in (".mp4", ".mov", ".m4v", ".webm"))
                    else find_primary_video_file(pack_dir, proj_dir)
                )
                if not video_file or not video_file.is_file():
                    self._send_html(
                        f"<!DOCTYPE html><html><head><meta charset='utf-8'><title>未找到可审阅成片</title></head>"
                        f"<body style='font-family:-apple-system,sans-serif;padding:36px;background:#f5f5f2;color:#171a18;'>"
                        f"<div style='max-width:560px;margin:0 auto;background:#fff;padding:24px 28px;border-radius:14px;border:1px solid #d9dedb;'>"
                        f"<h2 style='margin:0 0 12px;color:#8a5d15;'>⚠️ 目录已找到，但暂无成片视频 (.mp4 / .mov)</h2>"
                        f"<p style='font-size:14px;line-height:1.6;word-break:break-all;'>已定位作品目录：<code>{html.escape(str(proj_dir))}</code>，但其中尚未生成视频文件。</p>"
                        f"<p><a href='/open?dir={urllib.parse.quote(clean_slug or proj_dir.name)}&site=finder' style='color:#16624f;font-weight:700;'>📂 在 Finder 打开该作品目录查看</a></p>"
                        f"</div></body></html>",
                        status=404,
                    )
                    return

                resolved_slug = extract_clean_slug(proj_dir.name) or clean_slug
                project_label = raw_project or resolved_slug or proj_dir.name
                version_label = raw_version or infer_video_version_label(video_file)
                tok_info = state.register_review_video(video_file, project_name=project_label, version=version_label, ttl=7200)

                hash_dict: dict[str, str] = {"file": str(video_file)}
                if project_label:
                    hash_dict["project"] = project_label
                if version_label:
                    hash_dict["version"] = version_label
                if start_time > 0:
                    hash_dict["t"] = f"{start_time:g}"
                cutcheck_url = f"{raw_host}/#" + urllib.parse.urlencode(hash_dict)

                self._send_html(
                    build_cutcheck_launchpad_html(
                        tok_info=tok_info,
                        cutcheck_url=cutcheck_url,
                        work_slug=resolved_slug,
                        b_record_id=raw_bid,
                    )
                )
                return

            if parsed.path.startswith("/api/review-video/"):
                parts = [p for p in parsed.path.split("/") if p]
                # /api/review-video/<token> 或 /api/review-video/<token>/meta
                token = parts[2] if len(parts) >= 3 else ""
                is_meta_only = len(parts) >= 4 and parts[3] == "meta"
                entry = state.get_review_video_entry(token)
                if not entry:
                    self._send_json({"ok": False, "error": "审片视频临时令牌不存在或已过期，请从飞书重新点击『在线审片』"}, status=404)
                    return
                vpath = Path(entry["path"])
                if not vpath.is_file():
                    self._send_json({"ok": False, "error": "本机原视频文件已被移动或删除"}, status=404)
                    return
                total_size = vpath.stat().st_size
                if is_meta_only:
                    self._send_json(
                        {
                            "ok": True,
                            "name": entry["name"],
                            "size": total_size,
                            "mime": entry["mime"],
                            "lastModified": entry["lastModified"],
                            "projectName": entry.get("projectName", ""),
                            "version": entry.get("version", ""),
                            "sourcePath": entry["path"],
                        }
                    )
                    return

                # 支持 ?start=0&end=8388607 分片拉取（供扩展 Service Worker 绕过 64MB 消息上限流式转发）以及标准 HTTP Range
                qs_start = (qs.get("start") or [""])[0].strip()
                qs_end = (qs.get("end") or [""])[0].strip()
                range_hdr = (self.headers.get("Range") or "").strip()
                start_byte = 0
                end_byte = total_size - 1
                is_partial = False

                if qs_start != "" or qs_end != "":
                    start_byte = max(0, int(qs_start)) if qs_start else 0
                    end_byte = min(total_size - 1, int(qs_end)) if qs_end else (total_size - 1)
                elif range_hdr.startswith("bytes="):
                    m_rng = re.fullmatch(r"bytes=(\d*)-(\d*)", range_hdr)
                    if m_rng and (m_rng.group(1) or m_rng.group(2)):
                        g1, g2 = m_rng.groups()
                        if g1:
                            start_byte = int(g1)
                            end_byte = min(int(g2), total_size - 1) if g2 else (total_size - 1)
                        else:
                            suffix_len = int(g2)
                            start_byte = max(0, total_size - suffix_len)
                            end_byte = total_size - 1
                        is_partial = True

                if start_byte >= total_size or start_byte > end_byte:
                    self.send_response(416)
                    self._send_cors_headers()
                    self.send_header("Content-Range", f"bytes */{total_size}")
                    self.end_headers()
                    return

                chunk_total = end_byte - start_byte + 1
                self.send_response(206 if is_partial else 200)
                self._send_cors_headers()
                self.send_header("Content-Type", entry["mime"])
                self.send_header("Content-Length", str(chunk_total))
                self.send_header("Accept-Ranges", "bytes")
                if is_partial:
                    self.send_header("Content-Range", f"bytes {start_byte}-{end_byte}/{total_size}")
                self.send_header("Cache-Control", "no-store")
                self.end_headers()

                try:
                    with vpath.open("rb") as fp:
                        fp.seek(start_byte)
                        remaining = chunk_total
                        while remaining > 0:
                            buf = fp.read(min(262144, remaining))
                            if not buf:
                                break
                            self.wfile.write(buf)
                            remaining -= len(buf)
                except (BrokenPipeError, ConnectionResetError):
                    pass
                return

            if parsed.path == "/open":
                raw_dir = (qs.get("dir") or qs.get("path") or [""])[0]
                raw_pack = (qs.get("pack") or [""])[0]
                raw_account = (qs.get("account") or qs.get("acct") or [""])[0]
                raw_site = (qs.get("site") or [""])[0]
                raw_cid = normalize_feishu_cell_text((qs.get("cid") or [""])[0])
                raw_cno = normalize_feishu_cell_text((qs.get("cno") or qs.get("no") or [""])[0])
                raw_bid = normalize_feishu_cell_text((qs.get("bid") or [""])[0])
                open_finder = ((qs.get("finder") or ["1"])[0] or "1").strip() not in ("0", "false", "no")

                # 若直接指向具体文件（如导出的数据报表 .xlsx/.csv），在文件管理器高亮选中（仅针对带文件后缀的路径，避免误触慢速挂载盘）
                cleaned_file_rel = normalize_feishu_cell_text(raw_dir).lstrip("/\\")
                if (
                    cleaned_file_rel
                    and ".." not in Path(cleaned_file_rel).parts
                    and Path(cleaned_file_rel).suffix.lower() in (".xlsx", ".csv", ".pdf", ".mp4", ".mov", ".json", ".md")
                ):
                    cand_file = (state.workspace_root / cleaned_file_rel).resolve()
                    if cand_file.is_file():
                        try:
                            state.assert_inside_allowed_roots(cand_file)
                            reveal_in_file_manager(cand_file.parent, cand_file.parent)
                            if sys.platform == "darwin":
                                subprocess.Popen(["open", "-R", str(cand_file)])
                            self._send_html(
                                f"<!DOCTYPE html><html><head><meta charset='utf-8'><title>本地文件已定位</title></head>"
                                f"<body style='font-family:-apple-system,sans-serif;padding:36px;background:#f7f8fa;color:#1f2329;'>"
                                f"<div style='max-width:560px;margin:0 auto;background:#fff;padding:24px 28px;border-radius:14px;box-shadow:0 4px 20px rgba(0,0,0,0.06);'>"
                                f"<h2 style='margin:0 0 12px;color:#059669;'>📊 已在文件管理器定位原始文件</h2>"
                                f"<p style='font-size:14px;line-height:1.6;word-break:break-all;'><b>文件名：</b>{html.escape(cand_file.name)}</p>"
                                f"</div></body></html>"
                            )
                            return
                        except PermissionError:
                            pass

                site_key, account_label, brand_hint = parse_dispatch_account(
                    raw_account=raw_account,
                    raw_site=raw_site,
                    brand_hints_cfg=state.brand_hints,
                )

                if site_key == "all":
                    site_name = "四平台齐开（小红书 / 视频号 / 抖音 / B站）"
                    target_urls = ALL_FOUR_URLS
                elif site_key in ("none", "finder", "local"):
                    site_name = "仅打开本地目录（不跳转网页）"
                    target_urls = []
                else:
                    site_name, single_url = SITE_URLS.get(site_key, SITE_URLS["xhs"])
                    target_urls = [single_url]

                clean_slug = extract_clean_slug(raw_dir)
                try:
                    target_base = state.resolve_work_directory(raw_dir, brand_hint=brand_hint)
                    project_dir, pack_dir = state.locate_pack_dir(target_base, raw_pack)
                except PermissionError as exc:
                    self._send_html(
                        f"<div style='font-family:sans-serif;padding:32px;'><h2>⚠️ 非法路径被拦截</h2><p>{html.escape(str(exc))}</p></div>",
                        status=403,
                    )
                    return
                except (ValueError, FileNotFoundError):
                    # 关键升级：当 NAS 尚未同步到这台电脑时，绝不报 400 阻断！优雅切换为飞书云端兜底关联模式并照常打开平台网页！
                    if not clean_slug and not raw_cid and not raw_cno and not target_urls:
                        self._send_html(
                            "<div style='font-family:sans-serif;padding:32px;'><h2>⚠️ 未传入目录名且未指定目标平台</h2></div>",
                            status=400,
                        )
                        return
                    state.set_active_context(
                        project_dir=None,
                        pack_dir=None,
                        work_slug=clean_slug,
                        target_account=account_label,
                        c_record_id=raw_cid,
                        c_serial_no=raw_cno,
                        b_record_id=raw_bid,
                        local_missing=True,
                    )
                    page_html = build_launchpad_html(
                        folder_label=clean_slug or "飞书排期直连",
                        resolved_rel_path="本机磁盘/NAS 暂未同步该目录 · 已切换为飞书云端关联模式",
                        pack_file_name="",
                        cover_count=0,
                        finder_msg="本机暂无该文件夹，跳过 Finder 唤起",
                        site_key=site_key,
                        site_name=site_name,
                        account_label=account_label,
                        work_slug=clean_slug,
                        c_record_id=raw_cid,
                        c_serial_no=raw_cno,
                        b_record_id=raw_bid,
                        local_missing=True,
                        target_urls=target_urls,
                        pack_version=state.pack_version,
                    )
                    self._send_html(page_html)
                    return

                resolved_slug = extract_clean_slug(project_dir.name) or clean_slug
                state.set_active_context(
                    project_dir=project_dir,
                    pack_dir=pack_dir,
                    work_slug=resolved_slug,
                    target_account=account_label,
                    c_record_id=raw_cid,
                    c_serial_no=raw_cno,
                    b_record_id=raw_bid,
                    local_missing=False,
                )
                pack_file = find_latest_pack_file(pack_dir, project_dir)
                covers = list_media_image_rel_paths(pack_dir)

                finder_msg = "已跳过文件管理器唤起"
                now = time.time()
                if open_finder:
                    if site_key != "finder" and state.last_finder_target == str(pack_dir) and (now - state.last_finder_ts) < 12.0:
                        finder_msg = f"目录已处于打开状态（{pack_dir.name}）"
                    else:
                        finder_msg = reveal_in_file_manager(pack_dir, project_dir)
                        state.last_finder_target = str(pack_dir)
                        state.last_finder_ts = now

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
                    work_slug=resolved_slug,
                    c_record_id=raw_cid,
                    c_serial_no=raw_cno,
                    b_record_id=raw_bid,
                    local_missing=False,
                    target_urls=target_urls,
                    pack_version=state.pack_version,
                )
                self._send_html(page_html)
                return

            if parsed.path == "/api/open-finder":
                raw_dir = (qs.get("dir") or [""])[0].strip()
                pack_dir = state.active_pack_dir
                proj_dir = state.active_project_dir
                if raw_dir:
                    try:
                        target_base = state.resolve_work_directory(raw_dir)
                        proj_dir, pack_dir = state.locate_pack_dir(target_base, "")
                    except PermissionError as exc:
                        self._send_json({"ok": False, "error": str(exc)}, status=403)
                        return
                    except (ValueError, FileNotFoundError):
                        self._send_json({"ok": False, "error": f"本机磁盘/NAS 暂未找到目录：{raw_dir}"}, status=404)
                        return
                if not pack_dir or not pack_dir.is_dir():
                    self._send_json({"ok": False, "error": "当前尚未关联有效的本机作品目录"}, status=404)
                    return
                msg = reveal_in_file_manager(pack_dir, proj_dir or pack_dir)
                state.last_finder_target = str(pack_dir)
                state.last_finder_ts = time.time()
                self._send_json({"ok": True, "path": str(pack_dir), "msg": msg})
                return

            if parsed.path == "/api/status":
                pack_dir = state.active_pack_dir
                proj_dir = state.active_project_dir
                pack_file = find_latest_pack_file(pack_dir, proj_dir) if pack_dir and pack_dir.is_dir() else None
                self._send_json(
                    {
                        "ok": True,
                        "hasActivePack": bool((pack_dir and pack_dir.is_dir()) or state.active_local_missing),
                        "localMissing": state.active_local_missing,
                        "workSlug": state.active_work_slug,
                        "cRecordId": state.active_c_record_id,
                        "cSerialNo": state.active_c_serial_no,
                        "bRecordId": state.active_b_record_id,
                        "packVersion": state.pack_version,
                        "targetAccount": state.active_target_account,
                        "folderName": f"{proj_dir.name}/{pack_dir.name}" if (proj_dir and pack_dir) else state.active_work_slug,
                        "packFile": pack_file.name if pack_file else "",
                    }
                )
                return

            if parsed.path == "/api/pack":
                pack_dir = state.active_pack_dir
                proj_dir = state.active_project_dir
                if state.active_local_missing:
                    self._send_json(
                        {
                            "packVersion": state.pack_version,
                            "localMissing": True,
                            "workSlug": state.active_work_slug,
                            "cRecordId": state.active_c_record_id,
                            "cSerialNo": state.active_c_serial_no,
                            "bRecordId": state.active_b_record_id,
                            "targetAccount": state.active_target_account,
                            "baseDir": "",
                            "folderName": state.active_work_slug,
                            "packFile": "",
                            "mdFile": "",
                            "format": "cloud_fallback",
                            "content": "",
                            "markdown": "",
                            "subMarkdowns": {},
                            "covers": [],
                        }
                    )
                    return

                if not pack_dir or not pack_dir.is_dir():
                    self._send_json({"error": "尚未选定作品目录"}, status=404)
                    return
                pack_file = find_latest_pack_file(pack_dir, proj_dir)
                content = pack_file.read_text(encoding="utf-8") if (pack_file and pack_file.is_file()) else ""
                is_json = bool(pack_file and pack_file.suffix.lower() == ".json")
                self._send_json(
                    {
                        "packVersion": state.pack_version,
                        "localMissing": False,
                        "workSlug": state.active_work_slug,
                        "cRecordId": state.active_c_record_id,
                        "cSerialNo": state.active_c_serial_no,
                        "bRecordId": state.active_b_record_id,
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

            if parsed.path == "/api/collect":
                pending = [j for j in state.collect_queue if not j.get("acked")]
                self._send_json({"ok": True, "pending": pending})
                return

            self._send_json(
                {
                    "service": "PublishPack Local File Bridge",
                    "version": "2.0.0",
                    "status": "running",
                    "selfContained": True,
                    "workspaceRoot": str(state.workspace_root),
                    "fallbackRoots": [str(r) for r in state.fallback_roots],
                    "activeWorkSlug": state.active_work_slug,
                    "activePackDir": str(state.active_pack_dir) if state.active_pack_dir else None,
                    "packVersion": state.pack_version,
                }
            )

        def do_POST(self) -> None:
            parsed = urllib.parse.urlparse(self.path)
            length = int(self.headers.get("Content-Length") or 0)
            raw_body = self.rfile.read(length).decode("utf-8", errors="ignore") if length > 0 else "{}"
            try:
                body = json.loads(raw_body) if raw_body else {}
            except Exception:
                body = {}

            if parsed.path == "/api/collect":
                data_urls_map = {
                    "xhs": "https://creator.xiaohongshu.com/statistics/data-analysis?source=official",
                    "wx": "https://channels.weixin.qq.com/platform/statistic/post",
                    "bili": "https://member.bilibili.com/platform/data-up/video",
                    "dy": "https://creator.douyin.com/creator-micro/data-center/operation",
                }
                plats = body.get("platforms") or ["xhs", "wx", "bili", "dy"]
                urls = [data_urls_map[p] for p in plats if p in data_urls_map]
                job = {
                    "jobId": f"col_{int(time.time() * 1000)}",
                    "brand": body.get("brand") or "",
                    "platforms": plats,
                    "urls": urls,
                    "autoExport": bool(body.get("auto_export", True)),
                    "createdAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
                    "acked": False,
                }
                state.collect_queue.append(job)
                state.collect_queue = state.collect_queue[-20:]
                self._send_json({"ok": True, "jobId": job["jobId"], "urls": urls})
                return

            if parsed.path == "/api/collect/ack":
                jid = body.get("jobId") or ""
                for j in state.collect_queue:
                    if j["jobId"] == jid or jid == "all":
                        j["acked"] = True
                self._send_json({"ok": True})
                return

            if parsed.path == "/api/archive-downloads":
                hours_val = float(body.get("hours") or 24.0)
                move_val = bool(body.get("move", True))
                res = archive_creator_downloads(state.workspace_root, state.raw_cfg, hours=hours_val, move=move_val)
                self._send_json(res)
                return

            self._send_json({"error": "未知路由"}, status=404)

    return PackBridgeHandler


def main() -> None:
    cfg = load_local_config()
    default_root = detect_default_workspace_root(cfg)
    fallback_roots = [Path(p).expanduser() for p in (cfg.get("fallbackRoots") or [])]
    default_port = int(cfg.get("port") or 8765)
    default_subdirs = list(cfg.get("packSubdirs") or DEFAULT_PACK_SUBDIRS)
    brand_hints = dict(cfg.get("brandFolderHints") or {})

    parser = argparse.ArgumentParser(description="全平台半自动发布助手 · 本地文件桥接服务 (v2.0 自包含版)")
    parser.add_argument("pack_dir", nargs="?", default="", help="可选：初始激活的成品包目录路径")
    parser.add_argument("--root", default=str(default_root), help="主工作空间根目录")
    parser.add_argument("--port", type=int, default=default_port, help=f"监听端口（默认 {default_port}）")
    args = parser.parse_args()

    workspace_root = Path(args.root).expanduser().resolve()
    if not workspace_root.is_dir():
        workspace_root = Path.home().resolve()

    initial_pack = Path(args.pack_dir).expanduser().resolve() if args.pack_dir else None
    state = BridgeState(
        workspace_root=workspace_root,
        fallback_roots=fallback_roots,
        initial_pack_dir=initial_pack,
        pack_subdirs=default_subdirs,
        brand_hints=brand_hints,
        raw_cfg=cfg,
    )

    print("=" * 70)
    print("🚀 全平台半自动发布助手 · 本地桥接服务已启动 (v2.0.0 · 零外部依赖)")
    print(f"📁 主工作空间   : {state.workspace_root}")
    if state.fallback_roots:
        print(f"🗄️ 归档兜底盘   : {', '.join(str(r) for r in state.fallback_roots)}")
    print(f"🔒 本机监听地址 : http://127.0.0.1:{args.port}")
    print("=" * 70)

    server = ThreadingHTTPServer(("127.0.0.1", args.port), make_handler(state))
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n👋 已停止本地桥接服务。")


if __name__ == "__main__":
    main()
