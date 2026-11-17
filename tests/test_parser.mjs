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
  '\nglobalThis.__exported = { calcXhsTitleLen, sanitizeWeixinShortTitle, parsePublishPackMarkdown, parsePublishPackJson, exportPackToSpecJson };';

const context = { globalThis: {} };
vm.createContext(context);
vm.runInContext(snippet, context);

const {
  calcXhsTitleLen,
  sanitizeWeixinShortTitle,
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

console.log('✅ ALL MARKDOWN + PUBLISHPACK v1.0 JSON TESTS PASSED!');
