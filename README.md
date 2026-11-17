# Publish Pack Filler · 多平台《发布包》开放协议、飞书直连与浏览器插件 (v1.4)

一套打通 **「飞书多维表格管理 → 本地 Finder 定位视频 + 透传发布包 → 浏览器安全预填与配图」** 的多平台内容分发工具链：
1. **飞书多维表格一键直连 (`127.0.0.1:8765/open`)**：在飞书里点一下公式超链接，自动唤起 macOS Finder 高亮选中主 `.mp4` 视频、将整套文案与高清封面直接透传进浏览器插件，并自动打开目标创作者后台（详见 [`docs/FEISHU_SETUP.md`](./docs/FEISHU_SETUP.md)）。
2. **开放标准协议 (`PublishPack Spec v1.0`)**：支持 **视频 (`video`)、图文轮播 (`image_post`)、专栏长文 (`article`)、短动态 (`post`)、播客音频 (`audio`)** 五大形态，采用「`default` 全局默认层 + `platforms.<id>` 平台覆写与 `options` 子选项」架构。
3. **配套通用 AI Skill (`skills/publish-pack/`)**：适用于 Claude Code、Cursor、Antigravity、Codex（亦附网页版豆包 / Kimi / ChatGPT 通用转换提示词），将任意文稿/字幕/草稿自动转换为合规的 `publish.pack.json` 并通过门禁脚本校验。
4. **Chrome / Edge 浏览器插件 & 油猴脚本**：原生解析 `publish.pack.json`（同时 100% 向后兼容旧版《发布包.md》），支持飞书无感透传、直接粘贴 JSON、选择成品包目录跨平台实时共享配图、一键拟人填表、视频封面比例自动匹配、图文轮播多图一键按序注入。

> **安全边界声明**：本工具严守「纯前端草稿填表辅助」定位——**不代传正片视频、不劫持页面网络请求、绝不自动点击「发布」按钮**，最终核对与发布 100% 由真人物理点击完成。

---

## 📦 一、安装浏览器插件

### 方式 1：Chrome / Edge 独立插件（推荐，免装油猴）
1. 下载本仓库 [`releases/publish-pack-filler-chrome-v1.4.0.zip`](./releases/publish-pack-filler-chrome-v1.4.0.zip) 并解压（或直接克隆本仓库选用 `extension/` 目录）。
2. 打开 `chrome://extensions/`（Edge 打开 `edge://extensions/`），开启右上角 **「开发者模式」**。
3. 点击左上角 **「加载已解压的扩展程序」**，选择解压后的文件夹（内含 `manifest.json`）。

### 方式 2：Tampermonkey（篡改猴）脚本
将根目录下的 [`publish-pack-filler.user.js`](./publish-pack-filler.user.js) 粘贴进 Tampermonkey 新建脚本保存即可。

---

## 🤖 二、使用 AI Skill 或提示词生成标准 `publish.pack.json`

### 1. 在 AI 编程/创作 Agent 中使用 Skill
将 [`skills/publish-pack`](./skills/publish-pack) 目录安装或软链接到你的 Agent Skills 目录（如 `~/.claude/skills/publish-pack` 或 `~/.gemini/config/skills/publish-pack`）：
- 对 AI 说：**「帮我把这期文稿和封面目录整理成 publish.pack.json」**；
- AI 会自动扫描目录图片比例、按各平台硬门禁（小红书 ≤20 字折算、视频号 6–16 字及 7 类标点白名单、抖音 ≤30 字、B站无 `#` 标签与双封面）生成 `publish.pack.json`，并运行 `validate_pack.py` 门禁脚本确保 100% 合规。

### 2. 在网页端大模型（豆包 / Kimi / ChatGPT / Claude）中使用
直接复制 [`skills/publish-pack/references/web-llm-prompt.md`](./skills/publish-pack/references/web-llm-prompt.md) 中的提示词发送给任意网页 AI → 复制 AI 输出的 JSON → 点击插件面板右上角的 **「粘贴JSON」** 即可一键载入全平台文案！

---

## 📐 三、PublishPack v1.0 标准协议与多形态示例

- **完整协议文档**：[`docs/SPEC.md`](./docs/SPEC.md)
- **JSON Schema（支持编辑器自动补全）**：[`schemas/publish-pack.v1.schema.json`](./schemas/publish-pack.v1.schema.json)
- **三大内容形态标准样板**：
  - 🎬 中短视频赛马包：[`examples/video-pack.publish.pack.json`](./examples/video-pack.publish.pack.json)
  - 🖼️ 图文轮播笔记包（多图按序注入）：[`examples/image-carousel.publish.pack.json`](./examples/image-carousel.publish.pack.json)
  - 📰 深度专栏长文包（公众号 / 知乎 / B站专栏）：[`examples/article.publish.pack.json`](./examples/article.publish.pack.json)

---

## 🛠️ 四、本地构建与校验命令

```bash
# 1. 校验任意 publish.pack.json 是否符合各平台门禁（加 --render-md 可导出可读预览）
python3 skills/publish-pack/scripts/validate_pack.py examples/video-pack.publish.pack.json

# 2. 运行 Markdown + PublishPack JSON 双引擎回归单测
node tests/test_parser.mjs

# 3. 同步构建 Chrome 插件目录与 ZIP 发布包
node scripts/build.mjs
```
