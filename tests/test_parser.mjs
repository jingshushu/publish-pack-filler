import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const userScriptCode = fs.readFileSync(
  new URL('../publish-pack-filler.user.js', import.meta.url),
  'utf8'
);

// 提取脚本内的解析器与工具函数进行真实样本回归测试
const startIdx = userScriptCode.indexOf('function calcXhsTitleLen');
const endIdx = userScriptCode.indexOf('// ==================== IndexedDB');
assert.ok(startIdx > 0 && endIdx > startIdx, '未定位到解析器代码段');

const snippet =
  userScriptCode.slice(startIdx, endIdx) +
  '\nglobalThis.__exported = { calcXhsTitleLen, sanitizeWeixinShortTitle, parsePublishPackMarkdown };';

const context = { globalThis: {} };
vm.createContext(context);
vm.runInContext(snippet, context);

const { calcXhsTitleLen, sanitizeWeixinShortTitle, parsePublishPackMarkdown } =
  context.globalThis.__exported;

const tianjinMdPath = new URL('./fixtures/tianjin_pack_v01.md', import.meta.url);
const mdText = fs.readFileSync(tianjinMdPath, 'utf8');
const parsed = JSON.parse(
  JSON.stringify(
    parsePublishPackMarkdown(mdText, {
      baseDir: '',
    })
  )
);

// 1. 小红书核验
assert.equal(parsed.platforms.xiaohongshu.title, '紧挨北京装下2个上海，天津咋这么乐呵？');
assert.equal(calcXhsTitleLen(parsed.platforms.xiaohongshu.title), 18.5);
assert.equal(parsed.platforms.xiaohongshu.altTitles.length, 3);
assert.equal(parsed.platforms.xiaohongshu.collection, '一座城的年轮');
assert.equal(parsed.platforms.xiaohongshu.coverRel, '封面/封面_3x4_A-曾经只有这么大_v01.png');
assert.deepEqual(parsed.platforms.xiaohongshu.tags, [
  '天津',
  '北京',
  '上海',
  'GIS制图',
  '数据可视化设计',
  '城市可视化',
  '数字孪生',
  '城市漫游',
  '用AI讲知识',
  'ai替我说',
]);
assert.ok(parsed.platforms.xiaohongshu.body.includes('嘛钱不钱的，乐呵乐呵得了！'));
assert.ok(parsed.platforms.xiaohongshu.pinnedComment.includes('果篦儿'));

// 2. 视频号核验（含短标题中文逗号自动净化为空格）
assert.equal(parsed.platforms.weixin.shortTitleRaw, '装下2个上海，天津咋这么乐呵');
assert.equal(parsed.platforms.weixin.shortTitleClean, '装下2个上海 天津咋这么乐呵');
assert.deepEqual(parsed.platforms.weixin.tags, ['天津', '一座城的年轮', '城市变迁', '数据可视化']);
assert.ok(!parsed.platforms.weixin.body.includes('#天津'), '正文应已剥离末尾标签行');

// 3. B 站核验（含双封面分离与无 # 普通标签）
assert.equal(
  parsed.platforms.bilibili.title,
  '从1.6km²明代算盘城到北方第一大港：26.7万栋3D建筑还原天津622年向海生长史'
);
assert.equal(parsed.platforms.bilibili.coverRel, '封面/封面_4x3_A-曾经只有这么大_v01.png');
assert.equal(parsed.platforms.bilibili.coverWideRel, '封面/封面_16x9_A-曾经只有这么大_v01.png');
assert.equal(parsed.platforms.bilibili.tags.length, 10);
assert.ok(parsed.platforms.bilibili.tags.every((t) => !t.includes('#')));

// 4. 抖音核验（正文与 #话题 自动分离）
assert.deepEqual(parsed.platforms.douyin.tags, ['天津', '一座城的年轮', '城市变迁', '数据可视化', 'GIS制图']);
assert.ok(parsed.platforms.douyin.body.includes('150秒真实3D数据带你看懂622年天津卫！'));
assert.ok(!parsed.platforms.douyin.body.includes('#天津'));

// 5. 封面清单 6 张全部识别（3x4_A/B/C/D + 4x3_A + 16x9_A）
assert.equal(parsed.covers.length, 6);

console.log('✅ ALL PARSER TESTS PASSED!');
console.log(
  JSON.stringify(
    {
      packTitle: parsed.meta.packTitle,
      coversCount: parsed.covers.length,
      xhsTitle: parsed.platforms.xiaohongshu.title,
      wxShortTitleClean: parsed.platforms.weixin.shortTitleClean,
      biliCovers: [parsed.platforms.bilibili.coverRel, parsed.platforms.bilibili.coverWideRel],
      dyTags: parsed.platforms.douyin.tags,
    },
    null,
    2
  )
);
