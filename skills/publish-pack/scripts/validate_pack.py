#!/usr/bin/env python3
"""
PublishPack v1.0 零依赖门禁校验与预览生成器
用法：
  python3 validate_pack.py path/to/publish.pack.json [--check-files] [--render-md]
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

VALID_CONTENT_TYPES = {"video", "image_post", "article", "post", "audio"}
WEIXIN_SHORT_ALLOWED_RE = re.compile(r"^[\u4e00-\u9fa5A-Za-z0-9 《》“”‘’「」：:+？?%℃]+$")


def calc_xhs_len(text: str) -> float:
    total = sum(0.5 if ord(ch) <= 127 else 1.0 for ch in text)
    return round(total, 1)


def validate_pack_dict(data: dict, base_dir: Path | None = None, check_files: bool = False) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []

    if not isinstance(data, dict):
        return ["根节点必须是 JSON Object"], []

    if data.get("specVersion") != "1.0":
        errors.append(f"specVersion 必须为 '1.0'（当前: {data.get('specVersion')!r}）")

    ctype = data.get("contentType")
    if ctype not in VALID_CONTENT_TYPES:
        errors.append(f"contentType 非法: {ctype!r}，允许值: {sorted(VALID_CONTENT_TYPES)}")

    # 检查禁止包含个人绝对路径
    raw_str = json.dumps(data, ensure_ascii=False)
    if "/Users/" in raw_str or "C:\\Users\\" in raw_str:
        errors.append("检测到本机个人绝对路径（/Users/... 或 C:\\Users\\...），请一律改用相对路径")

    default_block = data.get("default") or {}
    platforms = data.get("platforms") or {}
    if not default_block and not platforms:
        errors.append("default 与 platforms 不能同时为空")

    # 校验资产引用
    assets = data.get("assets") or {}
    known_asset_ids: set[str] = set()
    for group_key in ("videos", "covers", "images", "subtitles", "audio"):
        items = assets.get(group_key) or []
        if not isinstance(items, list):
            errors.append(f"assets.{group_key} 必须是数组")
            continue
        for idx, item in enumerate(items):
            if not isinstance(item, dict) or not item.get("path"):
                errors.append(f"assets.{group_key}[{idx}] 缺少必填字段 path")
                continue
            if item.get("id"):
                known_asset_ids.add(item["id"])
            if check_files and base_dir:
                fp = base_dir / item["path"]
                if not fp.is_file():
                    warnings.append(f"本地未找到素材文件: {item['path']}")

    def merged_field(plat_obj: dict, key: str):
        val = plat_obj.get(key)
        return val if val not in (None, "", []) else default_block.get(key)

    # 1. 小红书专项校验
    xhs = platforms.get("xiaohongshu") or platforms.get("xhs")
    if isinstance(xhs, dict) and xhs.get("enabled", True):
        xhs_title = merged_field(xhs, "title") or ""
        if xhs_title:
            wlen = calc_xhs_len(xhs_title)
            if wlen > 20.0:
                errors.append(f"[xiaohongshu] 主标题折算字数 {wlen} > 20.0 上限: {xhs_title!r}")
        for idx, alt in enumerate(xhs.get("altTitles") or []):
            awlen = calc_xhs_len(alt)
            if awlen > 20.0:
                errors.append(f"[xiaohongshu] 备选标题 #{idx + 1} 折算字数 {awlen} > 20.0 上限: {alt!r}")
        for t in merged_field(xhs, "tags") or []:
            if str(t).startswith("#"):
                warnings.append(f"[xiaohongshu] tags 数组请存纯词（去掉开头的 #）: {t!r}")

    # 2. 微信视频号专项校验
    wx = platforms.get("weixin_channels") or platforms.get("weixin")
    if isinstance(wx, dict) and wx.get("enabled", True):
        st = wx.get("shortTitle") or ""
        if st:
            if not (6 <= len(st) <= 16):
                errors.append(f"[weixin_channels] shortTitle 长度必须为 6–16 字（当前 {len(st)} 字）: {st!r}")
            if not WEIXIN_SHORT_ALLOWED_RE.match(st):
                errors.append(
                    f"[weixin_channels] shortTitle 含违规标点（仅允许《》“”‘’「」：+？%℃ 与空格，严禁逗号/感叹号/句号/顿号）: {st!r}"
                )
        for idx, alt in enumerate(wx.get("altTitles") or []):
            if not (6 <= len(alt) <= 16) or not WEIXIN_SHORT_ALLOWED_RE.match(alt):
                errors.append(f"[weixin_channels] 备选短标题 #{idx + 1} 不符合 6–16 字或 7 类符号白名单: {alt!r}")

    # 3. 抖音专项校验
    dy = platforms.get("douyin") or platforms.get("dy")
    if isinstance(dy, dict) and dy.get("enabled", True):
        dy_ctype = dy.get("contentType") or ctype
        dy_title = merged_field(dy, "title") or ""
        limit = 20 if dy_ctype == "image_post" else 30
        if len(dy_title) > limit:
            errors.append(f"[douyin] ({dy_ctype}) 标题长度 {len(dy_title)} > {limit} 字上限: {dy_title!r}")

    # 4. B站专项校验
    bili = platforms.get("bilibili") or platforms.get("bili")
    if isinstance(bili, dict) and bili.get("enabled", True):
        b_title = merged_field(bili, "title") or ""
        if len(b_title) > 80:
            errors.append(f"[bilibili] 标题长度 {len(b_title)} > 80 字符上限")
        b_body = merged_field(bili, "body") or ""
        if re.search(r"https?://", b_body):
            warnings.append("[bilibili] 稿件简介中包含 http/https 外链，可能触发平台折叠或退回")
        b_tags = merged_field(bili, "tags") or []
        if len(b_tags) > 10:
            warnings.append(f"[bilibili] 普通标签数量 {len(b_tags)} > 10，插件将自动截取前 10 个")
        for t in b_tags:
            if "#" in str(t):
                errors.append(f"[bilibili] 普通标签严禁包含 '#' 号: {t!r}")

    return errors, warnings


def render_preview_markdown(data: dict) -> str:
    meta = data.get("meta") or {}
    default_b = data.get("default") or {}
    platforms = data.get("platforms") or {}
    lines = [
        f"# {meta.get('title') or 'PublishPack 多平台发布预览'}",
        "",
        f"- **协议版本**：`PublishPack v{data.get('specVersion', '1.0')}`",
        f"- **内容形态**：`{data.get('contentType')}`",
    ]
    if meta.get("summary"):
        lines.append(f"- **核心摘要**：{meta['summary']}")
    comp = meta.get("compliance") or {}
    if comp:
        lines.append(f"- **合规标识**：AI级别=`{comp.get('aiLevel', 'none')}` · 原创=`{comp.get('isOriginal', True)}`")

    covers = (data.get("assets") or {}).get("covers") or []
    if covers:
        lines.append("- **封面清单**：" + "、".join(f"`{c.get('path')}` ({c.get('ratio', '?')})" for c in covers))

    for pid, pconf in platforms.items():
        if not isinstance(pconf, dict) or not pconf.get("enabled", True):
            continue
        title = pconf.get("shortTitle") or pconf.get("title") or default_b.get("title") or ""
        body = pconf.get("body") or pconf.get("markdown") or default_b.get("body") or default_b.get("markdown") or ""
        tags = pconf.get("tags") or default_b.get("tags") or []
        pinned = pconf.get("pinnedComment") or default_b.get("pinnedComment") or ""
        opts = {**(default_b.get("options") or {}), **(pconf.get("options") or {})}

        lines.extend(["", "---", "", f"## 平台：`{pid}`"])
        if title:
            lines.extend(["- **标题**：", "```text", title, "```"])
        if pconf.get("altTitles"):
            lines.append("- **备选标题**：")
            for idx, at in enumerate(pconf["altTitles"], 1):
                lines.append(f"  {idx}. `{at}`")
        if body:
            lines.extend(["- **正文 / 简介**：", "```text", body, "```"])
        if tags:
            tag_str = ", ".join(tags) if pid == "bilibili" else " ".join(f"#{t}" for t in tags)
            lines.extend(["- **标签**：", "```text", tag_str, "```"])
        if pinned:
            lines.extend(["- **置顶首评**：", "```text", pinned, "```"])
        if opts:
            lines.append(f"- **平台子选项 (`options`)**：`{json.dumps(opts, ensure_ascii=False)}`")

    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description="校验 PublishPack v1.0 JSON 发布包")
    parser.add_argument("pack_json", help="publish.pack.json 文件路径")
    parser.add_argument("--check-files", action="store_true", help="同时检查 assets 本地相对路径文件是否存在")
    parser.add_argument("--render-md", action="store_true", help="同目录导出人类可读的 publish.pack.preview.md")
    args = parser.parse_args()

    json_path = Path(args.pack_json).expanduser().resolve()
    if not json_path.is_file():
        print(f"[FAIL] 文件不存在: {json_path}", file=sys.stderr)
        sys.exit(1)

    try:
        data = json.loads(json_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        print(f"[FAIL] JSON 语法解析失败: {exc}", file=sys.stderr)
        sys.exit(1)

    errors, warnings = validate_pack_dict(data, base_dir=json_path.parent, check_files=args.check_files)

    for w in warnings:
        print(f"[WARN] {w}")
    for e in errors:
        print(f"[FAIL] {e}", file=sys.stderr)

    if errors:
        sys.exit(1)

    if args.render_md:
        md_out = json_path.with_name(json_path.stem + ".preview.md")
        md_out.write_text(render_preview_markdown(data), encoding="utf-8")
        print(f"[INFO] 已导出可读预览: {md_out.name}")

    print("[PASS] ALL CHECKS PASSED")


if __name__ == "__main__":
    main()
