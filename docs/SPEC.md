# PublishPack Open Specification (`v1.0`)

`PublishPack`（默认文件名约定：`publish.pack.json`）是一套面向 **AI Agent 生成** 与 **多平台浏览器插件/工具消费** 的通用内容分发包开放标准。

它的设计目标是解决两个长期割裂的痛点：
1. **打破固定 Markdown 模板的脆弱正则耦合**：无论创作者用什么提示词、哪个大模型（Claude / ChatGPT / Gemini / 豆包 / DeepSeek），只要导出符合本标准的 `publish.pack.json`，任何兼容工具即可 100% 零误差读取全部文案、多比例封面、图文轮播序列及平台子选项。
2. **兼顾极简入门与深度运营扩展性**：最小只需填 `specVersion` + `contentType` + `default` 三块即可全平台通用；专业创作者则可在 `platforms.<id>` 中精细定义赛马标题、双比例封面映射、置顶首评以及数十项平台专属子选项（`options`）。

---

## 一、五大标准内容形态 (`contentType`)

| `contentType` 枚举值 | 适用形态 | 核心媒体字段 (`assets`) | 典型目标平台 |
|---|---|---|---|
| `"video"` | 短视频 / 中长视频 / 横屏纪录片 | `videos[]` + `covers[]` + `subtitles[]` | 小红书视频、微信视频号、抖音、B站、快手、YouTube、TikTok |
| `"image_post"` | 图文笔记 / 多图轮播卡片（Carousel） | `images[]`（按轮播顺序）+ 可选首图 `covers[]` | 小红书图文（≤18张）、抖音图文（≤35张）、公众号小绿书、Instagram、即刻 |
| `"article"` | 深度长文 / 专栏文章 | `markdown` / `html` + `digest` + 头图 `covers[]` | 微信公众号、知乎专栏、B站专栏、小红书长文、掘金、Substack |
| `"post"` | 纯文字或带图短动态 / 推文串 | `body` / `thread[]` + `images[]` | 微博、X (Twitter)、Threads、B站动态、雪球 |
| `"audio"` | 播客单集 / 音频节目 | `audio[]` + `covers[]` (`1:1`) + `chapters[]` | 小宇宙、喜马拉雅、网易云播客、Apple Podcasts |

> **跨形态混发支持**：顶层声明主形态（如 `"contentType": "video"`），同时允许在特定平台下覆写 `platforms.xiaohongshu.contentType = "image_post"`（例如同一期内容在 B 站发视频，在小红书发 9 张总结图卡）。

---

## 二、标准平台标识符注册表 (`platforms.<id>`)

为保证跨工具互通，推荐统一使用以下小写规范 ID（同时允许任意自定义平台键名如 `x_custom`）：

| 标准平台 ID | 平台名称 | 兼容别名 | 核心特有字段与子选项 (`options`) |
|---|---|---|---|
| `xiaohongshu` | 小红书 | `xhs` | `title` (≤20折算字), `altTitles[]`, `imageRefs[]`, `options.aiDeclaration`, `options.goodsIds` |
| `weixin_channels` | 微信视频号 | `weixin`, `channels` | `shortTitle` (6–16字且严守7类符号白名单), `coverPortraitRef` (3:4), `coverLandscapeRef` (4:3), `options.contentLabel`, `options.externalLink` |
| `douyin` | 抖音 | `dy` | `title` (≤30字), `coverPortraitRef`, `coverLandscapeRef`, `options.selfDeclaration` (自主声明), `options.syncFeeds`, `options.mount` |
| `bilibili` | B 站（哔哩哔哩） | `bili` | `title` (≤80字), `coverLandscapeRef` (4:3), `coverWideRef` (16:9), `options.category`, `options.topic`, `options.dynamicText`, `options.copyright`, `options.noReprint` |
| `kuaishou` | 快手 | `ks` | `title`, `body`, `coverPortraitRef`, `collection`, `options.visibility` |
| `weixin_mp` | 微信公众号 / 小绿书 | `mp`, `gzh` | `title`, `markdown` / `html` (`article`) 或 `imageRefs[]` (`image_post` 小绿书), `digest`, `options.isOriginal`, `options.allowReward` |
| `zhihu` | 知乎（想法 / 专栏 / 视频） | — | `title`, `markdown`, `tags[]`, `options.columnName`, `options.topicNames` |
| `weibo` | 微博 | — | `body`, `tags[]` (双 `#话题#` 渲染), `imageRefs[]`, `options.visibility` |
| `youtube` | YouTube / Shorts | `yt` | `title` (≤100 chars), `body`, `tags[]`, `chapters[]`, `coverWideRef` (16:9), `options.playlist`, `options.madeForKids`, `options.alteredContent` |
| `tiktok` | TikTok | `tt` | `body`, `tags[]`, `coverPortraitRef`, `options.privacy`, `options.aigcDisclosure` |
| `x` | X (Twitter) | `twitter` | `body` / `thread[]`, `imageRefs[]` |
| `instagram` | Instagram (Reels / Post) | `ig` | `body`, `tags[]`, `imageRefs[]`, `options.shareToFeed` |
| `xiaoyuzhou` | 小宇宙播客 | `xyz` | `title`, `body` / `markdown` (Shownotes), `chapters[]`, `coverRef` (1:1) |

