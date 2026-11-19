// Background Service Worker (Manifest V3 · v2.0.5)
// 1. 内置纯 JS 飞书/Lark OpenAPI 直连引擎 (feishu_client.js)，零本地 Python/CLI 强依赖，跨设备 5 秒激活。
// 2. 在扩展后台进程代理可选本地桥接请求 (127.0.0.1:8765)，与创作者中心网页网络栈彻底物理隔离。
// 3. 内置四端创作者数据中心采集指令接收器与下载瞬间标准重命名。

'use strict';

importScripts('feishu_client.js?v=2.0.5');

const BRIDGE_BASE = 'http://127.0.0.1:8765';
const DATA_CENTER_URLS = {
  xhs: [
    'https://creator.xiaohongshu.com/statistics/data-analysis?source=official',
    'https://creator.xiaohongshu.com/statistics/account/v2?source=official',
  ],
  wx: [
    'https://channels.weixin.qq.com/platform/statistic/post',
    'https://channels.weixin.qq.com/platform/statistic/follower',
  ],
  bili: [
    'https://member.bilibili.com/platform/data-up/video',
  ],
  dy: [
    'https://creator.douyin.com/creator-micro/data-center/operation',
    'https://creator.douyin.com/creator-micro/content/manage',
  ],
};

const PLAT_CN_MAP = {
  xiaohongshu: '小红书',
  douyin: '抖音',
  weixin: '视频号',
  bilibili: 'B站',
};

// 记录各平台最近识别到的创作者账号简称 & 点击导出按钮时的上下文队列（完全同步读取，确保 onDeterminingFilename 零延迟）
const lastAccountByPlat = {
  xiaohongshu: '',
  douyin: '',
  weixin: '',
  bilibili: '',
};
let lastExportHint = { platform: '', account: '', section: '', period: '', ts: 0 };
let exportHintQueue = [];
let recentGenericDataCount = { ts: 0, count: 0 };
const managedCreatorDownloadIds = new Set();
let autoArchiveTimer = null;

chrome.storage.local.get('ppf_last_accounts_by_plat_v1', (res) => {
  try {
    const saved = res?.ppf_last_accounts_by_plat_v1;
    const parsed = typeof saved === 'string' ? JSON.parse(saved) : saved;
    if (parsed && typeof parsed === 'object') {
      Object.assign(lastAccountByPlat, parsed);
    }
  } catch {
    // ignore
  }
});

function getIsoWeekAndYmd(d = new Date()) {
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((tmp - yearStart) / 86400000) + 1) / 7);
  return { weekStr: `W${String(weekNo).padStart(2, '0')}`, ymd };
}

function detectCreatorPlatformFromDownload(item) {
  const probe = `${item.referrer || ''} ${item.finalUrl || ''} ${item.url || ''}`.toLowerCase();
  if (/xiaohongshu\.com|xhscdn\.com/.test(probe)) return 'xiaohongshu';
  if (/douyin\.com|snssdk\.com|zijieapi\.com|bytedance\.com|byteimg\.com|volces\.com|tos-cn/.test(probe)) return 'douyin';
  if (/channels\.weixin\.qq\.com|finder\.video\.qq\.com|weixin\.qq\.com/.test(probe)) return 'weixin';
  if (/bilibili\.com|hdslb\.com|bilivideo\.com/.test(probe)) return 'bilibili';
  // 针对页面 Blob / Data URL 导出（如 DOM 兜底 CSV 或前端 Blob 生成的 xlsx），仅在最近 25s 有明确创作者后台导出动作时匹配
  if (/^(?:blob:|data:)/.test(item.url || '') && Date.now() - (lastExportHint.ts || 0) < 25_000 && lastExportHint.platform) {
    return lastExportHint.platform;
  }
  return '';
}

