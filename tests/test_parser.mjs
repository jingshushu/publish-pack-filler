import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const userScriptCode = fs.readFileSync(
  new URL('../publish-pack-filler.user.js', import.meta.url),
  'utf8'
);

const startIdx = userScriptCode.indexOf('function calcXhsTitleLen');
const endIdx = userScriptCode.indexOf('// ==================== IndexedDB');
assert.ok(startIdx > 0 && endIdx > startIdx, '未定位到解析器代码段');

const snippet =
  userScriptCode.slice(startIdx, endIdx) +
  '\nglobalThis.__exported = { calcXhsTitleLen, sanitizeWeixinShortTitle, extractPackVersionScore, isValidPublishPackContent, parsePublishPackMarkdown, parsePublishPackJson, exportPackToSpecJson };';

const context = { globalThis: {} };
vm.createContext(context);
vm.runInContext(snippet, context);

const {
  calcXhsTitleLen,
  sanitizeWeixinShortTitle,
  extractPackVersionScore,
  isValidPublishPackContent,
  parsePublishPackMarkdown,
  parsePublishPackJson,
  exportPackToSpecJson,
} = context.globalThis.__exported;

// ==================== Test 1: 旧版 Markdown 发布包回归核验 ====================
const tianjinMdPath = new URL('./fixtures/tianjin_pack_v01.md', import.meta.url);
const mdText = fs.readFileSync(tianjinMdPath, 'utf8');
const parsedMd = JSON.parse(JSON.stringify(parsePublishPackMarkdown(mdText, { baseDir: '' })));

assert.equal(parsedMd.platforms.xiaohongshu.title, '紧挨北京装下2个上海，天津咋这么乐呵？');
assert.equal(calcXhsTitleLen(parsedMd.platforms.xiaohongshu.title), 18.5);
assert.equal(parsedMd.platforms.xiaohongshu.altTitles.length, 3);
assert.equal(parsedMd.platforms.weixin.shortTitleClean, '装下2个上海 天津咋这么乐呵');
assert.equal(parsedMd.platforms.bilibili.coverRel, '封面/封面_4x3_A-曾经只有这么大_v01.png');
assert.equal(parsedMd.platforms.bilibili.coverWideRel, '封面/封面_16x9_A-曾经只有这么大_v01.png');
assert.equal(parsedMd.covers.length, 6);

// ==================== Test 2: PublishPack v1.0 视频 JSON 标准包核验 ====================
const videoJsonText = fs.readFileSync(new URL('../examples/video-pack.publish.pack.json', import.meta.url), 'utf8');
const parsedVideo = JSON.parse(JSON.stringify(parsePublishPackJson('```json\n' + videoJsonText + '\n```')));

assert.equal(parsedVideo.meta.contentType, 'video');
assert.equal(parsedVideo.meta.compliance.aiLevel, 'assisted');
assert.equal(parsedVideo.covers.length, 6);
assert.equal(parsedVideo.platforms.weixin.shortTitleClean, '装下2个上海 天津咋这么乐呵');
assert.equal(parsedVideo.platforms.weixin.coverRel, '封面/封面_3x4_A-曾经只有这么大_v01.png');
assert.equal(parsedVideo.platforms.weixin.coverSubRel, '封面/封面_4x3_A-曾经只有这么大_v01.png');
assert.equal(parsedVideo.platforms.bilibili.category, '知识 -> 人文历史');
assert.equal(parsedVideo.platforms.bilibili.options.noReprint, true);
// 未显式配置的扩展平台自动继承 default
assert.equal(parsedVideo.platforms.youtube.title, '紧挨北京装下2个上海，天津咋这么乐呵？');
assert.equal(parsedVideo.platforms.youtube.location, '天津市');

// ==================== Test 3: PublishPack v1.0 图文轮播 (image_post) 核验 ====================
const carouselJsonText = fs.readFileSync(new URL('../examples/image-carousel.publish.pack.json', import.meta.url), 'utf8');
const parsedCarousel = JSON.parse(JSON.stringify(parsePublishPackJson(carouselJsonText)));

assert.equal(parsedCarousel.meta.contentType, 'image_post');
assert.equal(parsedCarousel.images.length, 4);
assert.equal(parsedCarousel.platforms.xiaohongshu.slidePaths.length, 4);
assert.equal(parsedCarousel.platforms.douyin.options.bgm, '轻快科技感纯音乐');
assert.equal(parsedCarousel.platforms.weixin_mp.contentType, 'image_post');

// ==================== Test 4: PublishPack v1.0 专栏长文 (article) 核验 ====================
const articleJsonText = fs.readFileSync(new URL('../examples/article.publish.pack.json', import.meta.url), 'utf8');
const parsedArticle = JSON.parse(JSON.stringify(parsePublishPackJson(articleJsonText)));

assert.equal(parsedArticle.meta.contentType, 'article');
assert.ok(parsedArticle.platforms.weixin_mp.body.includes('## 一、数据准备'));
assert.ok(parsedArticle.platforms.weixin_mp.digest.includes('CMAB'));
assert.equal(parsedArticle.platforms.zhihu.options.columnName, '城市数据可视化手记');

// ==================== Test 5: 旧版 Markdown -> 标准 JSON 往返导出核验 ====================
const exportedJson = exportPackToSpecJson(parsedMd);
const reparsed = JSON.parse(JSON.stringify(parsePublishPackJson(exportedJson)));
assert.equal(reparsed.platforms.xiaohongshu.title, parsedMd.platforms.xiaohongshu.title);
assert.equal(reparsed.platforms.bilibili.tags.length, 10);

