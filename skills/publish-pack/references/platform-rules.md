# 主流内容平台字段门禁与子选项速查字典（2026）

生成 `publish.pack.json` 时，请严格核对目标平台的字数、标点、媒体规格与 `options` 子选项约定：

---

## 1. 小红书 (`xiaohongshu`)
- **支持形态**：`video`（视频笔记）、`image_post`（图文笔记，最多 **18** 张图，推荐 `3:4` 比例）、`article`（长文笔记）。
- **标题 (`title` / `altTitles[]`)**：硬上限 **`≤ 20.0` 折算字**（ASCII 半角数字/英文字母按 `0.5` 字计，汉字与全角标点按 `1.0` 字计）。超长会被后台截断。
- **正文 (`body`)**：上限 `1000` 字（短视频/图文高完播推荐 `50–220` 字）。
- **话题 (`tags[]`)**：填不带 `#` 的纯词，推荐 `5–10` 个；后台需唤醒联想框绑定官方蓝字。
- **常用 `options`**：
  - `visibility`: `"public"` | `"private"` | `"friends"`
  - `aiDeclaration`: `"none"` | `"assisted"` | `"ai_generated"`
  - `scheduleAt`: ISO-8601 定时时间（支持未来 1 小时至 14 天）
  - `allowDuet`: 是否允许合拍

## 2. 微信视频号 (`weixin_channels`)
- **支持形态**：`video`、`image_post`。
- **短标题 (`shortTitle`)**：**`6–16` 个字符**（汉字/字母均按字符校验，推荐 `8–15` 字最稳）。
  - **7 类合法标点硬白名单**：仅支持 `《》`、`“”‘’「」`、`：`、`+`、`？`、`%`、`℃` 以及空格！
  - **严禁出现**：逗号（`，` `,`）、感叹号（`！` `!`）、句号（`。` `.`）、顿号（`、`）、斜杠（`/`）、破折号等，停顿一律用**单个空格**代替！
- **描述 (`body`)**：上限 `1000` 字，支持挂 `2–5` 个 `#话题`。
- **双封面映射**：
  - `coverPortraitRef`：`3:4` 竖版（个人主页卡片）
  - `coverLandscapeRef`：`4:3` 横版（视频号动态 / 社交转发卡片）
- **常用 `options`**：
  - `isOriginal`: 是否声明原创
  - `contentLabel`: 视频标注（如 `"含AI生成内容"`、`"个人观点，仅供参考"`、`"内容为转载"`）
  - `externalLink`: 关联的微信公众号文章链接

## 3. 抖音 (`douyin`)
- **支持形态**：`video`、`image_post`（图文最多 **35** 张图）。
- **作品标题 (`title`)**：视频模式上限 **`≤ 30` 字**；**图文模式上限 `≤ 20` 字**！
- **作品简介 (`body` + `tags`)**：视频模式总长上限 `1000` 字（含 `#话题`），前 25–35 字折叠前直给核心钩子。
- **双封面映射**：
  - `coverPortraitRef`：`3:4` 或 `9:16`（对应弹窗「设置竖封面」）
  - `coverLandscapeRef`：`4:3` 或 `16:9`（对应弹窗「设置横封面」）
- **常用 `options`**：
  - `selfDeclaration`: 自主声明（如 `"内容由AI生成"`、`"内容为个人观点或见解"`、`"虚拟演绎，仅供娱乐"`）
  - `syncFeeds`: `["toutiao", "xigua"]`
  - `allowDownload`: 是否允许他人保存视频
  - `bgm`: 图文/视频配乐搜索词
  - `mount`: 挂载小程序/商品/POI

## 4. B 站 (`bilibili`)
- **支持形态**：`video`、`article`（专栏）、`post`（动态）。
- **稿件标题 (`title`)**：上限 **`≤ 80` 字符**（推荐 `20–45` 字完整展开核心看点与硬核数字）。
- **稿件简介 (`body`)**：上限 `2000` 字符，**严禁包含外部非白名单 `http/https` URL**（易触发退回或折叠）。长视频可在 `chapters[]` 提供分段时间戳。
- **普通标签 (`tags[]`)**：上限 **`10` 个**，**严禁带 `#` 号**，纯词数组。
- **双封面映射**：
  - `coverLandscapeRef`：`4:3`（信息流推荐卡片封面）
  - `coverWideRef`：`16:9`（播放页宽屏封面）
- **常用 `options`**：
  - `copyright`: `"original"`（自制）| `"repost"`（转载，需填 `repostSource`）
  - `category`: 分区路径数组，如 `["知识", "人文历史"]`、`["科技", "计算机技术"]`
  - `topic`: 活动话题（最多 1 个，如 `"知识分享官"`）
  - `dynamicText`: 粉丝动态转发语
  - `noReprint`: 未经作者授权禁止转载（`true/false`）
  - `enableWatermark`: 开启专属水印

## 5. 扩展平台约定（快手 / 公众号 / 知乎 / 微博 / 海外平台）
- **微信公众号 / 小绿书 (`weixin_mp`)**：`article` 模式使用 `title` (≤64字) + `digest` (≤120字) + `markdown` + `coverWideRef` (2.35:1 或 16:9) + `coverRef` (1:1 分享小图)；`image_post` 小绿书模式使用 `title` + `body` + `imageRefs[]`。
- **快手 (`kuaishou`)**：`video` / `image_post`，`body` + `tags[]` + `coverPortraitRef`。
- **知乎 (`zhihu`)**：`article` 专栏使用 `title` + `markdown` + `options.columnName` + `options.topicNames[]`。
- **YouTube (`youtube`)**：`title` (≤100 chars) + `body` (≤5000 chars, 自动拼接 `chapters[]`) + `tags[]` + `coverWideRef` (`16:9`) + `options.playlist` + `options.madeForKids` (`false`) + `options.alteredContent`。
- **X / Twitter (`x`)**：单推 `body` (≤280 加权字符) 或串推 `thread[]` + `imageRefs[]` (最多 4 图)。
