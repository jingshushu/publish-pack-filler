---
name: publish-pack
description: >-
  将任意视频文稿、SRT 字幕、图文卡片、专栏文章或草稿笔记整理转换为符合 PublishPack v1.0 开放协议的多平台标准发布包（`publish.pack.json`），支持视频（`video`）、图文轮播（`image_post`）、长文章（`article`）、短动态（`post`）、播客（`audio`）五大形态及小红书、微信视频号、抖音、B站、快手、公众号/小绿书、知乎、微博、YouTube、X 等平台，并运行门禁脚本校验字数、符号白名单与本地素材映射。当用户说「打包成通用发布包」「生成 publish.pack.json」「转成发布插件格式」「把这个文稿做成多平台发布 JSON」时使用（注：若在特定账号下已有专属私有文案 Skill 如 city-contrast-copy，以专属私有规范优先）。
---

# PublishPack · 通用多平台内容发布包生成与校验 Skill（v1.0）

把创作者手头的任意原始素材（视频配音稿、SRT 字幕、图文文件夹、Markdown 文章或零散卖点），一站式整理并校验输出为标准 **`publish.pack.json`**，供 [Publish Pack Filler](https://github.com/jingshushu/publish-pack-filler) 浏览器插件直接一键导入填表与自动配图。

---

## 一、工作流四步法

### Step 1：盘点本地素材与识别内容形态 (`contentType`)
1. 若用户给出了本地目录路径，先扫描目录内的媒体文件（**只读扫描，绝不重命名或覆盖原文件**）：
   - 存在 `.mp4 / .mov` 视频 → 默认 `"contentType": "video"`，扫描所有 `.png / .jpg / .jpeg / .webp` 封面图及其像素宽高比（`3:4`、`4:3`、`16:9`、`9:16`、`1:1`）；
   - 存在多张编号图片（如 `01.png, 02.png...`）且无主视频 → 默认 `"contentType": "image_post"`（图文轮播笔记），按顺序登记到 `assets.images[]`；
   - 长篇 Markdown / 公众号深度文章 → 默认 `"contentType": "article"`；
   - 简短动态 / 串推 → `"contentType": "post"`；播客音频 → `"contentType": "audio"`。
2. 明确目标分发平台集合（未指定时，中文视频/图文默认覆盖 `xiaohongshu`、`weixin_channels`、`douyin`、`bilibili` 四大平台；长文默认覆盖 `weixin_mp`、`zhihu`、`bilibili`）。

### Step 2：对照平台硬门禁撰写差异化文案与子选项
动笔前先查阅 [`references/platform-rules.md`](references/platform-rules.md)，严守以下硬红线：
1. **小红书 (`xiaohongshu`)**：
   - `title` 及 `altTitles[]` **折算字数必须 `≤ 20.0`**（ASCII 半角字符算 `0.5` 字，汉字与全角标点算 `1.0` 字）；
   - 正文分段自然呼吸，避免生硬营销词；提供 `5–10` 个无 `#` 纯词标签（填入 `tags[]`）及高互动 `pinnedComment` 置顶首评。
2. **微信视频号 (`weixin_channels`)**：
   - `shortTitle` 独立短标题严格控制在 **`6–16` 字**；
   - **7 类允许标点硬白名单**：仅限书名号 `《》`、引号 `“”‘’「」`、冒号 `：`、加号 `+`、问号 `？`、百分号 `%`、摄氏度 `℃` 及空格——**严禁出现逗号、感叹号、顿号、句号、斜杠，停顿一律用空格代替**！
   - 若同时有竖版 `3:4` 与横版 `4:3` 封面，分别绑定至 `coverPortraitRef`（个人主页卡）与 `coverLandscapeRef`（动态转发卡）。
3. **抖音 (`douyin`)**：
   - 独立 `title` 严格 **`≤ 30` 字**；`body` 前 25 字直给核心冲突或信息钩子；`tags` 控制在 `3–5` 个精准词。
4. **B 站 (`bilibili`)**：
   - `title` 展开硬核信息量（`≤ 80` 字符）；
   - `body`（稿件简介）严禁包含站外 `http/https` 导流链接；
   - `tags` 填 `5–10` 个**不带 `#` 的纯词**；双封面分离绑定 `coverLandscapeRef`（`4:3` 推荐流）与 `coverWideRef`（`16:9` 播放页）；在 `options` 中填好 `category`（分区数组）、`topic`（活动话题）与 `dynamicText`（动态转发语）。
5. **AI 合成与原创合规标识 (`meta.compliance` & `options`)**：
   - 若内容包含 AI 生成人声（TTS/声音克隆）或 AI 生成画面，如实将 `meta.compliance.aiLevel` 设为 `"generated"`，并在对应平台的 `options.aiDeclaration` / `selfDeclaration` / `contentLabel` 中标记，方便插件在界面醒目提示创作者勾选。

### Step 3：输出标准 `publish.pack.json`
在目标目录输出 `publish.pack.json`（若未指定本地目录，则在对话中输出完整 JSON 代码块供用户复制粘贴进插件的「📋 粘贴 JSON」入口）：
- 顶层必填 `"specVersion": "1.0"` 与 `"contentType"`；
- `default` 层填好通用基准字段，保证即使未来扩展到新平台也有优雅兜底；
- `platforms` 层按标准平台 ID（`xiaohongshu`, `weixin_channels`, `douyin`, `bilibili`, `kuaishou`, `weixin_mp`, `zhihu`, `weibo`, `youtube`, `tiktok`, `x`, `instagram`, `xiaoyuzhou`）写入各平台专属字段与 `options` 子选项；
- **严禁写入 `/Users/...` 或 `C:\...` 等个人本机绝对路径**，`assets` 内一律使用相对于发布包目录的相对路径（如 `"封面/cover_3x4.png"`）。

### Step 4：必跑自动校验脚本（硬门禁）
落盘 `publish.pack.json` 后，必须运行本 Skill 自带的零依赖校验脚本：
```bash
python3 "<skill-dir>/scripts/validate_pack.py" "<publish.pack.json 路径>" --render-md
```
- 若脚本报出 `[FAIL]`（如小红书标题超 20 字、视频号短标题含中文逗号、封面文件相对路径不存在等），立即修正 JSON 并复跑，直至输出 `ALL CHECKS PASSED`！
- 加 `--render-md` 参数会自动在同目录生成一份人类可读的 `publish.pack.preview.md` 供肉眼速览（不替代插件直接读取 `publish.pack.json`）。

---

## 二、配套参考资源
- 各平台字段门禁与子选项速查表：[`references/platform-rules.md`](references/platform-rules.md)
- 给网页端大模型（豆包 / Kimi / ChatGPT / Claude Web）直接复制使用的单段提示词：[`references/web-llm-prompt.md`](references/web-llm-prompt.md)