// ==================== Test 6: 靖蜀黍 SOP (发布文案_v1.md) 兼容解析核验 ====================
const jingshuMd = `# 发布文案：星舰第15次试飞
## 二、抖音（16:9 横屏成片 + 9:16 竖封）
### 标题文案
- **主推**：火箭下半截掉进海里，难十倍的上半截却被铁臂半空夹住了！5分钟拆透星舰试飞 #星舰 #商业航天
- **备选**：绕地球14圈还能被半空夹住？拆解星舰第15次试飞 #星舰 #硬核科技
## 三、小红书（16:9 视频 + 3:4 独立封面）
### 标题
- **主推**：绕地球14圈被半空夹住！5分钟看懂星舰15飞
### 正文
这两天星舰第15次试飞刷屏了。
#星舰 #商业航天 #科技科普
## 四、B 站（16:9 横屏主阵地）
### 标题候选
1. **推荐主标题**：下半截掉进海里，难十倍的上半截却被半空夹住！
### 简介正文
一栋17层楼高的飞船冲回大气层。
### 标签
\`星舰\` \`商业航天\` \`硬核科技\`
## 五、全平台置顶评论
> 今晚 0 元肉眼看头顶卫星列车指南
`;
const parsedJingshu = JSON.parse(JSON.stringify(parsePublishPackMarkdown(jingshuMd)));
assert.equal(parsedJingshu.platforms.xiaohongshu.title, '绕地球14圈被半空夹住！5分钟看懂星舰15飞');
assert.deepEqual(parsedJingshu.platforms.xiaohongshu.tags, ['星舰', '商业航天', '科技科普']);
assert.ok(parsedJingshu.platforms.douyin.body.includes('火箭下半截掉进海里'));
assert.deepEqual(parsedJingshu.platforms.douyin.tags, ['星舰', '商业航天']);
assert.equal(parsedJingshu.platforms.bilibili.tags.length, 3);
assert.ok(parsedJingshu.platforms.weixin.body.includes('火箭下半截掉进海里'));
assert.ok(parsedJingshu.platforms.douyin.pinnedComment.includes('卫星列车'));

// ==================== Test 7: FB-20261120-0001 视频号多版本 Markdown (v03/v10) 解析与辅助 JSON 过滤 ====================
assert.equal(parsedMd.meta.format, 'markdown', 'Markdown 发布包必须显式标记 meta.format = markdown');
assert.equal(
  isValidPublishPackContent('sources_changzhutan.json', '{"cities":["长沙","株洲","湘潭"]}'),
  false,
  'sources_*.json 严禁被误识别为发布包'
);
assert.equal(
  isValidPublishPackContent('publish_receipt.json', '{"publishedAt":"2026-11-20"}'),
  false,
  'publish_receipt.json 严禁被误识别为发布包'
);
assert.ok(
  extractPackVersionScore('发布包_v10.md') > extractPackVersionScore('发布包_v03.md') &&
    extractPackVersionScore('发布包_v03.md') > extractPackVersionScore('发布包_v2.md') &&
    extractPackVersionScore('发布包_v2.md') > extractPackVersionScore('发布包_v01.md'),
  '发布包版本号必须按自然数值 v10 > v03 > v2 > v01 排序'
);

const wxVariantMd = `# 《一座城的年轮 · 湘江三城》四平台标准发布包（v03）
## 02｜微信视频号（熟人裂变）
- **指定封面**：竖版主封面 \`封面/封面_3x4_A_v03.png\`
- **合集**：\`一座城的年轮\`
- **位置**：\`长沙市\`
- **主推短标题（6–16 字）**：
\`\`\`text
相距40公里 长株潭谁带飞了谁？
\`\`\`
- **备选短标题（2 个）**：
1. \`地铁跨市上班 长株潭为啥没合并？\`
2. \`融城40年 长株潭谁带飞了谁？\`
- **描述正文（直接复制）**：
\`\`\`text
一条湘江向北流，串起相距不到40公里的三座城。
#长株潭 #长沙 #株洲 #湘潭
\`\`\`
- **置顶首评**：
\`\`\`text
这四十年三兄弟到底是虹吸多还是托举多？
\`\`\`
`;
const parsedWxV03 = JSON.parse(JSON.stringify(parsePublishPackMarkdown(wxVariantMd, { mdFileName: '发布包_v03.md' })));
assert.equal(parsedWxV03.meta.format, 'markdown');
assert.equal(parsedWxV03.platforms.weixin.shortTitleClean, '相距40公里 长株潭谁带飞了谁？');
assert.equal(parsedWxV03.platforms.weixin.altTitles.length, 2);
assert.ok(parsedWxV03.platforms.weixin.body.includes('一条湘江向北流'));
assert.deepEqual(parsedWxV03.platforms.weixin.tags, ['长株潭', '长沙', '株洲', '湘潭']);
assert.equal(parsedWxV03.platforms.weixin.collection, '一座城的年轮');
assert.equal(parsedWxV03.platforms.weixin.location, '长沙市');

console.log('✅ ALL MARKDOWN + JINGSHUSHU SOP + PUBLISHPACK v1.0 JSON + WEIXIN v03 TESTS PASSED!');
