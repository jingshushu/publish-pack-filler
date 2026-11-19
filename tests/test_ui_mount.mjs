import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const scriptSource = fs.readFileSync(
  new URL('../publish-pack-filler.user.js', import.meta.url),
  'utf8'
);

function createMockDomEnv(targetUrl, feishuConfigured = true) {
  let lastShadowRoot = null;
  let innerHtmlStore = new WeakMap();

  class MockElement {
    constructor(tag = 'DIV') {
      this.tagName = tag.toUpperCase();
      this.nodeType = 1;
      this.style = {};
      this.dataset = {};
      this.children = [];
      this.className = '';
      this.textContent = '';
      this.innerText = '';
      this.value = '';
      this.attributes = new Map();
      this.parentElement = null;
      innerHtmlStore.set(this, '');
    }
    get innerHTML() {
      const own = innerHtmlStore.get(this) || '';
      const childHtml = this.children.map((c) => c.innerHTML || c.textContent || '').join('');
      return own + childHtml;
    }
    set innerHTML(val) {
      innerHtmlStore.set(this, String(val || ''));
      if (val === '') this.children = [];
    }
    appendChild(child) {
      child.parentElement = this;
      this.children.push(child);
      return child;
    }
    setAttribute(k, v) {
      this.attributes.set(k, String(v));
    }
    getAttribute(k) {
      return this.attributes.get(k) || null;
    }
    attachShadow() {
      const sr = new MockElement('SHADOW-ROOT');
      sr.getElementById = (id) => {
        // 返回可安全绑定 onclick/onchange 的虚拟控件桩，验证所有 ID 绑定无异常
        const html = this.children.map((c) => c.innerHTML).join('\n') + sr.innerHTML;
        if (html.includes(`id="${id}"`) || html.includes(`id='${id}'`)) {
          return new MockElement('BUTTON');
        }
        return null;
      };
      lastShadowRoot = sr;
      return sr;
    }
    querySelectorAll() {
      return [];
    }
    querySelector() {
      return null;
    }
    contains() {
      return false;
    }
    closest() {
      return null;
    }
    getBoundingClientRect() {
      return { top: 0, left: 0, right: 100, bottom: 40, width: 100, height: 40 };
    }
    addEventListener() {}
    removeEventListener() {}
  }

  const parsedUrl = new URL(targetUrl);
  const docEl = new MockElement('HTML');
  const bodyEl = new MockElement('BODY');
  const memStorage = {};

  const win = {
    innerWidth: 1440,
    innerHeight: 900,
    location: {
      href: parsedUrl.href,
      hostname: parsedUrl.hostname,
      pathname: parsedUrl.pathname,
      origin: parsedUrl.origin,
      search: parsedUrl.search,
    },
    getComputedStyle: () => ({ position: 'static', display: 'block', visibility: 'visible', opacity: '1' }),
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  win.top = win;
  win.self = win;
  win.window = win;

  const timers = [];
  const sandbox = {
    window: win,
    top: win,
    self: win,
    location: win.location,
    navigator: { clipboard: { writeText: async () => {} } },
    URL: Object.assign(URL, {
      createObjectURL: () => 'blob:mock',
      revokeObjectURL: () => {},
    }),
    URLSearchParams,
    Blob: globalThis.Blob,
    FileReader: class {
      readAsDataURL() {
        setTimeout(() => this.onload?.(), 0);
      }
    },
    indexedDB: {
      open: () => {
        const req = {};
        setTimeout(() => req.onerror?.(new Error('mock no idb')), 0);
        return req;
      },
    },
    document: {
      documentElement: docEl,
      body: bodyEl,
      title: '投稿中心',
      createElement: (t) => new MockElement(t),
      getElementById: () => null,
      querySelectorAll: () => [],
      querySelector: () => null,
      addEventListener: () => {},
      dispatchEvent: () => {},
    },
    chrome: {
      storage: {
        local: {
          get: async (k) => (typeof k === 'string' ? { [k]: memStorage[k] } : { ...memStorage }),
          set: async (obj) => Object.assign(memStorage, obj),
          remove: async () => {},
        },
        onChanged: {
          addListener: () => {},
        },
      },
      runtime: {
        lastError: null,
        sendMessage: (msg, cb) => {
          if (msg.type === 'PPF_FEISHU_QUERY_CONTEXT') {
            cb?.({
              ok: true,
              data: feishuConfigured
                ? {
                    ok: true,
                    configured: true,
                    accountId: 'recAcc01',
                    accountName: 'B站·靖蜀黍',
                    goldenWindows: '18:00-21:00',
                    candidates: [
                      {
                        bRecordId: 'recB01',
                        cRecordId: 'recC01',
                        label: '018｜百元AI大脑',
                        cStatus: 'C00未发布',
                        hasCloudPack: false,
                        fallbackTitle: '百元手搓AI桌面大脑',
                        fallbackBody: '测试云端文案 #AI硬件',
                      },
                    ],
                    matchedCandidate: {
                      bRecordId: 'recB01',
                      cRecordId: 'recC01',
                      label: '018｜百元AI大脑',
                      cStatus: 'C00未发布',
                      hasCloudPack: false,
                      fallbackTitle: '百元手搓AI桌面大脑',
                      fallbackBody: '测试云端文案 #AI硬件',
                    },
                    hasConflict: false,
                    summary: '🟢 排期安全（近 6h 内无同号冲突排期）',
                  }
                : { ok: true, configured: false, summary: '尚未配置' },
            });
            return;
          }
          cb?.({ ok: true, data: {} });
        },
      },
    },
    setTimeout: (fn) => {
      timers.push(fn);
      return timers.length;
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
    bodyEl,
    getShadowRoot: () => lastShadowRoot,
    flushTimers: async () => {
      while (timers.length > 0) {
        const fn = timers.shift();
        await fn();
      }
      await new Promise((r) => setImmediate(r));
    },
  };
}

// 1. 验证发布页挂载（已配置飞书）：必须成功渲染侧边栏、发前琥珀色警示同步钮与作品关联下拉框
const pubEnv = createMockDomEnv('https://member.bilibili.com/platform/upload/video/frame', true);
await pubEnv.flushTimers();
const pubShadow = pubEnv.getShadowRoot();
assert.ok(pubShadow, '发布页 ShadowRoot 必须成功创建');
const pubHtml = pubShadow.children.map((c) => c.innerHTML).join('\n');
assert.ok(pubHtml.includes('全平台半自动发布助手'), '必须渲染侧边栏标题');
assert.ok(pubHtml.includes('ppf-panel-sync-pub'), '必须渲染发前飞书黄转绿警示同步按钮');
assert.ok(pubHtml.includes('ppf-work-select'), '必须渲染飞书作品关联下拉框');
assert.ok(pubHtml.includes('发布前点此同步飞书'), '未同步时必须展示醒目警示文案');

// 2. 验证发布页挂载（新设备尚未配置飞书）：必须渲染跨设备 PPF2 配置码激活引导卡，不崩溃
const unconfEnv = createMockDomEnv('https://channels.weixin.qq.com/platform/post/list', false);
await unconfEnv.flushTimers();
const unconfHtml = unconfEnv.getShadowRoot().children.map((c) => c.innerHTML).join('\n');
assert.ok(unconfHtml.includes('粘贴配置码秒连'), '未配置飞书时必须展示跨设备配置码秒连入口');

// 3. 验证数据中心页挂载：必须成功渲染紧凑型导表面板
const dataEnv = createMockDomEnv('https://member.bilibili.com/platform/data-up/video', true);
await dataEnv.flushTimers();
const dataHtml = dataEnv.getShadowRoot().children.map((c) => c.innerHTML).join('\n');
assert.ok(dataHtml.includes('ppf-btn-exp-account'), '数据中心页必须渲染账号导出按钮');
assert.ok(dataHtml.includes('ppf-btn-exp-works'), '数据中心页必须渲染作品导出按钮');

console.log('✅ UI Mount & Render Smoke Tests (Publish Configured / Publish Unconfigured / Data Center) ALL PASSED!');
