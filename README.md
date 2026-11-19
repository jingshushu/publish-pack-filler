# 全平台半自动发布助手 (Publish Pack Filler · v2.0.1)

一套完全自包含、面向多设备与多团队复用的 **「飞书/Lark 多维表格直连 ↔ 云端兜底/本地作品寻址 ↔ 浏览器拟人预填与发前防撞同步」** 全平台内容分发工具链：
1. **插件内置纯 JS 飞书/Lark 直连引擎（零单机环境依赖）**：无需安装外部 CLI 或配置本地环境变量，插件后台直接连接飞书/Lark 多维表格（同时支持 **自建应用 App ID + Secret** 与个人零门槛 **多维表授权码 `pt-...`**，兼容「多表矩阵架构」与「极简单表模式」）。支持一键导出 `PPF2:...` **跨设备配置码**，换任何新电脑 5 秒粘贴即可激活。
2. **发前精准关联 + 云端兜底文案（兼容 NAS 未同步跨设备协作）**：当某台电脑已经加载本地成品包并同步飞书时，自动将精简标准 `PublishPack JSON` 快照备份至飞书云端；换到另一台 NAS 尚未同步完视频目录的电脑时，照常唤起发布后台并从飞书自动拉取全平台云端文案（或通用标题/正文兜底）。
3. **全平台统一「面板黄牌警示 → 点按同步变绿」体验**：彻底告别侵入式遮挡原生发布按钮的浮层，在小红书、微信视频号、抖音、B站右侧面板顶部统一提供醒目的 **「⚠️ 发布前点此同步飞书」** 警示卡，自动探测页面定时时间、核对同号 6h 撞车冲突、写入排期状态与实发标题/话题后 **瞬间变绿（`✅ 已同步飞书`）**，一旦改了页面定时自动退回黄色提醒。
4. **可选本机回环寻址助手 (`127.0.0.1:8765/open`)**：100% Python 标准库自包含（兼容 macOS / Windows / Linux），支持从飞书公式按钮一键唤起本地 Finder/Explorer 高亮主视频并透传高清封面图（详见 [`docs/FEISHU_SETUP.md`](./docs/FEISHU_SETUP.md)）。
5. **开放标准协议 (`PublishPack Spec v1.0`) & AI Skill**：支持 **视频 (`video`)、图文轮播 (`image_post`)、专栏长文 (`article`)、短动态 (`post`)、播客音频 (`audio`)** 五大形态，配套通用 AI Skill（`skills/publish-pack/`）。

> **安全边界声明**：本工具严守「纯前端草稿填表辅助」定位——**不代传正片视频、不劫持页面网络请求、绝不自动点击「发布」按钮**，最终核对与发布 100% 由真人物理点击完成。

---

## 📦 一、安装浏览器插件与 5 秒跨设备激活

### 方式 1：Chrome / Edge 独立插件（推荐，内置飞书直连引擎）
1. 下载本仓库 [`releases/publish-pack-filler-chrome-v2.0.1.zip`](./releases/publish-pack-filler-chrome-v2.0.1.zip) 并解压（或直接克隆本仓库选用 `extension/` 目录）。
2. 打开 `chrome://extensions/`（Edge 打开 `edge://extensions/`），开启右上角 **「开发者模式」**。
3. 点击左上角 **「加载已解压的扩展程序」**，选择解压后的文件夹（内含 `manifest.json`）。
4. **连接飞书多维表**：点击浏览器右上角插件图标 → **「⚙️ 飞书直连与跨设备配置码设置」**：
   - **首次配置**：粘贴多维表链接 + 授权码/应用凭证 → 点击「🔍 测试连接并自动探测表结构」即可自动识别表与列名；可顺手点「☁️ 一键创建『发布包快照』云端兜底列」；
   - **换到第 2 台电脑**：在主力机点「📤 生成跨设备配置码」，到新电脑粘贴 `PPF2:...` 配置码即可 5 秒全套激活！

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
