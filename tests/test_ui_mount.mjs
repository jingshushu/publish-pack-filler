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
      const childHtml = this.children
        .map((c) => `${c.id ? `<div id="${c.id}"></div>` : ''}${c.innerHTML || c.textContent || ''}`)
        .join('');
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
      const elById = new Map();
      sr.getElementById = (id) => {
        const html = this.children.map((c) => c.innerHTML).join('\n') + sr.innerHTML;
        if (html.includes(`id="${id}"`) || html.includes(`id='${id}'`)) {
          if (!elById.has(id)) elById.set(id, new MockElement('BUTTON'));
          return elById.get(id);
        }
        return null;
      };
      const origAppend = sr.appendChild.bind(sr);
      sr.appendChild = (ch) => {
        if (ch.className === 'ppf-root') {
          const origInnerSet = Object.getOwnPropertyDescriptor(MockElement.prototype, 'innerHTML').set;
          Object.defineProperty(ch, 'innerHTML', {
            get() {
              return Object.getOwnPropertyDescriptor(MockElement.prototype, 'innerHTML').get.call(this);
            },
            set(v) {
              if (v === '') elById.clear();
              origInnerSet.call(this, v);
            },
          });
        }
        return origAppend(ch);
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

  let syncedTimeInFeishu = '';
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
                    platformAccounts: [
                      { recordId: 'recAcc01', name: 'B站·靖蜀黍' },
                      { recordId: 'recAcc02', name: 'B站·万物有数可视化' },
                    ],
                    candidates: [
                      {
                        bRecordId: 'recB01',
                        cRecordId: 'recC01',
                        cSerialNo: 'C00258',
                        cDisplayTitle: `${syncedTimeInFeishu ? '✅' : '⏳'}@B站·靖蜀黍_018｜百元AI大脑`,
                        feishuPublishedAt: syncedTimeInFeishu,
                        slug: '20261102_百元AI大脑',
                        label: '018｜百元AI大脑',
                        cStatus: syncedTimeInFeishu ? 'C21已发布' : 'C00未发布',
                        hasCloudPack: false,
                        fallbackTitle: '百元手搓AI桌面大脑',
                        fallbackBody: '测试云端文案 #AI硬件',
                      },
                    ],
                    matchedCandidate: {
                      bRecordId: 'recB01',
                      cRecordId: 'recC01',
                      cSerialNo: 'C00258',
                      cDisplayTitle: `${syncedTimeInFeishu ? '✅' : '⏳'}@B站·靖蜀黍_018｜百元AI大脑`,
                      feishuPublishedAt: syncedTimeInFeishu,
                      slug: '20261102_百元AI大脑',
                      label: '018｜百元AI大脑',
                      cStatus: syncedTimeInFeishu ? 'C21已发布' : 'C00未发布',
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
          if (msg.type === 'PPF_FEISHU_SYNC_PUBLISH') {
            syncedTimeInFeishu = '2026-11-19 18:00';
            cb?.({
              ok: true,
              data: {
                ok: true,
                saved: true,
                bRecordId: 'recB01',
                cRecordId: 'recC01',
                recordedTime: syncedTimeInFeishu,
                summary: `✅ 已写入飞书发布记录表（真实发布日期 ${syncedTimeInFeishu}）`,
              },
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
    docEl,
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

// 1. 验证发布页挂载（已配置飞书）：默认左侧分屏停靠 + 顶部高危红色未同步横幅 + A/B/C 三段式极简结构
const pubEnv = createMockDomEnv('https://member.bilibili.com/platform/upload/video/frame', true);
await pubEnv.flushTimers();
const pubShadow = pubEnv.getShadowRoot();
assert.ok(pubShadow, '发布页 ShadowRoot 必须成功创建');
assert.equal(pubEnv.docEl.style.paddingLeft, '368px', '默认必须采用左侧分屏停靠并推开网页左侧边距防遮挡发布按钮');

const pubHtml = pubShadow.children.map((c) => c.innerHTML).join('\n');
assert.ok(pubHtml.includes('全平台半自动发布助手'), '必须渲染侧边栏标题');
assert.ok(pubHtml.includes('ppf-toggle-dock-side'), '必须渲染左/右分屏切换按钮');
assert.ok(pubHtml.includes('border:2px solid #dc2626'), '同步前顶部状态栏必须为高危红色 (#dc2626)');
assert.ok(pubHtml.includes('未同步真实发布时间'), '同步前顶部必须醒目提示未同步真实发布时间');
assert.ok(pubHtml.includes('ppf-sec-local') && pubHtml.includes('ppf-open-local-dir'), 'A区必须展示极简本地路径与打开路径按钮');
assert.ok(pubHtml.includes('20261102_百元AI大脑'), 'A区必须展示干净的本地作品目录标识');
assert.ok(!pubHtml.includes('选成品包目录') && !pubHtml.includes('粘贴JSON') && !pubHtml.includes('云文案'), '已按要求移除选成品包/粘贴JSON/云文案冗余按钮');
assert.ok(pubHtml.includes('⏳@B站·靖蜀黍_018｜百元AI大脑'), 'B区必须重点展示飞书发布记录名称');
assert.ok(pubHtml.includes('id="ppf-feishu-real-time"') && !pubHtml.includes('2026-11-19 18:00'), '未点同步前飞书真实发布时间必须为空');
assert.ok(pubHtml.includes('C 发布包'), 'C区必须清晰分隔展示发布包内容');

// 验证点击同步后：顶部状态横幅翻绿 + B区记录变 ✅ + 回读展示飞书表内真实发布时间
const syncBtn = pubShadow.getElementById('ppf-panel-sync-pub');
assert.ok(syncBtn && typeof syncBtn.onclick === 'function', '必须绑定顶部红色同步按钮点击事件');
await syncBtn.onclick();
const greenHtml = pubShadow.children.map((c) => c.innerHTML).join('\n');
assert.ok(greenHtml.includes('border:2px solid #10b981'), '点击同步后顶部状态栏必须翻为安全绿 (#10b981)');
assert.ok(greenHtml.includes('已同步真实发布时间 (2026-11-19 18:00)'), '点击同步后顶部必须展示回读的飞书真实发布时间');
assert.ok(greenHtml.includes('✅@B站·靖蜀黍_018｜百元AI大脑'), '点击同步后B区发布记录名称必须切换为 ✅');
assert.ok(greenHtml.includes('>2026-11-19 18:00</span>'), '点击同步后B区必须回读展示飞书表里的真实发布时间');

// 2. 验证发布页挂载（新设备尚未配置飞书）：必须渲染高危红顶部警示与跨设备 PPF2 配置码激活入口，不崩溃
const unconfEnv = createMockDomEnv('https://channels.weixin.qq.com/platform/post/create', false);
await unconfEnv.flushTimers();
const unconfHtml = unconfEnv.getShadowRoot().children.map((c) => c.innerHTML).join('\n');
assert.ok(unconfHtml.includes('粘贴配置码秒连'), '未配置飞书时必须展示跨设备配置码秒连入口');
assert.ok(unconfHtml.includes('border:2px solid #dc2626'), '未配置飞书时顶部也必须展示高危红色状态警示');

// 3. 验证发布页折叠态：未同步时必须展示红色高危未同步浮窗与一键同步快捷按钮，点击快捷同步后立即翻绿
const colEnv = createMockDomEnv('https://creator.douyin.com/creator-micro/content/post/video?enter_from=publish_page', true);
await colEnv.flushTimers();
const colShadow = colEnv.getShadowRoot();
const collapseBtn = colShadow.getElementById('ppf-collapse-btn');
assert.ok(collapseBtn && typeof collapseBtn.onclick === 'function', '必须能获取收起按钮');
collapseBtn.onclick();
const colUnsyncedHtml = colShadow.children.map((c) => c.innerHTML).join('\n');
assert.ok(colUnsyncedHtml.includes('ppf-collapsed-unsynced-card'), '折叠且未同步时必须渲染红色高危警示胶囊');
assert.ok(colUnsyncedHtml.includes('未同步发布时间') && colUnsyncedHtml.includes('ppf-collapsed-quick-sync'), '折叠且未同步时必须提供一键同步快捷入口');
const quickSyncBtn = colShadow.getElementById('ppf-collapsed-quick-sync');
await quickSyncBtn.onclick({ stopPropagation: () => {} });
const colSyncedHtml = colShadow.children.map((c) => c.innerHTML).join('\n');
assert.ok(colSyncedHtml.includes('ppf-collapsed-synced-tab') && colSyncedHtml.includes('✅ 已同步'), '折叠态点击快捷同步后必须直接翻为绿色已同步浮标');

// 4. 验证非发布页严格隐身：在创作者首页、作品/动态管理列表页、普通微博页必须完全隐藏且零页面边距污染
for (const nonPubUrl of [
  'https://creator.xiaohongshu.com/new/home',
  'https://channels.weixin.qq.com/platform/post/list',
  'https://creator.douyin.com/creator-micro/content/manage',
  'https://member.bilibili.com/platform/upload-manager/article',
  'https://weibo.com/',
]) {
  const idleEnv = createMockDomEnv(nonPubUrl, true);
  await idleEnv.flushTimers();
  const idleHtml = idleEnv.getShadowRoot().children.map((c) => c.innerHTML).join('\n').trim();
  assert.equal(idleHtml, '', `非发布页 (${nonPubUrl}) 严禁渲染发布助手面板`);
  assert.equal(idleEnv.docEl.style.paddingLeft || '', '', `非发布页 (${nonPubUrl}) 严禁修改页面边距`);
}

// 5. 验证数据中心页挂载：必须成功渲染紧凑型导表面板
const dataEnv = createMockDomEnv('https://member.bilibili.com/platform/data-up/video', true);
await dataEnv.flushTimers();
const dataHtml = dataEnv.getShadowRoot().children.map((c) => c.innerHTML).join('\n');
assert.ok(dataHtml.includes('ppf-btn-exp-account'), '数据中心页必须渲染账号导出按钮');
assert.ok(dataHtml.includes('ppf-btn-exp-works'), '数据中心页必须渲染作品导出按钮');

console.log('✅ UI Mount & Render Smoke Tests (Publish-Only Route Gate + Collapsed Red/Green Quick Sync + A/B/C Sections) ALL PASSED!');