---

## 三、双层继承与资产解耦规则（Resolution Algorithm）

任何消费 `publish.pack.json` 的插件或客户端，按以下确定性优先级合并生成目标平台的最终表单数据：

1. **字段级回退继承 (`platforms[id]` → `default`)**：
   - 对任意字段 `F`（如 `title`, `body`, `tags`, `collection`, `location`, `pinnedComment`, `chapters`）：若 `platforms[id][F]` 非空则采用该平台定制值；否则自动回退读取 `default[F]`。
   - `options` 对象执行浅合并：`{ ...default?.options, ...platforms[id]?.options }`。
2. **平台合规自适应归一化**：
   - `weixin_channels.shortTitle`：若未显式提供 `shortTitle`，则从 `title` 派生，自动将逗号、顿号、感叹号等不在 7 类白名单（`《》“”‘’「」：+？%℃`）内的标点替换为空格，并提示控制在 `6–16` 字。
   - `tags[]`：JSON 中统一存储**不带 `#` 的纯词**（如 `["天津", "数据可视化"]`）；插件在小红书/抖音/视频号填入时自动前置 `#`，在微博包裹 `#词#`，在 B 站/YouTube 作为无 `#` 纯标签胶囊输入。
3. **资产 ID 与相对路径双模引用 (`assets`)**：
   - `coverRef` / `coverPortraitRef` / `coverLandscapeRef` / `coverWideRef` / `imageRefs[]` 既可以填写 `assets.covers[].id`（如 `"cover_vertical_a"`），也可以直接填写相对路径（如 `"covers/vertical.jpg"`）。
   - 若连 `coverRef` 都未显式指定，客户端自动扫描 `assets.covers[]`（及目录内所有图片），读取真实像素宽高比匹配当前平台的首选比例（如小红书/抖音竖封匹配 `3:4` 或 `9:16`，B站列表封匹配 `4:3`、播放页匹配 `16:9`）。

---

## 四、最小合法示例 vs 完整多平台示例

### 1. 极简模式（10 行即可全平台通用）
```json
{
  "specVersion": "1.0",
  "contentType": "video",
  "default": {
    "title": "花3天手搓了一个桌面小机器人",
    "body": "把电路板斜着25度塞进外壳的那一刻太治愈了！大家觉得下一代加个小屏幕怎么样？",
    "tags": ["硬件DIY", "桌面搭子", "科技科普"],
    "pinnedComment": "工程文件整理好后会更新在置顶动态，想看哪部分拆解评论区告诉我👇"
  }
}
```

### 2. 完整生产级示例
参见本仓库 [`examples/`](../examples/) 目录下的三份标准样板：
- 视频多平台赛马包：[`examples/video-pack.publish.pack.json`](../examples/video-pack.publish.pack.json)
- 图文轮播笔记包：[`examples/image-carousel.publish.pack.json`](../examples/image-carousel.publish.pack.json)
- 专栏长文章包：[`examples/article.publish.pack.json`](../examples/article.publish.pack.json)
