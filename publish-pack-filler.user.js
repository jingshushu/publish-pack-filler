// ==UserScript==
// @name         全平台半自动发布助手
// @namespace    https://local.aihub.publish-pack-filler
// @version      2.3.0
// @description  全平台半自动发布与四端数据安全采集助手：内置飞书/Lark纯JS直连、Cutcheck在线审片直连免选文件、发前红转绿警示同步与A/B/C极简工作台
// @author       Jing & Antigravity
// @match        https://creator.xiaohongshu.com/*
// @match        https://creator.douyin.com/*
// @match        https://channels.weixin.qq.com/*
// @match        https://member.bilibili.com/*
// @match        https://cp.kuaishou.com/*
// @match        https://mp.weixin.qq.com/*
// @match        https://zhuanlan.zhihu.com/*
// @match        https://weibo.com/*
// @match        https://studio.youtube.com/*
// @match        https://cutcheck-alpha.vercel.app/*
// @match        http://127.0.0.1/*
// @match        http://localhost/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_setClipboard
// @grant        GM_xmlhttpRequest
// @connect      127.0.0.1
// @connect      localhost
// @connect      open.feishu.cn
// @connect      base-api.feishu.cn
// @connect      open.larksuite.com
// @connect      base-api.larksuite.com
// @run-at       document-idle
// ==/UserScript==

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
  const STORAGE_KEY_EXPORT_CACHE = 'ppf_export_cache_v1';
  const STORAGE_KEY_DEVICE_ID = 'ppf_device_id_v1';
  const STORAGE_KEY_PENDING_CUTCHECK = 'ppf_pending_cutcheck_v1';
  const FEISHU_FEEDBACK_FORM_URL = 'https://my.feishu.cn/share/base/shrcnRMlf6gosr0Werh6Oazu3Q9';
  const EXT_FALLBACK_VERSION = '2.3.0';
  const EXPORT_DEDUP_WINDOW_MS = 12 * 3600 * 1000; // 12 小时防重窗口
  const CROSS_COVER_PREFIX = 'ppf_xcover_v1::';
  const BRIDGE_DEFAULT_URL = 'http://127.0.0.1:8765';
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
      isPresetDefault: true,
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
    xiaohongshu: { name: '小红书', accent: '#ff2442', preferredRatios: ['3:4', '9:16', '4:3', '1:1', '16:9'] },
    douyin: { name: '抖音', accent: '#fe2c55', preferredRatios: ['3:4', '9:16', '16:9', '4:3'] },
    weixin: { name: '微信视频号', accent: '#07c160', preferredRatios: ['3:4', '4:3', '9:16', '16:9'] },
    bilibili: { name: 'B 站', accent: '#00aeec', preferredRatios: ['16:9', '4:3', '3:4', '9:16'] },
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

  function escapeHtml(str = '') {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function extractWorkSlugFront(raw = '') {
    const text = String(raw || '')
      .trim()
      .replace(/\\/g, '/')
      .replace(/\/+$/, '');
    if (!text) return '';
    const dateSlugMatch = text.match(/(\d{8}_[^/\\\s"']+)/);
    if (dateSlugMatch) return dateSlugMatch[1];
    const parts = text.split('/').filter(Boolean);
    if (!parts.length) return '';
    let last = parts[parts.length - 1];
    const subDirRe = /^(?:成片|04_成片|04_发布与成片|09_发布与交付|publish_pack|封面|covers|slides|images|文案)$/i;
    if (subDirRe.test(last)) {
      if (parts.length >= 2) {
        last = parts[parts.length - 2];
      } else {
        return '';
      }
    }
    if (/^(?:Users|Desktop|AIHub|Code|Downloads|Volumes)$/i.test(last) || subDirRe.test(last)) return '';
    return last;
  }

  function normalizeCompareTitle(str = '') {
    return String(str || '')
      .toLowerCase()
      .replace(/[^\u4e00-\u9fa5a-z0-9]/g, '');
  }

  async function getOrCreateDeviceId() {
    let devId = String((await xStorageGet(STORAGE_KEY_DEVICE_ID, '')) || '').trim();
    if (!devId || !devId.startsWith('ppf_')) {
      let rand = '';
      for (let i = 0; i < 10; i++) {
        rand += Math.floor(Math.random() * 36).toString(36);
      }
      devId = `ppf_${rand}`;
      await xStorageSet(STORAGE_KEY_DEVICE_ID, devId);
    }
    return devId;
  }

  function detectRuntimeOsAndBrowser() {
    const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
    const os = /Mac OS X|Macintosh/i.test(ua)
      ? 'macOS'
      : /Windows NT/i.test(ua)
      ? 'Windows'
      : /Linux/i.test(ua)
      ? 'Linux'
      : 'Desktop';
    const edg = ua.match(/Edg\/(\d+)/);
    const chr = ua.match(/Chrome\/(\d+)/);
    const browser = edg ? `Edge ${edg[1]}` : chr ? `Chrome ${chr[1]}` : 'Browser';
    return `${os} · ${browser}`;
  }

  function sanitizeDiagSnippet(text = '') {
    return String(text || '')
      .replace(/\/Users\/[^/\s"']+/g, '/Users/***')
      .replace(/[A-Za-z]:\\Users\\[^\\\s"']+/gi, 'C:\\Users\\***')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function buildFeishuFeedbackUrl({ pageLabel, panelModeLabel, deviceId, diagSummary }) {
    const ver =
      (IS_CHROME_EXT && typeof chrome !== 'undefined' && chrome.runtime?.getManifest?.()?.version) ||
      EXT_FALLBACK_VERSION;
    const fields = {
      所属产品: '全平台发布助手',
      产品代号: 'publish-pack-filler',
      产品形态: IS_CHROME_EXT ? '浏览器插件' : 'Tampermonkey脚本',
      版本号: ver,
      页面路径: pageLabel,
      运行环境: `${detectRuntimeOsAndBrowser()} · ${panelModeLabel}`,
      设备标识: deviceId,
      诊断信息: sanitizeDiagSnippet(diagSummary).slice(0, 280),
    };
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(fields)) {
      qs.set(`prefill_${k}`, String(v ?? ''));
      qs.set(`hide_${k}`, '1');
    }
    return `${FEISHU_FEEDBACK_FORM_URL}?${qs.toString()}`;
  }

  // 严格判定文件是否为合法的 PublishPack 发布包（自动排除 publish_receipt.json / words.json / sources.json 等回执与元数据文件）
  function isValidPublishPackContent(fileName = '', rawText = '') {
    const txt = String(rawText || '').trim();
    if (!txt) return false;
    const isJson = /\.json$/i.test(fileName) || txt.replace(/^```(?:json)?\s*/i, '').trimStart().startsWith('{');
    if (!isJson) return true;
    if (/(?:receipt|state|meta|words|sources|config|package|manifest|schema)/i.test(fileName)) {
      return false;
    }
    try {
      const clean = txt
        .replace(/^```(?:json)?\s*\n?/i, '')
        .replace(/\n?```\s*$/i, '')
        .trim();
      const obj = JSON.parse(clean);
      return Boolean(obj && typeof obj === 'object' && (obj.specVersion || obj.platforms || obj.default));
    } catch {
      return false;
    }
  }

  // 严格限定仅在各平台的「真实发布 / 投稿 / 创作编辑页」挂载发布助手，在首页、稿件管理列表、评论私信、普通浏览页一律隐藏！
  function isPublishPageContext(href = location.href) {
    let parsed;
    try {
      parsed = new URL(href || location.href);
    } catch {
      return false;
    }
    const host = parsed.hostname.toLowerCase();
    const p = parsed.pathname || '/';

    if (host.includes('creator.xiaohongshu.com')) {
      return /^\/publish(?:\/|$)/i.test(p);
    }
    if (host.includes('creator.douyin.com')) {
      return /\/(?:creator-micro\/)?content\/(?:upload|publish|post|edit)(?:\/|$)/i.test(p);
    }
    if (host.includes('channels.weixin.qq.com')) {
      return /^\/platform\/post\/(?!list(?:\/|$))[a-z0-9_-]*create|^\/platform\/post\/edit/i.test(p);
    }
    if (host.includes('member.bilibili.com')) {
      return /^\/platform\/upload(?:\/|$)/i.test(p);
    }
    if (host.includes('cp.kuaishou.com')) {
      return /^\/article\/publish(?:\/|$)/i.test(p);
    }
    if (host.includes('mp.weixin.qq.com')) {
      return /\/cgi-bin\/appmsg/i.test(p);
    }
    if (host.includes('zhuanlan.zhihu.com')) {
      return /^\/(?:write|p\/\d+\/edit)/i.test(p);
    }
    if (host === 'card.weibo.com') {
      return /\/article/i.test(p);
    }
    if (host.includes('weibo.com')) {
      return /^\/upload(?:\/|$)/i.test(p);
    }
    if (host.includes('studio.youtube.com')) {
      return /\/videos\/upload/i.test(href) || /^\/video\/[^/]+\/edit/i.test(p);
    }
    return false;
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

  function extractBulletValue(sectionText, labelRegex) {
    if (!sectionText) return '';
    const lines = sectionText.split('\n');
    for (const line of lines) {
      const m = line.match(/^\s*(?:[-*]|\d+\.)\s*(?:\*\*([^*]+)\*\*|([^：:\n]+))\s*[：:]\s*(.*)$/);
      if (m) {
        const key = (m[1] || m[2] || '').trim();
        if (labelRegex.test(key)) return (m[3] || '').trim();
      }
    }
    return '';
  }

  function extractSubheadingText(sectionText, subRegex) {
    if (!sectionText) return '';
    const normalized = sectionText.replace(/\r\n/g, '\n') + '\n### __END__\n';
    const re = /^###\s+([^\n]+)\n([\s\S]*?)(?=^###\s+|^---\s*$)/gm;
    let m;
    while ((m = re.exec(normalized)) !== null) {
      if (m[1].trim() === '__END__') break;
      if (subRegex.test(m[1].trim())) {
        return m[2].trim();
      }
    }
    return '';
  }

  function extractBacktickTokens(text = '') {
    const out = [];
    const re = /`([^`\n]+)`/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      const tok = m[1].replace(/^#+/, '').trim();
      if (tok && !out.includes(tok)) out.push(tok);
    }
    return out;
  }

  function extractBlockquoteText(sectionText = '') {
    return sectionText
      .split('\n')
      .filter((l) => /^\s*>/.test(l))
      .map((l) => l.replace(/^\s*>\s?/, ''))
      .join('\n')
      .trim();
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
      if (/00|基础|上传文件|封面\s*PK/i.test(heading)) sections.meta = (sections.meta ? `${sections.meta}\n` : '') + content;
      else if (/01|小红书|\bXHS\b/i.test(heading)) sections.xhs = content;
      else if (/02|视频号|\bSPH\b/i.test(heading)) sections.wx = content;
      else if (/03|B\s*站|bilibili|\bBILI\b/i.test(heading)) sections.bili = content;
      else if (/04|抖音|\bDY\b/i.test(heading)) sections.dy = content;
      else if (/置顶评论/.test(heading)) sections.globalPinned = content;
    }

    const coverSet = new Map();
    const collectCovers = (text = '') => {
      const re = /`([^`\n]*封面[^`\n]*\.(?:png|jpg|jpeg|webp))`|\(([^)\n]*封面[^)\n]*\.(?:png|jpg|jpeg|webp))\)|(?:^|\s|[：:])([^\s`()：:]*封面[^\s`()：:]*\.(?:png|jpg|jpeg|webp))/gim;
      let cm;
      while ((cm = re.exec(text)) !== null) {
        const rawRel = (cm[1] || cm[2] || cm[3] || '').trim().replace(/^(?:04_成片|04_发布与成片|成片)\//, '');
        if (!rawRel) continue;
        const normalizedRel = rawRel.startsWith('封面/') ? rawRel : (rawRel.includes('/') ? rawRel : `封面/${rawRel}`);
        if (!coverSet.has(normalizedRel)) {
          coverSet.set(normalizedRel, inferCoverMetaFromPath(normalizedRel));
        }
      }
    };
    collectCovers(mdText);

    const globalPinnedFallback = extractBlockquoteText(sections.globalPinned || '');

    // 01 小红书（兼容万物有数代码块与靖蜀黍 SOP 列表/子标题）
    const xhsSec = sections.xhs || '';
    const xhsTitle =
      extractCodeBlockAfter(xhsSec, /\*\*(?:主推)?标题[^*\n]*\*\*/) ||
      extractInlineAfter(xhsSec, /\*\*(?:主推)?标题[^*\n]*\*\*/) ||
      extractBulletValue(xhsSec, /^(?:主推|标题|推荐主标题)$/);
    const xhsAltBullet = extractBulletValue(xhsSec, /^备选/);
    const xhsAltTitles = extractNumberedList(xhsSec, /备选标题/);
    if (!xhsAltTitles.length && xhsAltBullet) xhsAltTitles.push(xhsAltBullet);
    const xhsBodyRaw =
      extractCodeBlockAfter(xhsSec, /\*\*正文\*\*/) ||
      extractSubheadingText(xhsSec, /^正文/) ||
      extractBulletValue(xhsSec, /^正文/);
    const xhsTagLine = extractCodeBlockAfter(xhsSec, /\*\*话题标签\*\*/);
    const xhsTagsFromBlock = splitBodyAndHashtags(xhsTagLine).tags;
    const xhsSplit = splitBodyAndHashtags(xhsBodyRaw);
    const xhsTags = xhsTagsFromBlock.length ? xhsTagsFromBlock : xhsSplit.tags;
    const xhsCover = extractCoverAfter(xhsSec, /\*\*指定封面\*\*/) || '封面/封面_3x4_A.png';
    const xhsCollection = extractInlineAfter(xhsSec, /\*\*合集\*\*/);
    const xhsPinned = extractCodeBlockAfter(xhsSec, /\*\*[^*\n]*置顶(?:首评|评论)[^*\n]*\*\*/) || globalPinnedFallback;

    // 04 抖音（先解析抖音以便视频号缺省时智能回退）
    const dySec = sections.dy || '';
    const dyExplicitTitle = extractCodeBlockAfter(dySec, /\*\*作品标题[^*\n]*\*\*/);
    const dyAltTitles = extractNumberedList(dySec, /备选标题/);
    const dyMainBullet = extractBulletValue(dySec, /^(?:主推|标题)$/);
    const dyAltBullet = extractBulletValue(dySec, /^备选/);
    const dyDescRaw =
      extractCodeBlockAfter(dySec, /\*\*作品描述[^*\n]*\*\*/) ||
      extractCodeBlockAfter(dySec, /\*\*描述[^*\n]*\*\*/) ||
      extractBulletValue(dySec, /^正文/) ||
      dyMainBullet;
    const dySplit = splitBodyAndHashtags(dyDescRaw);
    if (!dyAltTitles.length && dyAltBullet) {
      dyAltTitles.push(splitBodyAndHashtags(dyAltBullet).bodyOnly.slice(0, 30));
    }
    const dyFallbackTitle =
      dyExplicitTitle ||
      (dyMainBullet && !dyDescRaw.includes('\n') ? (dySplit.bodyOnly.split(/[！!？?。]/)[0] || '').slice(0, 30) : '') ||
      xhsTitle ||
      (dySplit.bodyOnly.split(/[！!？?。]/)[0] || '').slice(0, 30);
    const dyCollection = extractInlineAfter(dySec, /\*\*合集\*\*/);
    const dyLocation = extractInlineAfter(dySec, /\*\*位置\*\*/);
    const dyCover = extractCoverAfter(dySec, /\*\*指定封面\*\*/);
    const dyPinned = extractCodeBlockAfter(dySec, /\*\*置顶评论\*\*/) || globalPinnedFallback;

    // 02 视频号（若文稿未单列视频号章节，自动回退复用抖音/小红书正文与短标题）
    const wxSec = sections.wx || '';
    const wxShortRaw =
      extractCodeBlockAfter(wxSec, /\*\*短标题[^*\n]*\*\*/) ||
      extractInlineAfter(wxSec, /\*\*短标题[^*\n]*\*\*/) ||
      extractBulletValue(wxSec, /^(?:短标题|标题)$/) ||
      (!wxSec.trim() ? xhsTitle || dyFallbackTitle : '');
    const wxAltTitles = extractNumberedList(wxSec, /备选短标题/);
    const wxDescRaw =
      extractCodeBlockAfter(wxSec, /\*\*描述正文\*\*/) ||
      extractBulletValue(wxSec, /^正文/) ||
      (!wxSec.trim() ? dyDescRaw || xhsBodyRaw : '');
    const wxSplit = splitBodyAndHashtags(wxDescRaw);
    const wxCollection = extractInlineAfter(wxSec, /\*\*合集\*\*/);
    const wxLocation = extractInlineAfter(wxSec, /\*\*位置\*\*/);
    const wxPinned = extractCodeBlockAfter(wxSec, /\*\*[^*\n]*置顶(?:首评|评论)[^*\n]*\*\*/) || globalPinnedFallback;

    // 03 B 站
    const biliSec = sections.bili || '';
    const biliTitle =
      extractCodeBlockAfter(biliSec, /\*\*稿件标题[^*\n]*\*\*/) ||
      extractBulletValue(biliSec, /^(?:推荐主标题|主推|标题)$/);
    const biliAltTitles = extractNumberedList(biliSec, /备选标题/);
    const biliAltBullet = extractBulletValue(biliSec, /^备选/);
    if (!biliAltTitles.length && biliAltBullet) biliAltTitles.push(biliAltBullet);
    const biliBody =
      extractCodeBlockAfter(biliSec, /\*\*稿件简介[^*\n]*\*\*/) ||
      extractSubheadingText(biliSec, /^(?:简介正文|简介|正文)/) ||
      extractBulletValue(biliSec, /^正文/);
    const biliTagsRaw = extractCodeBlockAfter(biliSec, /\*\*普通标签[^*\n]*\*\*/);
    const biliTagSub = extractSubheadingText(biliSec, /^标签/);
    const biliTags = biliTagsRaw
      ? biliTagsRaw
          .split(/[,，\n]/)
          .map((s) => s.replace(/#/g, '').trim())
          .filter(Boolean)
      : extractBacktickTokens(biliTagSub);
    const biliCategory = extractInlineAfter(biliSec, /\*\*投稿分区\*\*/);
    const biliCollection = extractInlineAfter(biliSec, /\*\*合集\*\*/);
    const biliTopic = extractInlineAfter(biliSec, /\*\*活动话题[^*\n]*\*\*/);
    const biliDynamic = extractCodeBlockAfter(biliSec, /\*\*动态转发语\*\*/);
    const biliPinned = extractCodeBlockAfter(biliSec, /\*\*置顶评论\*\*/) || globalPinnedFallback;
    const biliCover4x3 = extractCoverAfter(biliSec, /推荐流列表封面/) || '';
    const biliCover16x9 = extractCoverAfter(biliSec, /播放页宽屏封面/) || '';

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

  function locateBilibiliTagContext() {
    // 1. 直接按 2025/2026 B站标签框多种 placeholder（初始为「按回车键Enter创建标签」，自动带入标签后变为「还可以添加X个标签」）与容器类名定位
    let tagInput = findFirstVisible([
      'input[placeholder*="按回车键Enter创建标签"]',
      'input[placeholder*="创建标签"]',
      'input[placeholder*="还可以添加"][placeholder*="标签"]',
      'input[placeholder*="添加标签"]',
      'input[placeholder*="输入标签"]',
      '.tag-input-wrp input',
      '.content-tag-v2-container input',
      '[class*="tag-input" i] input:not([type="hidden"]):not([type="file"])',
      '[class*="label-input" i] input:not([type="hidden"]):not([type="file"])',
    ]);

    let rowContainer = null;
    if (tagInput) {
      rowContainer =
        tagInput.closest?.('.tag-wrp, .content-tag-v2-container, .form-item, [class*="tag-container" i], [class*="form-item" i]') ||
        tagInput.parentElement?.parentElement ||
        tagInput.parentElement;
      return { tagInput, rowContainer };
    }

    // 2. 结构兜底：通过表单左侧「*标签 / 标签」标题行定位同行内的输入框（彻底免疫类名与 placeholder 改版）
    const labels = queryDeepAll('p, span, div, label');
    const tagLabel = labels.find((el) => {
      if (!isVisible(el)) return false;
      const r = el.getBoundingClientRect();
      if (r.width > 160 || r.height > 60) return false;
      const t = (el.textContent || '').replace(/[\s*:：]/g, '');
      return t === '标签';
    });

    if (tagLabel) {
      let cur = tagLabel.parentElement;
      for (let d = 0; d < 4 && cur; d++) {
        const r = cur.getBoundingClientRect();
        if (r.width >= 340 && r.height <= 360) {
          rowContainer = cur;
          break;
        }
        cur = cur.parentElement;
      }
      if (rowContainer) {
        const cands = queryDeepAll(
          'input[type="text"], input:not([type="hidden"]):not([type="file"]):not([type="checkbox"]):not([type="radio"]), [contenteditable="true"]',
          rowContainer
        ).filter((el) => isVisible(el));
        tagInput = cands[0] || null;
      }
    }

    return { tagInput, rowContainer };
  }

  async function fillBilibiliTagPills(tags = [], { clearExisting = true } = {}) {
    const cleanTargetTags = tags
      .map((t) => String(t || '').replace(/#/g, '').trim())
      .filter(Boolean)
      .slice(0, 10);
    if (!cleanTargetTags.length) return { ok: false, reason: '无有效标签' };

    let { tagInput, rowContainer } = locateBilibiliTagContext();
    if (!rowContainer && !tagInput) {
      return { ok: false, reason: '未找到 B 站标签框（请先上传视频展开投稿表单）' };
    }

    // 读取当前已存在的标签胶囊，必要时先清理视频上传自动带入的无关杂项标签（腾出 10 个名额）
    const getPillElements = (scope) => {
      if (!scope) return [];
      const pills = queryDeepAll(
        '.label-item-v2-container, .label-item-container, .tag-pre-wrp > div, [class*="label-item-v2" i], [class*="tag-item" i]',
        scope
      ).filter((el) => {
        if (!isVisible(el)) return false;
        const r = el.getBoundingClientRect();
        return r.width > 24 && r.width < 260 && r.height >= 18 && r.height <= 48;
      });
      return pills;
    };

    const extractPillText = (pillEl) =>
      (pillEl.textContent || '')
        .replace(/[×✕✖xX]$/g, '')
        .trim();

    if (clearExisting && rowContainer) {
      const existingPills = getPillElements(rowContainer);
      for (const pill of existingPills) {
        const txt = extractPillText(pill);
        if (txt && !cleanTargetTags.includes(txt)) {
          const closeBtn =
            pill.querySelector('.close, [class*="close" i], [class*="del" i], i, svg') ||
            Array.from(pill.children).find((ch) => ch.tagName === 'I' || ch.tagName === 'SVG');
          if (closeBtn) {
            closeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true }));
            await humanSleep(90, 160);
          }
        }
      }
    }

    // 清理后重新获取一次输入框（防止之前满 10 个时 input 被隐藏，删掉后重新显示）
    ({ tagInput, rowContainer } = locateBilibiliTagContext());
    if (!tagInput) {
      return { ok: false, reason: 'B站标签已满 10 个或未找到输入框，请手动删减后再试' };
    }

    const existingTexts = new Set(rowContainer ? getPillElements(rowContainer).map(extractPillText).filter(Boolean) : []);
    let addedCount = 0;

    for (const cleanTag of cleanTargetTags) {
      if (existingTexts.has(cleanTag)) {
        addedCount++;
        continue;
      }
      ({ tagInput, rowContainer } = locateBilibiliTagContext());
      if (!tagInput) break;

      const doc = tagInput.ownerDocument || document;
      const win = doc.defaultView || window;

      try {
        tagInput.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
      } catch {
        // ignore
      }
      await humanMouseClick(tagInput);
      tagInput.focus();
      await humanSleep(70, 130);

      if (tagInput.isContentEditable) {
        await clearRichEditor(tagInput);
        await insertTextIntoEditor(tagInput, cleanTag);
      } else {
        const proto = Object.getPrototypeOf(tagInput);
        const nativeSetter =
          Object.getOwnPropertyDescriptor(proto, 'value')?.set ||
          Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value')?.set;
        if (nativeSetter) nativeSetter.call(tagInput, '');
        else tagInput.value = '';
        tagInput.dispatchEvent(new win.InputEvent('input', { bubbles: true, composed: true, inputType: 'deleteContentBackward' }));

        if (nativeSetter) nativeSetter.call(tagInput, cleanTag);
        else tagInput.value = cleanTag;
        tagInput.dispatchEvent(
          new win.InputEvent('input', {
            bubbles: true,
            cancelable: true,
            composed: true,
            inputType: 'insertText',
            data: cleanTag,
          })
        );
        tagInput.dispatchEvent(new win.Event('change', { bubbles: true, composed: true }));
      }

      // 给 Vue 响应式 v-model 留足同步时间后再敲回车提交标签
      await humanSleep(140, 240);

      const enterInit = {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        charCode: 13,
        bubbles: true,
        cancelable: true,
        composed: true,
      };
      tagInput.dispatchEvent(new win.KeyboardEvent('keydown', enterInit));
      tagInput.dispatchEvent(new win.KeyboardEvent('keypress', enterInit));
      tagInput.dispatchEvent(new win.KeyboardEvent('keyup', enterInit));

      await humanSleep(220, 360);

      // 若回车监听挂在外层包装器上导致输入框仍有残留字符，向父容器补发一次回车
      if (!tagInput.isContentEditable && tagInput.value && tagInput.value.trim() === cleanTag && tagInput.parentElement) {
        tagInput.parentElement.dispatchEvent(new win.KeyboardEvent('keydown', enterInit));
        tagInput.parentElement.dispatchEvent(new win.KeyboardEvent('keyup', enterInit));
        await humanSleep(140, 220);
      }

      existingTexts.add(cleanTag);
      addedCount++;
    }

    return { ok: addedCount > 0, count: addedCount };
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
          '.archive-info-editor [contenteditable="true"]',
          'div[contenteditable="true"][placeholder*="填写更全面的相关信息"]',
          'textarea[placeholder*="填写更全面的相关信息"]',
          'textarea[placeholder*="简介"]',
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

  // ==================== 扩展后台通信 & 可选本地只读桥接 ====================
  function sendExtMessage(msg) {
    return new Promise((resolve, reject) => {
      if (!IS_CHROME_EXT || !chrome.runtime?.sendMessage) {
        reject(new Error('当前为独立脚本环境，建议安装 Chrome 扩展版以启用内置飞书直连'));
        return;
      }
      chrome.runtime.sendMessage(msg, (resp) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (resp && resp.ok === false) {
          reject(new Error(resp.error || '飞书请求失败'));
          return;
        }
        resolve(resp || {});
      });
    });
  }

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
        timeout: 20000,
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

  function gmPostJson(url, body = {}) {
    if (IS_CHROME_EXT && chrome.runtime?.sendMessage) {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'PPF_BRIDGE_POST', url, body }, (resp) => {
          if (resp && resp.ok) resolve(resp.data);
          else reject(new Error(resp?.error || '桥接请求失败'));
        });
      });
    }
    return new Promise((resolve, reject) => {
      if (typeof GM_xmlhttpRequest !== 'function') {
        reject(new Error('不支持桥接请求'));
        return;
      }
      GM_xmlhttpRequest({
        method: 'POST',
        url,
        data: JSON.stringify(body || {}),
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        timeout: 20000,
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

  function mergeCoversWithBlobs(existingCovers = [], blobsMap = new Map(), isImagePost = false) {
    if (isImagePost && (!existingCovers || existingCovers.length === 0)) {
      return [];
    }
    const merged = Array.isArray(existingCovers) ? [...existingCovers] : [];
    for (const relPath of blobsMap.keys()) {
      const base = relPath.split('/').pop();
      const already = merged.some((c) => c.relPath === relPath || (c.relPath && c.relPath.split('/').pop() === base));
      if (!already) {
        merged.push(inferCoverMetaFromPath(relPath));
      }
    }
    return merged;
  }

  function getThumbBoxDimensions(ratio = '3:4') {
    if (ratio === '16:9') return { w: 112, h: 63 };
    if (ratio === '4:3') return { w: 100, h: 75 };
    if (ratio === '1:1') return { w: 76, h: 76 };
    if (ratio === '9:16') return { w: 56, h: 99 };
    return { w: 68, h: 90 };
  }

  async function loadSettings() {
    const defaults = {
      theme: 'light',
      layoutMode: 'dock',
      dockSide: 'left',
      pushPage: true,
      collapsed: false,
      width: 368,
      height: Math.min(840, Math.max(560, window.innerHeight - 80)),
      floatTop: 64,
      floatRight: 20,
      clipboardOnlyMode: false,
      autoTopicEnter: false,
      bridgeUrl: BRIDGE_DEFAULT_URL,
      lastBridgeVersion: '',
      selectedCoverByPlat: {},
      selectedTitleIdx: -1,
      exportAccountOverride: 'auto',
    };
    try {
      const raw = await xStorageGet(STORAGE_KEY_SETTINGS, '');
      if (raw) {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const merged = { ...defaults, ...parsed };
        if (!merged.selectedCoverByPlat || typeof merged.selectedCoverByPlat !== 'object') {
          merged.selectedCoverByPlat = {};
        }
        if (merged.bridgeUrl === 'http://127.0.0.1:18765') {
          merged.bridgeUrl = BRIDGE_DEFAULT_URL;
        }
        return merged;
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

    // 确保所有已缓存配图全部合入封面池，并按真实像素宽高更新比例（即使文件名未带 16x9/3x4 也能精准识别！）
    async function hydrateCoversFromBlobs() {
      if (!coverBlobsMap.size) return false;
      const isImgPost = currentPack.meta?.contentType === 'image_post';
      const beforeCount = (currentPack.covers || []).length;
      currentPack.covers = mergeCoversWithBlobs(currentPack.covers, coverBlobsMap, isImgPost);
      let changed = currentPack.covers.length !== beforeCount;
      for (const c of currentPack.covers) {
        const blob = findBlobFlexible(coverBlobsMap, c.relPath);
        if (blob && !c._ratioVerified) {
          const realRatio = await detectImageBlobRatio(blob, c.ratio);
          if (realRatio && realRatio !== c.ratio) {
            c.ratio = realRatio;
            changed = true;
          }
          c._ratioVerified = true;
        }
      }
      if (changed) {
        savePackState(currentPack);
      }
      return changed;
    }

    function syncPagePushMargin() {
      const isPubPage = isPublishPageContext();
      const shouldPush = isPubPage && settings.layoutMode === 'dock' && settings.pushPage && !settings.collapsed;
      const isLeftDock = (settings.dockSide || 'left') === 'left';
      const docEl = document.documentElement;
      const bodyEl = document.body;
      if (docEl.style.marginRight) docEl.style.marginRight = '';
      if (docEl.style.marginLeft) docEl.style.marginLeft = '';

      // 先还原可能残留的反向 padding 与 fixed 容器偏移
      const clearShiftedFixed = () => {
        const shiftedR = document.querySelectorAll('[data-ppf-orig-right]');
        for (const el of shiftedR) {
          el.style.right = el.dataset.ppfOrigRight;
          delete el.dataset.ppfOrigRight;
        }
        const shiftedL = document.querySelectorAll('[data-ppf-orig-left]');
        for (const el of shiftedL) {
          el.style.left = el.dataset.ppfOrigLeft;
          delete el.dataset.ppfOrigLeft;
        }
      };

      if (shouldPush) {
        clearShiftedFixed();
        docEl.style.boxSizing = 'border-box';
        docEl.style.paddingLeft = isLeftDock ? `${settings.width}px` : '';
        docEl.style.paddingRight = isLeftDock ? '' : `${settings.width}px`;
        docEl.style.minWidth = '0px';
        if (bodyEl) {
          if (bodyEl.dataset.ppfOrigMinW === undefined) {
            bodyEl.dataset.ppfOrigMinW = bodyEl.style.minWidth || '';
          }
          bodyEl.style.minWidth = '0px';
          bodyEl.style.maxWidth = '100%';
        }
        // 兼容内部使用 position:fixed 自建全屏滚动区的 SPA 框架
        const fixedShells = document.querySelectorAll('body > div, body > main, #app > div');
        for (const el of fixedShells) {
          if (el === hostEl) continue;
          const cs = window.getComputedStyle(el);
          if (cs.position !== 'fixed') continue;
          const rect = el.getBoundingClientRect();
          if (rect.width > window.innerWidth * 0.5 && rect.height > window.innerHeight * 0.45) {
            if (isLeftDock && Math.abs(rect.left) <= 20) {
              if (el.dataset.ppfOrigLeft === undefined) {
                el.dataset.ppfOrigLeft = el.style.left || '';
              }
              el.style.left = `${settings.width}px`;
            } else if (!isLeftDock && Math.abs(window.innerWidth - rect.right) <= 20) {
              if (el.dataset.ppfOrigRight === undefined) {
                el.dataset.ppfOrigRight = el.style.right || '';
              }
              el.style.right = `${settings.width}px`;
            }
          }
        }
      } else {
        if (docEl.style.paddingRight) docEl.style.paddingRight = '';
        if (docEl.style.paddingLeft) docEl.style.paddingLeft = '';
        if (docEl.style.minWidth === '0px') docEl.style.minWidth = '';
        if (bodyEl && bodyEl.dataset.ppfOrigMinW !== undefined) {
          bodyEl.style.minWidth = bodyEl.dataset.ppfOrigMinW;
          bodyEl.style.maxWidth = '';
          delete bodyEl.dataset.ppfOrigMinW;
        }
        clearShiftedFixed();
      }
    }

    const hostEl = document.createElement('aside');
    (document.body || document.documentElement).appendChild(hostEl);
    const shadow = hostEl.attachShadow({ mode: 'closed' });

    const styleEl = document.createElement('style');
    shadow.appendChild(styleEl);

    const rootWrap = document.createElement('div');
    rootWrap.className = 'ppf-root';
    shadow.appendChild(rootWrap);

    let statusText =
      platform === 'weixin'
        ? '视频号就绪 · 请点页面「发表视频」并拖入视频，再点下方一键填表或注入双封面'
        : platform === 'douyin'
        ? '抖音就绪 · 打开封面弹窗后点注入将自动切换横/竖封面并避开 AI 参考图槽'
        : '就绪 · 打开封面编辑框后点「注入封面」将自动匹配裁剪比例';
    let activeThumbUrl = '';

    async function openFeedbackEntry() {
      const dataCtx = getDataCenterContext();
      const pageTag = dataCtx.isDataMode ? `${pMeta.name}数据页` : `${pMeta.name}发布页`;
      const cleanPageUrl = `[${pageTag}] ${location.origin}${location.pathname}`;
      const panelModeLabel = dataCtx.isDataMode
        ? '数据导出面板'
        : settings.layoutMode === 'float'
        ? '自由悬浮窗'
        : (settings.dockSide || 'left') === 'left'
        ? '左侧分屏停靠'
        : '右侧分屏停靠';

      let bridgeState = 'offline';
      try {
        const probe = await Promise.race([
          gmRequestJson(`${settings.bridgeUrl}/api/status`),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 500)),
        ]);
        if (probe && probe.ok) bridgeState = 'online';
      } catch {
        bridgeState = 'offline';
      }

      const effCand = getEffectiveFeishuCandidate();
      const curSig = getCurrentSyncSignature();
      const isSynced = Boolean(
        feishuState.configured && prePubState.syncedSig && prePubState.syncedSig === curSig && !prePubState.lastAlertIsError
      );
      const bindRec = effCand?.cSerialNo || effCand?.cRecordId || effCand?.bRecordId || 'none';
      const packFmt = currentPack.meta?.isPresetDefault
        ? 'preset'
        : `${currentPack.meta?.format || 'unknown'}(covers:${coverBlobsMap.size})`;
      const lastErr = sanitizeDiagSnippet(prePubState.lastAlert || feishuState.error || 'none').slice(0, 90);
      const diagSummary = `bridge:${bridgeState} | feishu:${
        feishuState.configured ? 'configured' : 'unconfigured'
      } | syncStatus:${isSynced ? '已同步' : '未同步'} | bindRecord:${bindRec} | pack:${packFmt} | lastError:${lastErr}`;

      const deviceId = await getOrCreateDeviceId();
      const fbUrl = buildFeishuFeedbackUrl({
        pageLabel: cleanPageUrl,
        panelModeLabel,
        deviceId,
        diagSummary,
      });
      window.open(fbUrl, '_blank', 'noopener,noreferrer');
    }

    function setStatus(msg) {
      statusText = msg;
      const isErr = /^(?:❌|⚠️|🚨|🔴)/.test(String(msg || '').trim());
      if (isErr) {
        prePubState.lastAlert = msg;
        prePubState.lastAlertIsError = true;
      } else if (/^✅/.test(String(msg || '').trim())) {
        prePubState.lastAlert = '';
        prePubState.lastAlertIsError = false;
      }
      const el = shadow.getElementById('ppf-status-line');
      if (el) el.textContent = msg;
      const topAlertEl = shadow.getElementById('ppf-top-alert-msg');
      if (topAlertEl && isErr) {
        topAlertEl.textContent = msg;
        topAlertEl.style.display = 'block';
      }
    }

    function applyHostGeometry() {
      syncPagePushMargin();
      const isDataPage = getDataCenterContext().isDataMode;
      const isPubPage = isPublishPageContext();
      if (!isPubPage && !isDataPage) {
        hostEl.style.cssText = 'all: initial; display: none !important; pointer-events: none;';
        return;
      }
      const isLeftDock = !isDataPage && (settings.dockSide || 'left') === 'left';
      if (settings.collapsed) {
        hostEl.style.cssText = isLeftDock
          ? 'all: initial; position: fixed; z-index: 2147483646; top: 84px; left: 0; pointer-events: none;'
          : 'all: initial; position: fixed; z-index: 2147483646; top: 84px; right: 0; pointer-events: none;';
        return;
      }
      if (isDataPage) {
        // 数据中心页使用独立紧凑型小面板（不占满全屏高度、不展示底部填表项）
        const dataW = 328;
        hostEl.style.cssText = `all: initial; position: fixed; z-index: 2147483646; top: ${settings.floatTop || 64}px; right: 16px; width: ${dataW}px; height: auto; pointer-events: none;`;
        return;
      }
      if (settings.layoutMode === 'dock') {
        hostEl.style.cssText = isLeftDock
          ? `all: initial; position: fixed; z-index: 2147483646; top: 0; left: 0; width: ${settings.width}px; height: 100vh; pointer-events: none;`
          : `all: initial; position: fixed; z-index: 2147483646; top: 0; right: 0; width: ${settings.width}px; height: 100vh; pointer-events: none;`;
      } else {
        const clampedW = Math.min(Math.max(320, settings.width), window.innerWidth - 24);
        const clampedH = Math.min(Math.max(380, settings.height), window.innerHeight - 24);
        hostEl.style.cssText = `all: initial; position: fixed; z-index: 2147483646; top: ${settings.floatTop}px; right: ${settings.floatRight}px; width: ${clampedW}px; height: ${clampedH}px; pointer-events: none;`;
      }
    }

    function buildStyles() {
      const isLight = settings.theme === 'light';
      const isDataPage = getDataCenterContext().isDataMode;
      const isLeftDock = !isDataPage && settings.layoutMode === 'dock' && (settings.dockSide || 'left') === 'left';
      const isLeftCollapsed = !isDataPage && (settings.dockSide || 'left') === 'left';
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
        ? isLeftDock
          ? '8px 0 28px rgba(15, 23, 42, 0.10), 0 8px 24px rgba(15, 23, 42, 0.08)'
          : '-8px 0 28px rgba(15, 23, 42, 0.10), 0 8px 24px rgba(15, 23, 42, 0.08)'
        : '0 16px 42px rgba(0, 0, 0, 0.45)';
      const radius = settings.layoutMode === 'dock' ? (isLeftDock ? '0 14px 14px 0' : '14px 0 0 14px') : '14px';
      const earPosCss = isLeftDock
        ? `right: -25px; border: 1px solid ${border}; border-left: none; border-radius: 0 10px 10px 0; box-shadow: 4px 2px 12px rgba(0,0,0,0.08);`
        : `left: -25px; border: 1px solid ${border}; border-right: none; border-radius: 10px 0 0 10px; box-shadow: -4px 2px 12px rgba(0,0,0,0.08);`;
      const collapsedTabCss = isLeftCollapsed
        ? `border: 1px solid ${border}; border-left: none; border-radius: 0 12px 12px 0; box-shadow: 4px 4px 16px rgba(0,0,0,0.12);`
        : `border: 1px solid ${border}; border-right: none; border-radius: 12px 0 0 12px; box-shadow: -4px 4px 16px rgba(0,0,0,0.12);`;
      const resizeWPos = isLeftDock ? 'right: -4px;' : 'left: -4px;';

      styleEl.textContent = `
        * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif; }
        .ppf-root { width: 100%; height: 100%; max-height: 100%; display: flex; min-height: 0; }
        .ppf-shell { position: relative; width: 100%; height: 100%; min-height: 0; pointer-events: auto; display: flex; }
        .ppf-wrap { width: 100%; height: 100%; min-height: 0; display: flex; flex-direction: column; background: ${bg}; color: ${fg}; border: 1px solid ${border}; border-radius: ${radius}; box-shadow: ${shadowCss}; backdrop-filter: blur(16px); overflow: hidden; font-size: 13px; }
        .ppf-ear { position: absolute; ${earPosCss} top: 50%; transform: translateY(-50%); width: 25px; height: 64px; background: ${bg}; color: ${subFg}; display: flex; align-items: center; justify-content: center; cursor: pointer; user-select: none; font-size: 13px; font-weight: 700; pointer-events: auto; }
        .ppf-ear:hover { color: ${pMeta.accent}; }
        .ppf-collapsed-tab { pointer-events: auto; display: flex; align-items: center; gap: 5px; padding: 10px 10px 10px 12px; background: ${bg}; color: ${fg}; ${collapsedTabCss} cursor: pointer; user-select: none; font-size: 12.5px; font-weight: 600; writing-mode: vertical-rl; letter-spacing: 2px; align-self: center; }
        .ppf-dot { width: 8px; height: 8px; border-radius: 50%; background: ${pMeta.accent}; display: inline-block; }
        .ppf-resize-w { position: absolute; ${resizeWPos} top: 0; width: 8px; height: 100%; cursor: ew-resize; z-index: 10; }
        .ppf-resize-s { position: absolute; left: 0; bottom: -4px; width: 100%; height: 8px; cursor: ns-resize; z-index: 10; }
        .ppf-resize-sw { position: absolute; left: 0; bottom: 0; width: 16px; height: 16px; cursor: nesw-resize; z-index: 12; display: flex; align-items: flex-end; justify-content: flex-start; padding: 2px; color: ${subFg}; font-size: 10px; opacity: 0.6; user-select: none; }
        .ppf-head { display: flex; align-items: center; justify-content: space-between; padding: 8px 11px; background: ${headBg}; border-bottom: 1px solid ${border}; cursor: ${settings.layoutMode === 'float' ? 'move' : 'default'}; user-select: none; flex-shrink: 0; gap: 6px; }
        .ppf-head-title { display: flex; align-items: center; gap: 6px; font-weight: 600; font-size: 12.5px; min-width: 0; overflow: hidden; white-space: nowrap; }
        .ppf-badge { padding: 2px 6px; border-radius: 5px; font-size: 11px; font-weight: 600; background: ${pMeta.accent}; color: #fff; flex-shrink: 0; }
        .ppf-icon-btn { background: transparent; border: 1px solid transparent; color: ${subFg}; cursor: pointer; font-size: 13px; padding: 2px 5px; border-radius: 6px; line-height: 1; }
        .ppf-icon-btn:hover { background: ${btnHover}; color: ${fg}; border-color: ${border}; }
        .ppf-copy-icon { background: transparent; border: none; color: ${subFg}; opacity: 0.55; cursor: pointer; font-size: 12.5px; padding: 3px 5px; border-radius: 5px; line-height: 1; transition: opacity 0.14s, background 0.14s; }
        .ppf-copy-icon:hover { opacity: 1; background: ${btnHover}; color: ${fg}; }
        .ppf-body { padding: 9px 11px; overflow-y: auto; overscroll-behavior: contain; display: flex; flex-direction: column; gap: 8px; flex: 1 1 0%; min-height: 0; }
        .ppf-compact-card { background: ${secBg}; border: 1px solid ${border}; border-radius: 9px; padding: 6px 9px; display: flex; flex-direction: column; gap: 5px; flex-shrink: 0; }
        .ppf-compact-row { display: flex; align-items: center; justify-content: space-between; gap: 6px; min-width: 0; }
        .ppf-compact-path { font-size: 12px; font-weight: 600; color: ${fg}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; min-width: 0; }
        .ppf-part-tag { font-size: 10px; font-weight: 700; padding: 1px 5px; border-radius: 4px; background: rgba(100,116,139,0.14); color: ${subFg}; flex-shrink: 0; }
        .ppf-divider-label { font-size: 11px; font-weight: 700; color: ${subFg}; display: flex; align-items: center; gap: 6px; margin-top: 2px; flex-shrink: 0; }
        .ppf-divider-label::after { content: ""; flex: 1; height: 1px; background: ${border}; }
        .ppf-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
        .ppf-row-nowrap { display: flex; align-items: center; gap: 4px; flex-shrink: 0; white-space: nowrap; }
        .ppf-btn { background: ${btnBg}; color: ${fg}; border: 1px solid ${border}; border-radius: 6px; padding: 4px 8px; font-size: 11.5px; cursor: pointer; font-weight: 500; white-space: nowrap; max-width: 100%; overflow: hidden; text-overflow: ellipsis; transition: all 0.14s; }
        .ppf-btn:hover { background: ${btnHover}; }
        .ppf-btn-accent { background: ${pMeta.accent}; border-color: transparent; color: #fff; font-weight: 600; padding: 7px 11px; font-size: 12.5px; }
        .ppf-btn-accent:hover { filter: brightness(1.06); background: ${pMeta.accent}; }
        .ppf-btn-block { width: 100%; justify-content: center; display: inline-flex; align-items: center; gap: 5px; }
        .ppf-sec { background: ${secBg}; border: 1px solid ${border}; border-radius: 10px; padding: 8px 10px; display: flex; flex-direction: column; gap: 6px; flex-shrink: 0; }
        .ppf-sec-hd { display: flex; align-items: center; justify-content: space-between; gap: 6px; color: ${subFg}; font-size: 11.5px; font-weight: 600; }
        .ppf-sec-hd > span:first-child { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .ppf-preview { font-size: 12.5px; color: ${fg}; line-height: 1.52; min-height: 38px; max-height: 130px; resize: vertical; overflow-y: auto; white-space: pre-wrap; word-break: break-word; background: ${inputBg}; border: 1px solid ${border}; padding: 7px 9px; border-radius: 7px; }
        .ppf-chip { padding: 3px 8px; border-radius: 999px; background: ${chipBg}; color: ${chipFg}; border: 1px solid transparent; font-size: 11.5px; cursor: pointer; white-space: nowrap; font-weight: 500; }
        .ppf-chip:hover { filter: brightness(0.95); }
        .ppf-chip.active { background: ${pMeta.accent}; color: #fff; font-weight: 600; }
        .ppf-cover-box { display: flex; gap: 10px; align-items: center; }
        .ppf-thumb { border-radius: 6px; background: ${inputBg}; border: 1px solid ${border}; object-fit: cover; flex-shrink: 0; display: flex; align-items: center; justify-content: center; color: ${subFg}; font-size: 10.5px; text-align: center; padding: 3px; white-space: pre-line; }
        .ppf-warn { color: #d97706; font-size: 11.5px; line-height: 1.4; }
        .ppf-status { font-size: 11.5px; color: ${statusFg}; min-height: 16px; line-height: 1.38; font-weight: 500; flex-shrink: 0; }
        .ppf-toggle { display: inline-flex; align-items: center; gap: 4px; font-size: 11.5px; color: ${subFg}; cursor: pointer; user-select: none; }
        .ppf-foot { font-size: 10.5px; color: ${subFg}; border-top: 1px solid ${border}; padding-top: 6px; display: flex; justify-content: space-between; align-items: center; flex-shrink: 0; }
        select.ppf-select, input.ppf-input { background: ${inputBg}; color: ${fg}; border: 1px solid ${border}; border-radius: 6px; padding: 4px 7px; font-size: 11.5px; width: 100%; outline: none; }
        select.ppf-select:focus, input.ppf-input:focus { border-color: ${pMeta.accent}; }
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
        return (a.variant || 'A').localeCompare(b.variant || 'A');
      });

      // 按当前平台独立记忆封面选择，互不串台；未手选时自动匹配当前平台首选比例（如 B站默认 16:9，小红书/抖音/视频号默认 3:4）
      const userPickedRel = settings.selectedCoverByPlat?.[platform] || '';
      const active =
        (userPickedRel && sorted.find((c) => c.relPath === userPickedRel || c.slot === userPickedRel)) ||
        sorted.find((c) => c.variant === 'A' && c.ratio === preferred[0]) ||
        sorted.find((c) => c.ratio === preferred[0]) ||
        sorted[0] ||
        null;

      return { active, sortedCovers: sorted };
    }

    function formatCoverChipLabel(c) {
      if (platform === 'weixin') {
        if (c.ratio === '3:4') return `款${c.variant} (3:4主页)`;
        if (c.ratio === '4:3') return `款${c.variant} (4:3动态)`;
      }
      if (platform === 'douyin') {
        if (c.ratio === '3:4' || c.ratio === '9:16') return `款${c.variant} (${c.ratio}竖)`;
        if (c.ratio === '4:3' || c.ratio === '16:9') return `款${c.variant} (${c.ratio}横)`;
      }
      if (platform === 'bilibili') {
        if (c.ratio === '16:9') return `款${c.variant} (16:9横封)`;
        if (c.ratio === '4:3') return `款${c.variant} (4:3列表)`;
      }
      return `款${c.variant} (${c.ratio})`;
    }

    let exportCacheMap = {};
    let pendingExportConfirm = null; // { dimension: 'account'|'works', lastTs, agoStr, lastFile }
    let feishuState = {
      configured: true, // 初次查询前默认乐观展示加载态，避免闪烁
      loading: false,
      loadedAt: 0,
      error: '',
      schemaMode: 'multi_table',
      accountId: '',
      accountName: '',
      goldenWindows: '',
      defaultCollection: '',
      platformAccounts: [],
      candidates: [],
      matchedCandidate: null,
      matchReason: '',
      hasConflict: false,
      conflicts: [],
      summary: '⏳ 正在连接飞书检查本号待发作品与排期...',
    };
    let prePubState = {
      selectedAccountId: '',
      selectedWorkKey: 'auto', // 'auto' | 'b:recXXX' | 'c:recXXX'
      syncedSig: '',
      syncedLabel: '',
      syncedFeishuTime: '',
      syncing: false,
      conflictConfirm: null, // { summary, conflicts }
      manualTimeOverride: '',
      showTimeInput: false,
      showQuickSetup: false,
      lastTimeSig: '',
      lastAlert: '',
      lastAlertIsError: false,
    };

    async function loadExportCache() {
      try {
        const raw = await xStorageGet(STORAGE_KEY_EXPORT_CACHE, {});
        exportCacheMap = (typeof raw === 'string' ? JSON.parse(raw) : raw) || {};
      } catch {
        exportCacheMap = {};
      }
      return exportCacheMap;
    }

    async function markExportCache(dimension, fileName = '') {
      const acct = detectLoggedInAccountShort() || '创作者账号';
      const key = `${platform}|${acct}|${dimension}`;
      exportCacheMap[key] = {
        ts: Date.now(),
        fileName,
      };
      await xStorageSet(STORAGE_KEY_EXPORT_CACHE, exportCacheMap);
    }

    function getExportCacheEntry(dimension) {
      const acct = detectLoggedInAccountShort() || '创作者账号';
      return (
        exportCacheMap[`${platform}|${acct}|${dimension}`] ||
        exportCacheMap[`${platform}|创作者账号|${dimension}`] ||
        null
      );
    }

    function formatRelativeTime(ts) {
      if (!ts) return '未导出';
      const diffMs = Math.max(0, Date.now() - Number(ts));
      const mins = Math.floor(diffMs / 60000);
      if (mins < 1) return '刚刚';
      if (mins < 60) return `${mins}分钟前`;
      const hrs = diffMs / 3600000;
      if (hrs < 24) return `${hrs.toFixed(1)}小时前`;
      const days = Math.floor(hrs / 24);
      return `${days}天前`;
    }

    function formatClockHM(ts) {
      const d = new Date(Number(ts));
      return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(
        d.getHours()
      ).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }

    // 类正态分布拟人随机等待（Bates 3阶中心极限定理采样，消除机械固定间隔特征）
    function humanGaussianSleep(minMs, maxMs) {
      const g = (Math.random() + Math.random() + Math.random()) / 3;
      const jitter = Math.round(minMs + g * (maxMs - minMs));
      return new Promise((r) => setTimeout(r, jitter));
    }

    function getDataCenterContext(href = location.href) {
      const u = href || '';
      if (u.includes('creator.xiaohongshu.com/statistics/account')) {
        return { isDataMode: true, pageKind: 'xhs_account', pageTitle: '小红书 · 账号概览' };
      }
      if (u.includes('creator.xiaohongshu.com/statistics')) {
        return { isDataMode: true, pageKind: 'xhs_works', pageTitle: '小红书 · 笔记数据' };
      }
      if (u.includes('creator.douyin.com/creator-micro/data-center/operation')) {
        return { isDataMode: true, pageKind: 'dy_operation', pageTitle: '抖音 · 数据中心' };
      }
      if (u.includes('creator.douyin.com/creator-micro/data-center') || u.includes('creator.douyin.com/creator-micro/data/stats')) {
        return { isDataMode: true, pageKind: 'dy_works', pageTitle: '抖音 · 作品数据' };
      }
      if (u.includes('channels.weixin.qq.com/platform/statistic/follower')) {
        return { isDataMode: true, pageKind: 'wx_account', pageTitle: '视频号 · 关注者数据' };
      }
      if (u.includes('channels.weixin.qq.com/platform/statistic')) {
        return { isDataMode: true, pageKind: 'wx_post', pageTitle: '视频号 · 动态数据' };
      }
      if (u.includes('member.bilibili.com/platform/data-up')) {
        return { isDataMode: true, pageKind: 'bili_data', pageTitle: 'B站 · 数据中心' };
      }
      return { isDataMode: false, pageKind: '', pageTitle: '' };
    }

    function detectLoggedInAccountShort() {
      if (settings.exportAccountOverride && settings.exportAccountOverride !== 'auto') {
        return settings.exportAccountOverride;
      }
      const selectors = [
        '.finder-nickname',
        '[class*="nickname" i]',
        '[class*="user-name" i]',
        '[class*="username" i]',
        '[class*="account-name" i]',
        '[class*="author-name" i]',
        '[class*="creator-name" i]',
        '[class*="user-info" i]',
        'header',
        'aside',
      ];
      let combined = '';
      for (const sel of selectors) {
        const els = queryDeepAll(sel);
        for (const el of els.slice(0, 12)) {
          if (!el || hostEl.contains?.(el)) continue;
          const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
          if (t && t.length <= 260) combined += ' ' + t;
        }
      }
      if (/万物有数|万物皆有数|数见万象/.test(combined)) return '万物有数';
      if (/靖蜀黍|flyloy|flylog/i.test(combined)) return '靖蜀黍';
      if (/工程检测/.test(combined)) return '工程检测科普';

      const nickEls = queryDeepAll('.finder-nickname, [class*="nickname" i], [class*="user-name" i], [class*="account-name" i]');
      for (const el of nickEls) {
        if (!isVisible(el) || hostEl.contains?.(el)) continue;
        const clean = (el.textContent || '').replace(/\s+/g, '').replace(/[\\/:*?"<>|]+/g, '').trim();
        if (clean.length >= 2 && clean.length <= 14 && !/创作|中心|服务|首页|登录|退出|消息|数据/.test(clean)) {
          return clean;
        }
      }
      return '';
    }

    function detectActivePeriodLabel(nearEl = null) {
      const checkRoot = nearEl?.closest?.('section, [class*="card" i], [class*="module" i], [class*="panel" i]') || document;
      const activeSelectors = [
        '[class*="active" i]',
        '[class*="checked" i]',
        '[class*="selected" i]',
        '[aria-selected="true"]',
        '.semi-radio-addon-buttonRadio-checked',
        '.d-radio-button--checked',
        '.ant-radio-button-wrapper-checked',
        '.semi-select-selection-text',
      ];
      for (const sel of activeSelectors) {
        const nodes = queryDeepAll(sel, checkRoot === document ? null : checkRoot);
        for (const n of nodes) {
          if (!isVisible(n) || hostEl.contains?.(n)) continue;
          const txt = (n.textContent || '').replace(/\s+/g, '').trim();
          const m = txt.match(/近(\d+)[天日]|过去(\d+)[天日]|^(\d+)[天日]$/);
          if (m) {
            const days = m[1] || m[2] || m[3];
            return `近${days}日`;
          }
        }
      }
      return '';
    }

    function inferNearbySectionTitle(btnEl) {
      let cur = btnEl;
      for (let depth = 0; depth < 7 && cur && cur !== document.body; depth++) {
        const headings = cur.querySelectorAll?.(
          'h1, h2, h3, h4, [class*="title" i], [class*="header" i], [class*="card-head" i]'
        );
        if (headings && headings.length > 0) {
          for (const h of headings) {
            if (h === btnEl || h.contains?.(btnEl)) continue;
            const txt = (h.textContent || '').replace(/\s+/g, '').trim();
            if (txt.length >= 2 && txt.length <= 28 && !/导出|下载/.test(txt)) {
              return txt;
            }
          }
        }
        cur = cur.parentElement || cur.getRootNode?.()?.host || null;
      }
      return '';
    }

    function pushExportHintToBackground({ btnEl = null, sectionOverride = '', dimension = '', enqueue = false } = {}) {
      if (!IS_CHROME_EXT || !chrome.runtime?.sendMessage) return '';
      const acct = detectLoggedInAccountShort();
      const section = sectionOverride || (btnEl ? inferNearbySectionTitle(btnEl) : '');
      const period = detectActivePeriodLabel(btnEl);
      try {
        chrome.runtime.sendMessage({
          type: 'PPF_SET_EXPORT_HINT',
          platform,
          account: acct,
          section,
          period,
          dimension,
          enqueue,
        });
      } catch {
        // ignore
      }
      return acct;
    }

    function findVisibleExportButtons() {
      const exportKw = /^(?:导出数据|导出表格|导出明细|导出列表|导出报表|导出Excel|下载数据|下载明细|下载表格|下载报表|下载Excel|数据导出|导出|下载)$/i;
      const nodes = queryDeepAll('button, a, [role="button"], .weui-desktop-btn, [class*="export" i], [class*="download" i], span, div');
      const found = [];
      const seen = new Set();

      for (const el of nodes) {
        if (!el || el === hostEl || hostEl.contains?.(el)) continue;
        if (!isVisible(el)) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width < 24 || rect.width > 280 || rect.height < 16 || rect.height > 68) continue;

        const rawTxt = (el.textContent || '').replace(/\s+/g, '').trim();
        if (!exportKw.test(rawTxt)) continue;

        const clickable =
          el.closest?.('button, a, [role="button"], .weui-desktop-btn, .d-button, .semi-button, .ant-btn, .el-button') || el;
        if (!isVisible(clickable) || seen.has(clickable)) continue;
        const cRect = clickable.getBoundingClientRect();
        if (cRect.width > 300 || cRect.height > 76) continue;

        seen.add(clickable);
        found.push({
          el: clickable,
          label: rawTxt,
          section: inferNearbySectionTitle(clickable),
          top: cRect.top,
        });
      }
      found.sort((a, b) => a.top - b.top);
      return found;
    }

    // 针对 B站 member.bilibili.com/platform/data-up/video「近期稿件对比」右上角无文字纯图标导出按钮 [📤]
    function findBilibiliRecentWorksExportButton() {
      const all = queryDeepAll('div, span, h2, h3, h4, p');
      const titleNode = all.find((el) => {
        if (!el || hostEl.contains?.(el)) return false;
        const t = (el.textContent || '').replace(/\s+/g, '').trim();
        return t === '近期稿件对比' && el.children.length === 0;
      });
      if (!titleNode) return null;

      let bar = titleNode.parentElement;
      for (let i = 0; i < 5 && bar && bar !== document.body; i++) {
        const r = bar.getBoundingClientRect();
        if (r.width >= 420 && r.height >= 24 && r.height <= 120) {
          break;
        }
        bar = bar.parentElement;
      }
      if (!bar) return null;

      const barRect = bar.getBoundingClientRect();
      // 1. 若有显式导出文字或 title 属性优先匹配
      const direct = Array.from(bar.querySelectorAll('button, a, [role="button"], div, span')).find((el) => {
        if (!isVisible(el)) return false;
        const attr = `${el.getAttribute('title') || ''} ${el.getAttribute('aria-label') || ''} ${(el.textContent || '').trim()}`;
        return /导出|下载/.test(attr) && el.getBoundingClientRect().width <= 140;
      });
      if (direct) return direct;

      // 2. 匹配「近期稿件对比」头部栏最右侧的方形图标按钮（[历史累积数据] [柱状图] [全屏] [📤导出数据]）
      const iconBtns = Array.from(bar.querySelectorAll('button, [role="button"], [class*="icon" i], [class*="btn" i], span, div'))
        .filter((el) => {
          if (!isVisible(el)) return false;
          const r = el.getBoundingClientRect();
          if (r.left < barRect.left + barRect.width * 0.65) return false;
          if (r.width < 22 || r.width > 54 || r.height < 22 || r.height > 50) return false;
          const txt = (el.textContent || '').replace(/\s+/g, '').trim();
          return txt === '' && Boolean(el.querySelector('svg, i, img') || el.tagName === 'BUTTON');
        });
      const leafIcons = iconBtns.filter((n) => !iconBtns.some((o) => o !== n && n.contains(o)));
      if (leafIcons.length > 0) {
        leafIcons.sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
        return leafIcons[leafIcons.length - 1];
      }
      return null;
    }

    function triggerBrowserCsvDownload(csvRows, filenamePrefix) {
      const esc = (v) => {
        const s = String(v ?? '').replace(/\r?\n/g, ' ').trim();
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const csvText = '\uFEFF' + csvRows.map((r) => r.map(esc).join(',')).join('\n') + '\n';
      const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const d = new Date();
      const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
      const a = document.createElement('a');
      a.href = url;
      a.download = `${ymd}_${filenamePrefix}.csv`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        a.remove();
        URL.revokeObjectURL(url);
      }, 1000);
      return a.download;
    }

    function exportDomFallbackCsv(ctx) {
      if (platform === 'douyin' && ctx?.isDouyinManage) {
        const cards = queryDeepAll(
          '[class*="video-card" i], [class*="content-item" i], [class*="item-card" i], [class*="work-card" i], [class*="manage" i] > div'
        ).filter((el) => {
          if (!isVisible(el) || hostEl.contains?.(el)) return false;
          const r = el.getBoundingClientRect();
          if (r.height < 60 || r.height > 340 || r.width < 360) return false;
          const t = el.textContent || '';
          return /(?:\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}|\d{1,2}月\d{1,2}日)\s*\d{1,2}:\d{2}/.test(t);
        });

        const leafCards = cards.filter((c) => !cards.some((other) => other !== c && c.contains(other)));
        if (leafCards.length > 0) {
          const rows = [['作品名称', '发布时间', '审核状态', '播放量', '完播率', '平均播放时长', '点赞量', '评论量', '收藏量', '分享量', '粉丝增量']];
          const nowYear = new Date().getFullYear();
          for (const card of leafCards) {
            const fullText = (card.innerText || card.textContent || '').trim();
            const lines = fullText.split(/\n+/).map((s) => s.trim()).filter(Boolean);
            const timeMatch = fullText.match(/(?:(\d{4})[-/.年])?(\d{1,2})[-/.月](\d{1,2})日?\s*(\d{1,2}:\d{2})/);
            let pubTime = '';
            if (timeMatch) {
              const y = timeMatch[1] || String(nowYear);
              pubTime = `${y}-${timeMatch[2].padStart(2, '0')}-${timeMatch[3].padStart(2, '0')} ${timeMatch[4]}`;
            }
            let audit = '公开';
            if (/不适宜公开|仅自己可见|审核未通过|未通过/.test(fullText)) {
              audit = (fullText.match(/不适宜公开|仅自己可见|审核未通过|未通过/) || ['异常'])[0];
            } else if (/好友可见|互关朋友可见/.test(fullText)) {
              audit = '好友可见';
            }
            const titleLine =
              lines.find(
                (l) =>
                  l.length >= 4 &&
                  !/^(?:公开|仅自己可见|不适宜公开|置顶|编辑|删除|数据分析|权限设置|查看评论|\d+(?:\.\d+)?[wW万]?)$/.test(l) &&
                  !/(?:\d{4}[-/.年]|\d{1,2}月\d{1,2}日)\s*\d{1,2}:\d{2}/.test(l)
              ) || lines[0] || '无标题';

            const grabStat = (kwRe) => {
              const m = fullText.match(kwRe);
              return m ? m[1] : '';
            };
            const numsAfterTime = fullText
              .replace(/^[\s\S]*?(?:\d{1,2}:\d{2})/, '')
              .match(/\b\d+(?:\.\d+)?[wW万]?\b/g) || [];
            const play = grabStat(/(?:播放|观看)[^\d]{0,4}(\d+(?:\.\d+)?[wW万]?)/) || numsAfterTime[0] || '0';
            const like = grabStat(/(?:点赞|喜欢)[^\d]{0,4}(\d+(?:\.\d+)?[wW万]?)/) || numsAfterTime[1] || '0';
            const comm = grabStat(/评论[^\d]{0,4}(\d+(?:\.\d+)?[wW万]?)/) || numsAfterTime[2] || '0';
            const fav = grabStat(/收藏[^\d]{0,4}(\d+(?:\.\d+)?[wW万]?)/) || numsAfterTime[3] || '0';
            const share = grabStat(/分享[^\d]{0,4}(\d+(?:\.\d+)?[wW万]?)/) || numsAfterTime[4] || '0';

            rows.push([titleLine, pubTime, audit, play, '', '', like, comm, fav, share, '0']);
          }
          const fname = triggerBrowserCsvDownload(rows, '抖音_作品列表导出');
          return { ok: true, count: leafCards.length, fileName: fname };
        }
      }
      return { ok: false, count: 0, fileName: '' };
    }

    // 核心安全导表执行器：严格区分 dimension = 'account'（账号）与 'works'（作品），内置 12h 防重二次确认
    async function runDimensionExport(dimension, { force = false } = {}) {
      await loadExportCache();
      const prevEntry = getExportCacheEntry(dimension);
      if (!force && prevEntry?.ts && Date.now() - Number(prevEntry.ts) < EXPORT_DEDUP_WINDOW_MS) {
        pendingExportConfirm = {
          dimension,
          lastTs: prevEntry.ts,
          agoStr: formatRelativeTime(prevEntry.ts),
          clockStr: formatClockHM(prevEntry.ts),
          lastFile: prevEntry.fileName || '',
        };
        render();
        return false;
      }
      pendingExportConfirm = null;

      const ctx = getDataCenterContext();
      const btns = findVisibleExportButtons();

      // ==================== 1. 导出「账号」数据 ====================
      if (dimension === 'account') {
        if (platform === 'xiaohongshu') {
          if (ctx.pageKind !== 'xhs_account') {
            setStatus('💡 当前不在「账号概览」页；请先在左侧菜单点「账号概览」再点此导出账号 4 表');
            return false;
          }
          const subNames = ['观看', '互动', '涨粉', '发布'];
          const tabCands = queryDeepAll('[role="tab"], .d-tab, li, span, div').filter((el) => {
            if (!isVisible(el) || hostEl.contains?.(el)) return false;
            const r = el.getBoundingClientRect();
            return r.width >= 32 && r.width <= 180 && r.height >= 20 && r.height <= 56;
          });
          let count = 0;
          for (let i = 0; i < subNames.length; i++) {
            const kw = subNames[i];
            const hitTab = tabCands.find((el) => {
              const t = (el.textContent || '').replace(/\s+/g, '').trim();
              return t === `${kw}数据` || t === kw;
            });
            if (hitTab) {
              setStatus(`⏳ 小红书账号存档 (${i + 1}/4)：切换「${kw}数据」（拟人随机延时中）...`);
              await humanMouseClick(hitTab);
              await humanGaussianSleep(1650, 2950);
            }
            const curBtns = findVisibleExportButtons();
            if (curBtns.length > 0) {
              pushExportHintToBackground({ btnEl: curBtns[0].el, sectionOverride: `${kw}数据`, dimension: 'account', enqueue: true });
              await humanMouseClick(curBtns[0].el);
              count++;
              if (i + 1 < subNames.length) {
                await humanGaussianSleep(2100, 4100);
              }
            }
          }
          if (count > 0) {
            await markExportCache('account');
            setStatus(`✅ 已按随机拟人间隔导出小红书账号 ${count} 张表并自动重命名！`);
            render();
            return true;
          }
          setStatus('⚠️ 未在当前页找到小红书导出按钮');
          return false;
        }

        if (platform === 'douyin') {
          // 精准只点「作品数据 / 粉丝数据」区域导出按钮，拉黑底下「投稿总结 / 投稿列表」那两张残缺 data.xlsx！
          const validBtn =
            btns.find((b) => /作品数据|粉丝数据|数据总览/.test(b.section) && !/投稿总结|投稿列表/.test(b.section)) ||
            btns.find((b) => !/投稿总结|投稿列表/.test(b.section));
          if (!validBtn) {
            setStatus('💡 请在左侧进入「数据中心」概览页，再点「📊 账号」导出短视频全量指标');
            return false;
          }
          pushExportHintToBackground({ btnEl: validBtn.el, dimension: 'account', enqueue: true });
          await humanMouseClick(validBtn.el);
          await markExportCache('account');
          setStatus('✅ 已导出抖音账号周期指标并自动重命名！');
          render();
          return true;
        }

        if (platform === 'bilibili') {
          const trendBtn = btns.find((b) => !/收益|充电|稿件对比/.test(b.section));
          if (!trendBtn) {
            setStatus('💡 未找到 B站账号趋势导出按钮（请确认位于「数据中心」顶部趋势区）');
            return false;
          }
          pushExportHintToBackground({ btnEl: trendBtn.el, sectionOverride: '播放互动趋势', dimension: 'account', enqueue: true });
          await humanMouseClick(trendBtn.el);
          await markExportCache('account');
          setStatus('✅ 已导出 B站账号趋势表并自动重命名！');
          render();
          return true;
        }

        if (platform === 'weixin') {
          if (btns.length === 0) {
            setStatus('💡 请在左侧点「关注者数据」或「动态数据-动态分析」再导出账号表');
            return false;
          }
          pushExportHintToBackground({ btnEl: btns[0].el, dimension: 'account', enqueue: true });
          await humanMouseClick(btns[0].el);
          await markExportCache('account');
          setStatus('✅ 已导出视频号账号表并自动重命名！');
          render();
          return true;
        }
      }

      // ==================== 2. 导出「作品」数据 ====================
      if (dimension === 'works') {
        if (platform === 'xiaohongshu') {
          if (ctx.pageKind !== 'xhs_works') {
            setStatus('💡 当前不在「笔记数据」页；请在左侧点「内容分析 / 笔记数据」再导作品明细表');
            return false;
          }
          if (btns.length === 0) {
            setStatus('⚠️ 未找到小红书「导出数据」按钮');
            return false;
          }
          pushExportHintToBackground({ btnEl: btns[0].el, sectionOverride: '笔记列表明细表', dimension: 'works', enqueue: true });
          await humanMouseClick(btns[0].el);
          await markExportCache('works');
          setStatus('✅ 已导出小红书《笔记列表明细表》并自动重命名！');
          render();
          return true;
        }

        if (platform === 'douyin') {
          if (ctx.isDouyinManage && btns.length === 0) {
            pushExportHintToBackground({ sectionOverride: '作品列表导出', dimension: 'works', enqueue: true });
            const fb = exportDomFallbackCsv(ctx);
            if (fb.ok) {
              await markExportCache('works', fb.fileName);
              setStatus(`✅ 已导出抖音作品管理列表 (${fb.count} 条) 并自动重命名！`);
              render();
              return true;
            }
          }
          // 检查是否还停留在「数据总览 / 运营数据」首页（右上角有「查看所有作品」且表头无完播率/5s完播率）
          const hasViewAllWorksLink = queryDeepAll('a, span, div').some(
            (el) => isVisible(el) && /^查看所有作品/.test((el.textContent || '').replace(/\s+/g, '').trim())
          );
          const thText = queryDeepAll('th, [class*="thead" i]').map((e) => e.textContent || '').join(' ');
          const isFull16ColTable = /审核状态|封面点击率|粉丝增量|收藏量/.test(thText);

          if (ctx.pageKind === 'dy_operation' && hasViewAllWorksLink && !isFull16ColTable) {
            setStatus('💡 请先手点页面右上角「查看所有作品 >」展开全量作品列表，再点「🎬 作品」导 16 列完整明细（已自动避开底部残缺表）');
            return false;
          }

          const workBtn = btns.find((b) => !/投稿总结/.test(b.section)) || btns[0];
          if (!workBtn) {
            setStatus('💡 请先点入「查看所有作品 >」或「作品数据」列表页，再点「🎬 作品」导出');
            return false;
          }
          pushExportHintToBackground({ btnEl: workBtn.el, sectionOverride: '作品列表导出', dimension: 'works', enqueue: true });
          await humanMouseClick(workBtn.el);
          await markExportCache('works');
          setStatus('✅ 已导出抖音《作品列表导出》并自动重命名！');
          render();
          return true;
        }

        if (platform === 'bilibili') {
          const biliIconBtn = findBilibiliRecentWorksExportButton();
          if (biliIconBtn) {
            const br = biliIconBtn.getBoundingClientRect();
            if (br.top < 0 || br.bottom > window.innerHeight) {
              biliIconBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
              await humanGaussianSleep(550, 880);
            }
            pushExportHintToBackground({ btnEl: biliIconBtn, sectionOverride: '近期稿件对比', dimension: 'works', enqueue: true });
            await humanMouseClick(biliIconBtn);
            await markExportCache('works');
            setStatus('✅ 已点击 B站「近期稿件对比」右上导出图标并自动重命名！');
            render();
            return true;
          }
          setStatus('💡 请在左侧进入「稿件数据」(data-up/video) 向下看「近期稿件对比」模块再点导出');
          return false;
        }

        if (platform === 'weixin') {
          if (ctx.pageKind === 'wx_account') {
            setStatus('💡 当前是「关注者数据」；请在左侧点「动态数据 → 单篇动态」再导作品明细');
            return false;
          }
          const tableText = queryDeepAll('th, thead').map((e) => e.textContent || '').join(' ');
          const activeTabsText = queryDeepAll('[class*="active" i], [aria-selected="true"]')
            .filter((e) => isVisible(e))
            .map((e) => (e.textContent || '').trim())
            .join(' ');
          const isSinglePostView = /视频描述|完播率/.test(tableText) || /单篇动态/.test(activeTabsText);
          if (!isSinglePostView) {
            setStatus('💡 当前停在按天趋势视图；请先手点页面上方「单篇动态」Tab，再点「🎬 作品」导出！');
            return false;
          }
          if (btns.length === 0) {
            setStatus('⚠️ 未找到视频号单篇动态「导出数据」按钮');
            return false;
          }
          pushExportHintToBackground({ btnEl: btns[0].el, sectionOverride: '动态数据明细', dimension: 'works', enqueue: true });
          await humanMouseClick(btns[0].el);
          await markExportCache('works');
          setStatus('✅ 已导出视频号《动态数据明细》并自动重命名！');
          render();
          return true;
        }
      }

      return false;
    }

    async function runArchiveDownloadsToAihub() {
      setStatus('⏳ 正在将 ~/Downloads 新导出的报表去重归档至 AIHub 对应账号目录...');
      const brandMap = {
        万物有数: '万物皆有数',
        靖蜀黍: '靖蜀黍·个人IP',
        工程检测科普: '工程检测科普',
      };
      const acct = detectLoggedInAccountShort();
      const brandArg =
        settings.exportAccountOverride !== 'auto' && brandMap[settings.exportAccountOverride]
          ? brandMap[settings.exportAccountOverride]
          : brandMap[acct] || 'auto';
      try {
        const res = await gmPostJson(`${settings.bridgeUrl}/api/archive-downloads`, {
          brand: brandArg,
          hours: 24,
          move: true,
        });
        if (res && res.ok) {
          if (res.archived_count > 0) {
            setStatus(`🎉 已统一移入归档 ${res.archived_count} 份报表至 ${res.dest_dir}！`);
          } else {
            setStatus('✅ 所有新导出的报表均已归档在对应账号 /05_数据复盘/数据导出/ 中');
          }
        }
      } catch (err) {
        setStatus(`💡 本地桥接未开 (${err?.message || '8765'})：文件留在 ~/Downloads 即可，跟 AI 说「清洗数据入飞书」会自动归档！`);
      }
    }

    // ==================== 发布页：定时探测 + 飞书发前作品关联 + 云端兜底文案 + 黄转绿警示同步 ====================
    function detectPagePublishModeAndTime() {
      if (prePubState.manualTimeOverride) {
        return { mode: 'scheduled', plannedAt: prePubState.manualTimeOverride, source: '手动指定' };
      }
      // 只读扫描页面上可见的定时时间控件（兼容视频号 Wujie ShadowDOM 分体式日期+时间下拉框、B站/小红书/抖音 DatePicker）
      const inputs = queryDeepAll('input');
      const nowYear = new Date().getFullYear();
      let foundDatePart = '';
      let foundTimePart = '';

      for (const inp of inputs) {
        if (!isVisible(inp) || hostEl.contains?.(inp)) continue;
        const val = (inp.value || inp.getAttribute('value') || '').trim();
        if (!val) continue;
        const fullMatch = val.match(/(?:(202\d)[-/.年])?(\d{1,2})[-/.月](\d{1,2})日?\s*(\d{1,2}:\d{2})/);
        if (fullMatch) {
          const y = fullMatch[1] || String(nowYear);
          const m = fullMatch[2].padStart(2, '0');
          const d = fullMatch[3].padStart(2, '0');
          return { mode: 'scheduled', plannedAt: `${y}-${m}-${d} ${fullMatch[4]}`, source: '页面定时框' };
        }
        const dateOnly = val.match(/^(?:(202\d)[-/.年])?(\d{1,2})[-/.月](\d{1,2})日?$/);
        if (dateOnly) {
          const y = dateOnly[1] || String(nowYear);
          foundDatePart = `${y}-${dateOnly[2].padStart(2, '0')}-${dateOnly[3].padStart(2, '0')}`;
        }
        const timeOnly = val.match(/^(\d{1,2}:\d{2})(?::\d{2})?$/);
        if (timeOnly) {
          foundTimePart = timeOnly[1];
        }
      }
      if (foundDatePart && foundTimePart) {
        return { mode: 'scheduled', plannedAt: `${foundDatePart} ${foundTimePart}`, source: '页面定时框' };
      }

      // 兼容非 input 文本型日期/时间选择器（特别是视频号 weui-desktop 日期框「2026年11月19日」与时间框「11:02」分列两个独立组件的情况）
      const schedContainers = queryDeepAll(
        '[class*="schedule" i], [class*="timer" i], [class*="timing" i], .semi-datepicker, .el-date-editor, .bcc-datepicker, .weui-desktop-picker, .weui-desktop-form__dropdown, [class*="date-picker" i], [class*="time-picker" i], [class*="datepicker" i], [class*="timepicker" i]'
      );
      let pickerDatePart = foundDatePart;
      let pickerTimePart = foundTimePart;
      for (const box of schedContainers) {
        if (!isVisible(box) || hostEl.contains?.(box)) continue;
        const txt = (box.innerText || box.textContent || '').replace(/\s+/g, ' ').trim();
        if (!txt || txt.length > 160) continue;
        const m = txt.match(/(?:(202\d)[-/.年])?(\d{1,2})[-/.月](\d{1,2})日?\s*(\d{1,2}:\d{2})/);
        if (m) {
          const y = m[1] || String(nowYear);
          return {
            mode: 'scheduled',
            plannedAt: `${y}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')} ${m[4]}`,
            source: '页面定时组件',
          };
        }
        if (!pickerDatePart) {
          const dm = txt.match(/(?:(202\d)[-/.年])(\d{1,2})[-/.月](\d{1,2})日?|(?:^|\s)(\d{1,2})月(\d{1,2})日/);
          if (dm) {
            const y = dm[1] || String(nowYear);
            const mo = (dm[2] || dm[4]).padStart(2, '0');
            const da = (dm[3] || dm[5]).padStart(2, '0');
            pickerDatePart = `${y}-${mo}-${da}`;
          }
        }
        if (!pickerTimePart) {
          const tm = txt.match(/(?:^|\s)(\d{1,2}:\d{2})(?::\d{2})?(?:\s|$)/);
          if (tm) {
            pickerTimePart = tm[1];
          }
        }
      }
      if (pickerDatePart && pickerTimePart) {
        return { mode: 'scheduled', plannedAt: `${pickerDatePart} ${pickerTimePart}`, source: '页面分体定时组件' };
      }

      // 兜底：扫描包含「定时发表 / 定时发布」可见表单行（高度 <= 220px）内的可见日期+时间文本（完美覆盖视频号 Wujie 自定义结构）
      const labels = queryDeepAll('label, span, div');
      for (const node of labels) {
        if (hostEl.contains?.(node) || node.children.length > 2) continue;
        const t = (node.textContent || '').trim();
        if (!/^(定时发表|定时发布|定时)$/.test(t)) continue;
        if (!isVisible(node)) continue;
        let row = node.parentElement;
        for (let depth = 0; depth < 4 && row; depth++, row = row.parentElement) {
          const rect = row.getBoundingClientRect?.();
          if (!rect || rect.height > 220 || rect.height < 18) continue;
          const rowTxt = (row.innerText || '').replace(/\s+/g, ' ').trim();
          if (!rowTxt || rowTxt.length > 240) continue;
          const rm = rowTxt.match(/(?:(202\d)[-/.年])?(\d{1,2})[-/.月](\d{1,2})日?[^0-9]{0,24}?(\d{1,2}:\d{2})/);
          if (rm) {
            const y = rm[1] || String(nowYear);
            return {
              mode: 'scheduled',
              plannedAt: `${y}-${rm[2].padStart(2, '0')}-${rm[3].padStart(2, '0')} ${rm[4]}`,
              source: '定时发表行',
            };
          }
        }
      }

      return { mode: 'immediate', plannedAt: '', source: '立即发布' };
    }

    function readCurrentFormTitleAndBody() {
      const pData = currentPack.platforms?.[platform] || {};
      const isPreset = Boolean(currentPack.meta?.isPresetDefault);
      const { titleInput, bodyEditor, shortTitleInput } = locatePlatformFields(platform);

      let pageRawTitle = '';
      if (platform === 'weixin' && shortTitleInput?.value) {
        pageRawTitle = shortTitleInput.value.trim();
      } else if (titleInput?.value) {
        pageRawTitle = titleInput.value.trim();
      }

      let actualTitle = pageRawTitle;
      if (!actualTitle && !isPreset) {
        actualTitle =
          platform === 'weixin'
            ? pData.shortTitleClean || pData.shortTitleRaw || currentPack.meta?.packTitle || ''
            : pData.title || currentPack.meta?.packTitle || '';
      }

      let pageRawBody = '';
      if (bodyEditor) {
        pageRawBody = (bodyEditor.value ?? bodyEditor.innerText ?? bodyEditor.textContent ?? '').trim();
      }
      let actualBody = pageRawBody;
      if (!actualBody && !isPreset) {
        actualBody = pData.body || '';
      }

      const tagSet = new Set();
      if (!isPreset && Array.isArray(pData.tags)) {
        for (const t of pData.tags) {
          const clean = String(t || '').replace(/^#+/, '').trim();
          if (clean) tagSet.add(clean);
        }
      }
      const hashMatches = (actualBody || '').match(/#([^\s#，,。！!？?；;：:\n]{1,24})/g) || [];
      for (const hm of hashMatches) {
        const clean = hm.replace(/^#+/, '').trim();
        if (clean) tagSet.add(clean);
      }
      const actualTags = Array.from(tagSet).slice(0, 15);

      return { actualTitle, actualBody, actualTags, pageRawTitle, pageRawBody };
    }

    function getCandidateKey(cand) {
      if (!cand) return '';
      return cand.bRecordId ? `b:${cand.bRecordId}` : cand.cRecordId ? `c:${cand.cRecordId}` : '';
    }

    function getEffectiveFeishuCandidate() {
      if (prePubState.selectedWorkKey === 'new') return null;
      if (prePubState.selectedWorkKey && prePubState.selectedWorkKey !== 'auto') {
        const found = (feishuState.candidates || []).find((c) => getCandidateKey(c) === prePubState.selectedWorkKey);
        if (found) return found;
      }
      return feishuState.matchedCandidate || null;
    }

    function getCurrentSyncSignature() {
      const schedInfo = detectPagePublishModeAndTime();
      const cand = getEffectiveFeishuCandidate();
      const candKey = prePubState.selectedWorkKey === 'new' ? 'new' : getCandidateKey(cand) || currentPack.meta?.workSlug || 'auto';
      const accKey = prePubState.selectedAccountId || feishuState.accountId || 'auto';
      return `${candKey}|${accKey}|${schedInfo.mode}|${schedInfo.plannedAt}`;
    }

    // 云端兜底文案注入：当 NAS 尚未同步本地目录或切换到另一台电脑时，直接从飞书拉取完整快照或通用文案装入面板！
    function applyCloudPackFromCandidate(cand, { silent = false } = {}) {
      if (!cand) return false;

      if (cand.hasCloudPack && cand.packSnapshot) {
        try {
          const parsed = parsePublishPackJson(cand.packSnapshot, {
            fileName: '☁️ 飞书云端发布包快照',
            sourceLabel: cand.label || '飞书云端快照',
            baseDir: '',
          });
          parsed.meta = {
            ...parsed.meta,
            isPresetDefault: false,
            packTitle: cand.label || parsed.meta?.packTitle || '飞书云端作品',
            mdFileName: '☁️ 飞书云端发布包快照',
            workSlug: cand.slug || currentPack.meta?.workSlug || '',
            bRecordId: cand.bRecordId || '',
            cRecordId: cand.cRecordId || '',
            cloudFallback: true,
            cloudSource: 'snapshot',
            localMissing: Boolean(currentPack.meta?.localMissing),
          };
          if (coverBlobsMap.size > 0) {
            parsed.covers = mergeCoversWithBlobs(parsed.covers, coverBlobsMap, parsed.meta?.contentType === 'image_post');
          }
          currentPack = parsed;
          settings.selectedTitleIdx = -1;
          saveSettings(settings);
          savePackState(currentPack);
          if (!silent) {
            setStatus(`☁️ 已从飞书载入《${cand.label}》完整四平台云端发布包快照！`);
          }
          return true;
        } catch {
          // 快照解析异常时平滑降级到通用字段兜底
        }
      }

      if (cand.fallbackTitle || cand.fallbackBody) {
        const rawBody = String(cand.fallbackBody || '').trim();
        const extractedTags = [];
        const hashMatches = rawBody.match(/#([^\s#，,。！!？?；;：:\n]{1,24})/g) || [];
        for (const hm of hashMatches) {
          const t = hm.replace(/^#+/, '').trim();
          if (t && !extractedTags.includes(t)) extractedTags.push(t);
        }
        const cleanBody = rawBody.replace(/(?:\s*#[^\s#，,。！!？?；;：:\n]{1,24})+\s*$/, '').trim() || rawBody;
        const baseTitle = String(cand.fallbackTitle || cand.label || '').replace(/^[0-9？?]+｜/, '').trim();
        const wxClean = sanitizeWeixinShortTitle(baseTitle).slice(0, 16);
        const defCol = String(cand.defaultCollection || '').trim();

        currentPack = {
          meta: {
            isPresetDefault: false,
            format: 'cloud_fields',
            contentType: 'video',
            packTitle: `${cand.label || baseTitle}（☁️ 飞书云端兜底）`,
            mdFileName: '☁️ 飞书通用文案兜底',
            baseDir: '',
            workSlug: cand.slug || currentPack.meta?.workSlug || '',
            bRecordId: cand.bRecordId || '',
            cRecordId: cand.cRecordId || '',
            cloudFallback: true,
            cloudSource: 'fields',
            localMissing: Boolean(currentPack.meta?.localMissing),
            updatedAt: new Date().toISOString(),
          },
          covers: coverBlobsMap.size > 0 ? mergeCoversWithBlobs([], coverBlobsMap, false) : [],
          images: [],
          platforms: {
            xiaohongshu: {
              collection: defCol,
              title: baseTitle.slice(0, 20),
              altTitles: [],
              body: cleanBody,
              tags: extractedTags,
              pinnedComment: '',
            },
            weixin: {
              collection: defCol,
              location: '',
              shortTitleRaw: baseTitle.slice(0, 16),
              shortTitleClean: wxClean,
              altTitles: [],
              body: cleanBody,
              tags: extractedTags.slice(0, 6),
              pinnedComment: '',
            },
            douyin: {
              collection: defCol,
              location: '',
              title: baseTitle.slice(0, 30),
              altTitles: [],
              body: cleanBody,
              tags: extractedTags.slice(0, 5),
              pinnedComment: '',
            },
            bilibili: {
              collection: defCol,
              title: baseTitle,
              altTitles: [],
              body: cleanBody,
              tags: extractedTags.slice(0, 10),
              pinnedComment: '',
            },
          },
        };
        settings.selectedTitleIdx = -1;
        saveSettings(settings);
        savePackState(currentPack);
        if (!silent) {
          setStatus(`☁️ 本机暂无本地包，已从飞书载入《${cand.label}》云端通用兜底文案！`);
        }
        return true;
      }

      return false;
    }

    async function refreshFeishuPublishContext(silent = true) {
      if (!isPublishPageContext() || getDataCenterContext().isDataMode) return;
      if (!IS_CHROME_EXT) {
        feishuState.configured = false;
        feishuState.summary = '请使用 Chrome 扩展版以启用零依赖飞书多维表直连';
        if (!silent) render();
        return;
      }

      feishuState.loading = true;
      const acct = detectLoggedInAccountShort() || currentPack.meta?.targetAccount || 'auto';
      const isPreset = Boolean(currentPack.meta?.isPresetDefault);
      const workSlug = isPreset
        ? ''
        : currentPack.meta?.workSlug || extractWorkSlugFront(currentPack.meta?.baseDir || currentPack.meta?.packTitle || '');
      const { pageRawTitle, actualTitle } = readCurrentFormTitleAndBody();
      const schedInfo = detectPagePublishModeAndTime();

      let explicitBId = '';
      let explicitCId = '';
      let explicitCSerialNo = '';
      if (prePubState.selectedWorkKey.startsWith('b:')) {
        explicitBId = prePubState.selectedWorkKey.slice(2);
      } else if (prePubState.selectedWorkKey.startsWith('c:')) {
        explicitCId = prePubState.selectedWorkKey.slice(2);
      } else if (!isPreset && prePubState.selectedWorkKey === 'auto') {
        explicitBId = currentPack.meta?.bRecordId || '';
        explicitCId = currentPack.meta?.cRecordId || '';
        explicitCSerialNo = currentPack.meta?.cSerialNo || '';
      }

      try {
        const resp = await sendExtMessage({
          type: 'PPF_FEISHU_QUERY_CONTEXT',
          params: {
            platform,
            account: acct,
            accountRecordId: prePubState.selectedAccountId || '',
            workSlug,
            bRecordId: explicitBId,
            cRecordId: explicitCId,
            cSerialNo: explicitCSerialNo,
            title: pageRawTitle || actualTitle || '',
            plannedAt: schedInfo.plannedAt || '',
            forceRefresh: !silent,
          },
        });
        const data = resp?.data || {};
        feishuState = {
          configured: Boolean(data.configured),
          loading: false,
          loadedAt: Date.now(),
          error: '',
          schemaMode: data.schemaMode || 'multi_table',
          accountId: data.accountId || '',
          accountName: data.accountName || '',
          goldenWindows: data.goldenWindows || '',
          defaultCollection: data.defaultCollection || '',
          platformAccounts: data.platformAccounts || [],
          candidates: data.candidates || [],
          matchedCandidate: data.matchedCandidate || null,
          matchReason: data.matchReason || '',
          hasConflict: Boolean(data.hasConflict),
          conflicts: data.conflicts || [],
          summary: data.summary || '🟢 已同步飞书排期状态',
        };

        // 当 NAS 尚未同步本地目录（localMissing / cloud_pending / empty）且飞书命中对应作品时，自动拉取云端兜底文案！
        const effCand = getEffectiveFeishuCandidate();
        const needsCloudHydrate =
          currentPack.meta?.localMissing ||
          currentPack.meta?.format === 'cloud_pending' ||
          currentPack.meta?.format === 'empty';
        if (effCand && needsCloudHydrate && (effCand.hasCloudPack || effCand.fallbackTitle || effCand.fallbackBody)) {
          const applied = applyCloudPackFromCandidate(effCand, { silent: true });
          if (applied) {
            currentPack.meta.localMissing = false;
            savePackState(currentPack);
            setStatus(
              effCand.hasCloudPack
                ? `☁️ NAS未同步本地包，已从飞书自动恢复《${effCand.label}》完整云端发布包！`
                : `☁️ NAS未同步本地包，已从飞书自动载入《${effCand.label}》通用兜底文案！`
            );
          }
        } else if (!silent && data.summary) {
          setStatus(data.summary);
        }
        render();
      } catch (err) {
        feishuState.loading = false;
        feishuState.error = String(err?.message || err);
        feishuState.summary = `⚠️ 飞书查询异常：${feishuState.error}`;
        if (!silent) setStatus(feishuState.summary);
        render();
      }
    }

    async function syncPrePublishAndTurnGreen({ force = false } = {}) {
      if (prePubState.syncing) return false;
      prePubState.syncing = true;
      render();

      const acct = detectLoggedInAccountShort() || currentPack.meta?.targetAccount || 'auto';
      const schedInfo = detectPagePublishModeAndTime();
      const { actualTitle, actualBody, actualTags } = readCurrentFormTitleAndBody();
      const isPreset = Boolean(currentPack.meta?.isPresetDefault);
      const effCand = getEffectiveFeishuCandidate();
      const isCreateNew = prePubState.selectedWorkKey === 'new';

      const workSlug = isCreateNew
        ? ''
        : effCand?.slug ||
          (isPreset ? '' : currentPack.meta?.workSlug || extractWorkSlugFront(currentPack.meta?.baseDir || ''));

      // 若本机已加载真实本地发布包（非预设、非空、非云端兜底），同步时顺手生成标准 PublishPack JSON 备份到飞书 B 表，供其他设备免 NAS 兜底！
      let packSnapshotJson = '';
      if (
        !isPreset &&
        !currentPack.meta?.cloudFallback &&
        currentPack.meta?.format !== 'empty' &&
        currentPack.meta?.format !== 'cloud_pending'
      ) {
        try {
          packSnapshotJson = exportPackToSpecJson(currentPack);
        } catch {
          packSnapshotJson = '';
        }
      }

      const curSig = getCurrentSyncSignature();
      setStatus('⏳ 正在向飞书核对同号排期并同步本次发布时间与作品关联...');

      try {
        const resp = await sendExtMessage({
          type: 'PPF_FEISHU_SYNC_PUBLISH',
          payload: {
            platform,
            account: acct,
            accountRecordId: prePubState.selectedAccountId || feishuState.accountId || '',
            mode: schedInfo.mode,
            plannedAt: schedInfo.plannedAt,
            bRecordId: isCreateNew ? '' : effCand?.bRecordId || (isPreset ? '' : currentPack.meta?.bRecordId || ''),
            cRecordId: isCreateNew ? '' : effCand?.cRecordId || (isPreset ? '' : currentPack.meta?.cRecordId || ''),
            cSerialNo: isCreateNew ? '' : effCand?.cSerialNo || (isPreset ? '' : currentPack.meta?.cSerialNo || ''),
            createNewWork: isCreateNew,
            workSlug,
            workLabel: isCreateNew ? actualTitle : effCand?.label || (isPreset ? actualTitle : currentPack.meta?.packTitle || ''),
            title: actualTitle,
            body: actualBody,
            tags: actualTags,
            packSnapshotJson,
            force,
          },
        });
        const res = resp?.data || {};
        prePubState.syncing = false;

        if (res.needsConfirm) {
          prePubState.conflictConfirm = {
            summary: res.summary || '🚨 检测到同账号 6 小时内存在排期撞车冲突！',
            conflicts: res.conflicts || [],
          };
          feishuState.hasConflict = true;
          feishuState.summary = res.summary || feishuState.summary;
          setStatus(res.summary || '🚨 排期冲突，请在面板确认强制同步或修改页面定时时间');
          render();
          return false;
        }

        if (res.saved) {
          prePubState.conflictConfirm = null;
          prePubState.lastAlert = '';
          prePubState.lastAlertIsError = false;
          if (!isPreset) {
            currentPack.meta = currentPack.meta || {};
            if (res.bRecordId) currentPack.meta.bRecordId = res.bRecordId;
            if (res.cRecordId) currentPack.meta.cRecordId = res.cRecordId;
            savePackState(currentPack);
          }
          if (res.bRecordId) {
            prePubState.selectedWorkKey = `b:${res.bRecordId}`;
          } else if (res.cRecordId) {
            prePubState.selectedWorkKey = `c:${res.cRecordId}`;
          }
          prePubState.syncedLabel =
            schedInfo.mode === 'scheduled' ? `定时 ${schedInfo.plannedAt.slice(5)}` : '立即发布';
          // 强制跳过缓存立即回读飞书表内的「真实发布日期」与最新记录名，并标记顶部横幅为绿色
          await refreshFeishuPublishContext(false);
          const refreshedCand = getEffectiveFeishuCandidate();
          prePubState.syncedFeishuTime = refreshedCand?.feishuPublishedAt || res.recordedTime || '';
          prePubState.syncedSig = getCurrentSyncSignature();
          feishuState.summary = res.summary || '✅ 已写入飞书发布记录表';
          feishuState.hasConflict = false;
          setStatus(`${res.summary} · 可放心点击网页「发布」按钮！`);
          render();
          // 2.2秒后静默二次回读，自动同步飞书工作流异步流转后的「✅@账号_片名」图标
          setTimeout(() => {
            refreshFeishuPublishContext(false).catch(() => {});
          }, 2200);
          return true;
        }
      } catch (err) {
        prePubState.syncing = false;
        const errMsg = String(err?.message || err);
        setStatus(`⚠️ 飞书同步失败：${errMsg}`);
        render();
      }
      return false;
    }

    let showPasteDrawer = false;

    function applyPackContent(fileName, rawText, subMdTextMap = {}, extraMeta = {}) {
      const isJson = /\.json$/i.test(fileName) || stripJsonCodeFence(rawText).startsWith('{');
      let parsed;

      if (isJson) {
        parsed = parsePublishPackJson(rawText, {
          fileName,
          sourceLabel: fileName,
          baseDir: extraMeta.baseDir ?? currentPack.meta?.baseDir ?? '',
        });
      } else {
        parsed = parsePublishPackMarkdown(rawText, {
          mdFileName: fileName,
          sourceLabel: fileName,
          baseDir: extraMeta.baseDir ?? currentPack.meta?.baseDir ?? '',
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
      }

      parsed.meta = {
        ...parsed.meta,
        isPresetDefault: false,
        cloudFallback: false,
        localMissing: false,
        ...extraMeta,
      };

      if (coverBlobsMap.size > 0) {
        parsed.covers = mergeCoversWithBlobs(parsed.covers, coverBlobsMap, parsed.meta?.contentType === 'image_post');
      }

      currentPack = parsed;
      prePubState.selectedWorkKey = 'auto';
      prePubState.syncedSig = '';
      settings.selectedTitleIdx = -1;
      settings.selectedCoverByPlat = {};
      saveSettings(settings);
      savePackState(currentPack);
    }

    async function ingestFileEntries(rawFiles, dirNameHint = '') {
      const files = Array.from(rawFiles || []);
      if (!files.length) return;

      const topFolderFromRel = (files[0]?.webkitRelativePath || '').split('/')[0] || '';
      const inferredSlug = extractWorkSlugFront(dirNameHint || topFolderFromRel);

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
        // 若用户仅手动重选了 04_发布与成片 子目录（inferredSlug 为空）或选的就是当前已关联作品目录，保留飞书带入的排期 ID 绑定！
        const keepBoundIds = !inferredSlug || inferredSlug === currentPack.meta?.workSlug;
        applyPackContent(best.name, best.text, subMdTextMap, {
          workSlug: inferredSlug || currentPack.meta?.workSlug || '',
          bRecordId: keepBoundIds ? currentPack.meta?.bRecordId || '' : '',
          cRecordId: keepBoundIds ? currentPack.meta?.cRecordId || '' : '',
          cSerialNo: keepBoundIds ? currentPack.meta?.cSerialNo || '' : '',
          targetAccount: keepBoundIds ? currentPack.meta?.targetAccount || '' : '',
        });
      } else if (imageFiles.length > 0) {
        currentPack.meta = {
          ...currentPack.meta,
          isPresetDefault: false,
          workSlug: inferredSlug || currentPack.meta?.workSlug || '',
        };
        currentPack.covers = mergeCoversWithBlobs(currentPack.covers, coverBlobsMap, false);
        savePackState(currentPack);
      }

      await hydrateCoversFromBlobs();
      setStatus(
        `✅ 已载入《${currentPack.meta?.mdFileName || '发布包'}》与 ${coverBlobsMap.size} 张配图`
      );
      render();
      refreshFeishuPublishContext(true);
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
          await ingestFileEntries(collected, dirHandle.name || '');
          return;
        } catch (err) {
          if (err && err.name === 'AbortError') return;
        }
      }
      shadow.getElementById('ppf-input-dir')?.click();
    }

    async function syncFromLocalBridge(silent = false) {
      if (!silent) setStatus('⏳ 正在从本地服务同步作品与配图...');
      try {
        const data = await gmRequestJson(`${settings.bridgeUrl}/api/pack`);
        if (data.localMissing) {
          coverBlobsMap.clear();
          await xStorageClearByPrefix(CROSS_COVER_PREFIX);
          currentPack = {
            meta: {
              isPresetDefault: false,
              packTitle: data.workSlug || '待从飞书拉取云端文案...',
              mdFileName: '☁️ 飞书云端关联模式',
              format: 'cloud_pending',
              contentType: 'video',
              baseDir: '',
              workSlug: data.workSlug || '',
              cRecordId: data.cRecordId || '',
              cSerialNo: data.cSerialNo || '',
              bRecordId: data.bRecordId || '',
              targetAccount: data.targetAccount || '',
              localMissing: true,
              cloudFallback: true,
              updatedAt: new Date().toISOString(),
            },
            covers: [],
            images: [],
            platforms: {},
          };
          prePubState.selectedWorkKey = 'auto';
          prePubState.syncedSig = '';
          if (data.packVersion) {
            settings.lastBridgeVersion = data.packVersion;
            saveSettings(settings);
          }
          savePackState(currentPack);
          render();
          await refreshFeishuPublishContext(false);
          return;
        }

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
        let fileName = data.packFile || data.mdFile || '';
        let rawContent = data.content || data.markdown || '';
        // 兼容未重启的旧版 serve_pack.py 误将 publish_receipt.json 当成发布包返回：前端自动从 /api/file 补拉真实发布包文档！
        if (!isValidPublishPackContent(fileName, rawContent)) {
          fileName = '';
          rawContent = '';
          const fallbackPackNames = ['publish.pack.json', '发布包_v03.md', '发布包_v02.md', '发布包_v01.md', '发布包.md'];
          for (const candName of fallbackPackNames) {
            try {
              const fbBlob = await gmRequestBlob(`${settings.bridgeUrl}/api/file?path=${encodeURIComponent(candName)}`);
              const fbText = await fbBlob.text();
              if (isValidPublishPackContent(candName, fbText)) {
                fileName = candName;
                rawContent = fbText;
                break;
              }
            } catch {
              // continue probing
            }
          }
        }
        const workSlug =
          data.workSlug ||
          extractWorkSlugFront(data.baseDir || data.folderName || '') ||
          currentPack.meta?.workSlug ||
          '';
        const sameWork = !workSlug || workSlug === currentPack.meta?.workSlug;
        const cRecordId = data.cRecordId || (sameWork ? currentPack.meta?.cRecordId || '' : '');
        const cSerialNo = data.cSerialNo || (sameWork ? currentPack.meta?.cSerialNo || '' : '');
        const bRecordId = data.bRecordId || (sameWork ? currentPack.meta?.bRecordId || '' : '');
        const targetAccount = data.targetAccount || (sameWork ? currentPack.meta?.targetAccount || '' : '');
        if (rawContent) {
          applyPackContent(fileName || 'publish.pack.json', rawContent, data.subMarkdowns || {}, {
            baseDir: data.baseDir || '',
            workSlug,
            cRecordId,
            cSerialNo,
            bRecordId,
            targetAccount,
          });
        } else if (data.folderName) {
          currentPack = {
            meta: {
              isPresetDefault: false,
              packTitle: data.folderName,
              mdFileName: '（仅媒体目录）',
              format: 'empty',
              contentType: 'video',
              baseDir: data.baseDir || '',
              workSlug,
              cRecordId,
              cSerialNo,
              bRecordId,
              targetAccount,
              localMissing: false,
              updatedAt: new Date().toISOString(),
            },
            covers: Array.from(coverBlobsMap.keys()).map((rel) => inferCoverMetaFromPath(rel)),
            images: [],
            platforms: {},
          };
          prePubState.selectedWorkKey = 'auto';
          prePubState.syncedSig = '';
        }
        if (data.packVersion) {
          settings.lastBridgeVersion = data.packVersion;
          saveSettings(settings);
        }
        currentPack.meta.baseDir = data.baseDir || '';
        await hydrateCoversFromBlobs();
        savePackState(currentPack);
        setStatus(`✅ 已同步：${currentPack.meta.packTitle}（${coverBlobsMap.size} 张配图）`);
        render();
        refreshFeishuPublishContext(true);
      } catch {
        if (!silent) {
          setStatus('⚠️ 本地桥接服务 (127.0.0.1:8765) 未响应：请确认桥接服务已启动后再点「🔄」同步本地作品目录');
        }
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
        const tagRes = await fillBilibiliTagPills(pData.tags, { clearExisting: true });
        if (tagRes.ok) {
          filledParts.push(`${tagRes.count || Math.min(10, pData.tags.length)}个标签`);
        } else if (tagRes.reason) {
          setStatus(`⚠️ 标题/简介已填，但标签未完成：${tagRes.reason}`);
          return;
        }
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
      const dataCtx = getDataCenterContext();
      const isPubPage = isPublishPageContext();
      // 严格只在「真实发布页」与「数据中心页」渲染界面，其他任何页面完全隐身且零副作用
      if (!isPubPage && !dataCtx.isDataMode) {
        rootWrap.innerHTML = '';
        return;
      }

      buildStyles();
      rootWrap.innerHTML = '';

      if (settings.collapsed) {
        const isLeftCol = !dataCtx.isDataMode && (settings.dockSide || 'left') === 'left';
        const wrapCol = document.createElement('div');
        wrapCol.style.cssText = `display:flex; flex-direction:column; align-items:${
          isLeftCol ? 'flex-start' : 'flex-end'
        }; gap:6px; pointer-events:auto;`;

        if (dataCtx.isDataMode) {
          const mkMiniBtn = (label, dim) => {
            const b = document.createElement('button');
            b.style.cssText =
              'padding:8px 11px; background:#059669; color:#fff; border:none; border-radius:10px 0 0 10px; font-size:12px; font-weight:700; cursor:pointer; box-shadow:-4px 4px 12px rgba(5,150,105,0.26); white-space:nowrap;';
            b.textContent = label;
            b.onclick = async (ev) => {
              ev.stopPropagation();
              settings.collapsed = false;
              saveSettings(settings);
              render();
              await runDimensionExport(dim, { force: false });
            };
            return b;
          };
          wrapCol.appendChild(mkMiniBtn('📊 账号', 'account'));
          wrapCol.appendChild(mkMiniBtn('🎬 作品', 'works'));
          const tab = document.createElement('div');
          tab.className = 'ppf-collapsed-tab';
          tab.title = '点击展开数据导出面板（快捷键 Alt+S）';
          tab.innerHTML = `<span class="ppf-dot" style="background:#059669;"></span><span>数据导出助手</span>`;
          tab.onclick = () => {
            settings.collapsed = false;
            saveSettings(settings);
            render();
          };
          wrapCol.appendChild(tab);
          rootWrap.appendChild(wrapCol);
          return;
        }

        // 发布页折叠态：未同步真实发布时间时展示高危红色警示浮窗 + 一键快捷同步入口；已同步后展示绿色安心浮标！
        const schedInfo = detectPagePublishModeAndTime();
        const curSig = getCurrentSyncSignature();
        const effCand = getEffectiveFeishuCandidate();
        const isSyncedGreen = Boolean(
          feishuState.configured &&
            prePubState.syncedSig &&
            prePubState.syncedSig === curSig &&
            !prePubState.lastAlertIsError
        );
        const feishuRealTime = isSyncedGreen
          ? effCand?.feishuPublishedAt || prePubState.syncedFeishuTime || ''
          : '';
        const modeTag = schedInfo.mode === 'scheduled' ? `定时 ${schedInfo.plannedAt.slice(5)}` : '立即发布';
        const pillRadius = isLeftCol ? '0 12px 12px 0' : '12px 0 0 12px';
        const borderSideFix = isLeftCol ? 'border-left:none;' : 'border-right:none;';

        if (!isSyncedGreen) {
          const redCard = document.createElement('div');
          redCard.id = 'ppf-collapsed-unsynced-card';
          redCard.style.cssText = `pointer-events:auto; display:flex; flex-direction:column; gap:5px; padding:8px 10px; background:linear-gradient(135deg, #ef4444, #dc2626); color:#fff; border:2px solid rgba(255,255,255,0.88); ${borderSideFix} border-radius:${pillRadius}; box-shadow:0 6px 20px rgba(220,38,38,0.42); max-width:210px;`;
          const subHint = !feishuState.configured
            ? '未连接飞书配置'
            : prePubState.lastAlert
            ? '⚠️ 存在报错/冲突，点此查看'
            : `${effCand ? effCand.label.slice(0, 10) + ' · ' : ''}${modeTag}`;
          redCard.innerHTML = `
            <div id="ppf-collapsed-expand-btn" style="display:flex; align-items:center; justify-content:space-between; gap:8px; cursor:pointer; font-size:12px; font-weight:800; white-space:nowrap;" title="点击展开完整发布助手面板 (Alt+S)">
              <span>🚨 未同步发布时间</span>
              <span style="font-size:11px; opacity:0.92; background:rgba(0,0,0,0.18); padding:1px 5px; border-radius:4px;">展开 ${
                isLeftCol ? '❯' : '❮'
              }</span>
            </div>
            <div style="font-size:10.5px; opacity:0.94; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(
              subHint
            )}</div>
            <button id="ppf-collapsed-quick-sync" style="background:#ffffff; color:#dc2626; border:none; border-radius:6px; padding:4px 8px; font-size:11.5px; font-weight:800; cursor:pointer; width:100%; box-shadow:0 2px 6px rgba(0,0,0,0.14);">
              ${
                !feishuState.configured
                  ? '⚙️ 展开连接飞书'
                  : prePubState.syncing
                  ? '⏳ 正在同步...'
                  : '⚡ 点此直接同步变绿'
              }
            </button>
          `;
          wrapCol.appendChild(redCard);
          rootWrap.appendChild(wrapCol);

          const expandFn = () => {
            settings.collapsed = false;
            saveSettings(settings);
            render();
          };
          const expBtn = shadow.getElementById('ppf-collapsed-expand-btn');
          if (expBtn) expBtn.onclick = expandFn;
          const quickSyncBtn = shadow.getElementById('ppf-collapsed-quick-sync');
          if (quickSyncBtn) {
            quickSyncBtn.onclick = async (ev) => {
              ev.stopPropagation();
              if (!feishuState.configured) {
                expandFn();
                return;
              }
              const ok = await syncPrePublishAndTurnGreen({ force: false });
              if (!ok) {
                // 若遇到 6h 排期撞车需二次确认或接口报错，自动展开面板展示顶部错误详情
                settings.collapsed = false;
                saveSettings(settings);
                render();
              }
            };
          }
          return;
        }

        // 已同步飞书真实发布时间：紧凑绿色安心胶囊
        const greenTab = document.createElement('div');
        greenTab.id = 'ppf-collapsed-synced-tab';
        greenTab.title = '已同步飞书真实发布时间 · 点击展开面板 (Alt+S)';
        greenTab.style.cssText = `pointer-events:auto; display:flex; align-items:center; gap:6px; padding:8px 11px; background:linear-gradient(135deg, #10b981, #059669); color:#fff; border:2px solid rgba(255,255,255,0.88); ${borderSideFix} border-radius:${pillRadius}; box-shadow:0 4px 14px rgba(16,185,129,0.34); cursor:pointer; font-size:12px; font-weight:800; white-space:nowrap;`;
        greenTab.innerHTML = `<span>✅ 已同步 ${escapeHtml(
          feishuRealTime ? feishuRealTime.slice(5) : modeTag
        )}</span><span style="opacity:0.9; font-size:11px;">${isLeftCol ? '❯' : '❮'}</span>`;
        greenTab.onclick = () => {
          settings.collapsed = false;
          saveSettings(settings);
          render();
        };
        wrapCol.appendChild(greenTab);
        rootWrap.appendChild(wrapCol);
        return;
      }

      // ==================== 独立面板一：纯「数据安全导出面板」（完全隐藏底部填表组件） ====================
      if (dataCtx.isDataMode) {
        const autoAcct = detectLoggedInAccountShort();
        const curOverride = settings.exportAccountOverride || 'auto';
        const acctCache = getExportCacheEntry('account');
        const worksCache = getExportCacheEntry('works');
        const acctSub = acctCache?.ts ? `上次：${formatRelativeTime(acctCache.ts)}` : '上次：未导出';
        const worksSub = worksCache?.ts ? `上次：${formatRelativeTime(worksCache.ts)}` : '上次：未导出';
        const dimLabel = pendingExportConfirm?.dimension === 'account' ? '账号' : '作品';

        const dataShell = document.createElement('div');
        dataShell.className = 'ppf-shell';
        dataShell.innerHTML = `
          <div class="ppf-ear" id="ppf-ear-collapse" title="贴边收起面板 (Alt+S)">❯</div>
          <div class="ppf-wrap" style="border-radius:14px; border:1.5px solid rgba(5,150,105,0.32);">
            <div class="ppf-head" id="ppf-data-drag" style="cursor:move;">
              <div class="ppf-head-title">
                <span class="ppf-badge" style="background:#059669;">📊 数据导出</span>
                <span style="overflow:hidden; text-overflow:ellipsis;">${dataCtx.pageTitle}</span>
              </div>
              <div class="ppf-row-nowrap">
                <button class="ppf-icon-btn" id="ppf-open-feedback" title="问题反馈与建议（自动附带匿名诊断信息）">💬</button>
                <button class="ppf-icon-btn" id="ppf-toggle-theme" title="切换深浅皮肤">${
                  settings.theme === 'light' ? '🌙' : '☀️'
                }</button>
                <button class="ppf-icon-btn" id="ppf-collapse-btn" title="贴边收起 (Alt+S)">❯</button>
              </div>
            </div>

            <div class="ppf-body" style="gap:9px; padding:11px 12px;">
              <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
                <span style="font-size:11.5px; opacity:0.8; font-weight:600;">归属账号重命名：</span>
                <select id="ppf-export-acct" class="ppf-select" style="width:auto; flex:1; font-weight:600; padding:4px 7px;">
                  <option value="auto" ${curOverride === 'auto' ? 'selected' : ''}>自动识别${
          autoAcct && curOverride === 'auto' ? ` (${autoAcct})` : ''
        }</option>
                  <option value="万物有数" ${curOverride === '万物有数' ? 'selected' : ''}>万物有数</option>
                  <option value="靖蜀黍" ${curOverride === '靖蜀黍' ? 'selected' : ''}>靖蜀黍</option>
                  <option value="工程检测科普" ${curOverride === '工程检测科普' ? 'selected' : ''}>工程检测科普</option>
                </select>
              </div>

              <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
                <button class="ppf-btn" id="ppf-btn-exp-account" style="background:#059669; color:#fff; border:none; padding:10px 8px; border-radius:10px; display:flex; flex-direction:column; align-items:center; gap:3px;">
                  <span style="font-size:14px; font-weight:700;">📊 账号</span>
                  <span style="font-size:10.5px; opacity:0.9; font-weight:400;">${acctSub}</span>
                </button>
                <button class="ppf-btn" id="ppf-btn-exp-works" style="background:#0284c7; color:#fff; border:none; padding:10px 8px; border-radius:10px; display:flex; flex-direction:column; align-items:center; gap:3px;">
                  <span style="font-size:14px; font-weight:700;">🎬 作品</span>
                  <span style="font-size:10.5px; opacity:0.9; font-weight:400;">${worksSub}</span>
                </button>
              </div>

              ${
                pendingExportConfirm
                  ? `<div style="background:#fffbeb; border:1.5px solid #f59e0b; color:#92400e; border-radius:9px; padding:8px 10px; font-size:11.5px; line-height:1.45;">
                      <div style="font-weight:700; margin-bottom:5px;">
                        ⚠️ 12小时防重提醒：「${dimLabel}」在 ${pendingExportConfirm.agoStr}（${pendingExportConfirm.clockStr}）刚导出过，确定重新导出吗？
                      </div>
                      <div style="display:flex; justify-content:flex-end; gap:6px;">
                        <button class="ppf-btn" id="ppf-exp-conf-cancel" style="padding:3px 9px; font-size:11.5px;">取消</button>
                        <button class="ppf-btn" id="ppf-exp-conf-ok" style="background:#d97706; color:#fff; border:none; padding:3px 10px; font-size:11.5px; font-weight:700;">确认重导</button>
                      </div>
                    </div>`
                  : ''
              }

              <button class="ppf-btn ppf-btn-block" id="ppf-archive-dl" style="border-color:rgba(5,150,105,0.4); color:#059669; font-weight:600; padding:6px 10px;">
                📂 归档 ~/Downloads 报表到 AIHub
              </button>

              <div class="ppf-status" id="ppf-status-line" style="font-size:11.5px;">${
                statusText.includes('就绪') ? '🛡️ 安全单点导出 · 下载落盘自动重命名' : statusText
              }</div>
            </div>
          </div>
        `;
        rootWrap.appendChild(dataShell);

        const toggleCollapseData = () => {
          settings.collapsed = true;
          saveSettings(settings);
          render();
        };
        shadow.getElementById('ppf-collapse-btn').onclick = toggleCollapseData;
        shadow.getElementById('ppf-ear-collapse').onclick = toggleCollapseData;
        const dataFbBtn = shadow.getElementById('ppf-open-feedback');
        if (dataFbBtn) dataFbBtn.onclick = openFeedbackEntry;
        shadow.getElementById('ppf-toggle-theme').onclick = () => {
          settings.theme = settings.theme === 'light' ? 'dark' : 'light';
          saveSettings(settings);
          render();
        };
        shadow.getElementById('ppf-export-acct').onchange = (e) => {
          settings.exportAccountOverride = e.target.value;
          saveSettings(settings);
          pendingExportConfirm = null;
          pushExportHintToBackground({ enqueue: false });
          render();
        };
        const btnAcc = shadow.getElementById('ppf-btn-exp-account');
        btnAcc.onclick = async () => {
          btnAcc.disabled = true;
          try {
            await runDimensionExport('account', { force: false });
          } finally {
            btnAcc.disabled = false;
          }
        };
        const btnWrk = shadow.getElementById('ppf-btn-exp-works');
        btnWrk.onclick = async () => {
          btnWrk.disabled = true;
          try {
            await runDimensionExport('works', { force: false });
          } finally {
            btnWrk.disabled = false;
          }
        };
        const confCancel = shadow.getElementById('ppf-exp-conf-cancel');
        if (confCancel) {
          confCancel.onclick = () => {
            pendingExportConfirm = null;
            render();
          };
        }
        const confOk = shadow.getElementById('ppf-exp-conf-ok');
        if (confOk) {
          confOk.onclick = async () => {
            const targetDim = pendingExportConfirm?.dimension || 'works';
            pendingExportConfirm = null;
            render();
            await runDimensionExport(targetDim, { force: true });
          };
        }
        const archBtn = shadow.getElementById('ppf-archive-dl');
        archBtn.onclick = async () => {
          archBtn.disabled = true;
          try {
            await runArchiveDownloadsToAihub();
          } finally {
            archBtn.disabled = false;
          }
        };
        const dataDrag = shadow.getElementById('ppf-data-drag');
        dataDrag.onmousedown = (e) => {
          if (e.target.closest('button, select')) return;
          const startY = e.clientY;
          const initTop = settings.floatTop || 64;
          const onMove = (me) => {
            settings.floatTop = Math.max(8, Math.min(window.innerHeight - 160, initTop + (me.clientY - startY)));
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
        return;
      }

      // ==================== 独立面板二：「发布填表与排期防撞面板」 ====================

      const pData = currentPack.platforms?.[platform] || {};
      const activeContentType = pData.contentType || currentPack.meta?.contentType || 'video';
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
      const thumbDim = getThumbBoxDimensions(activeRatioLabel);

      const injectBtnLabel =
        platform === 'douyin'
          ? `⚡ 注入${activeRatioLabel === '3:4' || activeRatioLabel === '9:16' ? '竖封' : '横封'} (${activeRatioLabel})`
          : platform === 'weixin'
          ? `⚡ 注入${activeRatioLabel === '3:4' ? ' 3:4 主页卡' : ' 4:3 动态卡'}`
          : `⚡ 注入封面 (${activeRatioLabel})`;

      const isLight = settings.theme === 'light';
      const isLeftDock = settings.layoutMode === 'dock' && (settings.dockSide || 'left') === 'left';
      const collapseArrow = isLeftDock ? '❮' : '❯';

      const shell = document.createElement('div');
      shell.className = 'ppf-shell';
      shell.innerHTML = `
        <div class="ppf-ear" id="ppf-ear-collapse" title="贴边收起面板，避免遮挡下方按钮 (快捷键 Alt+S)">${collapseArrow}</div>
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
              <span style="overflow:hidden; text-overflow:ellipsis;">全平台半自动发布助手</span>
            </div>
            <div class="ppf-row-nowrap">
              <button class="ppf-icon-btn" id="ppf-toggle-theme" title="切换 浅色纯白 / 深色暗夜 皮肤">
                ${isLight ? '🌙' : '☀️'}
              </button>
              <button class="ppf-icon-btn" id="ppf-toggle-dock-side" title="${
                isLeftDock ? '当前：左侧分屏停靠（防遮挡右侧发布按钮 · 点击切到右侧）' : '点击切换为左侧分屏停靠（防遮挡右侧发布按钮）'
              }">
                ${isLeftDock ? '◨' : '◧'}
              </button>
              <button class="ppf-icon-btn" id="ppf-toggle-layout" title="${
                settings.layoutMode === 'dock' ? '当前：分屏停靠（点击切换为自由悬浮窗）' : '当前：自由悬浮窗（点击切换为分屏停靠）'
              }">
                ${settings.layoutMode === 'dock' ? '🪟' : '📌'}
              </button>
              <button class="ppf-icon-btn" id="ppf-sync-bridge" title="从本地桥接服务重新同步作品与封面">🔄</button>
              <button class="ppf-icon-btn" id="ppf-open-feedback" title="反馈问题或建议">💬</button>
              <button class="ppf-icon-btn" id="ppf-collapse-btn" title="贴边收起 (Alt+S)">${collapseArrow}</button>
            </div>
          </div>

          <div class="ppf-body">
            ${(() => {
              // ==================== 顶部最醒目状态与错误信息栏（未同步高危红 / 已同步安全绿） ====================
              if (!feishuState.configured) {
                const unconfAlert = prePubState.lastAlert || (feishuState.error ? `❌ ${feishuState.error}` : '');
                return `<div class="ppf-sec" id="ppf-top-status-card" style="border:2px solid #dc2626; background:${
                  isLight ? '#fef2f2' : 'rgba(220,38,38,0.18)'
                }; gap:6px; padding:8px 10px;">
                  <div class="ppf-sec-hd" style="color:${isLight ? '#b91c1c' : '#fca5a5'}; font-size:12px; font-weight:800;">
                    <span>🚨 未连接飞书 · 尚未同步真实发布时间</span>
                    <button class="ppf-icon-btn" id="ppf-open-feishu-opts" title="打开飞书多维表连接设置">⚙️</button>
                  </div>
                  <div id="ppf-top-alert-msg" style="display:${unconfAlert ? 'block' : 'none'}; background:${
                  isLight ? 'rgba(220,38,38,0.10)' : 'rgba(239,68,68,0.22)'
                }; color:${
                  isLight ? '#991b1b' : '#fecaca'
                }; border-left:3px solid #dc2626; padding:5px 8px; border-radius:5px; font-size:11.5px; font-weight:700; line-height:1.4; word-break:break-word;">${escapeHtml(
                  unconfAlert
                )}</div>
                  <div style="display:flex; gap:6px;">
                    <button class="ppf-btn" id="ppf-toggle-quick-code" style="flex:1; font-weight:600;">📥 粘贴配置码秒连</button>
                    <button class="ppf-btn" id="ppf-open-feishu-opts-btn" style="background:#dc2626; color:#fff; border:none; font-weight:700; padding:4px 10px;">⚙️ 设置</button>
                  </div>
                  ${
                    prePubState.showQuickSetup
                      ? `<div style="display:flex; flex-direction:column; gap:6px; margin-top:2px;">
                          <input class="ppf-input" id="ppf-quick-code-inp" placeholder="在此粘贴 PPF2:... 跨设备配置码" />
                          <button class="ppf-btn ppf-btn-accent ppf-btn-block" id="ppf-quick-code-apply">⚡ 立即验证并连接飞书</button>
                        </div>`
                      : ''
                  }
                </div>`;
              }

              const schedInfo = detectPagePublishModeAndTime();
              const curSig = getCurrentSyncSignature();
              const effCand = getEffectiveFeishuCandidate();
              const isSyncedGreen = Boolean(
                prePubState.syncedSig && prePubState.syncedSig === curSig && !prePubState.lastAlertIsError
              );
              const feishuRealTime = isSyncedGreen
                ? effCand?.feishuPublishedAt || prePubState.syncedFeishuTime || ''
                : '';
              const modeTag =
                schedInfo.mode === 'scheduled' ? `定时 ${schedInfo.plannedAt.slice(5)}` : '立即发布';

              // 防张冠李戴检测：若网页输入框已填标题，但与自动匹配的作品毫无重合字，在顶部警告栏高亮提醒
              let mismatchWarn = '';
              const { pageRawTitle } = readCurrentFormTitleAndBody();
              if (prePubState.selectedWorkKey === 'auto' && effCand && pageRawTitle && pageRawTitle.length >= 5) {
                const pNorm = normalizeCompareTitle(pageRawTitle);
                const cNorm1 = normalizeCompareTitle(effCand.label.replace(/^[0-9？?]+｜/, ''));
                const cNorm2 = normalizeCompareTitle(effCand.fallbackTitle || '');
                const cNorm3 = currentPack.meta?.isPresetDefault ? '' : normalizeCompareTitle(activeTitle || '');
                const hasBigramOverlap = (a, b) => {
                  if (!a || !b || a.length < 2 || b.length < 2) return false;
                  for (let i = 0; i < a.length - 1; i++) {
                    if (b.includes(a.slice(i, i + 2))) return true;
                  }
                  return false;
                };
                if (
                  pNorm.length >= 4 &&
                  !hasBigramOverlap(pNorm, cNorm1) &&
                  !hasBigramOverlap(pNorm, cNorm2) &&
                  (!cNorm3 || !hasBigramOverlap(pNorm, cNorm3))
                ) {
                  mismatchWarn = `⚠️ 网页标题与关联记录《${effCand.label}》疑似不符，请在 B 区核对切换！`;
                }
              }

              const activeAlertText =
                prePubState.lastAlert ||
                (feishuState.error ? `❌ 飞书异常：${feishuState.error}` : '') ||
                (prePubState.conflictConfirm ? prePubState.conflictConfirm.summary : '') ||
                (!isSyncedGreen && feishuState.hasConflict ? feishuState.summary : '') ||
                mismatchWarn ||
                '';

              const topBorder = isSyncedGreen ? '#10b981' : '#dc2626';
              const topBg = isSyncedGreen
                ? isLight
                  ? '#ecfdf5'
                  : 'rgba(16,185,129,0.16)'
                : isLight
                ? '#fef2f2'
                : 'rgba(220,38,38,0.18)';
              const topHdColor = isSyncedGreen
                ? isLight
                  ? '#047857'
                  : '#6ee7b7'
                : isLight
                ? '#b91c1c'
                : '#fca5a5';

              return `<div class="ppf-sec" id="ppf-top-status-card" style="border:2px solid ${topBorder}; background:${topBg}; gap:6px; padding:8px 10px;">
                <div class="ppf-sec-hd" style="color:${topHdColor}; font-size:12px; font-weight:800;">
                  <span>${
                    isSyncedGreen
                      ? `✅ 已同步真实发布时间 (${escapeHtml(feishuRealTime || prePubState.syncedLabel || modeTag)})`
                      : '🚨 未同步真实发布时间 · 发布前必点同步'
                  }</span>
                  <div class="ppf-row-nowrap">
                    <button class="ppf-icon-btn" id="ppf-toggle-time-override" title="手动指定发布时间（页面未识别定时框时兜底）">⏰</button>
                    ${
                      isSyncedGreen
                        ? `<button class="ppf-btn" id="ppf-panel-sync-pub" style="padding:2px 7px; font-size:11px; border-color:#10b981; color:${topHdColor}; font-weight:700;" title="重新同步当前页面发布时间到飞书">重同步</button>`
                        : ''
                    }
                  </div>
                </div>

                <div id="ppf-top-alert-msg" style="display:${activeAlertText ? 'block' : 'none'}; background:${
                isLight ? 'rgba(220,38,38,0.11)' : 'rgba(239,68,68,0.24)'
              }; color:${
                isLight ? '#991b1b' : '#fecaca'
              }; border-left:3px solid #dc2626; padding:5px 8px; border-radius:5px; font-size:11.5px; font-weight:700; line-height:1.4; word-break:break-word;">${escapeHtml(
                activeAlertText
              )}</div>

                ${
                  prePubState.showTimeInput || prePubState.manualTimeOverride
                    ? `<div style="display:flex; gap:5px; align-items:center;">
                        <input class="ppf-input" id="ppf-manual-time-inp" placeholder="手动指定定时 YYYY-MM-DD HH:mm (留空自动读页面)" value="${escapeHtml(
                          prePubState.manualTimeOverride
                        )}" />
                        ${
                          prePubState.manualTimeOverride
                            ? `<button class="ppf-btn" id="ppf-clear-time-inp" style="flex-shrink:0;">清除</button>`
                            : ''
                        }
                      </div>`
                    : ''
                }

                ${
                  !isSyncedGreen && !feishuState.hasConflict && feishuState.summary
                    ? `<div style="font-size:11px; line-height:1.35; opacity:0.85;">${escapeHtml(feishuState.summary)}${
                        feishuState.goldenWindows ? ` · 黄金档 ${escapeHtml(feishuState.goldenWindows)}` : ''
                      }</div>`
                    : ''
                }

                ${
                  !isSyncedGreen
                    ? prePubState.conflictConfirm
                      ? `<div style="display:flex; gap:6px; justify-content:flex-end;">
                          <button class="ppf-btn" id="ppf-conf-cancel">去改页面定时</button>
                          <button class="ppf-btn" id="ppf-conf-force" style="background:#dc2626; color:#fff; border:none; font-weight:700;">已知风险 · 强制同步变绿</button>
                        </div>`
                      : `<button class="ppf-btn ppf-btn-block" id="ppf-panel-sync-pub" style="background:linear-gradient(135deg, #ef4444, #dc2626); color:#fff; border:none; font-weight:800; padding:7px 10px; font-size:12.5px; box-shadow:0 3px 10px rgba(220,38,38,0.28);">
                          ${
                            prePubState.syncing
                              ? '⏳ 正在写入飞书并回读真实发布时间...'
                              : `🚨 点此同步真实发布时间 · ${escapeHtml(modeTag)}`
                          }
                        </button>`
                    : ''
                }
              </div>`;
            })()}

            <!-- 结构 A：极简本地作品文件栏（Hover 展示真实完整路径 + 一键打开路径） -->
            ${(() => {
              const effCandForA = getEffectiveFeishuCandidate();
              const rawBaseDir = currentPack.meta?.baseDir || '';
              const cleanSlug =
                (!currentPack.meta?.isPresetDefault &&
                  (currentPack.meta?.workSlug || extractWorkSlugFront(rawBaseDir))) ||
                effCandForA?.slug ||
                '';
              const displaySlug =
                cleanSlug ||
                (!currentPack.meta?.isPresetDefault && currentPack.meta?.packTitle
                  ? currentPack.meta.packTitle
                  : '未关联本地作品目录');
              const fullPathTip =
                rawBaseDir ||
                (currentPack.meta?.localMissing && cleanSlug
                  ? `${cleanSlug}（本机/NAS 暂未同步该目录）`
                  : displaySlug);
              return `<div class="ppf-compact-card" id="ppf-sec-local">
                <div class="ppf-compact-row">
                  <span class="ppf-part-tag">A 本地</span>
                  <span class="ppf-compact-path" id="ppf-local-slug-text" title="${escapeHtml(fullPathTip)}">📁 ${escapeHtml(
                displaySlug
              )}</span>
                  <button class="ppf-btn" id="ppf-open-local-dir" style="padding:2px 8px; font-size:11px; flex-shrink:0;" title="${escapeHtml(
                    rawBaseDir ? `打开完整路径：${rawBaseDir}` : `在 Finder 打开：${displaySlug}`
                  )}">打开路径</button>
                </div>
              </div>`;
            })()}

            <!-- 结构 B：关联飞书发布记录（账号切换 + 发布记录主名称 + 飞书表真实发布时间回读） -->
            ${(() => {
              if (!feishuState.configured) return '';
              const effCand = getEffectiveFeishuCandidate();
              const curSig = getCurrentSyncSignature();
              const isSyncedGreen = Boolean(
                prePubState.syncedSig && prePubState.syncedSig === curSig && !prePubState.lastAlertIsError
              );
              const feishuSyncedTime = isSyncedGreen
                ? effCand?.feishuPublishedAt || prePubState.syncedFeishuTime || ''
                : '';
              const formatRecLabel = (c, syncedNow = false) => {
                if (!c) return '';
                const raw = c.cDisplayTitle || `⏳@${feishuState.accountName || pMeta.name}_${c.label}`;
                return syncedNow ? raw.replace(/^⏳@/, '✅@') : raw;
              };
              const acctList =
                Array.isArray(feishuState.platformAccounts) && feishuState.platformAccounts.length > 0
                  ? feishuState.platformAccounts
                  : [
                      {
                        recordId: feishuState.accountId || 'auto',
                        name: feishuState.accountName || pMeta.name,
                      },
                    ];

              return `<div class="ppf-compact-card" id="ppf-sec-feishu">
                <div class="ppf-compact-row">
                  <span class="ppf-part-tag">B 飞书</span>
                  <select class="ppf-select" id="ppf-feishu-acct-select" style="flex:1; padding:2px 6px; font-weight:600;" title="切换当前平台分发账号">
                    ${acctList
                      .map(
                        (acc) =>
                          `<option value="${escapeHtml(acc.recordId)}" ${
                            (prePubState.selectedAccountId || feishuState.accountId) === acc.recordId ? 'selected' : ''
                          }>👤 ${escapeHtml(acc.name)}</option>`
                      )
                      .join('')}
                  </select>
                  <button class="ppf-icon-btn" id="ppf-refresh-radar" title="重新从飞书读取发布记录与真实发布时间">🔄</button>
                  <button class="ppf-icon-btn" id="ppf-open-feishu-opts" title="飞书连接与配置码设置">⚙️</button>
                </div>

                <select class="ppf-select" id="ppf-work-select" style="font-weight:700; padding:4px 7px; font-size:12px;" title="当前关联的飞书 C 发布记录（点击可切换）">
                  <option value="auto" ${prePubState.selectedWorkKey === 'auto' ? 'selected' : ''}>${
                effCand
                  ? escapeHtml(formatRecLabel(effCand, isSyncedGreen))
                  : feishuState.loading
                  ? '⏳ 正在匹配飞书发布记录...'
                  : '⚠️ 未命中待发记录（请下拉选择）'
              }</option>
                  ${(feishuState.candidates || [])
                    .map((c) => {
                      const k = getCandidateKey(c);
                      const isThisSynced = isSyncedGreen && effCand && getCandidateKey(effCand) === k;
                      return `<option value="${escapeHtml(k)}" ${
                        prePubState.selectedWorkKey === k ? 'selected' : ''
                      }>${escapeHtml(formatRecLabel(c, isThisSynced))}</option>`;
                    })
                    .join('')}
                </select>

                <div class="ppf-compact-row" style="font-size:11.5px; padding-top:1px;">
                  <span style="opacity:0.75;">🕒 真实发布时间</span>
                  <span id="ppf-feishu-real-time" style="min-width:116px; min-height:18px; padding:1px 6px; border-radius:4px; border:1px dashed ${
                    feishuSyncedTime ? '#10b981' : 'rgba(148,163,184,0.35)'
                  }; text-align:right; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-weight:700; color:${
                feishuSyncedTime ? (isLight ? '#047857' : '#6ee7b7') : 'inherit'
              };">${escapeHtml(feishuSyncedTime)}</span>
                </div>
              </div>`;
            })()}

            <!-- 结构 C：发布包内容分隔头 -->
            <div class="ppf-divider-label">
              <span class="ppf-part-tag">C 发布包</span>
              <span>封面 · 标题 · 正文 · 标签</span>
            </div>

            ${
              activeContentType === 'image_post' && slidePaths.length > 0
                ? `<div class="ppf-sec">
                    <div class="ppf-sec-hd">
                      <span>🖼️ 图文轮播（${slidePaths.length} 张 · 已缓存 ${readySlideCount} 张）</span>
                    </div>
                    <button class="ppf-btn ppf-btn-accent ppf-btn-block" id="ppf-inject-slides">
                      ⚡ 按序注入全部 ${slidePaths.length} 张轮播图
                    </button>
                  </div>`
                : ''
            }

            <!-- 封面比例自适应预览与注入区 -->
            ${
              activeContentType !== 'image_post' || sortedCovers.length > 0
                ? `<div class="ppf-sec">
                    <div class="ppf-sec-hd">
                      <span>🖼️ 封面（已按${pMeta.name}默认识别 ${activeRatioLabel}）</span>
                      <span style="flex-shrink:0;">${coverBlobsMap.size ? `共 ${coverBlobsMap.size} 张` : '待选目录'}</span>
                    </div>
                    <div class="ppf-cover-box">
                      ${
                        activeThumbUrl
                          ? `<img class="ppf-thumb" style="width:${thumbDim.w}px; height:${thumbDim.h}px;" src="${activeThumbUrl}" alt="cover" />`
                          : `<div class="ppf-thumb" style="width:${thumbDim.w}px; height:${thumbDim.h}px;">${
                              activeCover ? `${activeCover.ratio}\n待载入图` : '选目录\n自动配图'
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
                    ? `短标题 (${activeTitle.length}/16字)`
                    : platform === 'douyin'
                    ? `作品标题 (${activeTitle.length}/${activeContentType === 'image_post' ? 20 : 30}字)`
                    : `标题 (${platform === 'xiaohongshu' ? `${xhsLen}/20字` : `${activeTitle.length}字`})`
                }</span>
                <div class="ppf-row-nowrap">
                  <button class="ppf-btn" id="ppf-fill-title-only">填入</button>
                  <button class="ppf-copy-icon" id="ppf-copy-title" title="复制标题">📋</button>
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
                  <button class="ppf-copy-icon" id="ppf-copy-body" title="复制正文">📋</button>
                </div>
              </div>
              <div class="ppf-preview" style="min-height: 72px;">${pData.body || '（空）'}</div>
            </div>

            <!-- 话题 / 标签 -->
            <div class="ppf-sec">
              <div class="ppf-sec-hd">
                <span>🏷️ ${
                  platform === 'bilibili'
                    ? `标签（共 ${(pData.tags || []).length} 个 · 点胶囊可单加）`
                    : platform === 'youtube'
                    ? '普通标签（无#纯词）'
                    : platform === 'weixin'
                    ? '话题（点胶囊可追加）'
                    : '话题（点胶囊唤醒下拉 → 按回车）'
                }</span>
                <div class="ppf-row-nowrap">
                  ${platform === 'bilibili' ? `<button class="ppf-btn" id="ppf-fill-tags-only">填入</button>` : ''}
                  <button class="ppf-copy-icon" id="ppf-copy-tags" title="复制全部标签">📋</button>
                </div>
              </div>
              <div class="ppf-row" id="ppf-tags-wrap"></div>
            </div>

            <!-- 合集 / 位置 / 置顶首评 / 平台子选项 -->
            <div class="ppf-sec">
              <div class="ppf-sec-hd"><span>📌 合集 · 首评 · 辅助项</span></div>
              <div class="ppf-row">
                ${
                  pData.collection && (platform === 'weixin' || platform === 'douyin')
                    ? `<button class="ppf-btn" id="ppf-auto-col" title="上传完成后点击，自动在下拉框精确匹配「${pData.collection}」">⚡ 自动选合集：${pData.collection}</button>`
                    : ''
                }
                ${pData.collection ? `<button class="ppf-btn" id="ppf-copy-col" title="点击复制合集名">📁 ${pData.collection}</button>` : ''}
                ${pData.location ? `<button class="ppf-btn" id="ppf-copy-loc" title="点击复制位置">📍 ${pData.location}</button>` : ''}
                ${pData.pinnedComment ? `<button class="ppf-btn" id="ppf-copy-pin" title="点击复制置顶评论">💬 置顶首评</button>` : ''}
                ${pData.dynamicText ? `<button class="ppf-btn" id="ppf-copy-dyn" title="点击复制动态语">✨ 动态语</button>` : ''}
              </div>
              <div class="ppf-row" id="ppf-opt-badges"></div>
            </div>

            <!-- 选项开关 -->
            <div class="ppf-row" style="justify-content:space-between;">
              <label class="ppf-toggle" title="分屏停靠时自动收缩网页宽度，避免遮挡页面内容与右侧发布按钮">
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

            <button class="ppf-btn ppf-btn-accent ppf-btn-block" id="ppf-run-all" style="padding: 10px 14px; font-size: 13.5px; flex-shrink: 0;">
              ${
                settings.clipboardOnlyMode
                  ? '📋 一键复制本平台全套文案'
                  : platform === 'weixin'
                  ? '✨ 一键填入描述 + #话题 + 短标题'
                  : platform === 'bilibili'
                  ? '✨ 一键填入标题 + 简介 + 标签'
                  : '✨ 一键填入标题与正文'
              }
            </button>

            <div class="ppf-status" id="ppf-status-line">${statusText}</div>
            <div class="ppf-foot">
              <span>🛡️ 拟人延时 · 不自动点发布</span>
              <span>${isLeftDock ? '右边缘可拖宽' : '左边缘可拖宽'} · Alt+S 收起</span>
            </div>
          </div>
        </div>
      `;

      rootWrap.appendChild(shell);

      // 渲染封面切换胶囊（按当前平台独立保存选中项，切到其它平台不会互相干扰）
      const coverChipsWrap = shadow.getElementById('ppf-cover-chips');
      if (coverChipsWrap) {
        for (const c of sortedCovers) {
          const chip = document.createElement('span');
          const isCurrent = activeCover && c.relPath === activeCover.relPath;
          chip.className = `ppf-chip ${isCurrent ? 'active' : ''}`;
          chip.textContent = formatCoverChipLabel(c);
          chip.title = c.relPath;
          chip.onclick = () => {
            settings.selectedCoverByPlat = settings.selectedCoverByPlat || {};
            settings.selectedCoverByPlat[platform] = c.relPath;
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

      // 渲染话题/标签胶囊（B站点胶囊直接填入单个标签；小红书/抖音唤醒下拉；视频号敲入 #话题）
      const tagsWrap = shadow.getElementById('ppf-tags-wrap');
      if (tagsWrap && Array.isArray(pData.tags)) {
        for (const tag of pData.tags) {
          const chip = document.createElement('span');
          chip.className = 'ppf-chip';
          chip.textContent = platform === 'bilibili' ? tag : `#${tag}`;
          chip.onclick = async () => {
            if (settings.clipboardOnlyMode) {
              await safeCopy(platform === 'bilibili' ? tag : `#${tag}`);
              setStatus(`📋 已复制标签：${tag}`);
              return;
            }
            if (platform === 'bilibili') {
              const res = await fillBilibiliTagPills([tag], { clearExisting: false });
              if (res.ok) {
                setStatus(`✅ 已向 B 站添加标签：${tag}`);
              } else {
                await safeCopy(tag);
                setStatus(`⚠️ ${res.reason || '未找到标签框'}，已复制「${tag}」到剪贴板`);
              }
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

      // 顶部栏与飞书发前关联 & 黄转绿警示同步按钮绑定
      const openOptsHandler = () => {
        sendExtMessage({ type: 'PPF_OPEN_OPTIONS_PAGE' }).catch(() => {
          setStatus('💡 请点击浏览器右上角插件图标 →「⚙️ 飞书直连与跨设备配置码设置」');
        });
      };
      const openOptsIcon = shadow.getElementById('ppf-open-feishu-opts');
      if (openOptsIcon) openOptsIcon.onclick = openOptsHandler;
      const openOptsBtn = shadow.getElementById('ppf-open-feishu-opts-btn');
      if (openOptsBtn) openOptsBtn.onclick = openOptsHandler;

      const toggleQuickBtn = shadow.getElementById('ppf-toggle-quick-code');
      if (toggleQuickBtn) {
        toggleQuickBtn.onclick = () => {
          prePubState.showQuickSetup = !prePubState.showQuickSetup;
          render();
        };
      }
      const quickApplyBtn = shadow.getElementById('ppf-quick-code-apply');
      if (quickApplyBtn) {
        quickApplyBtn.onclick = async () => {
          const code = (shadow.getElementById('ppf-quick-code-inp')?.value || '').trim();
          if (!code) {
            setStatus('⚠️ 请先粘贴 PPF2:... 跨设备配置码');
            return;
          }
          quickApplyBtn.disabled = true;
          setStatus('⏳ 正在验证配置码并连接飞书多维表...');
          try {
            await sendExtMessage({ type: 'PPF_FEISHU_IMPORT_CODE', code });
            prePubState.showQuickSetup = false;
            setStatus('✅ 飞书多维表连接成功！正在拉取待发作品与排期...');
            await refreshFeishuPublishContext(false);
          } catch (err) {
            setStatus(`❌ 配置码导入失败：${err?.message || err}`);
          } finally {
            quickApplyBtn.disabled = false;
          }
        };
      }

      const refreshRadarBtn = shadow.getElementById('ppf-refresh-radar');
      if (refreshRadarBtn) {
        refreshRadarBtn.onclick = () => refreshFeishuPublishContext(false);
      }

      const feishuAcctSel = shadow.getElementById('ppf-feishu-acct-select');
      if (feishuAcctSel) {
        feishuAcctSel.onchange = (e) => {
          prePubState.selectedAccountId = e.target.value;
          prePubState.syncedSig = '';
          prePubState.conflictConfirm = null;
          refreshFeishuPublishContext(false);
        };
      }

      const workSelect = shadow.getElementById('ppf-work-select');
      if (workSelect) {
        workSelect.onchange = (e) => {
          const val = e.target.value;
          prePubState.selectedWorkKey = val;
          prePubState.syncedSig = '';
          prePubState.conflictConfirm = null;
          if (val !== 'auto') {
            const picked = (feishuState.candidates || []).find((c) => getCandidateKey(c) === val);
            const canAutoHydrate =
              currentPack.meta?.isPresetDefault ||
              currentPack.meta?.cloudFallback ||
              currentPack.meta?.format === 'empty' ||
              currentPack.meta?.format === 'cloud_pending';
            if (picked && canAutoHydrate && (picked.hasCloudPack || picked.fallbackTitle || picked.fallbackBody)) {
              applyCloudPackFromCandidate(picked, { silent: true });
            }
          }
          render();
          refreshFeishuPublishContext(true);
        };
      }

      const openLocalDirBtn = shadow.getElementById('ppf-open-local-dir');
      if (openLocalDirBtn) {
        openLocalDirBtn.onclick = async () => {
          const eff = getEffectiveFeishuCandidate();
          // 优先传递干净的跨设备作品目录标识（如 20261118_开源爬墙画画盒），完美兼容跨电脑不同用户名及旧版桥接服务！
          const targetDir =
            (!currentPack.meta?.isPresetDefault &&
              (extractWorkSlugFront(currentPack.meta?.workSlug || currentPack.meta?.baseDir || '') ||
                currentPack.meta?.baseDir)) ||
            eff?.slug ||
            '';
          if (!targetDir) {
            setStatus('⚠️ 当前尚未关联本地作品路径，请从飞书点「🚀 去发布」唤起');
            return;
          }
          openLocalDirBtn.disabled = true;
          try {
            if (IS_CHROME_EXT) {
              const resp = await sendExtMessage({ type: 'PPF_BRIDGE_OPEN_FINDER', dir: targetDir });
              setStatus(`📂 已在 Finder 打开本地路径：${resp?.path || targetDir}`);
            } else {
              await gmRequestJson(`${settings.bridgeUrl}/api/open-finder?dir=${encodeURIComponent(targetDir)}`);
              setStatus(`📂 已在 Finder 打开本地路径：${targetDir}`);
            }
          } catch (err) {
            setStatus(
              `❌ 打开本地路径失败：${err?.message || '请确认本机桥接服务 (8765) 已运行且已同步该目录'}`
            );
          } finally {
            openLocalDirBtn.disabled = false;
          }
        };
      }

      const toggleTimeBtn = shadow.getElementById('ppf-toggle-time-override');
      if (toggleTimeBtn) {
        toggleTimeBtn.onclick = () => {
          prePubState.showTimeInput = !prePubState.showTimeInput;
          render();
        };
      }
      const manualTimeInp = shadow.getElementById('ppf-manual-time-inp');
      if (manualTimeInp) {
        manualTimeInp.onchange = (e) => {
          prePubState.manualTimeOverride = e.target.value.trim();
          prePubState.conflictConfirm = null;
          refreshFeishuPublishContext(false);
        };
      }
      const clearTimeBtn = shadow.getElementById('ppf-clear-time-inp');
      if (clearTimeBtn) {
        clearTimeBtn.onclick = () => {
          prePubState.manualTimeOverride = '';
          prePubState.showTimeInput = false;
          prePubState.conflictConfirm = null;
          refreshFeishuPublishContext(false);
        };
      }

      const panelSyncPubBtn = shadow.getElementById('ppf-panel-sync-pub');
      if (panelSyncPubBtn) {
        panelSyncPubBtn.onclick = () => syncPrePublishAndTurnGreen({ force: false });
      }
      const confCancelBtn = shadow.getElementById('ppf-conf-cancel');
      if (confCancelBtn) {
        confCancelBtn.onclick = () => {
          prePubState.conflictConfirm = null;
          render();
        };
      }
      const confForceBtn = shadow.getElementById('ppf-conf-force');
      if (confForceBtn) {
        confForceBtn.onclick = () => syncPrePublishAndTurnGreen({ force: true });
      }

      shadow.getElementById('ppf-toggle-theme').onclick = () => {
        settings.theme = settings.theme === 'light' ? 'dark' : 'light';
        saveSettings(settings);
        render();
      };
      const toggleDockSideBtn = shadow.getElementById('ppf-toggle-dock-side');
      if (toggleDockSideBtn) {
        toggleDockSideBtn.onclick = () => {
          if (settings.layoutMode !== 'dock') {
            settings.layoutMode = 'dock';
            settings.dockSide = 'left';
          } else {
            settings.dockSide = (settings.dockSide || 'left') === 'left' ? 'right' : 'left';
          }
          saveSettings(settings);
          render();
        };
      }
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
      shadow.getElementById('ppf-sync-bridge').onclick = () => syncFromLocalBridge(false);
      const pubFbBtn = shadow.getElementById('ppf-open-feedback');
      if (pubFbBtn) pubFbBtn.onclick = openFeedbackEntry;

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
            setStatus('⚠️ 当前未加载本地封面图：请确认本机桥接服务已启动并点右上角「🔄」同步本地作品目录');
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
      const fillTagsOnlyBtn = shadow.getElementById('ppf-fill-tags-only');
      if (fillTagsOnlyBtn) {
        fillTagsOnlyBtn.onclick = async () => {
          if (!pData.tags?.length) {
            setStatus('⚠️ 当前发布包没有标签');
            return;
          }
          setStatus('⏳ 正在向 B 站填入标签...');
          const res = await fillBilibiliTagPills(pData.tags, { clearExisting: true });
          if (res.ok) {
            setStatus(`✅ 已向 B 站填入 ${res.count || Math.min(10, pData.tags.length)} 个标签`);
          } else {
            setStatus(`⚠️ ${res.reason || '填入标签失败'}`);
          }
        };
      }
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

      // 侧边缘拖拽调宽（左侧分屏停靠时向右拉宽，右侧停靠/悬浮窗时向左拉宽）
      const resizeW = shadow.getElementById('ppf-resize-w');
      resizeW.onmousedown = (e) => {
        e.preventDefault();
        const startX = e.clientX;
        const startWidth = settings.width;
        const onMove = (me) => {
          const delta =
            settings.layoutMode === 'dock' && (settings.dockSide || 'left') === 'left'
              ? me.clientX - startX
              : startX - me.clientX;
          settings.width = Math.round(Math.min(760, Math.max(320, startWidth + delta)));
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

    // Chrome 插件模式下：当其它标签页载入了新成品包、更新了导出缓存，或切换折叠状态时，本页免刷新实时热同步！
    if (IS_CHROME_EXT && chrome.storage?.onChanged) {
      chrome.storage.onChanged.addListener(async (changes, areaName) => {
        if (areaName !== 'local' || suppressStorageEcho) return;
        let needRender = false;
        if (changes[STORAGE_KEY_SETTINGS]) {
          settings = await loadSettings();
          needRender = true;
        }
        if (changes[STORAGE_KEY_EXPORT_CACHE]) {
          await loadExportCache();
          needRender = true;
        }
        if (changes.ppf_last_auto_archive_v1?.newValue) {
          const info = changes.ppf_last_auto_archive_v1.newValue;
          if (info?.count > 0) {
            setStatus(`📂 已自动归档 ${info.count} 份报表 → ${info.destDir}（极空间同步中）`);
          }
        }
        if (changes.ppf_feishu_config_v1 || changes.ppf_feishu_config_v2) {
          refreshFeishuPublishContext(true);
        }
        if (changes[STORAGE_KEY_PACK]) {
          currentPack = await loadPackState();
          coverBlobsMap = await loadCoversCrossPlatform();
          await hydrateCoversFromBlobs();
          prePubState.selectedWorkKey = 'auto';
          prePubState.syncedSig = '';
          prePubState.conflictConfirm = null;
          setStatus(`🔄 已同步发布包：${currentPack.meta?.packTitle || ''}`);
          needRender = true;
          refreshFeishuPublishContext(true);
        } else if (Object.keys(changes).some((k) => k.startsWith(CROSS_COVER_PREFIX))) {
          coverBlobsMap = await loadCoversCrossPlatform();
          await hydrateCoversFromBlobs();
          needRender = true;
        }
        if (needRender) render();
      });
    }

    await loadExportCache();
    hydrateCoversFromBlobs().then((changed) => {
      if (changed) render();
    });
    render();
    setTimeout(() => {
      pushExportHintToBackground({ enqueue: false });
      if (isPublishPageContext()) {
        const initSched = detectPagePublishModeAndTime();
        prePubState.lastTimeSig = `${initSched.mode}|${initSched.plannedAt}`;
        refreshFeishuPublishContext(true);
      }
    }, 1200);

    // 即使手动直接点网页原生的「导出数据 / 下载明细」按钮，也在按下瞬间同步当前账号与板块名，让后台自动重命名与 12h 缓存生效！
    document.addEventListener(
      'mousedown',
      (e) => {
        const path = typeof e.composedPath === 'function' ? e.composedPath() : [e.target];
        const firstEl = path.find((n) => n && n.nodeType === 1);
        if (!firstEl || hostEl.contains?.(firstEl)) return;
        const btn = firstEl.closest?.('button, a, [role="button"], .weui-desktop-btn, span, div') || firstEl;
        const txt = (btn.textContent || '').replace(/\s+/g, '').trim();
        if (txt.length <= 12 && /(?:导出|下载)/.test(txt)) {
          pushExportHintToBackground({ btnEl: btn, enqueue: true });
        }
      },
      { capture: true, passive: true }
    );

    // SPA 路由切换感知（从首页/列表页进入发布页立即挂载，发布完成跳回列表页立即隐藏）& 页面定时时间变更实时监测
    let lastObservedHref = location.href;
    setInterval(() => {
      if (location.href !== lastObservedHref) {
        lastObservedHref = location.href;
        pendingExportConfirm = null;
        prePubState.syncedSig = '';
        prePubState.conflictConfirm = null;
        pushExportHintToBackground({ enqueue: false });
        render();
        if (isPublishPageContext()) {
          setTimeout(() => refreshFeishuPublishContext(true), 600);
        }
      } else if (isPublishPageContext()) {
        const curSched = detectPagePublishModeAndTime();
        const curTimeSig = `${curSched.mode}|${curSched.plannedAt}`;
        if (curTimeSig !== prePubState.lastTimeSig) {
          prePubState.lastTimeSig = curTimeSig;
          prePubState.conflictConfirm = null;
          render();
          if (!feishuState.loading && feishuState.configured) {
            refreshFeishuPublishContext(true);
          }
        }
      }
    }, 550);

    // 若由后台 /api/collect 下发了带 autoExport 的采集指令，进入数据页后默认触发作品导出（仍受 12h 防重保护）
    if (IS_CHROME_EXT && chrome.storage?.local && getDataCenterContext().isDataMode) {
      chrome.storage.local.get('ppf_collect_active_v1', (res) => {
        try {
          const raw = res?.ppf_collect_active_v1;
          if (!raw) return;
          const job = typeof raw === 'string' ? JSON.parse(raw) : raw;
          if (job?.autoExport && Date.now() < Number(job.expiresAt || 0)) {
            setTimeout(() => {
              runDimensionExport('works', { force: false });
            }, 2600);
          }
        } catch {
          // ignore
        }
      });
    }

    // 若本地 8765 桥接服务切换了新作品，或此前缓存的发布包因 publish_receipt.json 导致文案为空，自动静默拉取恢复！
    const cachedPlatEmpty =
      !currentPack.meta?.isPresetDefault &&
      !currentPack.meta?.localMissing &&
      (!currentPack.platforms?.[platform]?.body && !currentPack.platforms?.[platform]?.title);
    gmRequestJson(`${settings.bridgeUrl}/api/status`)
      .then((st) => {
        if (
          st &&
          st.hasActivePack &&
          ((st.packVersion && st.packVersion !== settings.lastBridgeVersion) || cachedPlatEmpty)
        ) {
          syncFromLocalBridge(true);
        }
      })
      .catch(() => {});
  }

  // ==================== 飞书跳板页 (127.0.0.1:8765/open & /review) 极速透传处理器 ====================
  async function handleFeishuLaunchpad() {
    // 1. Cutcheck 在线审片跳板页 (127.0.0.1:8765/review) 优先透传单文件令牌并跳往线上 Cutcheck
    const cutLaunchEl = document.getElementById('ppf-cutcheck-launchpad');
    if (cutLaunchEl) {
      cutLaunchEl.setAttribute('data-ext-handled', '1');
      const msgEl = document.getElementById('ppf-cutcheck-msg');
      if (msgEl) msgEl.textContent = '⚡ 插件已接管：正在打开线上 Cutcheck 并自动注入本机成片...';
      const targetUrl = cutLaunchEl.getAttribute('data-target-url') || '';
      const payload = {
        token: cutLaunchEl.getAttribute('data-review-token') || '',
        videoPath: cutLaunchEl.getAttribute('data-video-path') || '',
        fileName: cutLaunchEl.getAttribute('data-video-name') || '',
        size: Number(cutLaunchEl.getAttribute('data-video-size') || 0),
        mime: cutLaunchEl.getAttribute('data-video-mime') || 'video/mp4',
        lastModified: Number(cutLaunchEl.getAttribute('data-last-modified') || Date.now()),
        project: cutLaunchEl.getAttribute('data-project') || '',
        version: cutLaunchEl.getAttribute('data-version') || '',
        bridgeOrigin: location.origin,
        createdAt: Date.now(),
      };
      await xStorageSet(STORAGE_KEY_PENDING_CUTCHECK, JSON.stringify(payload));
      if (targetUrl) {
        if (IS_CHROME_EXT && chrome.runtime?.sendMessage) {
          chrome.runtime.sendMessage({ type: 'PPF_NAVIGATE_CLEAN_TABS', urls: [targetUrl] }, (resp) => {
            if (!resp || !resp.ok) {
              location.replace(targetUrl);
            }
          });
        } else {
          location.replace(targetUrl);
        }
      }
      return;
    }

    const launchEl = document.getElementById('ppf-feishu-launchpad');
    // 严格校验标识：普通本地开发项目 (localhost:3000/5173 等) 绝不挂载任何东西！
    if (!launchEl) return;

    launchEl.setAttribute('data-ext-handled', '1');
    const msgEl = document.getElementById('ppf-sync-msg');
    const setLaunchMsg = (txt) => {
      if (msgEl) msgEl.textContent = txt;
    };

    let targetUrls = [];
    try {
      targetUrls = JSON.parse(launchEl.getAttribute('data-target-urls') || '[]');
    } catch {
      targetUrls = [];
    }

    // 直接从飞书点击进入的 URL 参数 (?dir=...&account=...&cno=C00xxx&cid=...) 提取唯一排期身份，即使旧版 serve_pack.py 未重启也 100% 精准带入！
    const urlQs = new URLSearchParams(window.location.search || '');
    const qsDir = urlQs.get('dir') || urlQs.get('path') || '';
    const qsAccount = (urlQs.get('account') || urlQs.get('acct') || '').replace(/[.。]+$/, '').trim();
    const qsCSerialNo = (urlQs.get('cno') || urlQs.get('no') || '').trim();
    const qsCId = (urlQs.get('cid') || '').trim();
    const qsBId = (urlQs.get('bid') || '').trim();

    const launchAccount = launchEl.getAttribute('data-account') || qsAccount || '';
    const launchSlug = launchEl.getAttribute('data-work-slug') || extractWorkSlugFront(qsDir) || '';
    const launchCId = launchEl.getAttribute('data-c-record-id') || qsCId || '';
    const launchCSerialNo = launchEl.getAttribute('data-c-serial-no') || qsCSerialNo || '';
    const launchBId = launchEl.getAttribute('data-b-record-id') || qsBId || '';

    try {
      setLaunchMsg('⏳ 正在将当前作品《发布包》与配图透传至插件...');
      const origin = location.origin;
      const res = await fetch(`${origin}/api/pack`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        const effAccount = launchAccount || data.targetAccount || '';
        const effSlug = launchSlug || data.workSlug || extractWorkSlugFront(data.baseDir || data.folderName || '');
        const effCId = launchCId || data.cRecordId || '';
        const effCSerialNo = launchCSerialNo || data.cSerialNo || '';
        const effBId = launchBId || data.bRecordId || '';

        if (data.localMissing) {
          await xStorageClearByPrefix(CROSS_COVER_PREFIX);
          const cloudStub = {
            meta: {
              isPresetDefault: false,
              packTitle: effSlug || '待从飞书拉取云端文案...',
              mdFileName: '☁️ 飞书云端关联模式',
              format: 'cloud_pending',
              contentType: 'video',
              baseDir: '',
              workSlug: effSlug,
              cRecordId: effCId,
              cSerialNo: effCSerialNo,
              bRecordId: effBId,
              targetAccount: effAccount,
              localMissing: true,
              cloudFallback: true,
              updatedAt: new Date().toISOString(),
            },
            covers: [],
            images: [],
            platforms: {},
          };
          await xStorageSet(STORAGE_KEY_PACK, JSON.stringify(cloudStub));
          const curSettings = await loadSettings();
          curSettings.lastBridgeVersion = data.packVersion || '';
          curSettings.selectedTitleIdx = -1;
          curSettings.selectedCoverByPlat = {};
          await xStorageSet(STORAGE_KEY_SETTINGS, JSON.stringify(curSettings));
          setLaunchMsg('☁️ 本机暂无该目录，已绑定飞书排期并在目标发布页自动拉取云端兜底文案...');
        } else {
          const records = [];
          if (Array.isArray(data.covers) && data.covers.length > 0) {
            for (const rel of data.covers) {
              try {
                const imgRes = await fetch(`${origin}/api/file?path=${encodeURIComponent(rel)}`, { cache: 'no-store' });
                if (imgRes.ok) {
                  const blob = await imgRes.blob();
                  records.push({ relPath: rel, blob });
                }
              } catch {
                // ignore
              }
            }
            await saveCoversCrossPlatform(records);
          } else {
            await xStorageClearByPrefix(CROSS_COVER_PREFIX);
          }

          let fileName = data.packFile || data.mdFile || '';
          let rawContent = data.content || data.markdown || '';
          if (!isValidPublishPackContent(fileName, rawContent)) {
            fileName = '';
            rawContent = '';
            const fallbackPackNames = ['publish.pack.json', '发布包_v03.md', '发布包_v02.md', '发布包_v01.md', '发布包.md'];
            for (const candName of fallbackPackNames) {
              try {
                const fbRes = await fetch(`${origin}/api/file?path=${encodeURIComponent(candName)}`, { cache: 'no-store' });
                if (fbRes.ok) {
                  const fbText = await fbRes.text();
                  if (isValidPublishPackContent(candName, fbText)) {
                    fileName = candName;
                    rawContent = fbText;
                    break;
                  }
                }
              } catch {
                // continue probing
              }
            }
          }
          let parsed = null;
          if (rawContent) {
            const safeName = fileName || 'publish.pack.json';
            const isJson = /\.json$/i.test(safeName) || stripJsonCodeFence(rawContent).startsWith('{');
            parsed = isJson
              ? parsePublishPackJson(rawContent, { fileName: safeName, sourceLabel: safeName, baseDir: data.baseDir || '' })
              : parsePublishPackMarkdown(rawContent, { mdFileName: safeName, sourceLabel: safeName, baseDir: data.baseDir || '' });

            if (!isJson && data.subMarkdowns && typeof data.subMarkdowns === 'object') {
              for (const [subPath, subText] of Object.entries(data.subMarkdowns)) {
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
            }
          } else if (data.folderName || records.length > 0) {
            parsed = {
              meta: {
                packTitle: data.folderName || '已定位作品目录',
                mdFileName: '（仅媒体目录）',
                format: 'empty',
                contentType: 'video',
                baseDir: data.baseDir || '',
                updatedAt: new Date().toISOString(),
              },
              covers: [],
              images: [],
              platforms: {},
            };
          }

          if (parsed) {
            parsed.meta = {
              ...(parsed.meta || {}),
              isPresetDefault: false,
              workSlug: effSlug,
              cRecordId: effCId,
              cSerialNo: effCSerialNo,
              bRecordId: effBId,
              targetAccount: effAccount,
              localMissing: false,
              cloudFallback: false,
            };
            if (records.length > 0 && parsed.meta?.contentType !== 'image_post') {
              const recMap = new Map(records.map((r) => [r.relPath, r.blob]));
              parsed.covers = mergeCoversWithBlobs(parsed.covers, recMap, false);
              for (const c of parsed.covers) {
                const b = findBlobFlexible(recMap, c.relPath);
                if (b) {
                  c.ratio = await detectImageBlobRatio(b, c.ratio);
                  c._ratioVerified = true;
                }
              }
            }
            await xStorageSet(STORAGE_KEY_PACK, JSON.stringify(parsed));

            const curSettings = await loadSettings();
            curSettings.lastBridgeVersion = data.packVersion || '';
            curSettings.selectedTitleIdx = -1;
            curSettings.selectedCoverByPlat = {};
            await xStorageSet(STORAGE_KEY_SETTINGS, JSON.stringify(curSettings));
          }
          setLaunchMsg(`✅ 透传完成（含 ${records.length} 张配图）！正在前往目标发布后台...`);
        }
      }
    } catch {
      // 即使目录内暂无发布包文档，仍正常执行页面跳转
      setLaunchMsg('✅ Finder 已打开，正在前往目标发布后台...');
    }

    const navigateNoReferrer = (url) => {
      const a = document.createElement('a');
      a.href = url;
      a.rel = 'noreferrer noopener';
      a.referrerPolicy = 'no-referrer';
      document.body.appendChild(a);
      a.click();
    };

    if (targetUrls.length >= 1) {
      // Chrome 插件模式下：由后台 Service Worker 执行原生 chrome.tabs.create 并关闭本跳板页，
      // 确保目标页面请求头为 Sec-Fetch-Site: none、零 Referer、history.length === 1，与浏览器书签点击进入完全一致！
      if (IS_CHROME_EXT && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({ type: 'PPF_NAVIGATE_CLEAN_TABS', urls: targetUrls }, (resp) => {
          if (!resp || !resp.ok) {
            navigateNoReferrer(targetUrls[0]);
          }
        });
      } else {
        navigateNoReferrer(targetUrls[0]);
      }
    } else {
      setLaunchMsg('✅ Finder 已定位文件，且新作品已同步至所有已打开的发布页面！可关闭此标签页。');
    }
  }

  // ==================== Cutcheck 在线审片页 (cutcheck-alpha.vercel.app) 无感本机视频喂入器（零侧边栏干扰） ====================
  let cutcheckInjectRunning = false;
  async function handleCutcheckAutoLoad() {
    if (cutcheckInjectRunning) return;
    const hashStr = String(location.hash || '').replace(/^#/, '');
    if (!hashStr.includes('file=')) return;
    const hashParams = new URLSearchParams(hashStr);
    const hashFilePath = hashParams.get('file') || '';
    if (!hashFilePath) return;
    const expectedName = hashFilePath.split('/').pop() || '';

    let pending = null;
    try {
      const raw = await xStorageGet(STORAGE_KEY_PENDING_CUTCHECK, '');
      if (raw) pending = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
      pending = null;
    }
    if (!pending || !pending.token || !pending.fileName) return;
    if (Date.now() - Number(pending.createdAt || 0) > 15 * 60 * 1000) return;
    if (expectedName && pending.fileName !== expectedName) return;

    cutcheckInjectRunning = true;
    try {
      // 等待 Cutcheck 渲染出 #videoLinkNotice 提示框及隐藏的 input[type="file"]
      let noticeEl = null;
      let fileInp = null;
      for (let i = 0; i < 75; i++) {
        noticeEl = document.getElementById('videoLinkNotice');
        fileInp =
          document.getElementById('videoLinkFileInput') ||
          noticeEl?.querySelector?.('input[type="file"]') ||
          null;
        if (noticeEl && fileInp) break;
        await new Promise((r) => setTimeout(r, 80));
      }
      if (!noticeEl || !fileInp) return;

      const textEl = noticeEl.querySelector('p');
      const btnEl = noticeEl.querySelector('button');
      if (btnEl) btnEl.disabled = true;
      const updateProgress = (pct, modeLabel = '本机回环') => {
        if (textEl) {
          textEl.textContent = `⚡ 插件正在从${modeLabel}自动载入成片《${pending.fileName}》（${pct}% · 0字节上传外网）...`;
        }
      };
      updateProgress(0);

      const bridgeBase = String(pending.bridgeOrigin || BRIDGE_DEFAULT_URL).replace(/\/+$/, '');
      const totalBytes = Math.max(1, Number(pending.size || 0));
      let videoBlob = null;

      // 优先走直接本机 HTTP 回环流（~2GB/s 极速），若受浏览器 PNA 限制则自动切换扩展后台 8MB 分片流（免授权弹窗、突破 64MB 消息上限）
      try {
        const res = await fetch(`${bridgeBase}/api/review-video/${encodeURIComponent(pending.token)}`, {
          cache: 'no-store',
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        if (res.body && typeof res.body.getReader === 'function') {
          const reader = res.body.getReader();
          const chunks = [];
          let received = 0;
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              chunks.push(value);
              received += value.byteLength;
              updateProgress(Math.min(99, Math.round((received / totalBytes) * 100)));
            }
          }
          videoBlob = new Blob(chunks, { type: pending.mime || 'video/mp4' });
        } else {
          videoBlob = await res.blob();
        }
      } catch {
        // Fallback: 通过扩展后台 Service Worker 按 8MB 切片流式拉取组装
        if (!IS_CHROME_EXT) throw new Error('本地回环连接被浏览器拦截，请使用 Chrome 扩展版');
        const CHUNK_SIZE = 8 * 1024 * 1024;
        const chunks = [];
        let offset = 0;
        while (offset < totalBytes) {
          const end = Math.min(totalBytes - 1, offset + CHUNK_SIZE - 1);
          const resp = await sendExtMessage({
            type: 'PPF_FETCH_REVIEW_CHUNK',
            bridgeOrigin: bridgeBase,
            token: pending.token,
            start: offset,
            end,
          });
          const binStr = atob(resp.b64 || '');
          const bytes = new Uint8Array(binStr.length);
          for (let j = 0; j < binStr.length; j++) {
            bytes[j] = binStr.charCodeAt(j);
          }
          chunks.push(bytes);
          offset += bytes.byteLength || end - offset + 1;
          updateProgress(Math.min(99, Math.round((offset / totalBytes) * 100)), '扩展通道');
        }
        videoBlob = new Blob(chunks, { type: pending.mime || 'video/mp4' });
      }

      if (!videoBlob || videoBlob.size === 0) {
        throw new Error('读取到的本机视频内容为空');
      }

      updateProgress(100);
      await xStorageSet(STORAGE_KEY_PENDING_CUTCHECK, '');

      const fileObj = new File([videoBlob], pending.fileName, {
        type: pending.mime || 'video/mp4',
        lastModified: Number(pending.lastModified || Date.now()),
      });
      const dt = new DataTransfer();
      dt.items.add(fileObj);
      fileInp.files = dt.files;
      fileInp.dispatchEvent(new Event('change', { bubbles: true }));

      // 兼容旧版缓存的 Cutcheck PWA：若页面项目名/版本输入框仍为空，主动同步补齐并触发保存
      setTimeout(() => {
        const projInp = document.getElementById('sourceProjectName');
        const verInp = document.getElementById('sourceVersion');
        const pathInp = document.getElementById('sourcePath');
        let touched = false;
        if (projInp && !projInp.value && pending.project) {
          projInp.value = pending.project;
          touched = true;
        }
        if (verInp && !verInp.value && pending.version) {
          verInp.value = pending.version;
          touched = true;
        }
        if (pathInp && !pathInp.value && pending.videoPath) {
          pathInp.value = pending.videoPath;
          touched = true;
        }
        if (touched && projInp) {
          projInp.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }, 450);
    } catch (err) {
      const noticeEl = document.getElementById('videoLinkNotice');
      const textEl = noticeEl?.querySelector?.('p');
      const btnEl = noticeEl?.querySelector?.('button');
      if (btnEl) btnEl.disabled = false;
      if (textEl) {
        textEl.textContent = `⚠️ 自动载入未完成（${err?.message || err}），请点击右侧按钮手动选择：${hashFilePath}`;
      }
    } finally {
      cutcheckInjectRunning = false;
    }
  }

  if (location.hostname === '127.0.0.1' || location.hostname === 'localhost') {
    handleFeishuLaunchpad();
  } else if (location.hostname === 'cutcheck-alpha.vercel.app') {
    handleCutcheckAutoLoad();
    window.addEventListener('hashchange', () => handleCutcheckAutoLoad());
    if (IS_CHROME_EXT && chrome.storage?.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes[STORAGE_KEY_PENDING_CUTCHECK]?.newValue) {
          handleCutcheckAutoLoad();
        }
      });
    }
  } else {
    setTimeout(mountUI, 900);
  }
})();