function sanitizeFileToken(str) {
  return String(str || '')
    .replace(/[\\/:*?"<>|\r\n\t]+/g, '')
    .replace(/\s+/g, '')
    .trim();
}

if (chrome.downloads && chrome.downloads.onDeterminingFilename) {
  chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
    try {
      const baseName = String(item.filename || '').split(/[/\\]/).pop() || '';
      const extMatch = baseName.match(/\.(xlsx|csv)$/i);
      if (!extMatch) return;

      const platKey = detectCreatorPlatformFromDownload(item);
      if (!platKey) return;
      if (typeof item.id === 'number') {
        managedCreatorDownloadIds.add(item.id);
      }

      // 若已是标准命名格式则仅去重覆盖，不二次包裹
      if (/^W\d{2}_\d{8}导出_/.test(baseName)) {
        suggest({ filename: baseName, conflictAction: 'overwrite' });
        return;
      }

      const ext = extMatch[0].toLowerCase();
      let rawStem = baseName.slice(0, -ext.length);
      // 去除浏览器重复后缀 (1) / (2) 及前端兜底日期前缀
      rawStem = rawStem
        .replace(/\s*\(\d+\)\s*$/, '')
        .replace(/^\d{8}_(?:小红书|抖音|视频号|微信视频号|B站)_/, '')
        .replace(/\s+/g, '')
        .trim();

      const now = Date.now();
      exportHintQueue = exportHintQueue.filter((h) => now - h.ts < 30_000);
      let matchedHint = null;
      const qIdx = exportHintQueue.findIndex((h) => !h.platform || h.platform === platKey);
      if (qIdx >= 0) {
        matchedHint = exportHintQueue.splice(qIdx, 1)[0];
      } else if (now - (lastExportHint.ts || 0) < 30_000 && (!lastExportHint.platform || lastExportHint.platform === platKey)) {
        matchedHint = lastExportHint;
      }

      const hintSection = matchedHint?.section || '';
      const hintPeriod = sanitizeFileToken(matchedHint?.period || '');
      const acctShort =
        sanitizeFileToken(matchedHint?.account || lastAccountByPlat[platKey] || '') || '创作者账号';

      let reportName = sanitizeFileToken(rawStem) || '数据导出';

      if (reportName.toLowerCase() === 'data') {
        // 抖音运营数据页下方两张表默认均叫 data.xlsx（上：投稿总结，下：投稿列表）
        if (/投稿总结|周期汇总|投稿周期/.test(hintSection)) {
          reportName = '投稿周期汇总';
        } else if (/投稿列表|视频列表|作品表现/.test(hintSection)) {
          reportName = '投稿列表表现';
        } else {
          if (now - recentGenericDataCount.ts > 15_000) {
            recentGenericDataCount = { ts: now, count: 0 };
          }
          recentGenericDataCount.count += 1;
          recentGenericDataCount.ts = now;
          reportName = recentGenericDataCount.count === 1 ? '投稿周期汇总' : '投稿列表表现';
        }
      } else if (reportName.startsWith('数据表现_')) {
        const core = reportName.replace(/^数据表现_/, '');
        reportName = hintPeriod && !/近\d+[天日]/.test(core) ? `${hintPeriod}_${core}` : core;
      } else if (reportName === '近30天数据趋势') {
        reportName = /收益|充电|激励/.test(hintSection) ? '近30天收益趋势' : '近30天播放互动趋势';
      } else if (
        hintPeriod &&
        !/近\d+[天日]/.test(reportName) &&
        !/列表|明细|稿件/.test(reportName)
      ) {
        reportName = `${hintPeriod}_${reportName}`;
      }

      const { weekStr, ymd } = getIsoWeekAndYmd(new Date());
      const platCn = PLAT_CN_MAP[platKey] || platKey;
      const finalFilename = `${weekStr}_${ymd}导出_${platCn}_${acctShort}_${reportName}${ext}`;
      suggest({ filename: finalFilename, conflictAction: 'overwrite' });

      // 异步写入本地导出时间缓存（用于 12 小时内防重二次确认提示）
      const dim =
        matchedHint?.dimension ||
        (/列表|明细|稿件对比|单篇/.test(reportName) ? 'works' : 'account');
      const cacheKey = `${platKey}|${acctShort}|${dim}`;
      chrome.storage.local.get('ppf_export_cache_v1', (res) => {
        try {
          const prev = res?.ppf_export_cache_v1;
          const map = (typeof prev === 'string' ? JSON.parse(prev) : prev) || {};
          map[cacheKey] = { ts: Date.now(), fileName: finalFilename, reportName };
          chrome.storage.local.set({ ppf_export_cache_v1: map });
        } catch {
          // ignore
        }
      });
    } catch {
      // 出错时放行浏览器原始文件名，绝不阻断下载
    }
  });

  // 下载阶段自动前置归档：报表落盘完成的瞬间，自动通过本地桥接移入对应账号 /05_数据复盘/数据导出/ 统一同步管理！
  if (chrome.downloads.onChanged) {
    chrome.downloads.onChanged.addListener((delta) => {
      if (!delta || !managedCreatorDownloadIds.has(delta.id)) return;
      if (delta.state?.current === 'complete') {
        managedCreatorDownloadIds.delete(delta.id);
        if (autoArchiveTimer) clearTimeout(autoArchiveTimer);
        autoArchiveTimer = setTimeout(async () => {
          try {
            const res = await fetch(`${BRIDGE_BASE}/api/archive-downloads`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json; charset=utf-8' },
              body: JSON.stringify({ brand: 'auto', hours: 2, move: true }),
            });
            if (res.ok) {
              const data = await res.json();
              if (data?.ok && data.archived_count > 0) {
                chrome.storage.local.set({
                  ppf_last_auto_archive_v1: {
                    ts: Date.now(),
                    count: data.archived_count,
                    destDir: data.dest_dir || '',
                    files: data.files || [],
                  },
                });
              }
            }
          } catch {
            // 若本机桥接未开启，则保留在 ~/Downloads，待复盘阶段由 ingest-review 第0步自动前置归档兜底
          }
        }, 1200);
      } else if (delta.state?.current === 'interrupted') {
        managedCreatorDownloadIds.delete(delta.id);
      }
    });
  }
}

