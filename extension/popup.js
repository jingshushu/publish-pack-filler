'use strict';

const STORAGE_KEY_PACK = 'ppf_current_pack_v1';
const STORAGE_KEY_SETTINGS = 'ppf_settings_v2';
const CROSS_COVER_PREFIX = 'ppf_xcover_v1::';

const URLS = [
  'https://creator.douyin.com/creator-micro/content/upload',
  'https://channels.weixin.qq.com/platform/post/list',
  'https://creator.xiaohongshu.com/publish/publish?source=official&from=menu&target=video',
  'https://member.bilibili.com/platform/upload/video/frame',
];

async function initPopup() {
  const titleEl = document.getElementById('pack-title');
  const coversEl = document.getElementById('pack-covers');

  try {
    const all = await chrome.storage.local.get(null);
    const rawPack = all[STORAGE_KEY_PACK];
    const coverKeys = Object.keys(all).filter((k) => k.startsWith(CROSS_COVER_PREFIX));

    if (rawPack) {
      const pack = typeof rawPack === 'string' ? JSON.parse(rawPack) : rawPack;
      titleEl.textContent = pack?.meta?.packTitle || '已加载发布包';
    } else {
      titleEl.textContent = '内置示例 · 《一座城的年轮 · 天津》';
    }

    coversEl.textContent =
      coverKeys.length > 0
        ? `✅ 已跨平台缓存 ${coverKeys.length} 张高清封面`
        : '💡 请在任意发布页右侧点击「选择成品包目录」载入封面';
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
