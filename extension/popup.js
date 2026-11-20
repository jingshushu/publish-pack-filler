'use strict';

const STORAGE_KEY_PACK = 'ppf_current_pack_v1';
const STORAGE_KEY_SETTINGS = 'ppf_settings_v2';
const STORAGE_KEY_DEVICE_ID = 'ppf_device_id_v1';
const CROSS_COVER_PREFIX = 'ppf_xcover_v1::';
const FEISHU_FEEDBACK_FORM_URL = 'https://my.feishu.cn/share/base/shrcnRMlf6gosr0Werh6Oazu3Q9';

const URLS = [
  'https://creator.douyin.com/creator-micro/content/upload',
  'https://channels.weixin.qq.com/platform/post/create',
  'https://creator.xiaohongshu.com/publish/publish?source=official&from=menu&target=video',
  'https://member.bilibili.com/platform/upload/video/frame',
];

async function getOrCreateDeviceId(allStore) {
  let devId = String(allStore?.[STORAGE_KEY_DEVICE_ID] || '').trim();
  if (!devId || !devId.startsWith('ppf_')) {
    let rand = '';
    for (let i = 0; i < 10; i++) rand += Math.floor(Math.random() * 36).toString(36);
    devId = `ppf_${rand}`;
    await chrome.storage.local.set({ [STORAGE_KEY_DEVICE_ID]: devId });
  }
  return devId;
}

function detectRuntimeOsAndBrowser() {
  const ua = navigator.userAgent || '';
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

async function initPopup() {
  const titleEl = document.getElementById('pack-title');
  const coversEl = document.getElementById('pack-covers');

  const verEl = document.getElementById('popup-ver');
  const mfVer = chrome.runtime.getManifest?.()?.version || '2.5.3';
  if (verEl) verEl.textContent = `v${mfVer}`;

  let cachedStore = {};
  let coverCount = 0;
  try {
    const all = await chrome.storage.local.get(null);
    cachedStore = all || {};
    const rawPack = all[STORAGE_KEY_PACK];
    const coverKeys = Object.keys(all).filter((k) => k.startsWith(CROSS_COVER_PREFIX));
    coverCount = coverKeys.length;

    if (rawPack) {
      const pack = typeof rawPack === 'string' ? JSON.parse(rawPack) : rawPack;
      titleEl.textContent = pack?.meta?.packTitle || '已加载发布包';
    } else {
      titleEl.textContent = '内置示例 · 《一座城的年轮 · 天津》';
    }

    coversEl.textContent =
      coverKeys.length > 0
        ? `✅ 已跨平台缓存 ${coverKeys.length} 张高清封面`
        : '💡 从飞书点击「去发布」即可自动同步本地封面';
  } catch {
    titleEl.textContent = '就绪';
    coversEl.textContent = '';
  }

  document.querySelectorAll('.plat-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const url = btn.getAttribute('data-url');
      if (url) chrome.tabs.create({ url });
    });
  });

  document.getElementById('open-all').addEventListener('click', () => {
    for (const url of URLS) {
      chrome.tabs.create({ url, active: false });
    }
  });

  const dataBtn = document.getElementById('open-data-centers');
  if (dataBtn) {
    dataBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage(
        { type: 'PPF_OPEN_DATA_CENTERS', platforms: ['xhs', 'wx', 'bili', 'dy'], autoExport: false },
        () => window.close()
      );
    });
  }

  const optBtn = document.getElementById('open-options');
  if (optBtn) {
    optBtn.addEventListener('click', () => {
      if (chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage(() => window.close());
      } else {
        chrome.tabs.create({ url: chrome.runtime.getURL('options.html') });
      }
    });
  }

  const fbBtn = document.getElementById('open-feedback');
  if (fbBtn) {
    fbBtn.addEventListener('click', async () => {
      const deviceId = await getOrCreateDeviceId(cachedStore);
      const rawSettings = cachedStore[STORAGE_KEY_SETTINGS];
      const st = rawSettings ? (typeof rawSettings === 'string' ? JSON.parse(rawSettings) : rawSettings) : {};
      const layoutLabel = st.layoutMode === 'float' ? '自由悬浮窗' : '右侧分屏停靠';
      const rawFs = cachedStore.ppf_feishu_config_v2 || cachedStore.ppf_feishu_config_v1;
      const fsCfg = rawFs ? (typeof rawFs === 'string' ? JSON.parse(rawFs) : rawFs) : {};
      const diag = `feishu:${fsCfg?.enabled ? 'configured' : 'unconfigured'} | covers:${coverCount} | layout:${layoutLabel}`;
      const fields = {
        所属产品: '全平台发布助手',
        产品代号: 'publish-pack-filler',
        产品形态: '浏览器插件',
        版本号: mfVer,
        页面路径: '[插件弹窗] popup.html',
        运行环境: `${detectRuntimeOsAndBrowser()} · ${layoutLabel}`,
        设备标识: deviceId,
        诊断信息: diag.slice(0, 280),
      };
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(fields)) {
        qs.set(`prefill_${k}`, String(v));
        qs.set(`hide_${k}`, '1');
      }
      chrome.tabs.create({ url: `${FEISHU_FEEDBACK_FORM_URL}?${qs.toString()}` }, () => window.close());
    });
  }

  document.getElementById('toggle-panel').addEventListener('click', async () => {
    try {
      const res = await chrome.storage.local.get(STORAGE_KEY_SETTINGS);
      const raw = res[STORAGE_KEY_SETTINGS];
      const settings = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : {};
      settings.collapsed = !settings.collapsed;
      await chrome.storage.local.set({ [STORAGE_KEY_SETTINGS]: JSON.stringify(settings) });
      window.close();
    } catch {
      window.close();
    }
  });
}

document.addEventListener('DOMContentLoaded', initPopup);