function flattenDataCenterUrls(plats) {
  const out = [];
  for (const p of plats) {
    const u = DATA_CENTER_URLS[p];
    if (Array.isArray(u)) out.push(u[0]);
    else if (u) out.push(u);
  }
  return out;
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function pollCollectQueue() {
  try {
    const res = await fetch(`${BRIDGE_BASE}/api/collect`, { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    const pending = Array.isArray(data?.pending) ? data.pending : [];
    if (!pending.length) return;

    for (const job of pending) {
      await fetch(`${BRIDGE_BASE}/api/collect/ack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: job.jobId }),
      });
      await chrome.storage.local.set({
        ppf_collect_active_v1: JSON.stringify({
          jobId: job.jobId,
          autoExport: Boolean(job.autoExport),
          expiresAt: Date.now() + 90_000,
        }),
      });
      const urls = Array.isArray(job.urls) && job.urls.length > 0
        ? job.urls
        : flattenDataCenterUrls(['xhs', 'wx', 'bili', 'dy']);
      for (let i = 0; i < urls.length; i++) {
        await chrome.tabs.create({ url: urls[i], active: i === 0 });
      }
    }
  } catch {
    // 本地桥接服务未开启时静默忽略
  }
}

if (chrome.alarms) {
  chrome.alarms.create('ppf_poll_collect', { periodInMinutes: 1.0 });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'ppf_poll_collect') {
      pollCollectQueue();
    }
  });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || typeof msg !== 'object') return false;

  // ==================== 飞书直连引擎消息路由 (v2.0 跨设备自包含) ====================
  if (msg.type === 'PPF_OPEN_OPTIONS_PAGE') {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage(() => sendResponse({ ok: true }));
    } else {
      chrome.tabs.create({ url: chrome.runtime.getURL('options.html') }, () => sendResponse({ ok: true }));
    }
    return true;
  }

  if (msg.type === 'PPF_FEISHU_GET_CONFIG') {
    self.PPFFeishuClient.loadFeishuConfig()
      .then((config) => sendResponse({ ok: true, config }))
      .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
    return true;
  }

  if (msg.type === 'PPF_FEISHU_SAVE_CONFIG') {
    self.PPFFeishuClient.saveFeishuConfig(msg.config || {})
      .then((config) => sendResponse({ ok: true, config }))
      .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
    return true;
  }

  if (msg.type === 'PPF_FEISHU_EXPORT_CODE') {
    self.PPFFeishuClient.loadFeishuConfig()
      .then((cfg) => {
        const code = self.PPFFeishuClient.exportFeishuConfigCode(msg.config || cfg, {
          includeSecret: msg.includeSecret !== false,
        });
        sendResponse({ ok: true, code });
      })
      .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
    return true;
  }

  if (msg.type === 'PPF_FEISHU_IMPORT_CODE') {
    (async () => {
      const parsedCfg = self.PPFFeishuClient.importFeishuConfigCode(msg.code || '');
      const result = await self.PPFFeishuClient.discoverAndSaveSchema(parsedCfg);
      sendResponse({ ok: true, ...result });
    })().catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
    return true;
  }

  if (msg.type === 'PPF_FEISHU_DISCOVER') {
    self.PPFFeishuClient.discoverAndSaveSchema(msg.config || {})
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
    return true;
  }

  if (msg.type === 'PPF_FEISHU_ENSURE_SNAPSHOT_COL') {
    self.PPFFeishuClient.ensurePackSnapshotColumn()
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
    return true;
  }

  if (msg.type === 'PPF_FEISHU_QUERY_CONTEXT') {
    self.PPFFeishuClient.queryFeishuPublishContext(msg.params || {})
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
    return true;
  }

  if (msg.type === 'PPF_FEISHU_SYNC_PUBLISH') {
    self.PPFFeishuClient.syncPrePublishToFeishu(msg.payload || {})
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
    return true;
  }

  if (msg.type === 'PPF_SET_EXPORT_HINT') {
    const plat = String(msg.platform || '');
    const acct = sanitizeFileToken(msg.account || '');
    if (plat && acct) {
      lastAccountByPlat[plat] = acct;
      chrome.storage.local.set({ ppf_last_accounts_by_plat_v1: lastAccountByPlat });
    }
    const entry = {
      platform: plat,
      account: acct || (plat ? lastAccountByPlat[plat] : ''),
      section: String(msg.section || ''),
      period: String(msg.period || ''),
      dimension: String(msg.dimension || ''),
      ts: Date.now(),
    };
    lastExportHint = entry;
    if (msg.enqueue) {
      exportHintQueue = exportHintQueue.filter((h) => Date.now() - h.ts < 30_000);
      exportHintQueue.push(entry);
    }
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === 'PPF_BRIDGE_JSON') {
    fetch(msg.url, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        sendResponse({ ok: true, data });
      })
      .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
    return true;
  }

  if (msg.type === 'PPF_BRIDGE_POST') {
    fetch(msg.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(msg.body || {}),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.ok === false) {
          throw new Error(data?.error || `HTTP ${res.status}`);
        }
        sendResponse({ ok: true, data });
      })
      .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
    return true;
  }

  if (msg.type === 'PPF_BRIDGE_BLOB') {
    fetch(msg.url, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const mime = res.headers.get('content-type') || 'image/png';
        const buf = await res.arrayBuffer();
        const dataUrl = `data:${mime};base64,${arrayBufferToBase64(buf)}`;
        sendResponse({ ok: true, dataUrl });
      })
      .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
    return true;
  }

  if (msg.type === 'PPF_OPEN_DATA_CENTERS') {
    const plats = Array.isArray(msg.platforms) && msg.platforms.length
      ? msg.platforms
      : ['xhs', 'wx', 'bili', 'dy'];
    (async () => {
      await chrome.storage.local.set({
        ppf_collect_active_v1: JSON.stringify({
          jobId: `manual_${Date.now()}`,
          autoExport: Boolean(msg.autoExport),
          expiresAt: Date.now() + 90_000,
        }),
      });
      const urls = flattenDataCenterUrls(plats);
      for (let i = 0; i < urls.length; i++) {
        await chrome.tabs.create({ url: urls[i], active: i === 0 });
      }
      sendResponse({ ok: true });
    })().catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
    return true;
  }

  if (msg.type === 'PPF_NAVIGATE_CLEAN_TABS' && Array.isArray(msg.urls) && msg.urls.length > 0) {
    const baseIndex = _sender?.tab?.index;
    const launchTabId = _sender?.tab?.id;
    (async () => {
      for (let i = 0; i < msg.urls.length; i++) {
        const createProps = { url: msg.urls[i], active: i === 0 };
        if (typeof baseIndex === 'number') {
          createProps.index = baseIndex + i + 1;
        }
        await chrome.tabs.create(createProps);
      }
      if (typeof launchTabId === 'number') {
        try {
          await chrome.tabs.remove(launchTabId);
        } catch {
          // ignore
        }
      }
      sendResponse({ ok: true });
    })().catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
    return true;
  }

  if (msg.type === 'PPF_OPEN_EXTRA_TABS' && Array.isArray(msg.urls)) {
    Promise.all(msg.urls.map((url) => chrome.tabs.create({ url, active: false })))
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
    return true;
  }

  return false;
});
