// Background Service Worker (Manifest V3)
// 1. 在扩展后台进程代理本地只读桥接请求 (127.0.0.1:8765)，与创作者中心网页网络栈彻底物理隔离。
// 2. 支持飞书跳板页 site=all 时多标签页齐开。

'use strict';

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || typeof msg !== 'object') return false;

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

  if (msg.type === 'PPF_NAVIGATE_CLEAN_TABS' && Array.isArray(msg.urls) && msg.urls.length > 0) {
    // 使用浏览器级原生新建标签页 (chrome.tabs.create，不传 openerTabId)：
    // 确保请求头为 Sec-Fetch-Site: none、零 Referer、window.opener === null、history.length === 1，
    // 与用户在浏览器书签栏/地址栏手动打开创作者后台 100% 一致，绝不带入 127.0.0.1 跳转痕迹。
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
          // ignore if tab already closed
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
