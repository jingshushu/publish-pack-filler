# 网页端大模型通用《PublishPack JSON》生成提示词

> **适用人群**：不使用本地命令行 / Claude Code 的创作者。  
> **用法**：将下方提示词复制到 ChatGPT、Claude、豆包、Kimi、DeepSeek 等任意网页对话框，在末尾粘贴你的视频逐字稿 / 笔记草稿，复制 AI 输出的 JSON 代码块，点击浏览器右侧插件面板上的 **「📋 粘贴 JSON」** 即可一键导入全平台文案！

---

```markdown
你是一位资深多平台新媒体主编。请根据我提供的原始文稿/素材说明，为我生成一份严格符合 `PublishPack v1.0` 标准的 JSON 发布包，只输出一个合法的 ```json 代码块，不要夹杂多余解释。

### 平台硬性合规约束（必须严格满足）：
1. **小红书 (`xiaohongshu`)**：
   - `title` 与 3 个 `altTitles` 折算长度必须 **≤ 20.0 字**（英文字符/数字算 0.5 字，汉字与中文标点算 1 字），绝不超长；
   - `body` 口语化分段有呼吸感；`tags` 给 6–10 个纯词（不要带 `#` 号）；`pinnedComment` 写一条能引发评论区互动投票或地域/经历共鸣的置顶首评。
2. **微信视频号 (`weixin_channels`)**：
   - `shortTitle` 长度必须 **6–16 字**，且符号**仅允许** `《》“”‘’「」：+？%℃` 和空格——**严禁出现逗号、句号、感叹号、顿号**，句子中间停顿一律用**空格**代替！
3. **抖音 (`douyin`)**：
   - `title` 长度 **≤ 30 字**（若为图文 `image_post` 则 ≤ 20 字）；`body` 前 25 字直给冲突钩子；`tags` 给 4–5 个纯词（不带 `#`）。
4. **B 站 (`bilibili`)**：
   - `title` 长度 20–45 字（上限 80 字），突出硬核信息量；`body` 纯文本简介不带任何外部网址；`tags` 给 6–10 个纯词（不带 `#`）；在 `options` 中给出合适的 `category`（如 `["知识", "科学科普"]`）和 `dynamicText`（动态转发语）。

### 目标 JSON 结构模板：
{
  "specVersion": "1.0",
  "contentType": "video",
  "meta": {
    "title": "作品内部标题",
    "summary": "一句话摘要",
    "compliance": { "aiLevel": "none", "isOriginal": true }
  },
  "assets": {
    "covers": [
      { "id": "cover_3x4_a", "path": "封面_3x4.png", "ratio": "3:4", "variant": "A", "label": "竖版主封面" },
      { "id": "cover_4x3_a", "path": "封面_4x3.png", "ratio": "4:3", "variant": "A", "label": "横版封面" },
      { "id": "cover_16x9_a", "path": "封面_16x9.png", "ratio": "16:9", "variant": "A", "label": "宽屏封面" }
    ]
  },
  "default": {
    "title": "通用标题",
    "body": "通用正文",
    "tags": ["标签1", "标签2"],
    "collection": "",
    "pinnedComment": "通用置顶首评"
  },
  "platforms": {
    "xiaohongshu": { "title": "", "altTitles": [], "body": "", "tags": [], "coverRef": "cover_3x4_a", "collection": "", "pinnedComment": "", "options": { "aiDeclaration": "none" } },
    "weixin_channels": { "shortTitle": "", "altTitles": [], "body": "", "tags": [], "coverPortraitRef": "cover_3x4_a", "coverLandscapeRef": "cover_4x3_a", "collection": "", "location": "", "pinnedComment": "", "options": { "isOriginal": true, "contentLabel": "none" } },
    "douyin": { "title": "", "altTitles": [], "body": "", "tags": [], "coverPortraitRef": "cover_3x4_a", "coverLandscapeRef": "cover_4x3_a", "collection": "", "location": "", "pinnedComment": "", "options": { "selfDeclaration": "none" } },
    "bilibili": { "title": "", "body": "", "tags": [], "coverLandscapeRef": "cover_4x3_a", "coverWideRef": "cover_16x9_a", "collection": "", "pinnedComment": "", "options": { "copyright": "original", "category": [], "topic": "", "dynamicText": "" } }
  }
}

---
以下是我的本期原始文稿 / 素材说明：
【在此粘贴你的文稿或核心卖点】
```
