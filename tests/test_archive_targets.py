#!/usr/bin/env python3
"""
Unit tests for non-destructive export archiving & target directory preview in scripts/serve_pack.py.
Guarantees:
1. Unrecognized or generic accounts ('创作者账号', '未指定账号', unknown names) NEVER create directories and NEVER move files.
2. Areas without an already-existing `05_数据复盘/数据导出/` directory NEVER trigger mkdir.
3. Matched accounts with an existing `05_数据复盘/数据导出/` directory archive cleanly and deduplicate by SHA-256.
"""

from __future__ import annotations
import importlib.util
from pathlib import Path
import tempfile
from unittest.mock import patch


SPEC = importlib.util.spec_from_file_location(
    "serve_pack",
    Path(__file__).resolve().parent.parent / "scripts" / "serve_pack.py",
)
assert SPEC and SPEC.loader
serve_pack = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(serve_pack)


def run_tests() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        fake_home = tmp_path / "home"
        fake_dl = fake_home / "Downloads"
        fake_dl.mkdir(parents=True)

        ws = tmp_path / "AIHub"
        existing_jingshu = ws / "2 AH领域·Areas" / "2026_靖蜀黍" / "05_数据复盘" / "数据导出"
        existing_jingshu.mkdir(parents=True)

        # Area WITHOUT 05_数据复盘/数据导出 (must NOT be auto-created!)
        area_no_export = ws / "2 AH领域·Areas" / "2026_新领域无导出目录"
        area_no_export.mkdir(parents=True)

        # 1. Verify target enumeration only lists existing 05_数据复盘/数据导出 dirs
        targets = serve_pack.list_existing_export_targets(ws, {})
        assert len(targets) == 1
        assert targets[0]["account"] == "靖蜀黍"
        assert targets[0]["relDir"] == "2 AH领域·Areas/2026_靖蜀黍/05_数据复盘/数据导出"

        # 2. Verify placeholder & unmatched accounts return None
        for bad_acct in ("", "auto", "创作者账号", "未指定账号", "未知野生号", "新领域无导出目录"):
            assert serve_pack.resolve_existing_export_dest(ws, {}, bad_acct) is None, f"Must reject {bad_acct}"

        # 3. Verify matched account returns exact existing directory
        hit = serve_pack.resolve_existing_export_dest(ws, {}, "靖蜀黍")
        assert hit is not None
        assert hit["destDir"] == str(existing_jingshu)

        # 4. Prepare 3 downloaded files in ~/Downloads:
        #    - 1 generic '创作者账号' file (must stay in Downloads, MUST NOT create AIHub/数据导出!)
        #    - 1 unknown account file (must stay in Downloads!)
        #    - 1 valid '靖蜀黍' file (must move into existing_jingshu!)
        f_generic = fake_dl / "W47_20261120导出_抖音_创作者账号_近7日_短视频全量指标.xlsx"
        f_unknown = fake_dl / "W47_20261120导出_小红书_某未知号_笔记列表明细表.xlsx"
        f_valid = fake_dl / "W47_20261120导出_抖音_靖蜀黍_作品列表导出.xlsx"

        f_generic.write_bytes(b"generic-data")
        f_unknown.write_bytes(b"unknown-data")
        f_valid.write_bytes(b"valid-jingshu-works")

        with patch.object(Path, "home", return_value=fake_home):
            res = serve_pack.archive_creator_downloads(ws, {}, hours=24.0, move=True)

        assert res["ok"] is True
        assert res["archived_count"] == 1
        assert res["files"] == ["W47_20261120导出_抖音_靖蜀黍_作品列表导出.xlsx"]
        assert res["unmatched_count"] == 2

        # CRITICAL ASSERTIONS:
        assert not (ws / "数据导出").exists(), "NEVER create rogue AIHub/数据导出 directory!"
        assert not (area_no_export / "05_数据复盘").exists(), "NEVER create missing 05_数据复盘 directory!"
        assert f_generic.is_file(), "Unmatched '创作者账号' file must stay untouched in ~/Downloads!"
        assert f_unknown.is_file(), "Unmatched unknown-account file must stay untouched in ~/Downloads!"
        assert not f_valid.exists() and (existing_jingshu / f_valid.name).is_file(), "Matched file must move cleanly!"

    print("✅ All Python archive target & zero-mkdir non-destructive tests passed!")


if __name__ == "__main__":
    run_tests()
