// Auto-generated from publish-pack-filler.user.js (v1.3.0) — DO NOT EDIT DIRECTLY
/**
 * 安全与反风控设计铁律（严格遵守）：
 * 1. 绝不使用 @grant none，绝不向页面 window 挂载变量，绝不 Hook fetch / XHR / EventTarget / toString。
 * 2. 悬浮工作台完全封装在 closed ShadowRoot 中，外部脚本无法探测内部节点，亦不污染宿主样式。
 * 3. 严守「四不碰」：不自动点发布、不代传正片视频、不进页面静默自动执行、不伪造私有接口请求。
 * 4. 所有事件均携带 composed: true（对齐浏览器真实硬件事件规范，完美穿透视频号 Wujie ShadowDOM），
 *    并内置类正态分布视觉反应延时、随机内部落点抖动与完整 Pointer/Mouse 按压序列。
 */

(function () {
  'use strict';

  if (window.top !== window.self) {
    return;
  }

  const STORAGE_KEY_PACK = 'ppf_current_pack_v1';
  const STORAGE_KEY_SETTINGS = 'ppf_settings_v2';
  const CROSS_COVER_PREFIX = 'ppf_xcover_v1::';
  const BRIDGE_DEFAULT_URL = 'http://127.0.0.1:18765';
  const IDB_NAME = 'ppf_local_covers_v1';
  const IDB_STORE = 'covers';

  // 自动识别运行环境：Chrome MV3 扩展 Content Script (ISOLATED World) vs Tampermonkey 油猴沙箱
  const IS_CHROME_EXT = typeof chrome !== 'undefined' && Boolean(chrome.storage && chrome.storage.local);
  let suppressStorageEcho = false;

  async function xStorageGet(key, fallback = '') {
    try {
      if (IS_CHROME_EXT) {
        const res = await chrome.storage.local.get(key);
        return res[key] ?? fallback;
      }
      if (typeof GM_getValue === 'function') {
        return GM_getValue(key, fallback);
      }
    } catch {
      // ignore
    }
    return fallback;
  }

  async function xStorageSet(key, val) {
    try {
      suppressStorageEcho = true;
      if (IS_CHROME_EXT) {
        await chrome.storage.local.set({ [key]: val });
      } else if (typeof GM_setValue === 'function') {
        GM_setValue(key, val);
      }
    } catch {
      // ignore
    } finally {
      setTimeout(() => {
        suppressStorageEcho = false;
      }, 120);
    }
  }

  async function xStorageClearByPrefix(prefix) {
    try {
      suppressStorageEcho = true;
      if (IS_CHROME_EXT) {
        const all = await chrome.storage.local.get(null);
        const keys = Object.keys(all).filter((k) => k.startsWith(prefix));
        if (keys.length) await chrome.storage.local.remove(keys);
      } else if (typeof GM_listValues === 'function' && typeof GM_deleteValue === 'function') {
        for (const k of GM_listValues()) {
          if (k.startsWith(prefix)) GM_deleteValue(k);
        }
      }
    } catch {
      // ignore
    } finally {
      setTimeout(() => {
        suppressStorageEcho = false;
      }, 120);
    }
  }

  async function xStorageEntriesByPrefix(prefix) {
    try {
      if (IS_CHROME_EXT) {
        const all = await chrome.storage.local.get(null);
        return Object.entries(all).filter(([k]) => k.startsWith(prefix));
      }
      if (typeof GM_listValues === 'function' && typeof GM_getValue === 'function') {
        return GM_listValues()
          .filter((k) => k.startsWith(prefix))
          .map((k) => [k, GM_getValue(k, '')]);
      }
    } catch {
      // ignore
    }
    return [];
  }

  // 开箱即用默认预设：《一座城的年轮 · 天津》四平台标准发布包（v01）
  const DEFAULT_PRESET_PACK = {
    meta: {
      packTitle: '《一座城的年轮 · 天津》四平台标准发布包（v01）',
      mdFileName: '发布包_v01.md',
      baseDir: '',
      videoFile: '一座城的年轮_天津_v2_发布版.mp4',
      updatedAt: '2026-11-17T16:40:00+08:00',
      sourceLabel: '内置预设 · 天津城市变迁 v01',
    },
    covers: [
      { slot: '3x4_A', ratio: '3:4', variant: 'A', relPath: '封面/封面_3x4_A-曾经只有这么大_v01.png', label: '款A 主推 · 3:4（曾经只有这么大）' },
      { slot: '4x3_A', ratio: '4:3', variant: 'A', relPath: '封面/封面_4x3_A-曾经只有这么大_v01.png', label: '款A 主推 · 4:3（横版动态/列表卡）' },
      { slot: '16x9_A', ratio: '16:9', variant: 'A', relPath: '封面/封面_16x9_A-曾经只有这么大_v01.png', label: '款A 主推 · 16:9（宽屏播放页）' },
      { slot: '3x4_B', ratio: '3:4', variant: 'B', relPath: '封面/封面_3x4_B-夜景乐呵天津_v01.png', label: '款B 备选 · 3:4（夜景乐呵天津）' },
      { slot: '3x4_C', ratio: '3:4', variant: 'C', relPath: '封面/封面_3x4_C-黑金800倍扩张_v01.png', label: '款C 备选 · 3:4（黑金800倍扩张）' },
      { slot: '3x4_D', ratio: '3:4', variant: 'D', relPath: '封面/封面_3x4_D-来津第一站_v01.png', label: '款D 备选 · 3:4（来津第一站）' },
    ],
    platforms: {
      xiaohongshu: {
        collection: '一座城的年轮',
        coverRel: '封面/封面_3x4_A-曾经只有这么大_v01.png',
        title: '紧挨北京装下2个上海，天津咋这么乐呵？',
        altTitles: [
          'GDP稳居北方第二，天津人咋只管乐呵？',
          '600年狂翻800倍，天津人咋这么乐呵？',
          '离北京仅半小时高铁，天津咋守住慢烟火？',
        ],
        body: [
          '评论区催更的「天津」来了！',
          '1404年三岔河口筑起算盘城，向东奔海45公里造出北方第一大港和530米高楼，面积装下近2个上海，GDP稳居北方第二',
          '结果到了胡同口，早点摊煎饼果子磕俩鸡蛋，下午茶馆竹板一响听相声，夏天狮子林桥扑通跳进海河',
          '嘛钱不钱的，乐呵乐呵得了！快夸夸这座既有硬核家底、又活得倍儿通透的大天津！',
        ].join('\n'),
        tags: ['天津', '北京', '上海', 'GIS制图', '数据可视化设计', '城市可视化', '数字孪生', '城市漫游', '用AI讲知识', 'ai替我说'],
        pinnedComment: [
          '来对个地道天津人暗号👇',
          '1️⃣ 买煎饼果子，你默认夹「果子」还是「果篦儿」？有没有拎着自家鸡蛋下楼排过队？🥚',
          '2️⃣ 你第一次来天津，是在天津站出来看见世纪钟和解放桥，还是在西站红砖楼下的车？',
          '（先主动自首保命：150秒拍完了中心六区、八里台和滨海，居然漏掉了京津走廊上的武清和宝坻！武清宝坻静海宁河的朋友别拿麻花砸我，评论区集合给自家上分🙋‍♂️）',
        ].join('\n'),
      },
      weixin: {
        collection: '一座城的年轮',
        location: '天津市',
        coverRel: '封面/封面_3x4_A-曾经只有这么大_v01.png',
        coverSubRel: '封面/封面_4x3_A-曾经只有这么大_v01.png',
        shortTitleRaw: '装下2个上海，天津咋这么乐呵',
        shortTitleClean: '装下2个上海 天津咋这么乐呵',
        altTitles: [],
        body: '从1404年三岔河口1.6平方公里的明代算盘城，向东奔海45公里长成装下近两个上海、稳居北方第二的1363万人大城。这里有中国第一所现代大学、第一条时速350公里高铁，也有津湾世纪钟、八里台一墙之隔的天大南开和清晨热气腾腾的煎饼果子。谨以此片，献给每一个热爱并留在乐呵天津的人！',
        tags: ['天津', '一座城的年轮', '城市变迁', '数据可视化'],
        pinnedComment: '你当年来天津的第一站，是在天津站看见世纪钟，还是在西站下的车？如今住在哪个区？欢迎中心六区、滨海和武清宝坻静海宁河的老乡在评论区报到，转发给身边的天津朋友一起看看咱这600年的家底！',
      },
      bilibili: {
        category: '知识 -> 人文历史',
        collection: '一座城的年轮·3D城市变迁',
        coverRel: '封面/封面_4x3_A-曾经只有这么大_v01.png',
        coverWideRel: '封面/封面_16x9_A-曾经只有这么大_v01.png',
        title: '从1.6km²明代算盘城到北方第一大港：26.7万栋3D建筑还原天津622年向海生长史',
        altTitles: [],
        body: [
          '九河下梢天津卫，三道浮桥两道关。它是中国古代唯一确切记载建城年月日（1404年12月23日）的大城市，九成五土地曾是渤海退海平原，却在622年间从1.6平方公里的矩形“算盘城”一路向东奔海45公里，长成建成区狂翻近800倍、GDP稳居北方第二的津滨双城。本期基于267,516栋真实三维建筑与30米地形数据，用150秒带你看懂这座硬核又乐呵的天津城。',
          '',
          '【章节时间轴】',
          '00:00 开篇：三岔河口漫出的北方大港',
          '00:06 九河下梢：燕山九山顶与渤海退海平原',
          '00:11 漕运起点：1214直沽寨与1282海津镇',
          '00:17 皇家筑城：1404明永乐赐名与1.6km²算盘城',
          '00:23 近代风云：九国租界十倍扩张与1895北洋大学堂',
          '00:29 铁桥破局：1888津唐铁路与1927万国桥（解放桥）合龙',
          '00:35 甜水地铁：1983引滦入津与1984中国内地第二条地铁',
          '00:41 向海双城：东进45公里建泰达与滨海新区',
          '00:47 一桥一景：海河市区不到800米一座跨河桥',
          '00:53 高铁先锋：2008中国首条350km/h京津城际通车',
          '00:59 海空双港：北方第一大港天津港年吞吐2403万标箱',
          '01:06 尺度对比：11966km²市域相当于近2个上海',
          '01:12 山海折叠：3米退海平原到1078.5米蓟州九山顶',
          '01:18 津门地标：120米桥上摩天轮天津之眼与五大道洋楼',
          '01:24 双城天际：337米津塔、415米天塔与530米津沽棒',
          '01:32 哏儿都烟火：茶馆竹板相声、煎饼果子与狮子林桥跳水',
          '01:39 百年高教：天大南开与56所高校71.6万青年学子',
          '01:45 轨道成网：12条地铁379公里串联津城与滨城',
          '01:52 经济坐标：2025年GDP达1.85万亿稳居北方第二城',
          '01:59 来津第一站：天津站世纪钟与1363万常住人口万家灯火',
          '02:14 终章名片：九河 · 渤海 · 乐呵天津',
          '',
          '【数据与开源致谢】',
          '三维建筑：清华大学 CMAB 中国建筑数据集（天津市17分块共267,516栋）',
          '数字高程：Copernicus DEM GLO-30',
          '路网水系与轨道：OpenStreetMap 开放地理数据（ODbL）',
          '统计口径：2025年天津市及北方十强城市国民经济和社会发展统计公报（历代城垣范围与地标精模为历史空间对位示意）',
        ].join('\n'),
        tags: ['天津', '一座城的年轮', '城市变迁', '历史地理', '三维地图', 'GIS', '数据可视化', '数字孪生', '海河', '人文历史'],
        topic: '知识分享官',
        dynamicText: '耗时打磨26.7万栋三维建筑，从1404年1.6km²的明代算盘城一路长到45公里外的渤海湾！天大南开的校友、还有全网的天津卫老乡快来认领你家的楼！',
        pinnedComment: '补充两个片中细节考据：① 天津是中国古代唯一有确切建城日（1404年12月23日）的大城市，老城厢东西南北四马路就是当年城墙拆墙修路留下的边界；② 限于150秒篇幅，这次重点聚焦了三岔河口至滨海双城主轴，武清、宝坻、静海、宁河、蓟州的朋友快来评论区打卡补充！下一期北方城市大家想看石家庄、济南、沈阳还是大连？',
      },
      douyin: {
        collection: '一座城的年轮',
        location: '天津市',
        coverRel: '封面/封面_3x4_A-曾经只有这么大_v01.png',
        title: '紧挨北京装下2个上海，天津咋这么乐呵？',
        altTitles: [
          'GDP稳居北方第二，天津人咋只管乐呵？',
          '600年狂翻800倍，天津人咋这么乐呵？',
          '离北京仅半小时高铁，天津咋守住慢烟火？',
        ],
        body: '紧挨北京装下近2个上海！从1.6km²明代算盘城狂翻近800倍，GDP稳居北方第二的天津，骨子里咋活得这么乐呵？150秒真实3D数据带你看懂622年天津卫！',
        tags: ['天津', '一座城的年轮', '城市变迁', '数据可视化', 'GIS制图'],
        pinnedComment: '来报个坐标：你在天津住哪个区？买煎饼果子是果子党还是果篦儿党？👇（武清、宝坻、滨海的朋友评论区集合！）',
      },
    },
  };

  // ==================== 通用工具函数 ====================
  const randFloat = (min, max) => Math.random() * (max - min) + min;
  // 双重随机均值模拟真人正态分布反应时延
  const humanSleep = (minMs = 240, maxMs = 540) => {
    const ms = Math.round((randFloat(minMs, maxMs) + randFloat(minMs, maxMs)) / 2);
    return new Promise((resolve) => setTimeout(resolve, ms));
  };

  function detectPlatform() {
    const host = location.hostname;
    if (host.includes('xiaohongshu.com')) return 'xiaohongshu';
    if (host.includes('douyin.com')) return 'douyin';
    if (host.includes('channels.weixin.qq.com')) return 'weixin';
    if (host.includes('mp.weixin.qq.com')) return 'weixin_mp';
    if (host.includes('bilibili.com')) return 'bilibili';
    if (host.includes('kuaishou.com')) return 'kuaishou';
    if (host.includes('zhihu.com')) return 'zhihu';
    if (host.includes('weibo.com')) return 'weibo';
    if (host.includes('youtube.com')) return 'youtube';
    return 'xiaohongshu';
  }

  const PLATFORM_META = {
    xiaohongshu: { name: '小红书', accent: '#ff2442', preferredRatios: ['3:4', '4:3', '1:1'] },
    douyin: { name: '抖音', accent: '#fe2c55', preferredRatios: ['3:4', '9:16', '4:3', '16:9'] },
    weixin: { name: '微信视频号', accent: '#07c160', preferredRatios: ['3:4', '4:3'] },
    bilibili: { name: 'B 站', accent: '#00aeec', preferredRatios: ['4:3', '16:9'] },
    kuaishou: { name: '快手', accent: '#ff4906', preferredRatios: ['3:4', '9:16', '16:9'] },
    weixin_mp: { name: '公众号/小绿书', accent: '#07c160', preferredRatios: ['16:9', '3:4', '1:1'] },
    zhihu: { name: '知乎', accent: '#1772f6', preferredRatios: ['16:9', '4:3'] },
    weibo: { name: '微博', accent: '#ff8200', preferredRatios: ['3:4', '16:9', '1:1'] },
    youtube: { name: 'YouTube', accent: '#ff0033', preferredRatios: ['16:9', '9:16'] },
  };

  const CONTENT_TYPE_LABELS = {
    video: '🎬 视频',
    image_post: '🖼️ 图文轮播',
    article: '📰 专栏长文',
    post: '💬 短动态',
    audio: '🎙️ 播客音频',
  };

  // 小红书标题字数折算（ASCII 算 0.5，汉字及全角算 1.0）
  function calcXhsTitleLen(str = '') {
    let total = 0;
    for (const ch of str) {
      total += ch.charCodeAt(0) <= 127 ? 0.5 : 1;
    }
    return Math.round(total * 10) / 10;
  }

  // 视频号短标题 7 类允许符号白名单净化：《》“”‘’「」：+？%℃ + 中英文数字空格（长度限制 6–16 字）
  function sanitizeWeixinShortTitle(str = '') {
    return str
      .replace(/[，,、。！!；;·/\\|~～—\-]+/g, ' ')
      .replace(/[^\u4e00-\u9fa5a-zA-Z0-9 《》“”‘’「」：:+？?%℃]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function safeCopy(text) {
    if (typeof GM_setClipboard === 'function') {
      GM_setClipboard(text, 'text');
      return Promise.resolve(true);
    }
    return navigator.clipboard.writeText(text).then(() => true).catch(() => false);
  }

  // ==================== Markdown 发布包解析器 ====================
  function extractCodeBlockAfter(sectionText, labelRegex) {
    const match = sectionText.match(
      new RegExp(labelRegex.source + '[^\\n]*\\n+\\s*```(?:text|markdown|md)?\\n([\\s\\S]*?)```', 'i')
    );
    return match ? match[1].trim() : '';
  }

  function extractInlineAfter(sectionText, labelRegex) {
    const match = sectionText.match(new RegExp(labelRegex.source + '[^\\n`]*`([^`\\n]+)`', 'i'));
    return match ? match[1].trim() : '';
  }

  function extractCoverAfter(sectionText, labelRegex) {
    const match = sectionText.match(
      new RegExp(labelRegex.source + '[^\\n]*?`([^`\\n]*\\.(?:png|jpg|jpeg|webp))`', 'i')
    );
    return match ? match[1].trim() : '';
  }

  function extractNumberedList(sectionText, headerRegex) {
    const idx = sectionText.search(headerRegex);
    if (idx === -1) return [];
    const tail = sectionText.slice(idx);
    const lines = tail.split('\n').slice(1);
    const items = [];
    for (const line of lines) {
      const m = line.match(/^\s*\d+\.\s*(?:`([^`]+)`|(.+))$/);
      if (m) {
        items.push((m[1] || m[2] || '').trim());
      } else if (items.length > 0 && (/^\s*[-#]/.test(line) || line.trim() === '---')) {
        break;
      }
    }
    return items;
  }

  function splitBodyAndHashtags(rawText = '') {
    const tags = [];
    const tagRegex = /#([^\s#，,。！!？?；;]+)/g;
    let m;
    while ((m = tagRegex.exec(rawText)) !== null) {
      if (!tags.includes(m[1])) tags.push(m[1]);
    }
    const cleanedLines = rawText
      .split('\n')
      .map((line) => line.replace(/(?:\s*#[^\s#，,。！!？?；;]+)+\s*$/g, '').trimEnd())
      .filter((line, i, arr) => !(line === '' && i === arr.length - 1));
    return {
      bodyOnly: cleanedLines.join('\n').trim(),
      tags,
    };
  }

  function inferCoverMetaFromPath(relPath) {
    const ratioMatch = relPath.match(/(3x4|4x3|16x9|9x16|1x1)/i);
    const ratio = ratioMatch ? ratioMatch[1].toLowerCase().replace('x', ':') : '3:4';
    const varMatch = relPath.match(/[_-]([A-D])[-_.]/i);
    const variant = varMatch ? varMatch[1].toUpperCase() : 'A';
    const slot = `${ratio.replace(':', 'x')}_${variant}`;
    const baseName = relPath.split('/').pop();
    return { slot, ratio, variant, relPath, label: `款${variant} · ${ratio} (${baseName})` };
  }

  function parsePublishPackMarkdown(mdText, options = {}) {
    const titleMatch = mdText.match(/^#\s+(.+)$/m);
    const packTitle = titleMatch ? titleMatch[1].trim() : (options.sourceLabel || '未命名发布包');

    const sections = {};
    const secRegex = /^##\s+([^\n]+)\n([\s\S]*?)(?=^##\s+)/gm;
    let sm;
    const normalizedMd = mdText.replace(/\r\n/g, '\n') + '\n## __END__\n';
    while ((sm = secRegex.exec(normalizedMd)) !== null) {
      const heading = sm[1].trim();
      const content = sm[2];
      if (heading === '__END__') break;
      if (/00|基础|上传文件/.test(heading)) sections.meta = content;
      else if (/01|小红书/.test(heading)) sections.xhs = content;
      else if (/02|视频号/.test(heading)) sections.wx = content;
      else if (/03|B\s*站|bilibili/i.test(heading)) sections.bili = content;
      else if (/04|抖音/.test(heading)) sections.dy = content;
    }

    const coverSet = new Map();
    const collectCovers = (text = '') => {
      const re = /`([^`\n]*封面[^`\n]*\.(?:png|jpg|jpeg|webp))`|\(([^)\n]*封面[^)\n]*\.(?:png|jpg|jpeg|webp))\)/gi;
      let cm;
      while ((cm = re.exec(text)) !== null) {
        const rel = (cm[1] || cm[2]).trim();
        const normalizedRel = rel.startsWith('封面/') ? rel : (rel.includes('/') ? rel : `封面/${rel}`);
        if (!coverSet.has(normalizedRel)) {
          coverSet.set(normalizedRel, inferCoverMetaFromPath(normalizedRel));
        }
      }
    };
    collectCovers(mdText);

    // 01 小红书
    const xhsSec = sections.xhs || '';
    const xhsTitle = extractCodeBlockAfter(xhsSec, /\*\*(?:主推)?标题[^*\n]*\*\*/) || extractInlineAfter(xhsSec, /\*\*(?:主推)?标题[^*\n]*\*\*/);
    const xhsAltTitles = extractNumberedList(xhsSec, /备选标题/);
    const xhsBodyRaw = extractCodeBlockAfter(xhsSec, /\*\*正文\*\*/);
    const xhsTagLine = extractCodeBlockAfter(xhsSec, /\*\*话题标签\*\*/);
    const xhsTagsFromBlock = splitBodyAndHashtags(xhsTagLine).tags;
    const xhsSplit = splitBodyAndHashtags(xhsBodyRaw);
    const xhsTags = xhsTagsFromBlock.length ? xhsTagsFromBlock : xhsSplit.tags;
    const xhsCover = extractCoverAfter(xhsSec, /\*\*指定封面\*\*/) || '封面/封面_3x4_A.png';
    const xhsCollection = extractInlineAfter(xhsSec, /\*\*合集\*\*/);
    const xhsPinned = extractCodeBlockAfter(xhsSec, /\*\*[^*\n]*置顶(?:首评|评论)[^*\n]*\*\*/);

    // 02 视频号
    const wxSec = sections.wx || '';
    const wxShortRaw = extractCodeBlockAfter(wxSec, /\*\*短标题[^*\n]*\*\*/) || extractInlineAfter(wxSec, /\*\*短标题[^*\n]*\*\*/);
    const wxAltTitles = extractNumberedList(wxSec, /备选短标题/);
    const wxDescRaw = extractCodeBlockAfter(wxSec, /\*\*描述正文\*\*/);
    const wxSplit = splitBodyAndHashtags(wxDescRaw);
    const wxCollection = extractInlineAfter(wxSec, /\*\*合集\*\*/);
    const wxLocation = extractInlineAfter(wxSec, /\*\*位置\*\*/);
    const wxPinned = extractCodeBlockAfter(wxSec, /\*\*[^*\n]*置顶(?:首评|评论)[^*\n]*\*\*/);

    // 03 B 站
    const biliSec = sections.bili || '';
    const biliTitle = extractCodeBlockAfter(biliSec, /\*\*稿件标题[^*\n]*\*\*/);
    const biliAltTitles = extractNumberedList(biliSec, /备选标题/);
    const biliBody = extractCodeBlockAfter(biliSec, /\*\*稿件简介[^*\n]*\*\*/);
    const biliTagsRaw = extractCodeBlockAfter(biliSec, /\*\*普通标签[^*\n]*\*\*/);
    const biliTags = biliTagsRaw
      .split(/[,，\n]/)
      .map((s) => s.replace(/#/g, '').trim())
      .filter(Boolean);
    const biliCategory = extractInlineAfter(biliSec, /\*\*投稿分区\*\*/);
    const biliCollection = extractInlineAfter(biliSec, /\*\*合集\*\*/);
    const biliTopic = extractInlineAfter(biliSec, /\*\*活动话题[^*\n]*\*\*/);
    const biliDynamic = extractCodeBlockAfter(biliSec, /\*\*动态转发语\*\*/);
    const biliPinned = extractCodeBlockAfter(biliSec, /\*\*置顶评论\*\*/);
    const biliCover4x3 = extractCoverAfter(biliSec, /推荐流列表封面/) || '';
    const biliCover16x9 = extractCoverAfter(biliSec, /播放页宽屏封面/) || '';

    // 04 抖音
    const dySec = sections.dy || '';
    const dyExplicitTitle = extractCodeBlockAfter(dySec, /\*\*作品标题[^*\n]*\*\*/);
    const dyAltTitles = extractNumberedList(dySec, /备选标题/);
    const dyDescRaw =
      extractCodeBlockAfter(dySec, /\*\*作品描述[^*\n]*\*\*/) ||
      extractCodeBlockAfter(dySec, /\*\*描述[^*\n]*\*\*/);
    const dySplit = splitBodyAndHashtags(dyDescRaw);
    const dyFallbackTitle = dyExplicitTitle || xhsTitle || (dySplit.bodyOnly.split(/[！!？?。]/)[0] || '').slice(0, 30);
    const dyCollection = extractInlineAfter(dySec, /\*\*合集\*\*/);
    const dyLocation = extractInlineAfter(dySec, /\*\*位置\*\*/);
    const dyCover = extractCoverAfter(dySec, /\*\*指定封面\*\*/);
    const dyPinned = extractCodeBlockAfter(dySec, /\*\*置顶评论\*\*/);

    const metaSec = sections.meta || '';
    const videoFile = extractInlineAfter(metaSec, /\*\*唯一正片文件\*\*/);

    return {
      meta: {
        packTitle,
        mdFileName: options.mdFileName || '发布包_v01.md',
        baseDir: options.baseDir || '',
        videoFile,
        updatedAt: new Date().toISOString(),
        sourceLabel: options.sourceLabel || packTitle,
      },
      covers: Array.from(coverSet.values()),
      platforms: {
        xiaohongshu: {
          collection: xhsCollection,
          coverRel: xhsCover,
          title: xhsTitle,
          altTitles: xhsAltTitles,
          body: xhsSplit.bodyOnly || xhsBodyRaw,
          tags: xhsTags,
          pinnedComment: xhsPinned,
        },
        weixin: {
          collection: wxCollection,
          location: wxLocation,
          coverRel: xhsCover,
          coverSubRel: biliCover4x3,
          shortTitleRaw: wxShortRaw,
          shortTitleClean: sanitizeWeixinShortTitle(wxShortRaw),
          altTitles: wxAltTitles.map(sanitizeWeixinShortTitle),
          body: wxSplit.bodyOnly,
          tags: wxSplit.tags,
          pinnedComment: wxPinned,
        },
        bilibili: {
          category: biliCategory,
          collection: biliCollection,
          coverRel: biliCover4x3,
          coverWideRel: biliCover16x9,
          title: biliTitle,
          altTitles: biliAltTitles,
          body: biliBody,
          tags: biliTags,
          topic: biliTopic,
          dynamicText: biliDynamic,
          pinnedComment: biliPinned,
        },
        douyin: {
          collection: dyCollection,
          location: dyLocation,
          coverRel: dyCover || xhsCover,
          title: dyFallbackTitle,
          altTitles: dyAltTitles.length ? dyAltTitles : xhsAltTitles,
          body: dySplit.bodyOnly,
          tags: dySplit.tags,
          pinnedComment: dyPinned,
        },
      },
    };
  }

  function parseSinglePlatformMarkdown(mdText) {
    const titleMatch = mdText.match(/##\s*标题\s*\n+([^\n#]+)/);
    const bodyMatch = mdText.match(/##\s*(?:正文|简介|描述)\s*\n+([\s\S]+)$/);
    const title = titleMatch ? titleMatch[1].trim() : '';
    const rawBody = bodyMatch ? bodyMatch[1].trim() : mdText.trim();
    const { bodyOnly, tags } = splitBodyAndHashtags(rawBody);
    return { title, body: bodyOnly, tags };
  }

  // ==================== PublishPack v1.0 通用 JSON 开放协议解析与归一化引擎 ====================
  const PLATFORM_ALIASES = {
    xhs: 'xiaohongshu',
    xiaohongshu: 'xiaohongshu',
    weixin: 'weixin',
    weixin_channels: 'weixin',
    channels: 'weixin',
    dy: 'douyin',
    douyin: 'douyin',
    bili: 'bilibili',
    bilibili: 'bilibili',
    ks: 'kuaishou',
    kuaishou: 'kuaishou',
    mp: 'weixin_mp',
    gzh: 'weixin_mp',
    weixin_mp: 'weixin_mp',
    zhihu: 'zhihu',
    weibo: 'weibo',
    yt: 'youtube',
    youtube: 'youtube',
    tt: 'tiktok',
    tiktok: 'tiktok',
    twitter: 'x',
    x: 'x',
    ig: 'instagram',
    instagram: 'instagram',
    xyz: 'xiaoyuzhou',
    xiaoyuzhou: 'xiaoyuzhou',
  };

  function stripJsonCodeFence(raw = '') {
    const trimmed = String(raw || '').trim();
    const fenceMatch = trimmed.match(/^```(?:json|jsonc)?\s*\n([\s\S]*?)\n```\s*$/i);
    return fenceMatch ? fenceMatch[1].trim() : trimmed;
  }

  function normalizeLocationStr(loc) {
    if (!loc) return '';
    if (typeof loc === 'string') return loc.trim();
    if (typeof loc === 'object' && loc.name) return String(loc.name).trim();
    return '';
  }

  function parsePublishPackJson(rawInput, options = {}) {
    const obj = typeof rawInput === 'string' ? JSON.parse(stripJsonCodeFence(rawInput)) : rawInput;
    if (!obj || typeof obj !== 'object') {
      throw new Error('无效的 JSON 对象');
    }

    const rootContentType = obj.contentType || 'video';
    const metaIn = obj.meta || {};
    const defIn = obj.default || {};
    const assetsIn = obj.assets || {};
    const platformsIn = obj.platforms || {};

    // 1. 归一化封面池 assets.covers[] 与图文轮播池 assets.images[]
    const assetById = new Map();
    const covers = [];
    for (const [idx, c] of (assetsIn.covers || []).entries()) {
      if (!c || !c.path) continue;
      const inferred = inferCoverMetaFromPath(c.path);
      const ratio = c.ratio || inferred.ratio;
      const variant = (c.variant || inferred.variant || 'A').toUpperCase();
      const id = c.id || `${ratio.replace(':', 'x')}_${variant}_${idx}`;
      const slot = c.id || `${ratio.replace(':', 'x')}_${variant}`;
      const baseName = c.path.split('/').pop();
      const entry = {
        id,
        slot,
        ratio,
        variant,
        relPath: c.path,
        label: c.label ? `款${variant} · ${ratio} (${c.label})` : `款${variant} · ${ratio} (${baseName})`,
      };
      covers.push(entry);
      assetById.set(id, entry);
      assetById.set(c.path, entry);
    }

    const images = [];
    for (const [idx, img] of (assetsIn.images || []).entries()) {
      if (!img || !img.path) continue;
      const id = img.id || `slide_${idx + 1}`;
      const entry = {
        id,
        index: idx + 1,
        relPath: img.path,
        ratio: img.ratio || '3:4',
        alt: img.alt || img.caption || `图 ${idx + 1}`,
      };
      images.push(entry);
      assetById.set(id, entry);
      assetById.set(img.path, entry);
    }

    const resolveAssetPath = (ref) => {
      if (!ref) return '';
      const hit = assetById.get(ref);
      return hit ? hit.relPath : String(ref);
    };

    // 2. 合并 default 与各平台覆写层
    const rawPlatMap = {};
    for (const [rawKey, val] of Object.entries(platformsIn)) {
      if (!val || typeof val !== 'object') continue;
      const normKey = PLATFORM_ALIASES[rawKey.toLowerCase()] || rawKey.toLowerCase();
      rawPlatMap[normKey] = val;
    }

    const targetIds = new Set([
      'xiaohongshu',
      'weixin',
      'douyin',
      'bilibili',
      'kuaishou',
      'weixin_mp',
      'zhihu',
      'weibo',
      'youtube',
      ...Object.keys(rawPlatMap),
    ]);

    const normalizedPlatforms = {};
    for (const pid of targetIds) {
      const p = rawPlatMap[pid] || {};
      const cType = p.contentType || defIn.contentType || rootContentType;
      const mergedTitle = p.title ?? defIn.title ?? '';
      const rawShort = p.shortTitle ?? defIn.shortTitle ?? mergedTitle;
      const mergedAltTitles = Array.isArray(p.altTitles) && p.altTitles.length ? p.altTitles : defIn.altTitles || [];
      let mergedBody = p.body ?? p.markdown ?? defIn.body ?? defIn.markdown ?? '';
      const mergedChapters = Array.isArray(p.chapters) && p.chapters.length ? p.chapters : defIn.chapters || [];
      if (mergedChapters.length && (pid === 'bilibili' || pid === 'youtube') && !mergedBody.includes('00:')) {
        const chapLines = mergedChapters.map((ch) => `${ch.time} ${ch.title}`).join('\n');
        mergedBody = mergedBody ? `${mergedBody}\n\n${chapLines}` : chapLines;
      }

      const rawTags = Array.isArray(p.tags) && p.tags.length ? p.tags : defIn.tags || [];
      const cleanTags = rawTags.map((t) => String(t).replace(/^#+/, '').trim()).filter(Boolean);

      const mergedOptions = { ...(defIn.options || {}), ...(p.options || {}) };
      const catOpt = mergedOptions.category;
      const categoryStr = Array.isArray(catOpt) ? catOpt.join(' -> ') : catOpt || '';

      const rawImgRefs = Array.isArray(p.imageRefs) && p.imageRefs.length ? p.imageRefs : defIn.imageRefs || [];
      const slidePaths = rawImgRefs.length ? rawImgRefs.map(resolveAssetPath).filter(Boolean) : images.map((im) => im.relPath);

      normalizedPlatforms[pid] = {
        enabled: p.enabled !== false,
        contentType: cType,
        title: mergedTitle,
        shortTitleRaw: rawShort,
        shortTitleClean: sanitizeWeixinShortTitle(rawShort),
        altTitles: pid === 'weixin' ? mergedAltTitles.map(sanitizeWeixinShortTitle) : mergedAltTitles,
        body: mergedBody,
        digest: p.digest ?? defIn.digest ?? '',
        thread: Array.isArray(p.thread) ? p.thread : defIn.thread || [],
        tags: cleanTags,
        collection: p.collection ?? defIn.collection ?? '',
        location: normalizeLocationStr(p.location ?? defIn.location),
        pinnedComment: p.pinnedComment ?? defIn.pinnedComment ?? '',
        coverRel: resolveAssetPath(p.coverPortraitRef || p.coverRef || p.coverLandscapeRef || defIn.coverRef),
        coverSubRel: resolveAssetPath(p.coverLandscapeRef || ''),
        coverWideRel: resolveAssetPath(p.coverWideRef || ''),
        slidePaths,
        category: categoryStr,
        topic: mergedOptions.topic || '',
        dynamicText: mergedOptions.dynamicText || '',
        options: mergedOptions,
      };
    }

    const firstVideo = (assetsIn.videos || [])[0];
    return {
      meta: {
        specVersion: obj.specVersion || '1.0',
        format: 'json',
        contentType: rootContentType,
        packTitle: metaIn.title || defIn.title || options.sourceLabel || 'PublishPack 发布包',
        summary: metaIn.summary || '',
        compliance: metaIn.compliance || {},
        mdFileName: options.fileName || 'publish.pack.json',
        baseDir: options.baseDir || '',
        videoFile: firstVideo?.path || '',
        updatedAt: metaIn.createdAt || new Date().toISOString(),
        sourceLabel: options.sourceLabel || metaIn.title || 'publish.pack.json',
      },
      covers,
      images,
      platforms: normalizedPlatforms,
    };
  }

  // 将当前内存中的任意发布包（含旧版 Markdown 解析结果）一键导出为标准 PublishPack v1.0 JSON
  function exportPackToSpecJson(pack) {
    const p = pack.platforms || {};
    const specObj = {
      $schema: 'https://raw.githubusercontent.com/jingshushu/publish-pack-filler/main/schemas/publish-pack.v1.schema.json',
      specVersion: '1.0',
      contentType: pack.meta?.contentType || 'video',
      meta: {
        title: pack.meta?.packTitle || '',
        compliance: pack.meta?.compliance || { aiLevel: 'none', isOriginal: true },
      },
      assets: {
        videos: pack.meta?.videoFile ? [{ id: 'main_video', path: pack.meta.videoFile }] : [],
        covers: (pack.covers || []).map((c) => ({
          id: c.slot || c.id,
          path: c.relPath,
          ratio: c.ratio,
          variant: c.variant || 'A',
          label: c.label || '',
        })),
        images: (pack.images || []).map((im) => ({
          id: im.id,
          path: im.relPath,
          ratio: im.ratio || '3:4',
          alt: im.alt || '',
        })),
      },
      default: {
        title: p.xiaohongshu?.title || p.douyin?.title || '',
        body: p.xiaohongshu?.body || p.douyin?.body || '',
        tags: p.douyin?.tags || p.xiaohongshu?.tags || [],
        collection: p.xiaohongshu?.collection || '',
        pinnedComment: p.xiaohongshu?.pinnedComment || '',
      },
      platforms: {
        xiaohongshu: p.xiaohongshu
          ? {
              title: p.xiaohongshu.title,
              altTitles: p.xiaohongshu.altTitles || [],
              body: p.xiaohongshu.body,
              tags: p.xiaohongshu.tags || [],
              collection: p.xiaohongshu.collection || '',
              pinnedComment: p.xiaohongshu.pinnedComment || '',
              options: p.xiaohongshu.options || {},
            }
          : undefined,
        weixin_channels: p.weixin
          ? {
              shortTitle: p.weixin.shortTitleClean || p.weixin.shortTitleRaw || '',
              altTitles: p.weixin.altTitles || [],
              body: p.weixin.body,
              tags: p.weixin.tags || [],
              collection: p.weixin.collection || '',
              location: p.weixin.location || '',
              pinnedComment: p.weixin.pinnedComment || '',
              options: p.weixin.options || {},
            }
          : undefined,
        douyin: p.douyin
          ? {
              title: p.douyin.title,
              altTitles: p.douyin.altTitles || [],
              body: p.douyin.body,
              tags: p.douyin.tags || [],
              collection: p.douyin.collection || '',
              location: p.douyin.location || '',
              pinnedComment: p.douyin.pinnedComment || '',
              options: p.douyin.options || {},
            }
          : undefined,
        bilibili: p.bilibili
          ? {
              title: p.bilibili.title,
              altTitles: p.bilibili.altTitles || [],
              body: p.bilibili.body,
              tags: p.bilibili.tags || [],
              collection: p.bilibili.collection || '',
              pinnedComment: p.bilibili.pinnedComment || '',
              options: {
                ...(p.bilibili.options || {}),
                category: p.bilibili.category || p.bilibili.options?.category || '',
                topic: p.bilibili.topic || p.bilibili.options?.topic || '',
                dynamicText: p.bilibili.dynamicText || p.bilibili.options?.dynamicText || '',
              },
            }
          : undefined,
      },
    };
    return JSON.stringify(specObj, null, 2);
  }

  // 灵活按相对路径或文件名匹配本地缓存的图片 Blob（解耦任意图片命名与子文件夹结构）
  function findBlobFlexible(blobsMap, targetRelPath) {
    if (!targetRelPath || !blobsMap || !blobsMap.size) return null;
    if (blobsMap.has(targetRelPath)) return blobsMap.get(targetRelPath);
    const targetBase = targetRelPath.split('/').pop();
    for (const [k, blob] of blobsMap.entries()) {
      if (k === targetBase || k.split('/').pop() === targetBase) {
        return blob;
      }
    }
    return null;
  }

  // ==================== IndexedDB + 跨平台 GM_setValue 封面共享存储 ====================
  function openCoverDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE, { keyPath: 'relPath' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  async function dataURLToBlob(dataUrl) {
    const res = await fetch(dataUrl);
    return await res.blob();
  }

  // 保存封面至本域 IndexedDB，并同步写入扩展/油猴跨平台存储（实现选一次目录，小红书/视频号/抖音/B站直接共享封面！）
  async function saveCoversCrossPlatform(coverRecords) {
    try {
      const db = await openCoverDB();
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      store.clear();
      for (const rec of coverRecords) store.put(rec);
    } catch {
      // ignore IDB error
    }

    try {
      await xStorageClearByPrefix(CROSS_COVER_PREFIX);
      for (const rec of coverRecords) {
        const dataUrl = await blobToDataURL(rec.blob);
        await xStorageSet(CROSS_COVER_PREFIX + rec.relPath, dataUrl);
      }
    } catch {
      // 个别环境超配额时自动忽略，不影响当前域使用
    }
  }

  async function loadCoversCrossPlatform() {
    const map = new Map();
    // 1. 优先从 Chrome 扩展 / Tampermonkey 跨平台存储读取
    try {
      const entries = await xStorageEntriesByPrefix(CROSS_COVER_PREFIX);
      for (const [k, dataUrl] of entries) {
        const relPath = k.slice(CROSS_COVER_PREFIX.length);
        if (typeof dataUrl === 'string' && dataUrl.startsWith('data:')) {
          const blob = await dataURLToBlob(dataUrl);
          map.set(relPath, blob);
        }
      }
      if (map.size > 0) return map;
    } catch {
      // fallback to IDB
    }

    // 2. 回退本域 IndexedDB
    try {
      const db = await openCoverDB();
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.getAll();
      const list = await new Promise((res) => {
        req.onsuccess = () => res(req.result || []);
        req.onerror = () => res([]);
      });
      for (const item of list) {
        if (item.relPath && item.blob) map.set(item.relPath, item.blob);
      }
    } catch {
      // ignore
    }
    return map;
  }

  async function detectImageBlobRatio(blob, fallbackRatio = '3:4') {
    if (!blob) return fallbackRatio;
    const url = URL.createObjectURL(blob);
    try {
      const { w, h } = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
        img.onerror = reject;
        img.src = url;
      });
      if (!w || !h) return fallbackRatio;
      const r = w / h;
      if (Math.abs(r - 3 / 4) < 0.08) return '3:4';
      if (Math.abs(r - 4 / 3) < 0.09) return '4:3';
      if (Math.abs(r - 16 / 9) < 0.14) return '16:9';
      if (Math.abs(r - 9 / 16) < 0.08) return '9:16';
      if (Math.abs(r - 1) < 0.08) return '1:1';
      return r < 1 ? '3:4' : '4:3';
    } catch {
      return fallbackRatio;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  // ==================== 深度穿透查找（全面支持视频号 Wujie ShadowDOM + 同源 iframe） ====================
  function queryDeepAll(selector, rootNode = null) {
    const results = [];
    const visitedRoots = new Set();

    const visit = (root) => {
      if (!root || visitedRoots.has(root) || !root.querySelectorAll) return;
      visitedRoots.add(root);

      try {
        const matched = root.querySelectorAll(selector);
        for (const el of matched) results.push(el);
      } catch {
        // 忽略低版本浏览器不支持的选择器语法
      }

      const all = root.querySelectorAll('*');
      for (const el of all) {
        if (el.shadowRoot) {
          visit(el.shadowRoot);
        }
        if (el.tagName === 'IFRAME') {
          try {
            if (el.contentDocument) visit(el.contentDocument);
          } catch {
            // 跨域 iframe 忽略
          }
        }
      }
    };

    visit(rootNode || document);
    return results;
  }

  function isVisible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const win = el.ownerDocument?.defaultView || window;
    const style = win.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0;
  }

  function findFirstVisible(selectors, scopeRoot = null) {
    for (const sel of selectors) {
      const all = queryDeepAll(sel, scopeRoot);
      for (const el of all) {
        if (isVisible(el)) return el;
      }
    }
    return null;
  }

  // ==================== 拟人交互原语（全事件携带 composed: true 穿透 Wujie ShadowDOM） ====================
  async function humanMouseClick(targetEl) {
    if (!targetEl || !isVisible(targetEl)) return false;
    try {
      targetEl.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    } catch {
      // ignore
    }
    await humanSleep(40, 90);

    const doc = targetEl.ownerDocument;
    const win = doc.defaultView || window;
    const rect = targetEl.getBoundingClientRect();

    const jitterX = randFloat(-rect.width * 0.2, rect.width * 0.2);
    const jitterY = randFloat(-rect.height * 0.2, rect.height * 0.2);
    const clientX = Math.round((rect.left + rect.width / 2 + jitterX) * 10) / 10;
    const clientY = Math.round((rect.top + rect.height / 2 + jitterY) * 10) / 10;
    const screenX = Math.round(clientX + (win.screenX || 0));
    const screenY = Math.round(clientY + (win.screenY || 80));

    for (const step of [0.45, 0.82]) {
      const mx = clientX - randFloat(16, 42) * (1 - step);
      const my = clientY + randFloat(-18, 22) * (1 - step);
      const moveInit = { bubbles: true, cancelable: true, composed: true, view: win, clientX: mx, clientY: my };
      if (typeof win.PointerEvent === 'function') {
        targetEl.dispatchEvent(new win.PointerEvent('pointermove', { ...moveInit, pointerType: 'mouse' }));
      }
      targetEl.dispatchEvent(new win.MouseEvent('mousemove', moveInit));
      await humanSleep(20, 45);
    }

    const baseCoords = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: win,
      clientX,
      clientY,
      screenX,
      screenY,
    };

    if (typeof win.PointerEvent === 'function') {
      targetEl.dispatchEvent(new win.PointerEvent('pointerover', { ...baseCoords, pointerType: 'mouse' }));
      targetEl.dispatchEvent(new win.PointerEvent('pointerenter', { ...baseCoords, bubbles: false, pointerType: 'mouse' }));
    }
    targetEl.dispatchEvent(new win.MouseEvent('mouseover', baseCoords));
    targetEl.dispatchEvent(new win.MouseEvent('mouseenter', { ...baseCoords, bubbles: false }));
    await humanSleep(90, 205);

    if (typeof win.PointerEvent === 'function') {
      targetEl.dispatchEvent(
        new win.PointerEvent('pointerdown', { ...baseCoords, button: 0, buttons: 1, pointerType: 'mouse', isPrimary: true })
      );
    }
    targetEl.dispatchEvent(new win.MouseEvent('mousedown', { ...baseCoords, button: 0, buttons: 1, detail: 1 }));
    if (typeof targetEl.focus === 'function') {
      try {
        targetEl.focus({ preventScroll: true });
      } catch {
        // ignore
      }
    }

    await humanSleep(58, 136);

    if (typeof win.PointerEvent === 'function') {
      targetEl.dispatchEvent(
        new win.PointerEvent('pointerup', { ...baseCoords, button: 0, buttons: 0, pointerType: 'mouse', isPrimary: true })
      );
    }
    targetEl.dispatchEvent(new win.MouseEvent('mouseup', { ...baseCoords, button: 0, buttons: 0, detail: 1 }));
    targetEl.dispatchEvent(new win.MouseEvent('click', { ...baseCoords, button: 0, buttons: 0, detail: 1 }));
    return true;
  }

  function dispatchFilesToInput(fileInput, blob, fileName) {
    const win = fileInput.ownerDocument?.defaultView || window;
    try {
      fileInput.value = '';
    } catch {
      // ignore
    }
    const file = new win.File([blob], fileName, {
      type: blob.type || 'image/png',
      lastModified: Date.now(),
    });
    const dt = new win.DataTransfer();
    dt.items.add(file);
    fileInput.files = dt.files;
    fileInput.dispatchEvent(new win.Event('input', { bubbles: true, composed: true }));
    fileInput.dispatchEvent(new win.Event('change', { bubbles: true, composed: true }));
  }

  // ==================== 四平台专属封面注入与裁剪比例自适应引擎 ====================
  function normalizeRatioText(str = '') {
    return str.replace(/\s+/g, '').replace(/：/g, ':');
  }

  function findVisibleCoverModal() {
    const modalCandidates = queryDeepAll(
      'div.dy-creator-content-modal, div.weui-desktop-dialog, [role="dialog"], [class*="modal" i], [class*="dialog" i], [class*="drawer" i], [class*="cover" i], [class*="crop" i]'
    );
    for (let i = modalCandidates.length - 1; i >= 0; i--) {
      const el = modalCandidates[i];
      if (!isVisible(el)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 360 || rect.height < 260) continue;
      const txt = el.textContent || '';
      if (/设置封面|编辑封面|封面设置|裁剪封面|裁剪设置|设置竖封面|设置横封面|编辑个人主页卡片|编辑视频号动态封面|编辑动态封面/.test(txt)) {
        return el;
      }
    }

    const titleLeaves = queryDeepAll('div, span, h1, h2, h3, h4, header');
    for (let i = titleLeaves.length - 1; i >= 0; i--) {
      const el = titleLeaves[i];
      if (!isVisible(el)) continue;
      const t = (el.textContent || '').trim();
      if (/^(?:设置封面|编辑封面|封面设置|裁剪封面|编辑个人主页卡片|编辑视频号动态封面|编辑动态封面)$/.test(t)) {
        let cur = el.parentElement;
        while (cur && cur !== document.body && cur !== document.documentElement) {
          const r = cur.getBoundingClientRect();
          if (r.width >= 400 && r.height >= 280) return cur;
          cur = cur.parentElement;
        }
      }
    }
    return null;
  }

  function findRatioOptionCard(candidateRatios, scopeModal = null) {
    const allElements = queryDeepAll('div, span, button, label, li, a', scopeModal);

    for (const ratio of candidateRatios) {
      for (const el of allElements) {
        if (!isVisible(el)) continue;
        const norm = normalizeRatioText(el.textContent || '');
        if (norm !== ratio) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width < 10 || rect.width > 175 || rect.height < 10 || rect.height > 175) continue;

        let card = el;
        while (card.parentElement && isVisible(card.parentElement)) {
          const pNorm = normalizeRatioText(card.parentElement.textContent || '');
          const pRect = card.parentElement.getBoundingClientRect();
          if (pNorm === ratio && pRect.width <= 180 && pRect.height <= 180) {
            card = card.parentElement;
          } else {
            break;
          }
        }
        return { card, matchedRatio: ratio };
      }

      const prefixRe = new RegExp(
        `^(?:竖版|横版|竖封面|横封面|推荐封面|列表封面|播放页封面|空间封面)?${ratio.replace(':', '\\:')}(?:竖版|横版|封面)?$`
      );
      for (const el of allElements) {
        if (!isVisible(el)) continue;
        const norm = normalizeRatioText(el.textContent || '');
        if (!prefixRe.test(norm)) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width < 16 || rect.width > 220 || rect.height < 14 || rect.height > 160) continue;
        return { card: el, matchedRatio: ratio };
      }
    }
    return null;
  }

  function isElementExplicitlyActive(el) {
    let cur = el;
    for (let depth = 0; depth < 3 && cur; depth++) {
      const cls = String(cur.className || '');
      const aria = `${cur.getAttribute?.('aria-selected') || ''} ${cur.getAttribute?.('aria-checked') || ''}`;
      if (/(?:^|[-_\s])(active|selected|checked|current|is-active)(?:$|[-_\s])/i.test(cls) || /true/i.test(aria)) {
        return true;
      }
      cur = cur.parentElement;
    }
    return false;
  }

  function buildRatioCandidates(actualRatio, platform) {
    const map = {
      '3:4': ['3:4', '9:16'],
      '9:16': platform === 'xiaohongshu' ? ['3:4', '9:16'] : ['9:16', '3:4'],
      '4:3': ['4:3', '16:9'],
      '16:9': platform === 'xiaohongshu' ? ['4:3', '16:9'] : ['16:9', '4:3'],
      '1:1': ['1:1', '3:4'],
    };
    return map[actualRatio] || [actualRatio, '3:4', '4:3'];
  }

  // 1. 微信视频号封面注入专属流程（兼容 Wujie ShadowDOM 下的 3:4 个人主页卡片 & 4:3 视频号动态双弹窗）
  async function injectCoverWeixin(blob, fileName, actualRatio, onProgress) {
    const isPortrait = actualRatio === '3:4' || actualRatio === '9:16';
    const findWxDialog = () => {
      const dialogs = queryDeepAll('div.weui-desktop-dialog');
      for (let i = dialogs.length - 1; i >= 0; i--) {
        if (!isVisible(dialogs[i])) continue;
        const txt = dialogs[i].textContent || '';
        if (/封面|个人主页卡片|动态/.test(txt) && !/切换视频号/.test(txt)) {
          return dialogs[i];
        }
      }
      return null;
    };

    let dialog = findWxDialog();

    // 若用户尚未点开视频号封面弹窗，自动按比例拟人点开对应的「个人主页卡片(3:4)」或「视频号动态(4:3)」卡片
    if (!dialog) {
      const wrapSelectors = isPortrait
        ? ['div.vertical-cover-wrap', 'div[class*="vertical-cover"]']
        : ['div.horizontal-cover-wrap', 'div[class*="horizontal-cover"]'];
      let trigger = findFirstVisible(wrapSelectors);
      if (!trigger) {
        const allDivs = queryDeepAll('div');
        trigger = allDivs.find((el) => {
          if (!isVisible(el)) return false;
          const r = el.getBoundingClientRect();
          if (r.width < 50 || r.width > 320 || r.height < 50 || r.height > 360) return false;
          const t = (el.textContent || '').trim();
          return isPortrait ? /个人主页卡片|3\s*:\s*4/.test(t) : /视频号动态|横版封面|4\s*:\s*3/.test(t);
        });
      }
      if (trigger) {
        onProgress?.(`⏳ 正在打开视频号「${isPortrait ? '3:4 个人主页卡片' : '4:3 动态封面'}」弹窗...`);
        await humanMouseClick(trigger);
        await humanSleep(680, 1080);
        dialog = findWxDialog();
      }
    }

    if (!dialog) {
      return {
        ok: false,
        msg: `请先在视频号页面点击「${isPortrait ? '个人主页卡片 (3:4)' : '视频号动态封面 (4:3)'}」打开编辑弹窗后再点注入。`,
      };
    }

    // 严格限定在当前可见的 weui-desktop-dialog 内寻找封面上传框（防止误触主视频上传框或隐藏的另一个封面弹窗）
    let targetInput =
      queryDeepAll('.single-cover-uploader-wrap input[type="file"]', dialog)[0] ||
      queryDeepAll('input[type="file"][accept*="image" i]', dialog)[0] ||
      queryDeepAll('input[type="file"]', dialog)[0];

    if (!targetInput) {
      // 部分状态下需先点一下弹窗内的「上传封面 / 更换封面」图标区唤醒 input
      const upBtn = queryDeepAll('div, button, span, label', dialog).find((el) => {
        if (!isVisible(el)) return false;
        const t = (el.textContent || '').trim();
        return /^(?:上传封面|上传图片|更换封面|本地上传|\+)$/.test(t) && el.getBoundingClientRect().width < 220;
      });
      if (upBtn) {
        await humanMouseClick(upBtn);
        await humanSleep(420, 700);
        targetInput =
          queryDeepAll('.single-cover-uploader-wrap input[type="file"]', dialog)[0] ||
          queryDeepAll('input[type="file"]', dialog)[0];
      }
    }

    if (!targetInput) {
      return {
        ok: false,
        msg: '在当前视频号封面弹窗内未检测到文件上传槽，请确认弹窗内可上传自定义图片。',
      };
    }

    onProgress?.(`⏳ 正在注入视频号 ${actualRatio} 封面图...`);
    await humanSleep(200, 390);
    dispatchFilesToInput(targetInput, blob, fileName);

    await humanSleep(780, 1200);
    // 若弹窗内存在比例切换选项（如 3:4 / 4:3），同步拟人选中
    const ratioFound = findRatioOptionCard(buildRatioCandidates(actualRatio, 'weixin'), dialog);
    if (ratioFound) {
      await humanMouseClick(ratioFound.card);
      await humanSleep(300, 520);
    }

    return {
      ok: true,
      msg: `已注入视频号 ${actualRatio} 封面！请在裁剪框核对画面后手动点击「确定 / 确认」。`,
    };
  }

  // 2. 抖音封面注入专属流程（先切「设置竖封面 / 设置横封面」，并精准绕开左侧「AI生成参考图」陷阱上传槽）
  async function injectCoverDouyin(blob, fileName, actualRatio, onProgress) {
    const isPortrait = actualRatio === '3:4' || actualRatio === '9:16';
    const findDyModal = () => {
      const m = findFirstVisible(['div.dy-creator-content-modal']);
      if (m) return m;
      return findVisibleCoverModal();
    };

    let modal = findDyModal();
    if (!modal) {
      return {
        ok: false,
        msg: '请先在抖音页面点击封面区的「选择封面 / 编辑封面」打开封面弹窗后再点注入。',
      };
    }

    // 第一步：在注入图片前，先根据图片比例拟人切换顶部「设置竖封面」或「设置横封面」Tab！
    const targetTabText = isPortrait ? '设置竖封面' : '设置横封面';
    const allNodes = queryDeepAll('div, span, button, li', modal);
    const orientTab = allNodes.find((el) => {
      if (!isVisible(el)) return false;
      const t = (el.textContent || '').trim();
      const r = el.getBoundingClientRect();
      return (t === targetTabText || t === (isPortrait ? '竖封面' : '横封面')) && r.width <= 200 && r.height <= 80;
    });

    if (orientTab && !isElementExplicitlyActive(orientTab)) {
      onProgress?.(`⏳ 正在切换至抖音「${targetTabText}」...`);
      await humanMouseClick(orientTab);
      await humanSleep(580, 920);
      modal = findDyModal() || modal;
    }

    // 第二步：若当前停在「截取视频帧」且存在独立的「上传封面」Tab，先拟人切过去
    const findRealDyUploadInput = (scope) => {
      const allInputs = queryDeepAll('input.semi-upload-hidden-input, input[type="file"]', scope).filter((inp) => {
        const accept = (inp.getAttribute('accept') || '').toLowerCase();
        if (accept.includes('video') || accept.includes('.mp4')) return false;
        // 关键排雷：剔除抖音弹窗左侧「生成参考图 (AI封面)」的上传框（其特征为 .semi-upload-drag-area-custom 或文案含“参考图”）
        const semiWrap = inp.closest?.('.semi-upload');
        if (semiWrap) {
          if (semiWrap.querySelector('.semi-upload-drag-area-custom')) return false;
          const wrapTxt = semiWrap.textContent || '';
          if (/参考图/.test(wrapTxt)) return false;
        }
        return true;
      });

      // 优先选择带 .semi-upload-drag-area-main-text（「点击上传文件或拖拽…」）的真正封面槽
      const mainSlot = allInputs.find((inp) => {
        const semiWrap = inp.closest?.('.semi-upload');
        return semiWrap && semiWrap.querySelector('.semi-upload-drag-area-main-text');
      });
      return mainSlot || allInputs[allInputs.length - 1] || null;
    };

    let targetInput = findRealDyUploadInput(modal);
    if (!targetInput) {
      const uploadSubTab = queryDeepAll('div, span, button, li', modal).find((el) => {
        if (!isVisible(el)) return false;
        const t = (el.textContent || '').trim();
        const r = el.getBoundingClientRect();
        return t === '上传封面' && r.width <= 180 && r.height <= 70;
      });
      if (uploadSubTab) {
        onProgress?.('⏳ 正在展开「上传封面」区域...');
        await humanMouseClick(uploadSubTab);
        await humanSleep(480, 780);
        modal = findDyModal() || modal;
        targetInput = findRealDyUploadInput(modal);
      }
    }

    if (!targetInput) {
      return {
        ok: false,
        msg: '在抖音封面弹窗中未定位到封面上传槽，请确认当前处于「上传封面」视图。',
      };
    }

    // 第三步：拟人停顿后注入图片
    onProgress?.(`⏳ 正在向「${targetTabText}」载入 ${actualRatio} 封面图...`);
    await humanSleep(210, 400);
    dispatchFilesToInput(targetInput, blob, fileName);

    // 第四步：等待抖音预览与裁剪框渲染（840ms ~ 1320ms），随后自动点选匹配的比例（如 3:4 / 4:3 / 16:9 / 9:16）
    onProgress?.(`⏳ 封面已载入，正在同步检查 ${actualRatio} 裁剪比例...`);
    await humanSleep(840, 1320);

    const activeModal = findDyModal() || modal;
    const ratioFound = findRatioOptionCard(buildRatioCandidates(actualRatio, 'douyin'), activeModal);
    if (ratioFound) {
      await humanMouseClick(ratioFound.card);
      await humanSleep(360, 580);
    }

    return {
      ok: true,
      msg: `已注入抖音「${targetTabText} (${actualRatio})」！等待右下角「完成」按钮亮起后手动点击即可。`,
    };
  }

  // 3. 通用（小红书 / B站）+ 分发入口
  async function injectCoverAndSelectCropRatio(blob, fileName, expectedRatio, platform, onProgress) {
    const actualRatio = await detectImageBlobRatio(blob, expectedRatio || '3:4');

    if (platform === 'weixin') {
      return await injectCoverWeixin(blob, fileName, actualRatio, onProgress);
    }
    if (platform === 'douyin') {
      return await injectCoverDouyin(blob, fileName, actualRatio, onProgress);
    }

    // 小红书 & B站流程
    const modal = findVisibleCoverModal();
    const filterImageInputs = (list) =>
      list.filter((inp) => {
        const accept = (inp.getAttribute('accept') || '').toLowerCase();
        const isImg = accept.includes('image') || accept.includes('.png') || accept.includes('.jpg') || accept.includes('.jpeg');
        const isVideo = accept.includes('video') || accept.includes('.mp4') || accept.includes('.mov');
        return isImg && !isVideo;
      });

    let imageInputs = modal ? filterImageInputs(queryDeepAll('input[type="file"]', modal)) : [];
    if (!imageInputs.length) {
      imageInputs = filterImageInputs(queryDeepAll('input[type="file"]'));
    }

    const targetInput = imageInputs[imageInputs.length - 1];
    if (!targetInput) {
      return {
        ok: false,
        msg: '未检测到封面上传框：请先手动点开平台的「设置封面 / 编辑封面」弹窗后再点注入。',
      };
    }

    onProgress?.(`⏳ 正在载入 ${actualRatio} 封面图...`);
    await humanSleep(190, 380);
    dispatchFilesToInput(targetInput, blob, fileName);

    onProgress?.(`⏳ 封面已上屏，等待画面就绪后切换至 ${actualRatio} 裁剪比例...`);
    await humanSleep(780, 1240);

    const activeModal = findVisibleCoverModal() || modal;
    const candidateRatios = buildRatioCandidates(actualRatio, platform);
    let found = findRatioOptionCard(candidateRatios, activeModal);

    if (!found) {
      const tabEls = queryDeepAll('div, span, button, li', activeModal);
      const cropTab = tabEls.find((el) => {
        if (!isVisible(el)) return false;
        const t = (el.textContent || '').trim();
        const r = el.getBoundingClientRect();
        return t === '裁剪' && r.width <= 120 && r.height <= 120;
      });
      if (cropTab) {
        onProgress?.('⏳ 正在展开「裁剪」面板...');
        await humanMouseClick(cropTab);
        await humanSleep(440, 760);
        found = findRatioOptionCard(candidateRatios, findVisibleCoverModal() || activeModal);
      }
    }

    if (!found) {
      return {
        ok: true,
        msg: `已注入封面 ${fileName}（请核对裁剪框后手动点击完成）`,
      };
    }

    await humanMouseClick(found.card);

    await humanSleep(480, 720);
    const recheckModal = findVisibleCoverModal() || activeModal;
    const recheckTarget = findRatioOptionCard([found.matchedRatio], recheckModal);
    const default4x3 = found.matchedRatio !== '4:3' ? findRatioOptionCard(['4:3'], recheckModal) : null;
    if (
      recheckTarget &&
      default4x3 &&
      isElementExplicitlyActive(default4x3.card) &&
      !isElementExplicitlyActive(recheckTarget.card)
    ) {
      await humanSleep(220, 380);
      await humanMouseClick(recheckTarget.card);
    }

    return {
      ok: true,
      msg: `已注入封面并自动选中「${found.matchedRatio}」裁剪比例！请核对画面后手动点完成。`,
    };
  }

  // ==================== 表单文本与富文本拟人输入（兼容 Wujie / Semi Design / TipTap / Quill） ====================
  async function humanFillTextInput(inputEl, text) {
    if (!inputEl) return false;
    const win = inputEl.ownerDocument?.defaultView || window;
    await humanMouseClick(inputEl);
    inputEl.focus();
    await humanSleep(140, 300);

    // 直接从实例自身原型链取原生 value setter，兼容同源 iframe 与 Wujie 代理节点
    const proto = Object.getPrototypeOf(inputEl);
    const nativeSetter =
      Object.getOwnPropertyDescriptor(proto, 'value')?.set ||
      Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value')?.set ||
      Object.getOwnPropertyDescriptor(win.HTMLTextAreaElement.prototype, 'value')?.set;

    if (nativeSetter) {
      nativeSetter.call(inputEl, text);
    } else {
      inputEl.value = text;
    }

    inputEl.dispatchEvent(
      new win.InputEvent('input', {
        bubbles: true,
        cancelable: true,
        composed: true,
        inputType: 'insertFromPaste',
        data: text,
      })
    );
    inputEl.dispatchEvent(new win.Event('change', { bubbles: true, composed: true }));
    await humanSleep(220, 440);
    return true;
  }

  function resolveEditableNode(el) {
    if (!el) return null;
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' || el.isContentEditable) return el;
    const inner = el.querySelector?.('[contenteditable="true"], textarea, input');
    return inner || el;
  }

  function placeCaretAtEnd(editorEl) {
    const doc = editorEl.ownerDocument;
    const win = doc.defaultView || window;
    editorEl.focus();
    const sel = win.getSelection();
    if (!sel) return;
    try {
      const range = doc.createRange();
      range.selectNodeContents(editorEl);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    } catch {
      // ignore ShadowDOM selection edge case
    }
  }

  async function clearRichEditor(editorEl) {
    const doc = editorEl.ownerDocument;
    const win = doc.defaultView || window;
    await humanMouseClick(editorEl);
    editorEl.focus();
    await humanSleep(120, 240);
    doc.execCommand('selectAll', false, null);
    await humanSleep(80, 150);
    doc.execCommand('delete', false, null);
    // 若在 ShadowDOM (Wujie) 内 selectAll 未清空干净，安全兜底清空残余文本并触发 input
    if ((editorEl.textContent || '').trim().length > 0) {
      const sel = win.getSelection();
      if (sel) {
        try {
          const range = doc.createRange();
          range.selectNodeContents(editorEl);
          sel.removeAllRanges();
          sel.addRange(range);
          doc.execCommand('delete', false, null);
        } catch {
          // ignore
        }
      }
    }
    await humanSleep(130, 250);
  }

  async function insertTextIntoEditor(editorEl, text) {
    const doc = editorEl.ownerDocument;
    const win = doc.defaultView || window;
    const beforeLen = (editorEl.textContent || '').length;
    const ok = doc.execCommand('insertText', false, text);
    const afterLen = (editorEl.textContent || '').length;

    // 若浏览器在 Wujie ShadowDOM 下拦截了 execCommand('insertText')，用粘贴事件 / InputEvent 兜底
    if (!ok && afterLen === beforeLen && text.length > 0) {
      const dt = new win.DataTransfer();
      dt.setData('text/plain', text);
      const pasteEvt = new win.ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        composed: true,
        clipboardData: dt,
      });
      const notCancelled = editorEl.dispatchEvent(pasteEvt);
      if (notCancelled && (editorEl.textContent || '').length === beforeLen) {
        editorEl.textContent = (editorEl.textContent || '') + text;
        editorEl.dispatchEvent(
          new win.InputEvent('input', {
            bubbles: true,
            cancelable: true,
            composed: true,
            inputType: 'insertText',
            data: text,
          })
        );
      }
    }
  }

  async function humanFillRichEditor(editorEl, bodyText, { append = false } = {}) {
    const target = resolveEditableNode(editorEl);
    if (!target) return false;
    const doc = target.ownerDocument;

    if (!append) {
      await clearRichEditor(target);
    } else {
      await humanMouseClick(target);
      placeCaretAtEnd(target);
      await humanSleep(120, 240);
    }

    const lines = bodyText.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.length > 0) {
        await insertTextIntoEditor(target, line);
      }
      if (i < lines.length - 1) {
        const inserted = doc.execCommand('insertParagraph', false, null);
        if (!inserted) {
          await insertTextIntoEditor(target, '\n');
        }
      }
      await humanSleep(110, 250);
    }
    return true;
  }

  // 在富文本末尾敲入单个 #话题（适配小红书 / 抖音 / 微信视频号）
  async function typeSingleHashtagPrompt(editorEl, tagWord, { autoConfirmEnter = false, platform = 'xiaohongshu' } = {}) {
    const target = resolveEditableNode(editorEl);
    if (!target || !tagWord) return false;
    const doc = target.ownerDocument;
    const win = doc.defaultView || window;

    await humanMouseClick(target);
    placeCaretAtEnd(target);
    await humanSleep(130, 260);

    // 微信视频号规则：输入 ` #话题词 ` 加空格即可触发话题识别（也可点候选框）
    if (platform === 'weixin') {
      await insertTextIntoEditor(target, ` #${tagWord}`);
      await humanSleep(320, 580);
      await insertTextIntoEditor(target, ' ');
      const spaceInit = { key: ' ', code: 'Space', keyCode: 32, which: 32, bubbles: true, cancelable: true, composed: true };
      target.dispatchEvent(new win.KeyboardEvent('keydown', spaceInit));
      target.dispatchEvent(new win.KeyboardEvent('keyup', spaceInit));
      await humanSleep(220, 420);
      return true;
    }

    await insertTextIntoEditor(target, ` #${tagWord}`);
    if (!autoConfirmEnter) {
      return true;
    }

    await humanSleep(820, 1180);
    const dropdownSelectors =
      platform === 'xiaohongshu'
        ? [
            '.publish-topic-item',
            '[class*="topic-item" i]',
            '.tippy-box [class*="item" i]',
            '[class*="mention-list" i] [class*="item" i]',
            '[class*="suggestion" i] li',
          ]
        : [
            '.semi-portal [class*="mention" i] [class*="item" i]',
            '[class*="mention-wrapper" i] [class*="item" i]',
            '[class*="at-panel" i] [class*="item" i]',
            '[class*="topic-item" i]',
          ];

    const firstCandidate = findFirstVisible(dropdownSelectors);
    if (firstCandidate) {
      await humanMouseClick(firstCandidate);
    } else {
      // 抖音支持空格收束 #话题（见 social-auto-upload 实测），小红书支持回车
      if (platform === 'douyin') {
        await insertTextIntoEditor(target, ' ');
      } else {
        const enterInit = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true, composed: true };
        target.dispatchEvent(new win.KeyboardEvent('keydown', enterInit));
        target.dispatchEvent(new win.KeyboardEvent('keyup', enterInit));
        await humanSleep(150, 260);
        await insertTextIntoEditor(target, ' ');
      }
    }
    await humanSleep(420, 740);
    return true;
  }

  // 视频号 & 抖音「添加到合集」一键精确匹配助手（找不到同名合集时自动收起，绝不乱选）
  async function autoSelectCollection(platform, collectionName) {
    if (!collectionName) return { ok: false, msg: '发布包未配置合集名称' };

    if (platform === 'weixin') {
      // 视频号偶尔在上传后弹出非强制「切换视频号」遮罩，先检查跳过
      const cancelSwitch = findFirstVisible([
        '.changeAccount-dialog .weui-desktop-dialog__close-btn',
      ]);
      if (cancelSwitch) {
        await humanMouseClick(cancelSwitch);
        await humanSleep(400, 650);
      }

      const allNodes = queryDeepAll('div, span, label');
      const labelNode = allNodes.find((el) => isVisible(el) && (el.textContent || '').trim() === '添加到合集');
      const dropdown = labelNode?.nextElementSibling || labelNode?.parentElement?.nextElementSibling;
      if (!dropdown || !isVisible(dropdown)) {
        return { ok: false, msg: '未找到视频号「添加到合集」下拉框（请确认视频已上传，已为您复制合集名）' };
      }

      await humanMouseClick(dropdown);
      await humanSleep(580, 900);

      const options = queryDeepAll('.option-list-wrap .option-item, [class*="option-item"]');
      const matched = options.find((opt) => {
        const nameEl = opt.querySelector('.name') || opt;
        return (nameEl.textContent || '').trim() === collectionName;
      });

      if (!matched) {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }));
        return { ok: false, msg: `视频号合集列表中未找到「${collectionName}」，已保持未选` };
      }

      await humanMouseClick(matched);
      return { ok: true, msg: `已自动选中视频号合集：「${collectionName}」` };
    }

    if (platform === 'douyin') {
      // 先按 Escape 收起可能残留的抖音 #话题 浮层，防止遮挡合集下拉框
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }));
      await humanSleep(220, 380);

      const triggerWrap = findFirstVisible(['[class*="select-collection-"]']);
      const selection = triggerWrap?.querySelector('.semi-select-selection') || triggerWrap;
      if (!selection || !isVisible(selection)) {
        return { ok: false, msg: '未找到抖音「添加合集」下拉框（请等待视频上传渲染表单，已为您复制合集名）' };
      }

      await humanMouseClick(selection);
      await humanSleep(620, 960);

      const options = queryDeepAll('.semi-select-option.collection-option, .semi-select-option');
      const matched = options.find((opt) => {
        if (!isVisible(opt)) return false;
        const titleEl = opt.querySelector('[class*="option-title-"]') || opt;
        return (titleEl.textContent || '').trim() === collectionName;
      });

      if (!matched) {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }));
        return { ok: false, msg: `抖音合集列表中未找到「${collectionName}」，已保持未选` };
      }

      await humanMouseClick(matched);
      return { ok: true, msg: `已自动选中抖音合集：「${collectionName}」` };
    }

    return { ok: false, msg: '当前平台请手动粘贴合集名' };
  }

  async function fillBilibiliTagPills(tags = []) {
    const tagInput = findFirstVisible([
      'input[placeholder*="按回车键Enter创建标签"]',
      'input[placeholder*="创建标签"]',
      '.tag-input-wrp input',
    ]);
    if (!tagInput) return { ok: false, reason: '未找到 B 站标签输入框' };

    const win = tagInput.ownerDocument?.defaultView || window;
    for (const rawTag of tags.slice(0, 10)) {
      const cleanTag = rawTag.replace(/#/g, '').trim();
      if (!cleanTag) continue;
      await humanFillTextInput(tagInput, cleanTag);
      const enterInit = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true, composed: true };
      tagInput.dispatchEvent(new win.KeyboardEvent('keydown', enterInit));
      tagInput.dispatchEvent(new win.KeyboardEvent('keypress', enterInit));
      tagInput.dispatchEvent(new win.KeyboardEvent('keyup', enterInit));
      await humanSleep(340, 580);
    }
    return { ok: true };
  }

  // ==================== 四大平台表单输入框精准定位器（2026 实测对齐） ====================
  function locatePlatformFields(platform) {
    if (platform === 'xiaohongshu') {
      return {
        titleInput: findFirstVisible([
          'input[placeholder*="填写标题"]',
          '.titleInput input',
          'input.d-text',
          'input[maxlength="20"]',
        ]),
        bodyEditor: findFirstVisible([
          '.tiptap.ProseMirror[contenteditable="true"]',
          '.ProseMirror[contenteditable="true"]',
          '.ql-editor[contenteditable="true"]',
          'div[contenteditable="true"][data-placeholder]',
        ]),
      };
    }

    if (platform === 'douyin') {
      return {
        titleInput: findFirstVisible([
          'input[placeholder*="填写作品标题"]',
          'input.semi-input[placeholder*="标题"]',
          'input[placeholder*="作品标题"]',
          'input[placeholder*="添加标题"]',
        ]),
        bodyEditor: findFirstVisible([
          'div.zone-container[contenteditable="true"]',
          '.editor-kit-container [contenteditable="true"]',
          'div.zone-container',
          '.ProseMirror[contenteditable="true"]',
          'div[contenteditable="true"][data-placeholder]',
        ]),
      };
    }

    if (platform === 'weixin') {
      // 2026 视频号最新短标题 placeholder：「填写短标题有机会获得更多流量」+ 兜底相邻「短标题」label 定位
      let shortInput = findFirstVisible([
        'input[placeholder="填写短标题有机会获得更多流量"]',
        'input[placeholder*="填写短标题"]',
        'input[placeholder*="短标题"]',
        'input[placeholder*="概括视频主要内容"]',
        '.short-title-wrap input',
      ]);
      if (!shortInput) {
        const labels = queryDeepAll('div, span, label');
        const shortLabel = labels.find((el) => isVisible(el) && (el.textContent || '').trim() === '短标题');
        const siblingWrap = shortLabel?.parentElement?.nextElementSibling || shortLabel?.nextElementSibling;
        const cand = siblingWrap?.querySelector?.('input[type="text"], input');
        if (cand && isVisible(cand)) shortInput = cand;
      }

      const descEditor = findFirstVisible([
        'div.input-editor[contenteditable="true"]',
        'div.input-editor [contenteditable="true"]',
        'div.input-editor',
        'div[data-placeholder*="添加描述"]',
        '.post-desc-box [contenteditable="true"]',
        'textarea[placeholder*="描述"]',
      ]);

      return { titleInput: shortInput, bodyEditor: descEditor };
    }

    if (platform === 'bilibili') {
      return {
        titleInput: findFirstVisible([
          'input[placeholder*="请输入稿件标题"]',
          'input[placeholder*="稿件标题"]',
          'input[maxlength="80"]',
        ]),
        bodyEditor: findFirstVisible([
          '.ql-editor[contenteditable="true"]',
          'textarea[placeholder*="填写更全面的相关信息"]',
          'textarea[placeholder*="简介"]',
          'div[contenteditable="true"]',
        ]),
      };
    }

    // 扩展平台通用自适应定位器（快手 / 微信公众号&小绿书 / 知乎专栏 / 微博 / YouTube Studio）
    return {
      titleInput: findFirstVisible([
        'input[placeholder*="标题"]',
        'textarea[placeholder*="标题"]',
        '#title',
        'input[name="title"]',
      ]),
      bodyEditor: findFirstVisible([
        '.ProseMirror[contenteditable="true"]',
        '.ql-editor[contenteditable="true"]',
        '.DraftEditor-root [contenteditable="true"]',
        '#edui1_iframeholder iframe',
        'div[contenteditable="true"]',
        'textarea[placeholder*="描述"]',
        'textarea[placeholder*="正文"]',
      ]),
    };
  }

  // 图文轮播模式 (image_post) 多图按序批量注入器（兼容小红书上传图文、抖音发布图文、公众号小绿书）
  async function injectCarouselSlides(slideItems, blobsMap, onProgress) {
    const validFiles = [];
    const win = window;
    for (let i = 0; i < slideItems.length; i++) {
      const rel = slideItems[i];
      const blob = findBlobFlexible(blobsMap, rel);
      if (!blob) continue;
      const fname = rel.split('/').pop() || `slide_${String(i + 1).padStart(2, '0')}.png`;
      validFiles.push(new win.File([blob], fname, { type: blob.type || 'image/png', lastModified: Date.now() + i }));
    }

    if (!validFiles.length) {
      return { ok: false, msg: '未找到已缓存的图文轮播图片，请先选择包含图文图片的成品包目录。' };
    }

    const candidates = queryDeepAll('input[type="file"]').filter((inp) => {
      const accept = (inp.getAttribute('accept') || '').toLowerCase();
      const isImg = accept.includes('image') || accept.includes('.png') || accept.includes('.jpg') || inp.hasAttribute('multiple');
      const isVideoOnly = (accept.includes('video') || accept.includes('.mp4')) && !accept.includes('image');
      return isImg && !isVideoOnly;
    });

    const targetInput = candidates.find((inp) => inp.hasAttribute('multiple')) || candidates[0];
    if (!targetInput) {
      return { ok: false, msg: '未检测到图文多图上传框：请先在网页切换至「上传图文 / 发布图文」Tab。' };
    }

    onProgress?.(`⏳ 正在按顺序载入 ${validFiles.length} 张图文卡片...`);
    await humanSleep(220, 440);

    const iWin = targetInput.ownerDocument?.defaultView || window;
    const dt = new iWin.DataTransfer();
    for (const f of validFiles) dt.items.add(f);
    try {
      targetInput.value = '';
    } catch {
      // ignore
    }
    targetInput.files = dt.files;
    targetInput.dispatchEvent(new iWin.Event('input', { bubbles: true, composed: true }));
    targetInput.dispatchEvent(new iWin.Event('change', { bubbles: true, composed: true }));
    await humanSleep(500, 860);

    return { ok: true, msg: `已按序注入全部 ${validFiles.length} 张图文轮播卡片！` };
  }

  // ==================== 本地只读小助手桥接（可选，兼容 Chrome MV3 Service Worker 与油猴） ====================
  function gmRequestJson(url) {
    if (IS_CHROME_EXT && chrome.runtime?.sendMessage) {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'PPF_BRIDGE_JSON', url }, (resp) => {
          if (resp && resp.ok) resolve(resp.data);
          else reject(new Error(resp?.error || '未启动'));
        });
      });
    }
    return new Promise((resolve, reject) => {
      if (typeof GM_xmlhttpRequest !== 'function') {
        reject(new Error('不支持桥接请求'));
        return;
      }
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        timeout: 3500,
        onload: (res) => {
          if (res.status >= 200 && res.status < 300) {
            try {
              resolve(JSON.parse(res.responseText));
            } catch (e) {
              reject(e);
            }
          } else {
            reject(new Error(`HTTP ${res.status}`));
          }
        },
        onerror: () => reject(new Error('未启动')),
        ontimeout: () => reject(new Error('超时')),
      });
    });
  }

  function gmRequestBlob(url) {
    if (IS_CHROME_EXT && chrome.runtime?.sendMessage) {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'PPF_BRIDGE_BLOB', url }, async (resp) => {
          if (resp && resp.ok && resp.dataUrl) {
            try {
              resolve(await dataURLToBlob(resp.dataUrl));
            } catch (e) {
              reject(e);
            }
          } else {
            reject(new Error(resp?.error || '读取失败'));
          }
        });
      });
    }
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        responseType: 'blob',
        timeout: 5000,
        onload: (res) => {
          if (res.status >= 200 && res.status < 300 && res.response) resolve(res.response);
          else reject(new Error(`HTTP ${res.status}`));
        },
        onerror: () => reject(new Error('读取失败')),
      });
    });
  }

  // ==================== 状态持久化 ====================
  async function loadPackState() {
    try {
      const raw = await xStorageGet(STORAGE_KEY_PACK, '');
      if (raw) return typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
      // ignore
    }
    return DEFAULT_PRESET_PACK;
  }

  function savePackState(pack) {
    xStorageSet(STORAGE_KEY_PACK, JSON.stringify(pack));
  }

  async function loadSettings() {
    const defaults = {
      theme: 'light',
      layoutMode: 'dock',
      pushPage: true,
      collapsed: false,
      width: 384,
      height: Math.min(840, Math.max(560, window.innerHeight - 80)),
      floatTop: 64,
      floatRight: 20,
      clipboardOnlyMode: false,
      autoTopicEnter: false,
      bridgeUrl: BRIDGE_DEFAULT_URL,
      selectedCoverSlot: '',
      selectedTitleIdx: -1,
    };
    try {
      const raw = await xStorageGet(STORAGE_KEY_SETTINGS, '');
      if (raw) {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return { ...defaults, ...parsed };
      }
    } catch {
      // ignore
    }
    return defaults;
  }

  function saveSettings(settings) {
    xStorageSet(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
  }

  // ==================== Closed Shadow DOM 工作台 UI ====================
  async function mountUI() {
    const platform = detectPlatform();
    const pMeta = PLATFORM_META[platform];
    let currentPack = await loadPackState();
    let settings = await loadSettings();
    let availableMdFiles = [];
    let coverBlobsMap = await loadCoversCrossPlatform();

    function syncPagePushMargin() {
      const shouldPush = settings.layoutMode === 'dock' && settings.pushPage && !settings.collapsed;
      if (shouldPush) {
        document.documentElement.style.marginRight = `${settings.width}px`;
        document.documentElement.style.transition = 'margin-right 0.18s ease';
      } else if (document.documentElement.style.marginRight) {
        document.documentElement.style.marginRight = '';
      }
    }

    const hostEl = document.createElement('aside');
    document.documentElement.appendChild(hostEl);
    const shadow = hostEl.attachShadow({ mode: 'closed' });

    const styleEl = document.createElement('style');
    shadow.appendChild(styleEl);

    const rootWrap = document.createElement('div');
    shadow.appendChild(rootWrap);

    let statusText =
      platform === 'weixin'
        ? '视频号就绪 · 支持自动点开 3:4 主页卡 / 4:3 动态卡注入封面（注意从首页点「发表视频」进入）'
        : platform === 'douyin'
        ? '抖音就绪 · 打开封面弹窗后点注入将自动切换横/竖封面并避开 AI 参考图槽'
        : '就绪 · 打开封面编辑框后点「注入封面」将自动匹配裁剪比例';
    let activeThumbUrl = '';

    function setStatus(msg) {
      statusText = msg;
      const el = shadow.getElementById('ppf-status-line');
      if (el) el.textContent = msg;
    }

    function applyHostGeometry() {
      syncPagePushMargin();
      if (settings.collapsed) {
        hostEl.style.cssText =
          'all: initial; position: fixed; z-index: 2147483646; top: 42%; right: 0; pointer-events: none;';
        return;
      }
      if (settings.layoutMode === 'dock') {
        hostEl.style.cssText = `all: initial; position: fixed; z-index: 2147483646; top: 0; right: 0; width: ${settings.width}px; height: 100vh; pointer-events: none;`;
      } else {
        const clampedW = Math.min(Math.max(320, settings.width), window.innerWidth - 24);
        const clampedH = Math.min(Math.max(380, settings.height), window.innerHeight - 24);
        hostEl.style.cssText = `all: initial; position: fixed; z-index: 2147483646; top: ${settings.floatTop}px; right: ${settings.floatRight}px; width: ${clampedW}px; height: ${clampedH}px; pointer-events: none;`;
      }
    }

    function buildStyles() {
      const isLight = settings.theme === 'light';
      const bg = isLight ? 'rgba(255, 255, 255, 0.98)' : 'rgba(22, 24, 30, 0.97)';
      const fg = isLight ? '#1f2329' : '#f3f4f6';
      const subFg = isLight ? '#646a73' : '#9ca3af';
      const headBg = isLight ? '#f7f8fa' : 'rgba(255,255,255,0.04)';
      const secBg = isLight ? '#f8f9fb' : 'rgba(255,255,255,0.035)';
      const border = isLight ? 'rgba(31,35,41,0.10)' : 'rgba(255,255,255,0.11)';
      const inputBg = isLight ? '#ffffff' : 'rgba(0,0,0,0.28)';
      const btnBg = isLight ? '#ffffff' : 'rgba(255,255,255,0.09)';
      const btnHover = isLight ? '#f2f3f5' : 'rgba(255,255,255,0.16)';
      const chipBg = isLight ? 'rgba(59,130,246,0.10)' : 'rgba(59,130,246,0.18)';
      const chipFg = isLight ? '#1d4ed8' : '#93c5fd';
      const statusFg = isLight ? '#059669' : '#34d399';
      const shadowCss = isLight
        ? '-8px 0 28px rgba(15, 23, 42, 0.10), 0 8px 24px rgba(15, 23, 42, 0.08)'
        : '0 16px 42px rgba(0, 0, 0, 0.45)';
      const radius = settings.layoutMode === 'dock' ? '14px 0 0 14px' : '14px';

      styleEl.textContent = `
        * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif; }
        .ppf-shell { position: relative; width: 100%; height: 100%; pointer-events: auto; display: flex; }
        .ppf-wrap { width: 100%; height: 100%; display: flex; flex-direction: column; background: ${bg}; color: ${fg}; border: 1px solid ${border}; border-radius: ${radius}; box-shadow: ${shadowCss}; backdrop-filter: blur(16px); overflow: hidden; font-size: 13px; }
        .ppf-ear { position: absolute; left: -26px; top: 50%; transform: translateY(-50%); width: 26px; height: 68px; background: ${bg}; color: ${subFg}; border: 1px solid ${border}; border-right: none; border-radius: 10px 0 0 10px; box-shadow: -4px 2px 12px rgba(0,0,0,0.08); display: flex; align-items: center; justify-content: center; cursor: pointer; user-select: none; font-size: 13px; font-weight: 700; pointer-events: auto; }
        .ppf-ear:hover { color: ${pMeta.accent}; }
        .ppf-collapsed-tab { pointer-events: auto; display: flex; align-items: center; gap: 5px; padding: 10px 10px 10px 12px; background: ${bg}; color: ${fg}; border: 1px solid ${border}; border-right: none; border-radius: 12px 0 0 12px; box-shadow: -4px 4px 16px rgba(0,0,0,0.12); cursor: pointer; user-select: none; font-size: 12.5px; font-weight: 600; writing-mode: vertical-rl; letter-spacing: 2px; }
        .ppf-dot { width: 8px; height: 8px; border-radius: 50%; background: ${pMeta.accent}; display: inline-block; }
        .ppf-resize-w { position: absolute; left: -4px; top: 0; width: 8px; height: 100%; cursor: ew-resize; z-index: 10; }
        .ppf-resize-s { position: absolute; left: 0; bottom: -4px; width: 100%; height: 8px; cursor: ns-resize; z-index: 10; }
        .ppf-resize-sw { position: absolute; left: 0; bottom: 0; width: 16px; height: 16px; cursor: nesw-resize; z-index: 12; display: flex; align-items: flex-end; justify-content: flex-start; padding: 2px; color: ${subFg}; font-size: 10px; opacity: 0.6; user-select: none; }
        .ppf-head { display: flex; align-items: center; justify-content: space-between; padding: 10px 13px; background: ${headBg}; border-bottom: 1px solid ${border}; cursor: ${settings.layoutMode === 'float' ? 'move' : 'default'}; user-select: none; flex-shrink: 0; }
        .ppf-head-title { display: flex; align-items: center; gap: 7px; font-weight: 600; font-size: 13.5px; }
        .ppf-badge { padding: 2px 8px; border-radius: 6px; font-size: 11.5px; font-weight: 600; background: ${pMeta.accent}; color: #fff; }
        .ppf-icon-btn { background: transparent; border: 1px solid transparent; color: ${subFg}; cursor: pointer; font-size: 13px; padding: 3px 6px; border-radius: 6px; line-height: 1; }
        .ppf-icon-btn:hover { background: ${btnHover}; color: ${fg}; border-color: ${border}; }
        .ppf-body { padding: 12px 14px; overflow-y: auto; display: flex; flex-direction: column; gap: 11px; flex: 1; }
        .ppf-pack-bar { background: ${secBg}; border: 1.5px dashed ${border}; border-radius: 10px; padding: 9px 11px; display: flex; flex-direction: column; gap: 7px; }
        .ppf-pack-bar.dragover { border-color: ${pMeta.accent}; }
        .ppf-pack-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        .ppf-pack-name { font-weight: 600; color: ${fg}; font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; }
        .ppf-link-btn { background: none; border: none; color: ${pMeta.accent}; font-size: 11.5px; cursor: pointer; padding: 2px 4px; white-space: nowrap; font-weight: 500; }
        .ppf-link-btn:hover { text-decoration: underline; }
        .ppf-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
        .ppf-row-nowrap { display: flex; align-items: center; gap: 6px; flex-shrink: 0; white-space: nowrap; }
        .ppf-btn { background: ${btnBg}; color: ${fg}; border: 1px solid ${border}; border-radius: 7px; padding: 5px 10px; font-size: 12px; cursor: pointer; font-weight: 500; white-space: nowrap; transition: all 0.14s; }
        .ppf-btn:hover { background: ${btnHover}; }
        .ppf-btn-accent { background: ${pMeta.accent}; border-color: transparent; color: #fff; font-weight: 600; padding: 8px 13px; font-size: 12.5px; }
        .ppf-btn-accent:hover { filter: brightness(1.06); background: ${pMeta.accent}; }
        .ppf-btn-block { width: 100%; justify-content: center; display: inline-flex; align-items: center; gap: 5px; }
        .ppf-sec { background: ${secBg}; border: 1px solid ${border}; border-radius: 10px; padding: 10px 11px; display: flex; flex-direction: column; gap: 7px; }
        .ppf-sec-hd { display: flex; align-items: center; justify-content: space-between; gap: 8px; color: ${subFg}; font-size: 11.5px; font-weight: 600; }
        .ppf-sec-hd > span:first-child { flex: 1; min-width: 0; }
        .ppf-preview { font-size: 12.5px; color: ${fg}; line-height: 1.52; min-height: 40px; max-height: 130px; resize: vertical; overflow-y: auto; white-space: pre-wrap; word-break: break-word; background: ${inputBg}; border: 1px solid ${border}; padding: 7px 9px; border-radius: 7px; }
        .ppf-chip { padding: 3.5px 9px; border-radius: 999px; background: ${chipBg}; color: ${chipFg}; border: 1px solid transparent; font-size: 11.5px; cursor: pointer; white-space: nowrap; font-weight: 500; }
        .ppf-chip:hover { filter: brightness(0.95); }
        .ppf-chip.active { background: ${pMeta.accent}; color: #fff; font-weight: 600; }
        .ppf-cover-box { display: flex; gap: 11px; align-items: center; }
        .ppf-thumb { width: 68px; height: 90px; border-radius: 7px; background: ${inputBg}; border: 1px solid ${border}; object-fit: cover; flex-shrink: 0; display: flex; align-items: center; justify-content: center; color: ${subFg}; font-size: 10.5px; text-align: center; padding: 4px; }
        .ppf-warn { color: #d97706; font-size: 11.5px; line-height: 1.4; }
        .ppf-status { font-size: 12px; color: ${statusFg}; min-height: 18px; line-height: 1.42; font-weight: 500; }
        .ppf-toggle { display: inline-flex; align-items: center; gap: 5px; font-size: 11.5px; color: ${subFg}; cursor: pointer; user-select: none; }
        .ppf-foot { font-size: 11px; color: ${subFg}; border-top: 1px solid ${border}; padding-top: 7px; display: flex; justify-content: space-between; align-items: center; }
        select.ppf-select { background: ${inputBg}; color: ${fg}; border: 1px solid ${border}; border-radius: 7px; padding: 5px 8px; font-size: 12px; width: 100%; }
      `;
    }

    function resolvePlatformCoverOptions() {
      const covers = currentPack.covers || [];
      const preferred = pMeta.preferredRatios;
      const sorted = [...covers].sort((a, b) => {
        const ia = preferred.indexOf(a.ratio);
        const ib = preferred.indexOf(b.ratio);
        const scoreA = ia === -1 ? 99 : ia;
        const scoreB = ib === -1 ? 99 : ib;
        if (scoreA !== scoreB) return scoreA - scoreB;
        return a.variant.localeCompare(b.variant);
      });

      let active =
        sorted.find((c) => c.slot === settings.selectedCoverSlot) ||
        sorted.find((c) => c.variant === 'A' && c.ratio === preferred[0]) ||
        sorted[0] ||
        null;

      return { active, sortedCovers: sorted };
    }

    function formatCoverChipLabel(c) {
      if (platform === 'weixin') {
        if (c.ratio === '3:4') return `款${c.variant} (3:4主页卡)`;
        if (c.ratio === '4:3') return `款${c.variant} (4:3动态卡)`;
      }
      if (platform === 'douyin') {
        if (c.ratio === '3:4' || c.ratio === '9:16') return `款${c.variant} (${c.ratio}竖封)`;
        if (c.ratio === '4:3' || c.ratio === '16:9') return `款${c.variant} (${c.ratio}横封)`;
      }
      return `款${c.variant} (${c.ratio})`;
    }

    let showPasteDrawer = false;

    function applyPackContent(fileName, rawText, subMdTextMap = {}) {
      const isJson = /\.json$/i.test(fileName) || stripJsonCodeFence(rawText).startsWith('{');
      let parsed;

      if (isJson) {
        parsed = parsePublishPackJson(rawText, {
          fileName,
          sourceLabel: fileName,
          baseDir: currentPack.meta?.baseDir || '',
        });
        // 若 JSON 中未显式列出 covers 但目录里扫到了封面图，自动补齐
        if ((!parsed.covers || !parsed.covers.length) && coverBlobsMap.size > 0 && parsed.meta.contentType !== 'image_post') {
          parsed.covers = Array.from(coverBlobsMap.keys()).map((rel) => inferCoverMetaFromPath(rel));
        }
      } else {
        parsed = parsePublishPackMarkdown(rawText, {
          mdFileName: fileName,
          sourceLabel: fileName,
          baseDir: currentPack.meta?.baseDir || '',
        });
        parsed.meta.format = 'markdown';
        parsed.meta.contentType = 'video';

        for (const [subPath, subText] of Object.entries(subMdTextMap)) {
          const subData = parseSinglePlatformMarkdown(subText);
          if (subPath.includes('小红书') && subData.body) {
            parsed.platforms.xiaohongshu.title = subData.title || parsed.platforms.xiaohongshu.title;
            parsed.platforms.xiaohongshu.body = subData.body;
            parsed.platforms.xiaohongshu.tags = subData.tags;
          } else if (subPath.includes('抖音') && subData.body) {
            parsed.platforms.douyin.title = subData.title || parsed.platforms.douyin.title;
            parsed.platforms.douyin.body = subData.body;
            parsed.platforms.douyin.tags = subData.tags;
          } else if (subPath.includes('B站') && subData.body) {
            parsed.platforms.bilibili.title = subData.title || parsed.platforms.bilibili.title;
            parsed.platforms.bilibili.body = subData.body;
          }
        }

        if (coverBlobsMap.size > 0) {
          parsed.covers = Array.from(coverBlobsMap.keys()).map((rel) => inferCoverMetaFromPath(rel));
        }
      }

      currentPack = parsed;
      settings.selectedTitleIdx = -1;
      settings.selectedCoverSlot = '';
      saveSettings(settings);
      savePackState(currentPack);
    }

    async function ingestFileEntries(rawFiles) {
      const files = Array.from(rawFiles || []);
      if (!files.length) return;

      const packCandidates = [];
      const subMdTextMap = {};
      const imageFiles = [];

      for (const f of files) {
        const relPath = (f.webkitRelativePath || f._relPath || f.name).replace(/\\/g, '/');
        if (/\.(mp4|mov|mkv|wav|zip)$/i.test(relPath)) continue;

        if (/\.json$/i.test(relPath)) {
          // 排除无关配置文件（如 sources_*.json / package.json），仅收录 PublishPack 或含 platforms/default 的 JSON
          const txt = await f.text();
          try {
            const probe = JSON.parse(txt);
            if (probe && (probe.specVersion || probe.platforms || probe.default)) {
              packCandidates.push({
                name: relPath.split('/').pop(),
                relPath,
                text: txt,
                priority: /\.pack\.json$/i.test(relPath) ? 3 : 2,
              });
            }
          } catch {
            // ignore non-pack json
          }
        } else if (/\.md$/i.test(relPath)) {
          if (/(小红书|抖音|视频号|B站).*\.md$/i.test(relPath)) {
            subMdTextMap[relPath] = await f.text();
          } else if (!/\.preview\.md$/i.test(relPath)) {
            packCandidates.push({
              name: relPath.split('/').pop(),
              relPath,
              text: await f.text(),
              priority: /发布包/.test(relPath) ? 1 : 0,
            });
          }
        } else if (/\.(png|jpg|jpeg|webp)$/i.test(relPath)) {
          imageFiles.push({ file: f, relPath });
        }
      }

      if (imageFiles.length > 0) {
        // 保留子目录相对路径（如 封面/xxx.png、slides/01.png、covers/hero.png），同时支持灵活文件名匹配
        const stripTopFolder = (p) => {
          const parts = p.split('/');
          return parts.length > 1 ? parts.slice(1).join('/') : p;
        };
        coverBlobsMap.clear();
        const records = [];
        for (const { file, relPath } of imageFiles) {
          const cleanRel = stripTopFolder(relPath);
          const key = cleanRel.includes('/') ? cleanRel : `封面/${file.name}`;
          coverBlobsMap.set(key, file);
          records.push({ relPath: key, blob: file });
        }
        setStatus('⏳ 正在跨平台缓存媒体图片（全平台实时共享）...');
        await saveCoversCrossPlatform(records);
      }

      if (packCandidates.length > 0) {
        // 优先级：*.pack.json (标准协议) > publish*.json > 发布包*.md (兼容旧版) > 其它 .md
        packCandidates.sort((a, b) => {
          if (a.priority !== b.priority) return b.priority - a.priority;
          return b.name.localeCompare(a.name, 'zh-CN', { numeric: true });
        });
        availableMdFiles = packCandidates;
        const best = packCandidates[0];
        applyPackContent(best.name, best.text, subMdTextMap);
      } else if (imageFiles.length > 0) {
        currentPack.covers = Array.from(coverBlobsMap.keys()).map((rel) => inferCoverMetaFromPath(rel));
        savePackState(currentPack);
      }

      setStatus(
        `✅ 已自动载入《${currentPack.meta?.mdFileName || '发布包'}》(${
          currentPack.meta?.format === 'json' ? 'PublishPack JSON' : 'Markdown'
        }) 与 ${coverBlobsMap.size} 张图片`
      );
      render();
    }

    async function pickPackDirectory() {
      if (typeof window.showDirectoryPicker === 'function') {
        try {
          const dirHandle = await window.showDirectoryPicker({ mode: 'read' });
          const collected = [];
          const walkDir = async (handle, prefix = '', depth = 0) => {
            if (depth > 3) return;
            for await (const [name, entry] of handle.entries()) {
              if (name.startsWith('.')) continue;
              if (entry.kind === 'file') {
                if (/\.(json|md|png|jpg|jpeg|webp)$/i.test(name)) {
                  const file = await entry.getFile();
                  file._relPath = `${prefix}${name}`;
                  collected.push(file);
                }
              } else if (entry.kind === 'directory') {
                if (/^(?:成片|封面|covers|slides|images|文案|04_发布与成片|09_发布与交付)$/i.test(name) || depth === 0) {
                  await walkDir(entry, `${prefix}${name}/`, depth + 1);
                }
              }
            }
          };
          await walkDir(dirHandle, '');
          await ingestFileEntries(collected);
          return;
        } catch (err) {
          if (err && err.name === 'AbortError') return;
        }
      }
      shadow.getElementById('ppf-input-dir')?.click();
    }

    async function syncFromLocalBridge() {
      setStatus('⏳ 正在从本地只读桥接服务同步...');
      try {
        const data = await gmRequestJson(`${settings.bridgeUrl}/api/pack`);
        if (Array.isArray(data.covers) && data.covers.length > 0) {
          coverBlobsMap.clear();
          const records = [];
          for (const rel of data.covers) {
            try {
              const blob = await gmRequestBlob(`${settings.bridgeUrl}/api/file?path=${encodeURIComponent(rel)}`);
              coverBlobsMap.set(rel, blob);
              records.push({ relPath: rel, blob });
            } catch {
              // ignore
            }
          }
          await saveCoversCrossPlatform(records);
        }
        const fileName = data.packFile || data.mdFile || 'publish.pack.json';
        const rawContent = data.content || data.markdown || '';
        applyPackContent(fileName, rawContent);
        currentPack.meta.baseDir = data.baseDir || '';
        savePackState(currentPack);
        setStatus(`✅ 桥接同步成功：${currentPack.meta.packTitle}（${coverBlobsMap.size} 张图片全平台已共享）`);
        render();
      } catch {
        setStatus('⚠️ 本地桥接未启动，直接点「📂 选择成品包目录」或「📋 粘贴JSON」即可');
      }
    }

    async function runSafeFillAll() {
      const pData = currentPack.platforms?.[platform];
      if (!pData) {
        setStatus('⚠️ 当前发布包无此平台数据');
        return;
      }

      const activeTitle =
        settings.selectedTitleIdx >= 0 && pData.altTitles?.[settings.selectedTitleIdx]
          ? pData.altTitles[settings.selectedTitleIdx]
          : platform === 'weixin'
          ? pData.shortTitleClean || pData.shortTitleRaw
          : pData.title;

      if (settings.clipboardOnlyMode) {
        const fullClip = [
          activeTitle,
          '',
          pData.body,
          pData.tags?.length
            ? pData.tags.map((t) => (platform === 'bilibili' ? t : `#${t}`)).join(platform === 'bilibili' ? ',' : ' ')
            : '',
        ]
          .filter(Boolean)
          .join('\n');
        await safeCopy(fullClip);
        setStatus('📋 [纯剪贴板模式] 已复制全套文案，请手动 ⌘V 粘贴');
        return;
      }

      setStatus('⏳ 正在按真人节奏分步填入表单...');
      const { titleInput, bodyEditor } = locatePlatformFields(platform);
      const filledParts = [];

      // 微信视频号：建议先填视频描述 + #话题，再填底部短标题（与真人从上往下阅读填写顺序一致）
      if (platform === 'weixin') {
        if (bodyEditor && pData.body) {
          await humanFillRichEditor(bodyEditor, pData.body, { append: false });
          filledParts.push('视频描述');
          await humanSleep(320, 620);

          if (pData.tags?.length) {
            for (const tag of pData.tags) {
              await typeSingleHashtagPrompt(bodyEditor, tag, { autoConfirmEnter: true, platform: 'weixin' });
            }
            filledParts.push(`#${pData.tags.length}个话题`);
          }
        }
        if (titleInput && activeTitle) {
          await humanSleep(300, 580);
          await humanFillTextInput(titleInput, activeTitle);
          filledParts.push('短标题');
        }
        if (!filledParts.length) {
          setStatus('⚠️ 未检测到视频号编辑框：请从视频号首页点击「发表视频」按钮进入并上传视频后再填表');
        } else {
          setStatus(`✅ 视频号已安全填入：${filledParts.join(' + ')}（视频传完后可点下方「⚡ 选合集」）`);
        }
        return;
      }

      // 小红书 / 抖音 / B站：先填标题，再填正文描述
      if (titleInput && activeTitle) {
        const clippedTitle = platform === 'douyin' ? activeTitle.slice(0, 30) : activeTitle;
        await humanFillTextInput(titleInput, clippedTitle);
        filledParts.push('标题');
        await humanSleep(380, 760);
      }

      if (bodyEditor && pData.body) {
        if (bodyEditor.tagName === 'TEXTAREA' || bodyEditor.tagName === 'INPUT') {
          await humanFillTextInput(bodyEditor, pData.body);
        } else {
          await humanFillRichEditor(bodyEditor, pData.body, { append: false });
        }
        filledParts.push('正文');
        await humanSleep(360, 680);
      }

      if (platform === 'bilibili' && pData.tags?.length) {
        const tagRes = await fillBilibiliTagPills(pData.tags);
        if (tagRes.ok) filledParts.push(`${Math.min(10, pData.tags.length)}个标签`);
      } else if ((platform === 'xiaohongshu' || platform === 'douyin') && bodyEditor && pData.tags?.length) {
        if (settings.autoTopicEnter) {
          setStatus(`⏳ 正在拟人逐个绑定 ${pData.tags.length} 个 #蓝字话题...`);
          for (const tag of pData.tags) {
            await typeSingleHashtagPrompt(bodyEditor, tag, { autoConfirmEnter: true, platform });
          }
          // 抖音填完所有话题后发一次 Escape 收起残余下拉浮层，避免挡住合集/位置下拉框
          if (platform === 'douyin') {
            const doc = bodyEditor.ownerDocument || document;
            doc.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }));
          }
          filledParts.push(`#${pData.tags.length}个话题`);
        } else {
          setStatus(`✅ 已填 ${filledParts.join('+')}！依次点下方 #话题胶囊 后按键盘回车即可变真蓝字`);
          return;
        }
      }

      if (!filledParts.length) {
        setStatus(
          platform === 'douyin'
            ? '⚠️ 未检测到抖音输入框：抖音需先上传视频跳转出编辑表单后再点填入'
            : '⚠️ 未定位到表单框（若正在全屏编辑封面，请先完成封面后再填正文）'
        );
      } else {
        setStatus(`✅ 已安全填入：${filledParts.join(' + ')}（请核对后真人点击发布）`);
      }
    }

    function render() {
      if (activeThumbUrl) {
        URL.revokeObjectURL(activeThumbUrl);
        activeThumbUrl = '';
      }
      applyHostGeometry();
      buildStyles();
      rootWrap.innerHTML = '';

      if (settings.collapsed) {
        const tab = document.createElement('div');
        tab.className = 'ppf-collapsed-tab';
        tab.title = '点击展开多平台发布包助手（快捷键 Alt+S）';
        tab.innerHTML = `<span class="ppf-dot"></span><span>发布包助手</span>`;
        tab.onclick = () => {
          settings.collapsed = false;
          saveSettings(settings);
          render();
        };
        rootWrap.appendChild(tab);
        return;
      }

      const pData = currentPack.platforms?.[platform] || {};
      const activeContentType = pData.contentType || currentPack.meta?.contentType || 'video';
      const cTypeBadge = CONTENT_TYPE_LABELS[activeContentType] || '🎬 内容';
      const { active: activeCover, sortedCovers } = resolvePlatformCoverOptions();

      const activeTitle =
        settings.selectedTitleIdx >= 0 && pData.altTitles?.[settings.selectedTitleIdx]
          ? pData.altTitles[settings.selectedTitleIdx]
          : platform === 'weixin'
          ? pData.shortTitleClean || pData.shortTitleRaw || ''
          : pData.title || '';

      const activeBlob = activeCover ? findBlobFlexible(coverBlobsMap, activeCover.relPath) : null;
      if (activeBlob) {
        activeThumbUrl = URL.createObjectURL(activeBlob);
      }

      const slidePaths = Array.isArray(pData.slidePaths) && pData.slidePaths.length
        ? pData.slidePaths
        : (currentPack.images || []).map((im) => im.relPath);
      const readySlideCount = slidePaths.filter((sp) => Boolean(findBlobFlexible(coverBlobsMap, sp))).length;

      // 整理当前平台子选项与合规提示项
      const optBadges = [];
      const comp = currentPack.meta?.compliance || {};
      const opts = pData.options || {};
      if (comp.aiLevel === 'generated' || opts.aiDeclaration === 'ai_generated' || opts.selfDeclaration === '内容由AI生成' || opts.contentLabel === '含AI生成内容') {
        optBadges.push({ text: '⚠️ 需勾选 AI 生成标识', warn: true });
      } else if (comp.aiLevel === 'assisted' || opts.aiDeclaration === 'assisted') {
        optBadges.push({ text: 'ℹ️ AI辅助创作(零AI配音免勾)' });
      }
      if (comp.isOriginal || opts.isOriginal || opts.copyright === 'original') {
        optBadges.push({ text: '✓ 原创 / 自制' });
      }
      if (pData.category) optBadges.push({ text: `📂 分区：${pData.category}`, copyVal: pData.category });
      if (pData.topic) optBadges.push({ text: `🎯 活动：${pData.topic}`, copyVal: pData.topic });
      if (opts.selfDeclaration && opts.selfDeclaration !== 'none') optBadges.push({ text: `声明：${opts.selfDeclaration}` });
      if (opts.contentLabel && opts.contentLabel !== 'none') optBadges.push({ text: `标注：${opts.contentLabel}` });
      if (opts.scheduleAt) optBadges.push({ text: `⏰ 定时：${opts.scheduleAt}`, copyVal: opts.scheduleAt });
      if (opts.noReprint) optBadges.push({ text: '🔒 禁止转载' });
      if (opts.bgm) optBadges.push({ text: `🎵 BGM：${typeof opts.bgm === 'string' ? opts.bgm : opts.bgm.name || ''}`, copyVal: typeof opts.bgm === 'string' ? opts.bgm : opts.bgm.name || '' });
      if (pData.digest) optBadges.push({ text: '📋 复制文章摘要(Digest)', copyVal: pData.digest });

      const xhsLen = platform === 'xiaohongshu' ? calcXhsTitleLen(activeTitle) : 0;
      const wxDirtyWarn =
        platform === 'weixin' && pData.shortTitleRaw && pData.shortTitleRaw !== pData.shortTitleClean;
      const activeRatioLabel = activeCover ? activeCover.ratio : pMeta.preferredRatios[0];

      const injectBtnLabel =
        platform === 'douyin'
          ? `⚡ 注入抖音${activeRatioLabel === '3:4' || activeRatioLabel === '9:16' ? '竖封面' : '横封面'} (${activeRatioLabel})`
          : platform === 'weixin'
          ? `⚡ 注入视频号${activeRatioLabel === '3:4' ? ' 3:4 主页卡' : ' 4:3 动态卡'}`
          : `⚡ 注入封面并自动选 ${activeRatioLabel} 比例`;

      const shell = document.createElement('div');
      shell.className = 'ppf-shell';
      shell.innerHTML = `
        <div class="ppf-ear" id="ppf-ear-collapse" title="贴边收起面板，避免遮挡下方按钮 (快捷键 Alt+S)">❯</div>
        <div class="ppf-resize-w" id="ppf-resize-w" title="左右拖拽调整面板宽度"></div>
        ${
          settings.layoutMode === 'float'
            ? `<div class="ppf-resize-s" id="ppf-resize-s" title="上下拖拽调整面板高度"></div>
               <div class="ppf-resize-sw" id="ppf-resize-sw" title="拖拽左下角同时调整宽高">↙</div>`
            : ''
        }

        <div class="ppf-wrap">
          <div class="ppf-head" id="ppf-drag-handle">
            <div class="ppf-head-title">
              <span class="ppf-badge">${pMeta.name}</span>
              <span>发布包助手</span>
              <span style="font-size:11px; opacity:0.75; font-weight:500;">${cTypeBadge}</span>
            </div>
            <div class="ppf-row-nowrap">
              <button class="ppf-icon-btn" id="ppf-toggle-theme" title="切换 浅色纯白 / 深色暗夜 皮肤">
                ${settings.theme === 'light' ? '🌙' : '☀️'}
              </button>
              <button class="ppf-icon-btn" id="ppf-toggle-layout" title="${
                settings.layoutMode === 'dock' ? '当前：右侧分屏停靠（点击切换为自由悬浮窗）' : '当前：自由悬浮窗（点击切换为右侧分屏停靠）'
              }">
                ${settings.layoutMode === 'dock' ? '🪟' : '📌'}
              </button>
              <button class="ppf-icon-btn" id="ppf-sync-bridge" title="从本地 serve_pack.py 同步（可选）">🔄</button>
              <button class="ppf-icon-btn" id="ppf-collapse-btn" title="贴边收起 (Alt+S)">❯</button>
            </div>
          </div>

          <div class="ppf-body">
            <!-- 成品包一键载入区（原生兼容 PublishPack JSON + 旧版 Markdown + 直接粘贴 JSON） -->
            <div class="ppf-pack-bar" id="ppf-dropzone">
              <div class="ppf-pack-top">
                <div class="ppf-pack-name" title="${currentPack.meta?.packTitle || ''}">
                  📦 ${currentPack.meta?.packTitle || '未加载发布包'}
                </div>
                <div class="ppf-row-nowrap">
                  <button class="ppf-link-btn" id="ppf-toggle-paste" title="直接粘贴 AI 生成的 PublishPack JSON">粘贴JSON</button>
                  <button class="ppf-link-btn" id="ppf-export-json" title="将当前发布包复制为标准 PublishPack v1.0 JSON">导出JSON</button>
                  <button class="ppf-link-btn" id="ppf-pick-md" title="手动选择单份 .json 或 .md 发布包文件">更换文件</button>
                </div>
              </div>
              ${
                showPasteDrawer
                  ? `<div style="display:flex; flex-direction:column; gap:6px; margin-top:2px;">
                      <textarea id="ppf-paste-area" class="ppf-preview" style="min-height:92px; font-family:monospace; font-size:11.5px;" placeholder='在此粘贴符合 PublishPack v1.0 标准的 JSON（支持直接粘贴带 \`\`\`json 代码块的 AI 回复）...'></textarea>
                      <div class="ppf-row" style="justify-content:flex-end;">
                        <button class="ppf-btn" id="ppf-paste-cancel">取消</button>
                        <button class="ppf-btn ppf-btn-accent" id="ppf-paste-confirm" style="padding:5px 12px;">✅ 解析并载入</button>
                      </div>
                    </div>`
                  : ''
              }
              ${
                availableMdFiles.length > 1
                  ? `<select class="ppf-select" id="ppf-md-select" title="检测到目录内多份发布包文件，可随时切换">
                      ${availableMdFiles
                        .map(
                          (m, idx) =>
                            `<option value="${idx}" ${
                              m.name === currentPack.meta?.mdFileName ? 'selected' : ''
                            }>📄 当前采用：${m.name}</option>`
                        )
                        .join('')}
                    </select>`
                  : ''
              }
              <button class="ppf-btn ppf-btn-block" id="ppf-pick-dir">
                📂 选择成品包目录（自动识别 publish.pack.json / 发布包.md 与配图）
              </button>
              <input type="file" id="ppf-input-dir" webkitdirectory directory multiple style="display:none" />
              <input type="file" id="ppf-input-md" accept=".json,.md,.markdown,.txt" style="display:none" />
            </div>

            ${
              activeContentType === 'image_post' && slidePaths.length > 0
                ? `<!-- 图文轮播模式批量配图区 -->
                  <div class="ppf-sec">
                    <div class="ppf-sec-hd">
                      <span>🖼️ 图文轮播卡片（共 ${slidePaths.length} 张 · 已缓存 ${readySlideCount} 张）</span>
                    </div>
                    <button class="ppf-btn ppf-btn-accent ppf-btn-block" id="ppf-inject-slides">
                      ⚡ 按顺序一键注入全部 ${slidePaths.length} 张轮播图
                    </button>
                  </div>`
                : ''
            }

            <!-- 封面注入区（视频/专栏模式下展示，或图文有独立封面时展示） -->
            ${
              activeContentType !== 'image_post' || sortedCovers.length > 0
                ? `<div class="ppf-sec">
                    <div class="ppf-sec-hd">
                      <span>🖼️ 封面注入（${
                        platform === 'weixin'
                          ? '支持 3:4 主页卡 + 4:3 动态卡双封'
                          : platform === 'douyin'
                          ? '自动切竖封/横封并避开AI参考图槽'
                          : `自动延时选中 ${activeRatioLabel} 裁剪框`
                      }）</span>
                      <span>${coverBlobsMap.size ? `已共享 ${coverBlobsMap.size} 张` : '待选目录'}</span>
                    </div>
                    <div class="ppf-cover-box">
                      ${
                        activeThumbUrl
                          ? `<img class="ppf-thumb" src="${activeThumbUrl}" alt="cover" />`
                          : `<div class="ppf-thumb">${
                              activeCover ? `${activeCover.ratio}\n选一次目录\n多端共享` : '选目录后\n自动配图'
                            }</div>`
                      }
                      <div style="flex:1; display:flex; flex-direction:column; gap:7px; min-width:0;">
                        <div class="ppf-row" id="ppf-cover-chips"></div>
                        <button class="ppf-btn ppf-btn-accent ppf-btn-block" id="ppf-inject-cover">
                          ${injectBtnLabel}
                        </button>
                      </div>
                    </div>
                  </div>`
                : ''
            }

            <!-- 标题与备选 -->
            <div class="ppf-sec">
              <div class="ppf-sec-hd">
                <span>✏️ ${
                  platform === 'weixin'
                    ? `短标题 (${activeTitle.length}/16字 · 7类白名单)`
                    : platform === 'douyin'
                    ? `作品标题 (${activeTitle.length}/${activeContentType === 'image_post' ? 20 : 30}字)`
                    : `标题 (${platform === 'xiaohongshu' ? `${xhsLen}/20字` : `${activeTitle.length}字`})`
                }</span>
                <div class="ppf-row-nowrap">
                  <button class="ppf-btn" id="ppf-fill-title-only">填入</button>
                  <button class="ppf-btn" id="ppf-copy-title">📋 复制</button>
                </div>
              </div>
              ${
                pData.altTitles && pData.altTitles.length > 0
                  ? `<select class="ppf-select" id="ppf-title-select">
                      <option value="-1" ${settings.selectedTitleIdx === -1 ? 'selected' : ''}>[主推] ${
                      platform === 'weixin' ? pData.shortTitleClean : pData.title
                    }</option>
                      ${pData.altTitles
                        .map(
                          (t, idx) =>
                            `<option value="${idx}" ${settings.selectedTitleIdx === idx ? 'selected' : ''}>[备选${
                              idx + 1
                            }] ${t}</option>`
                        )
                        .join('')}
                    </select>`
                  : ''
              }
              <div class="ppf-preview">${activeTitle || '（无独立标题）'}</div>
              ${wxDirtyWarn ? `<div class="ppf-warn">✨ 已自动净化短标题违规标点为空格</div>` : ''}
            </div>

            <!-- 正文 / 描述 -->
            <div class="ppf-sec">
              <div class="ppf-sec-hd">
                <span>📝 ${platform === 'weixin' ? '视频描述' : platform === 'douyin' ? '作品简介' : '正文 / 简介'}（${
        (pData.body || '').length
      } 字）</span>
                <div class="ppf-row-nowrap">
                  <button class="ppf-btn" id="ppf-fill-body-only">填入</button>
                  <button class="ppf-btn" id="ppf-copy-body">📋 复制</button>
                </div>
              </div>
              <div class="ppf-preview" style="min-height: 76px;">${pData.body || '（空）'}</div>
            </div>

            <!-- 话题 / 标签 -->
            <div class="ppf-sec">
              <div class="ppf-sec-hd">
                <span>🏷️ ${
                  platform === 'bilibili' || platform === 'youtube'
                    ? '普通标签（无#纯词）'
                    : platform === 'weixin'
                    ? '话题（一键填入已自动带入，也可点胶囊补加）'
                    : '话题（点胶囊唤醒下拉 → 按回车变真蓝字）'
                }</span>
                <div class="ppf-row-nowrap">
                  <button class="ppf-btn" id="ppf-copy-tags">📋 全复制</button>
                </div>
              </div>
              <div class="ppf-row" id="ppf-tags-wrap"></div>
            </div>

            <!-- 合集 / 位置 / 置顶首评 / 平台子选项 -->
            <div class="ppf-sec">
              <div class="ppf-sec-hd"><span>📌 合集 · 首评 · 平台子选项清单</span></div>
              <div class="ppf-row">
                ${
                  pData.collection && (platform === 'weixin' || platform === 'douyin')
                    ? `<button class="ppf-btn" id="ppf-auto-col" title="上传完成后点击，自动在下拉框精确匹配「${pData.collection}」">⚡ 自动选合集：${pData.collection}</button>`
                    : ''
                }
                ${pData.collection ? `<button class="ppf-btn" id="ppf-copy-col">📁 合集：${pData.collection}</button>` : ''}
                ${pData.location ? `<button class="ppf-btn" id="ppf-copy-loc">📍 位置：${pData.location}</button>` : ''}
                ${pData.pinnedComment ? `<button class="ppf-btn" id="ppf-copy-pin">💬 复制置顶首评</button>` : ''}
                ${pData.dynamicText ? `<button class="ppf-btn" id="ppf-copy-dyn">✨ 复制动态语</button>` : ''}
              </div>
              <div class="ppf-row" id="ppf-opt-badges"></div>
            </div>

            <!-- 选项开关 -->
            <div class="ppf-row" style="justify-content:space-between;">
              <label class="ppf-toggle" title="右侧停靠时自动将网页主体左移，不遮挡右侧面板">
                <input type="checkbox" id="ppf-chk-push" ${settings.pushPage ? 'checked' : ''} ${
        settings.layoutMode !== 'dock' ? 'disabled' : ''
      } />
                <span>推开网页防遮挡</span>
              </label>
              <label class="ppf-toggle" title="开启后绝不写入网页输入框，仅复制到系统剪贴板">
                <input type="checkbox" id="ppf-chk-cliponly" ${settings.clipboardOnlyMode ? 'checked' : ''} />
                <span>纯剪贴板</span>
              </label>
              ${
                platform === 'xiaohongshu' || platform === 'douyin'
                  ? `<label class="ppf-toggle" title="自动逐个输入 #话题 并延迟点选下拉首项">
                      <input type="checkbox" id="ppf-chk-autotopic" ${settings.autoTopicEnter ? 'checked' : ''} />
                      <span>自动连填#话题</span>
                    </label>`
                  : ''
              }
            </div>

            <button class="ppf-btn ppf-btn-accent ppf-btn-block" id="ppf-run-all" style="padding: 10px 14px; font-size: 13.5px;">
              ${
                settings.clipboardOnlyMode
                  ? '📋 一键复制本平台全套文案'
                  : platform === 'weixin'
                  ? '✨ 一键填入描述 + #话题 + 短标题'
                  : '✨ 一键填入标题与正文'
              }
            </button>

            <div class="ppf-status" id="ppf-status-line">${statusText}</div>
            <div class="ppf-foot">
              <span>🛡️ 拟人延时防检测 · 不自动点发布</span>
              <span>左边缘可拖宽 · Alt+S 收起</span>
            </div>
          </div>
        </div>
      `;

      rootWrap.appendChild(shell);

      // 渲染封面切换胶囊
      const coverChipsWrap = shadow.getElementById('ppf-cover-chips');
      if (coverChipsWrap) {
        for (const c of sortedCovers) {
          const chip = document.createElement('span');
          const isCurrent = activeCover && c.slot === activeCover.slot;
          chip.className = `ppf-chip ${isCurrent ? 'active' : ''}`;
          chip.textContent = formatCoverChipLabel(c);
          chip.title = c.relPath;
          chip.onclick = () => {
            settings.selectedCoverSlot = c.slot;
            const vIdx = ['B', 'C', 'D'].indexOf(c.variant);
            if (vIdx >= 0 && pData.altTitles?.[vIdx]) {
              settings.selectedTitleIdx = vIdx;
            } else if (c.variant === 'A') {
              settings.selectedTitleIdx = -1;
            }
            saveSettings(settings);
            render();
          };
          coverChipsWrap.appendChild(chip);
        }
      }

      // 渲染话题胶囊（小红书/抖音唤醒下拉按回车；视频号直接敲入 ` #话题 ` 激活；B站复制）
      const tagsWrap = shadow.getElementById('ppf-tags-wrap');
      if (tagsWrap && Array.isArray(pData.tags)) {
        for (const tag of pData.tags) {
          const chip = document.createElement('span');
          chip.className = 'ppf-chip';
          chip.textContent = platform === 'bilibili' ? tag : `#${tag}`;
          chip.onclick = async () => {
            if (settings.clipboardOnlyMode || platform === 'bilibili') {
              await safeCopy(platform === 'bilibili' ? tag : `#${tag}`);
              setStatus(`📋 已复制标签：${tag}`);
              return;
            }
            const { bodyEditor } = locatePlatformFields(platform);
            if (bodyEditor) {
              if (platform === 'weixin') {
                await typeSingleHashtagPrompt(bodyEditor, tag, { autoConfirmEnter: true, platform: 'weixin' });
                setStatus(`✅ 已向视频号描述追加话题 #${tag}`);
              } else {
                await typeSingleHashtagPrompt(bodyEditor, tag, { autoConfirmEnter: false, platform });
                setStatus(`💡 已在末尾敲入 #${tag}，请按一下键盘「回车 Enter」确认变官方蓝字！`);
              }
            } else {
              await safeCopy(`#${tag}`);
              setStatus(`📋 已复制 #${tag}`);
            }
          };
          tagsWrap.appendChild(chip);
        }
      }

      // 顶部栏按钮
      shadow.getElementById('ppf-toggle-theme').onclick = () => {
        settings.theme = settings.theme === 'light' ? 'dark' : 'light';
        saveSettings(settings);
        render();
      };
      shadow.getElementById('ppf-toggle-layout').onclick = () => {
        settings.layoutMode = settings.layoutMode === 'dock' ? 'float' : 'dock';
        saveSettings(settings);
        render();
      };
      const toggleCollapse = () => {
        settings.collapsed = true;
        saveSettings(settings);
        render();
      };
      shadow.getElementById('ppf-collapse-btn').onclick = toggleCollapse;
      shadow.getElementById('ppf-ear-collapse').onclick = toggleCollapse;
      shadow.getElementById('ppf-sync-bridge').onclick = syncFromLocalBridge;

      // 渲染平台子选项与合规徽章
      const optBadgesWrap = shadow.getElementById('ppf-opt-badges');
      if (optBadgesWrap && optBadges.length > 0) {
        for (const item of optBadges) {
          const badge = document.createElement('span');
          badge.className = 'ppf-chip';
          if (item.warn) {
            badge.style.background = 'rgba(245, 158, 11, 0.16)';
            badge.style.color = '#d97706';
          }
          badge.textContent = item.text;
          if (item.copyVal) {
            badge.title = '点击复制该项内容';
            badge.onclick = async () => {
              await safeCopy(String(item.copyVal));
              setStatus(`📋 已复制：${item.text}`);
            };
          }
          optBadgesWrap.appendChild(badge);
        }
      }

      // 目录、JSON 粘贴与文档导入导出
      const inputDir = shadow.getElementById('ppf-input-dir');
      const inputMd = shadow.getElementById('ppf-input-md');
      shadow.getElementById('ppf-pick-dir').onclick = pickPackDirectory;
      shadow.getElementById('ppf-pick-md').onclick = () => inputMd.click();

      shadow.getElementById('ppf-toggle-paste').onclick = () => {
        showPasteDrawer = !showPasteDrawer;
        render();
      };
      shadow.getElementById('ppf-export-json').onclick = async () => {
        const jsonStr = exportPackToSpecJson(currentPack);
        await safeCopy(jsonStr);
        setStatus('📋 已将当前发布包导出为标准 PublishPack v1.0 JSON 并复制到剪贴板！');
      };

      const pasteCancel = shadow.getElementById('ppf-paste-cancel');
      if (pasteCancel) {
        pasteCancel.onclick = () => {
          showPasteDrawer = false;
          render();
        };
      }
      const pasteConfirm = shadow.getElementById('ppf-paste-confirm');
      if (pasteConfirm) {
        pasteConfirm.onclick = () => {
          const val = shadow.getElementById('ppf-paste-area')?.value || '';
          if (!val.trim()) {
            setStatus('⚠️ 请先粘贴 JSON 内容');
            return;
          }
          try {
            applyPackContent('pasted.publish.pack.json', val);
            showPasteDrawer = false;
            setStatus(`✅ 已成功解析并载入 PublishPack JSON：${currentPack.meta?.packTitle || ''}`);
            render();
          } catch (err) {
            setStatus(`❌ JSON 解析失败：${err.message || err}`);
          }
        };
      }

      inputDir.onchange = (e) => ingestFileEntries(e.target.files);
      inputMd.onchange = async (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        try {
          const text = await f.text();
          applyPackContent(f.name, text);
          setStatus(`✅ 已载入发布包文件：${f.name}`);
          render();
        } catch (err) {
          setStatus(`❌ 解析文件失败：${err.message || err}`);
        }
      };

      const mdSelect = shadow.getElementById('ppf-md-select');
      if (mdSelect) {
        mdSelect.onchange = (e) => {
          const chosen = availableMdFiles[Number(e.target.value)];
          if (chosen) {
            applyPackContent(chosen.name, chosen.text);
            setStatus(`✅ 已切换至文件：${chosen.name}`);
            render();
          }
        };
      }

      // 拖拽导入支持
      const dropzone = shadow.getElementById('ppf-dropzone');
      dropzone.ondragover = (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
      };
      dropzone.ondragleave = () => dropzone.classList.remove('dragover');
      dropzone.ondrop = async (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        const collected = [];
        const readEntry = (entry, prefix = '') =>
          new Promise((resolve) => {
            if (entry.isFile) {
              if (!/\.(json|md|png|jpg|jpeg|webp)$/i.test(entry.name)) {
                resolve();
                return;
              }
              entry.file((file) => {
                file._relPath = prefix + file.name;
                collected.push(file);
                resolve();
              });
            } else if (entry.isDirectory) {
              const reader = entry.createReader();
              const readBatch = () => {
                reader.readEntries(async (entries) => {
                  if (!entries.length) {
                    resolve();
                    return;
                  }
                  for (const sub of entries) await readEntry(sub, `${prefix}${entry.name}/`);
                  readBatch();
                });
              };
              readBatch();
            } else {
              resolve();
            }
          });

        if (e.dataTransfer?.items?.length) {
          const entries = [];
          for (const item of e.dataTransfer.items) {
            const ent = item.webkitGetAsEntry?.();
            if (ent) entries.push(ent);
          }
          if (entries.length) {
            for (const ent of entries) await readEntry(ent, '');
            await ingestFileEntries(collected);
            return;
          }
        }
        if (e.dataTransfer?.files?.length) {
          await ingestFileEntries(e.dataTransfer.files);
        }
      };

      // 图文轮播批量注入
      const injectSlidesBtn = shadow.getElementById('ppf-inject-slides');
      if (injectSlidesBtn) {
        injectSlidesBtn.onclick = async () => {
          injectSlidesBtn.disabled = true;
          try {
            const res = await injectCarouselSlides(slidePaths, coverBlobsMap, (msg) => setStatus(msg));
            setStatus((res.ok ? '✅ ' : '⚠️ ') + res.msg);
          } finally {
            injectSlidesBtn.disabled = false;
          }
        };
      }

      // 封面注入
      const injectBtn = shadow.getElementById('ppf-inject-cover');
      if (injectBtn) {
        injectBtn.onclick = async () => {
          if (!activeBlob || !activeCover) {
            setStatus('⚠️ 请先点上方「📂 选择成品包目录」载入一次封面（多平台将自动共享）');
            return;
          }
          injectBtn.disabled = true;
          try {
            const fileName = activeCover.relPath.split('/').pop() || 'cover.png';
            const res = await injectCoverAndSelectCropRatio(
              activeBlob,
              fileName,
              activeCover.ratio,
              platform,
              (progressMsg) => setStatus(progressMsg)
            );
            setStatus((res.ok ? '✅ ' : '⚠️ ') + res.msg);
          } finally {
            injectBtn.disabled = false;
          }
        };
      }

      // 标题切换、单项填入与复制
      const titleSelect = shadow.getElementById('ppf-title-select');
      if (titleSelect) {
        titleSelect.onchange = (e) => {
          settings.selectedTitleIdx = Number(e.target.value);
          saveSettings(settings);
          render();
        };
      }

      shadow.getElementById('ppf-fill-title-only').onclick = async () => {
        const { titleInput } = locatePlatformFields(platform);
        if (!titleInput) {
          await safeCopy(activeTitle);
          setStatus('⚠️ 未找到标题框，已自动复制标题到剪贴板（⌘V 粘贴）');
          return;
        }
        const clipped = platform === 'douyin' ? activeTitle.slice(0, 30) : activeTitle;
        await humanFillTextInput(titleInput, clipped);
        setStatus('✅ 标题已安全填入');
      };
      shadow.getElementById('ppf-copy-title').onclick = async () => {
        await safeCopy(activeTitle);
        setStatus('📋 标题已复制');
      };

      shadow.getElementById('ppf-fill-body-only').onclick = async () => {
        const { bodyEditor } = locatePlatformFields(platform);
        if (!bodyEditor) {
          await safeCopy(pData.body || '');
          setStatus('⚠️ 未找到描述框，已自动复制到剪贴板（⌘V 粘贴）');
          return;
        }
        if (bodyEditor.tagName === 'TEXTAREA' || bodyEditor.tagName === 'INPUT') {
          await humanFillTextInput(bodyEditor, pData.body || '');
        } else {
          await humanFillRichEditor(bodyEditor, pData.body || '', { append: false });
        }
        setStatus('✅ 正文描述已安全填入');
      };
      shadow.getElementById('ppf-copy-body').onclick = async () => {
        await safeCopy(pData.body || '');
        setStatus('📋 正文已复制');
      };
      shadow.getElementById('ppf-copy-tags').onclick = async () => {
        const str = (pData.tags || [])
          .map((t) => (platform === 'bilibili' ? t : `#${t}`))
          .join(platform === 'bilibili' ? ',' : ' ');
        await safeCopy(str);
        setStatus('📋 全部标签已复制');
      };

      const autoColBtn = shadow.getElementById('ppf-auto-col');
      if (autoColBtn) {
        autoColBtn.onclick = async () => {
          await safeCopy(pData.collection);
          const res = await autoSelectCollection(platform, pData.collection);
          setStatus((res.ok ? '✅ ' : '⚠️ ') + res.msg);
        };
      }

      const bindCopy = (id, val, label) => {
        const el = shadow.getElementById(id);
        if (el) {
          el.onclick = async () => {
            await safeCopy(val);
            setStatus(`📋 已复制${label}`);
          };
        }
      };
      bindCopy('ppf-copy-col', pData.collection, `合集名：${pData.collection}`);
      bindCopy('ppf-copy-loc', pData.location, `位置：${pData.location}`);
      bindCopy('ppf-copy-pin', pData.pinnedComment, '置顶首评，发后 1 分钟可直接粘贴置顶！');
      bindCopy('ppf-copy-dyn', pData.dynamicText, 'B站动态转发语');

      const chkPush = shadow.getElementById('ppf-chk-push');
      if (chkPush) {
        chkPush.onchange = (e) => {
          settings.pushPage = e.target.checked;
          saveSettings(settings);
          syncPagePushMargin();
        };
      }
      const chkClip = shadow.getElementById('ppf-chk-cliponly');
      if (chkClip) {
        chkClip.onchange = (e) => {
          settings.clipboardOnlyMode = e.target.checked;
          saveSettings(settings);
          render();
        };
      }
      const chkAutoTopic = shadow.getElementById('ppf-chk-autotopic');
      if (chkAutoTopic) {
        chkAutoTopic.onchange = (e) => {
          settings.autoTopicEnter = e.target.checked;
          saveSettings(settings);
        };
      }

      shadow.getElementById('ppf-run-all').onclick = runSafeFillAll;

      // 左边框拖拽调宽
      const resizeW = shadow.getElementById('ppf-resize-w');
      resizeW.onmousedown = (e) => {
        e.preventDefault();
        const startX = e.clientX;
        const startWidth = settings.width;
        const onMove = (me) => {
          settings.width = Math.round(Math.min(760, Math.max(320, startWidth + (startX - me.clientX))));
          applyHostGeometry();
        };
        const onUp = () => {
          saveSettings(settings);
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
      };

      // Float 模式拖拽位置与高度调节
      if (settings.layoutMode === 'float') {
        const resizeS = shadow.getElementById('ppf-resize-s');
        const resizeSW = shadow.getElementById('ppf-resize-sw');
        if (resizeS) {
          resizeS.onmousedown = (e) => {
            e.preventDefault();
            const startY = e.clientY;
            const startHeight = settings.height;
            const onMove = (me) => {
              settings.height = Math.round(Math.min(window.innerHeight - 24, Math.max(380, startHeight + (me.clientY - startY))));
              applyHostGeometry();
            };
            const onUp = () => {
              saveSettings(settings);
              window.removeEventListener('mousemove', onMove);
              window.removeEventListener('mouseup', onUp);
            };
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
          };
        }
        if (resizeSW) {
          resizeSW.onmousedown = (e) => {
            e.preventDefault();
            const startX = e.clientX;
            const startY = e.clientY;
            const startW = settings.width;
            const startH = settings.height;
            const onMove = (me) => {
              settings.width = Math.round(Math.min(760, Math.max(320, startW + (startX - me.clientX))));
              settings.height = Math.round(Math.min(window.innerHeight - 24, Math.max(380, startH + (me.clientY - startY))));
              applyHostGeometry();
            };
            const onUp = () => {
              saveSettings(settings);
              window.removeEventListener('mousemove', onMove);
              window.removeEventListener('mouseup', onUp);
            };
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
          };
        }

        const dragHandle = shadow.getElementById('ppf-drag-handle');
        dragHandle.onmousedown = (e) => {
          if (e.target.closest('button')) return;
          const startX = e.clientX;
          const startY = e.clientY;
          const initTop = settings.floatTop;
          const initRight = settings.floatRight;
          const onMove = (me) => {
            settings.floatTop = Math.max(8, Math.min(window.innerHeight - 80, initTop + (me.clientY - startY)));
            settings.floatRight = Math.max(8, Math.min(window.innerWidth - 120, initRight - (me.clientX - startX)));
            applyHostGeometry();
          };
          const onUp = () => {
            saveSettings(settings);
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
          };
          window.addEventListener('mousemove', onMove);
          window.addEventListener('mouseup', onUp);
        };
      }
    }

    window.addEventListener('keydown', (e) => {
      if (e.altKey && (e.code === 'KeyS' || e.key === 's' || e.key === 'ß')) {
        e.preventDefault();
        settings.collapsed = !settings.collapsed;
        saveSettings(settings);
        render();
      }
    });

    // Chrome 插件模式下：当其它标签页载入了新成品包，或点击右上角插件弹窗切换折叠状态时，本页免刷新实时热同步！
    if (IS_CHROME_EXT && chrome.storage?.onChanged) {
      chrome.storage.onChanged.addListener(async (changes, areaName) => {
        if (areaName !== 'local' || suppressStorageEcho) return;
        let needRender = false;
        if (changes[STORAGE_KEY_SETTINGS]) {
          settings = await loadSettings();
          needRender = true;
        }
        if (changes[STORAGE_KEY_PACK]) {
          currentPack = await loadPackState();
          coverBlobsMap = await loadCoversCrossPlatform();
          setStatus(`🔄 已实时同步新发布包：${currentPack.meta?.packTitle || ''}`);
          needRender = true;
        } else if (Object.keys(changes).some((k) => k.startsWith(CROSS_COVER_PREFIX))) {
          coverBlobsMap = await loadCoversCrossPlatform();
          needRender = true;
        }
        if (needRender) render();
      });
    }

    render();
  }

  setTimeout(mountUI, 1000);
})();
