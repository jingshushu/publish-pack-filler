import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const scriptSource = fs.readFileSync(
  new URL('../publish-pack-filler.user.js', import.meta.url),
  'utf8'
);

function createExportTestDom(targetUrl, setupPageDomFn) {
  let lastShadowRoot = null;

  class MockElement {
    constructor(tagName = 'DIV') {
      this.tagName = String(tagName).toUpperCase();
      this.id = '';
      this.className = '';
      this.style = {};
      this.dataset = {};
      this.attributes = {};
      this.children = [];
      this.parentElement = null;
      this._textContent = '';
      this.value = '';
      this.disabled = false;
      this.isConnected = true;
      this.onclick = null;
      this.onchange = null;
      this.oninput = null;
      this.onmousedown = null;
      this._rect = { top: 80, left: 100, right: 200, bottom: 112, width: 100, height: 32 };
      this.nativeClickCount = 0;
      this.dispatchedEvents = [];
    }
    get textContent() {
      if (this.children.length === 0) return this._textContent;
      return this._textContent + this.children.map((c) => c.textContent).join('');
    }
    set textContent(v) {
      this._textContent = String(v ?? '');
      this.children = [];
    }
    set innerHTML(html) {
      this._innerHTML = String(html || '');
      this.children = [];
      const tagRe = /<(input|select|button|div|span|a)\b([^>]*)>([\s\S]*?)<\/\1>|<input\b([^>]*)\/?>/gi;
      let m;
      while ((m = tagRe.exec(this._innerHTML)) !== null) {
        const tag = (m[1] || 'input').toUpperCase();
        const attrs = m[2] || m[4] || '';
        const inner = m[3] || '';
        const child = new MockElement(tag);
        const idM = attrs.match(/\bid=["']([^"']+)["']/);
        if (idM) child.id = idM[1];
        const clsM = attrs.match(/\bclass=["']([^"']+)["']/);
        if (clsM) child.className = clsM[1];
        const valM = attrs.match(/\bvalue=["']([^"']*)["']/);
        if (valM) child.value = valM[1];
        child._innerHTML = inner;
        child._textContent = inner.replace(/<[^>]+>/g, '');
        child.parentElement = this;
        this.children.push(child);
      }
    }
    get innerHTML() {
      return this._innerHTML || this.children.map((c) => c.innerHTML || c.textContent).join('');
    }
    appendChild(child) {
      child.parentElement = this;
      child.isConnected = true;
      this.children.push(child);
      return child;
    }
    remove() {
      this.isConnected = false;
      if (this.parentElement) {
        this.parentElement.children = this.parentElement.children.filter((c) => c !== this);
      }
    }
    setAttribute(k, v) {
      this.attributes[k] = String(v);
      if (k === 'id') this.id = String(v);
      if (k === 'class') this.className = String(v);
    }
    getAttribute(k) {
      if (k === 'id') return this.id || null;
      if (k === 'class') return this.className || null;
      return this.attributes[k] ?? null;
    }
    attachShadow() {
      const sr = new MockElement('SHADOW-ROOT');
      const idMap = new Map();
      sr.getElementById = (id) => {
        const html = sr.children.map((c) => c.innerHTML).join('\n') + (sr._innerHTML || '');
        if (html.includes(`id="${id}"`) || html.includes(`id='${id}'`)) {
          if (!idMap.has(id)) idMap.set(id, new MockElement('BUTTON'));
          return idMap.get(id);
        }
        return null;
      };
      lastShadowRoot = sr;
      return sr;
    }
    findById(id) {
      if (this.id === id) return this;
      for (const c of this.children) {
        const hit = c.findById?.(id);
        if (hit) return hit;
      }
      return null;
    }
    matches(sel) {
      const parts = sel.split(',').map((s) => s.trim());
      for (const p of parts) {
        if (!p) continue;
        if (p.toUpperCase() === this.tagName) return true;
        if (p.startsWith('.') && String(this.className || '').split(/\s+/).includes(p.slice(1))) return true;
        if (p === '[role="button"]' && this.getAttribute('role') === 'button') return true;
        if (p === '[role="tab"]' && this.getAttribute('role') === 'tab') return true;
        if (p === '[role="dialog"]' && this.getAttribute('role') === 'dialog') return true;
        const clsContains = p.match(/^\[class\*=["']([^"']+)["'](?:\s+i)?\]$/);
        if (clsContains && String(this.className || '').toLowerCase().includes(clsContains[1].toLowerCase())) {
          return true;
        }
        const titleContains = p.match(/^\[title\*=["']([^"']+)["']\]$/);
        if (titleContains && String(this.getAttribute('title') || '').includes(titleContains[1])) {
          return true;
        }
        const ariaContains = p.match(/^\[aria-label\*=["']([^"']+)["']\]$/);
        if (ariaContains && String(this.getAttribute('aria-label') || '').includes(ariaContains[1])) {
          return true;
        }
      }
      return false;
    }
    closest(sel) {
      let cur = this;
      while (cur) {
        if (cur.matches?.(sel)) return cur;
        cur = cur.parentElement;
      }
      return null;
    }
    contains(other) {
      let cur = other;
      while (cur) {
        if (cur === this) return true;
        cur = cur.parentElement;
      }
      return false;
    }
    querySelectorAll(sel) {
      const out = [];
      const walk = (node) => {
        for (const c of node.children || []) {
          if (sel === '*' || c.matches?.(sel)) out.push(c);
          walk(c);
        }
      };
      walk(this);
      return out;
    }
    querySelector(sel) {
      return this.querySelectorAll(sel)[0] || null;
    }
    getBoundingClientRect() {
      return this._rect;
    }
    scrollIntoView() {}
    focus() {}
    dispatchEvent(ev) {
      this.dispatchedEvents.push(ev.type);
      if (ev.type === 'click' && typeof this.onclick === 'function') {
        this.onclick(ev);
      }
      return true;
    }
    click() {
      this.nativeClickCount++;
      if (typeof this.onclick === 'function') {
        this.onclick({ type: 'click', target: this });
      }
    }
  }

  const parsedUrl = new URL(targetUrl);
  const docEl = new MockElement('HTML');
  const bodyEl = new MockElement('BODY');
  docEl.appendChild(bodyEl);

  const hintsReceived = [];
  const simulatedDownloads = [];

  const doc = {
    documentElement: docEl,
    body: bodyEl,
    title: '数据中心',
    createElement: (t) => new MockElement(t),
    getElementById: (id) => docEl.findById(id),
    querySelectorAll: (sel) => docEl.querySelectorAll(sel),
    querySelector: (sel) => docEl.querySelector(sel),
    addEventListener: () => {},
    dispatchEvent: () => {},
  };

  class MockEvent {
    constructor(type, init = {}) {
      this.type = type;
      Object.assign(this, init);
    }
  }

  const win = {
    innerWidth: 1440,
    innerHeight: 900,
    screenX: 0,
    screenY: 0,
    MouseEvent: MockEvent,
    PointerEvent: MockEvent,
    Event: MockEvent,
    location: {
      href: parsedUrl.href,
      hostname: parsedUrl.hostname,
      pathname: parsedUrl.pathname,
      origin: parsedUrl.origin,
      search: parsedUrl.search,
      hash: parsedUrl.hash,
    },
    getComputedStyle: () => ({ position: 'static', display: 'block', visibility: 'visible', opacity: '1', cursor: 'pointer' }),
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  win.top = win;
  win.self = win;
  win.window = win;
  doc.defaultView = win;

  MockElement.prototype.ownerDocument = doc;

  const memStorage = {
    ppf_settings_v2: JSON.stringify({ exportAccountOverride: '靖蜀黍' }),
  };

  setupPageDomFn({ doc, bodyEl, MockElement, simulatedDownloads });

  const timers = [];
  const sandbox = {
    window: win,
    top: win,
    self: win,
    location: win.location,
    navigator: { userAgent: 'Mozilla/5.0 Macintosh Chrome/131.0' },
    URL: Object.assign(URL, { createObjectURL: () => 'blob:mock', revokeObjectURL: () => {} }),
    URLSearchParams,
    Blob: globalThis.Blob,
    document: doc,
    chrome: {
      storage: {
        local: {
          get: async (k) => (typeof k === 'string' ? { [k]: memStorage[k] } : { ...memStorage }),
          set: async (obj) => Object.assign(memStorage, obj),
          remove: async () => {},
        },
        onChanged: { addListener: () => {} },
      },
      runtime: {
        id: 'mock_ext_id_v253',
        lastError: null,
        getManifest: () => ({ version: '2.5.3' }),
        sendMessage: (msg, cb) => {
          if (msg.type === 'PPF_SET_EXPORT_HINT') {
            hintsReceived.push(msg);
            cb?.({ ok: true, account: msg.account });
            return;
          }
          if (msg.type === 'PPF_GET_RECENT_DOWNLOADS') {
            const items = simulatedDownloads.filter((d) => d.ts >= Number(msg.sinceTs || 0));
            cb?.({ ok: true, count: items.length, items });
            return;
          }
          if (msg.type === 'PPF_BRIDGE_EXPORT_TARGETS') {
            cb?.({
              ok: true,
              data: {
                ok: true,
                targets: [
                  {
                    account: '靖蜀黍',
                    areaDir: '2026_靖蜀黍',
                    destDir: '/mock/AIHub/2 AH领域·Areas/2026_靖蜀黍/05_数据复盘/数据导出',
                    relDir: '2 AH领域·Areas/2026_靖蜀黍/05_数据复盘/数据导出',
                  },
                ],
                matched: msg.account === '靖蜀黍',
                account: msg.account,
                destDir: '/mock/AIHub/2 AH领域·Areas/2026_靖蜀黍/05_数据复盘/数据导出',
                relDir: '2 AH领域·Areas/2026_靖蜀黍/05_数据复盘/数据导出',
              },
            });
            return;
          }
          cb?.({ ok: true, data: {} });
        },
      },
    },
    // Speed up sleeps immediately in unit test
    setTimeout: (fn) => {
      timers.push(fn);
      Promise.resolve().then(() => {
        const idx = timers.indexOf(fn);
        if (idx >= 0) {
          timers.splice(idx, 1);
          fn();
        }
      });
      return 1;
    },
    clearTimeout: () => {},
    setInterval: () => 1,
    clearInterval: () => {},
    console,
    Date,
    Math,
    JSON,
    Promise,
    Map,
    Set,
    WeakMap,
    Number,
    String,
    Boolean,
    Array,
    Object,
    RegExp,
    Error,
  };

  vm.createContext(sandbox);
  vm.runInContext(scriptSource, sandbox);

  return {
    getShadow: () => lastShadowRoot,
    hintsReceived,
    simulatedDownloads,
    waitSettled: async () => {
      for (let i = 0; i < 12; i++) {
        await new Promise((r) => setImmediate(r));
      }
    },
  };
}

// ==================== Test A: 小红书「账号概览」外层容器包裹陷阱 + 4 Tab 逐一触发真实 .click() ====================
let xhsOuterWrap = null;
let xhsInnerBtn = null;
const xhsTabs = [];

const xhsEnv = createExportTestDom('https://creator.xiaohongshu.com/statistics/account/v2', ({ bodyEl, MockElement, simulatedDownloads }) => {
  const tabBar = new MockElement('DIV');
  tabBar._rect = { top: 140, left: 80, right: 680, bottom: 180, width: 600, height: 40 };
  ['观看数据', '互动数据', '涨粉数据', '发布数据'].forEach((name, idx) => {
    const t = new MockElement('DIV');
    t.className = idx === 0 ? 'd-tab is-active' : 'd-tab';
    t.setAttribute('role', 'tab');
    t.textContent = name;
    t._rect = { top: 144, left: 90 + idx * 110, right: 180 + idx * 110, bottom: 176, width: 90, height: 32 };
    t.onclick = () => {
      xhsTabs.forEach((other) => {
        other.className = 'd-tab';
      });
      t.className = 'd-tab is-active';
    };
    xhsTabs.push(t);
    tabBar.appendChild(t);
  });
  bodyEl.appendChild(tabBar);

  // 复现小红书账号概览真实陷阱：外层宽度 220px 的空白槽位 div 包裹着内层真正的 <button class="d-button">导出数据</button>
  xhsOuterWrap = new MockElement('DIV');
  xhsOuterWrap.className = 'header-extra-slot';
  xhsOuterWrap._rect = { top: 142, left: 760, right: 980, bottom: 178, width: 220, height: 36 };

  xhsInnerBtn = new MockElement('BUTTON');
  xhsInnerBtn.className = 'd-button';
  xhsInnerBtn._rect = { top: 144, left: 890, right: 978, bottom: 176, width: 88, height: 32 };
  const spanTxt = new MockElement('SPAN');
  spanTxt.textContent = '导出数据';
  spanTxt._rect = { top: 148, left: 902, right: 966, bottom: 172, width: 64, height: 24 };
  xhsInnerBtn.appendChild(spanTxt);
  xhsInnerBtn.onclick = () => {
    simulatedDownloads.push({ ts: Date.now(), filename: `W47_20261120导出_小红书_靖蜀黍_近7日数据.xlsx` });
  };

  xhsOuterWrap.appendChild(xhsInnerBtn);
  bodyEl.appendChild(xhsOuterWrap);
});

await xhsEnv.waitSettled();
const xhsShadow = xhsEnv.getShadow();
assert.ok(xhsShadow, '小红书账号概览页必须成功挂载导表面板');
await xhsShadow.getElementById('ppf-btn-exp-account').onclick();
await xhsEnv.waitSettled();

assert.equal(xhsOuterWrap.nativeClickCount, 0, '严禁误点外层空白包装容器 div');
assert.equal(xhsInnerBtn.nativeClickCount, 4, '必须穿透外层 div 精准对内层真实 <button> 调用 4 次原生 .click()（观看/互动/涨粉/发布）');
const xhsEnqueuedHints = xhsEnv.hintsReceived.filter((h) => h.enqueue);
assert.deepEqual(
  xhsEnqueuedHints.map((h) => h.section),
  ['观看数据', '互动数据', '涨粉数据', '发布数据'],
  '4 次导出提示必须依次精确标记观看/互动/涨粉/发布分栏'
);

// ==================== Test B: 抖音「数据中心」防重验证：点「📊 账号」与「🎬 作品」绝不重复点同一张概览表 ====================
let dyOverviewBtn = null;
let dyModalWorksBtn = null;

const dyEnv = createExportTestDom('https://creator.douyin.com/creator-micro/data-center/operation', ({ bodyEl, MockElement, simulatedDownloads }) => {
  // 顶部「核心数据」概览卡片 + 导出数据按钮（导出《短视频全量指标》）
  const topCard = new MockElement('DIV');
  topCard.className = 'overview-card';
  topCard._rect = { top: 120, left: 100, right: 1100, bottom: 420, width: 1000, height: 300 };
  const h3 = new MockElement('H3');
  h3.textContent = '核心数据';
  h3._rect = { top: 130, left: 120, right: 240, bottom: 160, width: 120, height: 30 };
  topCard.appendChild(h3);

  dyOverviewBtn = new MockElement('BUTTON');
  dyOverviewBtn.className = 'semi-button';
  dyOverviewBtn.textContent = '导出数据';
  dyOverviewBtn._rect = { top: 132, left: 980, right: 1076, bottom: 164, width: 96, height: 32 };
  dyOverviewBtn.onclick = () => {
    simulatedDownloads.push({ ts: Date.now(), filename: 'W47_20261120导出_抖音_靖蜀黍_近7日_短视频全量指标.xlsx' });
  };
  topCard.appendChild(dyOverviewBtn);
  bodyEl.appendChild(topCard);

  // 页面中部的「查看所有作品 >」入口：点击后动态挂载全量作品弹窗（含 16 列表格与作品列表导出按钮）
  const viewAllBtn = new MockElement('SPAN');
  viewAllBtn.textContent = '查看所有作品>';
  viewAllBtn._rect = { top: 460, left: 960, right: 1070, bottom: 488, width: 110, height: 28 };
  viewAllBtn.onclick = () => {
    const modal = new MockElement('DIV');
    modal.className = 'semi-modal-content';
    modal.setAttribute('role', 'dialog');
    modal._rect = { top: 160, left: 140, right: 1260, bottom: 820, width: 1120, height: 660 };

    dyModalWorksBtn = new MockElement('BUTTON');
    dyModalWorksBtn.className = 'semi-button';
    dyModalWorksBtn.textContent = '导出数据';
    // 故意让弹窗内导出按钮的 top (210) 比背景页概览按钮的 top (132) 更大，验证绝不会按 top 误点背景概览按钮！
    dyModalWorksBtn._rect = { top: 210, left: 1120, right: 1216, bottom: 242, width: 96, height: 32 };
    dyModalWorksBtn.onclick = () => {
      simulatedDownloads.push({ ts: Date.now(), filename: 'W47_20261120导出_抖音_靖蜀黍_作品列表导出.xlsx' });
    };
    modal.appendChild(dyModalWorksBtn);

    const tbl = new MockElement('TABLE');
    tbl._rect = { top: 260, left: 160, right: 1240, bottom: 780, width: 1080, height: 520 };
    const th1 = new MockElement('TH');
    th1.textContent = '作品名称';
    const th2 = new MockElement('TH');
    th2.textContent = '播放量';
    tbl.appendChild(th1);
    tbl.appendChild(th2);
    modal.appendChild(tbl);
    bodyEl.appendChild(modal);
  };
  bodyEl.appendChild(viewAllBtn);
});

await dyEnv.waitSettled();
const dyShadow = dyEnv.getShadow();

// 1) 点击「📊 账号」：严格只点 1 次顶部概览按钮
await dyShadow.getElementById('ppf-btn-exp-account').onclick();
await dyEnv.waitSettled();
assert.equal(dyOverviewBtn.nativeClickCount, 1, '抖音点「📊 账号」必须只点击 1 次顶部短视频全量指标按钮');

// 2) 点击「🎬 作品」：必须自动展开「查看所有作品>」弹窗并点击弹窗内的《作品列表导出》按钮，绝不能再次点击顶部概览按钮！
await dyShadow.getElementById('ppf-btn-exp-works').onclick();
await dyEnv.waitSettled();
assert.equal(dyOverviewBtn.nativeClickCount, 1, '抖音点「🎬 作品」严禁再次点击顶部《短视频全量指标》按钮（彻底根治重复下载）');
assert.ok(dyModalWorksBtn && dyModalWorksBtn.nativeClickCount === 1, '抖音点「🎬 作品」必须精准点击展开后的作品明细表导出按钮');

console.log('✅ Xiaohongshu 4-Tab Account Export & Douyin Non-Duplicate Account/Works Export Tests ALL PASSED!');
