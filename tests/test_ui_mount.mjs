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

  const openedUrls = [];
  const win = {
    innerWidth: 1440,
    innerHeight: 900,
    location: {
      href: parsedUrl.href,
      hostname: parsedUrl.hostname,
      pathname: parsedUrl.pathname,
      origin: parsedUrl.origin,
      search: parsedUrl.search,
      hash: parsedUrl.hash,
    },
    open: (url) => openedUrls.push(url),
    getComputedStyle: () => ({ position: 'static', display: 'block', visibility: 'visible', opacity: '1' }),
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  win.top = win;
  win.self = win;
  win.window = win;

  let ccApprovedInMock = false;
  let ccApproveCallCount = 0;
  let ccBiliPublishedInMock = false;
  let syncedTimeInFeishu = '';
  const timers = [];
  const sandbox = {
    window: win,
    top: win,
    self: win,
    location: win.location,
    navigator: {
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36',
      clipboard: { writeText: async () => {} },
    },
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
        getManifest: () =>
          JSON.parse(fs.readFileSync(new URL('../extension/manifest.json', import.meta.url), 'utf8')),
        sendMessage: (msg, cb) => {
          if (msg.type === 'PPF_FEISHU_QUERY_REVIEW_QUEUE') {
            const wantTasks = Boolean(msg.params?.includePublishTasks);
            cb?.({
              ok: true,
              data: {
                ok: true,
                configured: feishuConfigured,
                tasksIncluded: wantTasks,
                pendingWorks: ccApprovedInMock
                  ? [
                      {
                        bRecordId: 'recBRev02',
                        title: '百元AI大脑',
                        slug: '20261102_百元AI大脑',
                        status: 'B11待审核',
                        brand: '靖蜀黍·个人IP',
                        isApproved: false,
                        cTasks: [],
                      },
                    ]
                  : [
                      {
                        bRecordId: 'recBRev01',
                        title: '开源爬墙画画盒',
                        slug: '20261118_开源爬墙画画盒',
                        status: 'B11待审核',
                        brand: '靖蜀黍·个人IP',
                        isApproved: false,
                        cTasks: [],
                      },
                      {
                        bRecordId: 'recBRev02',
                        title: '百元AI大脑',
                        slug: '20261102_百元AI大脑',
                        status: 'B11待审核',
                        brand: '靖蜀黍·个人IP',
                        isApproved: false,
                        cTasks: [],
                      },
                    ],
                activeWork: {
                  bRecordId: 'recBRev01',
                  title: '开源爬墙画画盒',
                  slug: '20261118_开源爬墙画画盒',
                  status: ccApprovedInMock ? 'B12等待发布至平台' : 'B11待审核',
                  brand: '靖蜀黍·个人IP',
                  isApproved: ccApprovedInMock,
                  cTasks:
                    ccApprovedInMock && wantTasks
                      ? [
                          {
                            cRecordId: 'recC1',
                            cSerialNo: 'C00301',
                            accountName: '小红书·靖蜀黍',
                            cStatus: 'C21已发布',
                            publishedAt: '2026-11-19 17:35',
                            isPublished: true,
                            isCancelled: false,
                          },
                          {
                            cRecordId: 'recC2',
                            cSerialNo: 'C00302',
                            accountName: 'B站·靖蜀黍',
                            cStatus: ccBiliPublishedInMock ? 'C21已发布' : 'C00未发布',
                            publishedAt: ccBiliPublishedInMock ? '2026-11-19 18:10' : '',
                            isPublished: ccBiliPublishedInMock,
                            isCancelled: false,
                          },
                        ]
                      : [],
                },
              },
            });
            return;
          }
          if (msg.type === 'PPF_FEISHU_APPROVE_REVIEW') {
            ccApproveCallCount++;
            ccApprovedInMock = true;
            cb?.({
              ok: true,
              data: {
                ok: true,
                approved: true,
                bRecordId: 'recBRev01',
                title: '开源爬墙画画盒',
                slug: '20261118_开源爬墙画画盒',
                newStatus: 'B12等待发布至平台',
                approvedAtStr: '2026-11-19 17:30',
                tasksLoaded: false,
                pendingWorks: [
                  {
                    bRecordId: 'recBRev02',
                    title: '百元AI大脑',
                    slug: '20261102_百元AI大脑',
                    status: 'B11待审核',
                    brand: '靖蜀黍·个人IP',
                    isApproved: false,
                    cTasks: [],
                  },
                ],
                cTasks: [],
              },
            });
            return;
          }
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
          if (msg.type === 'PPF_BRIDGE_EXPORT_TARGETS') {
            const acct = String(msg.account || '').trim();
            const mockTargets = [
              {
                account: '万物有数',
                areaDir: '2026_万物有数',
                destDir: '/mock/AIHub/2 AH领域·Areas/2026_万物有数/05_数据复盘/数据导出',
                relDir: '2 AH领域·Areas/2026_万物有数/05_数据复盘/数据导出',
              },
              {
                account: '靖蜀黍',
                areaDir: '2026_靖蜀黍',
                destDir: '/mock/AIHub/2 AH领域·Areas/2026_靖蜀黍/05_数据复盘/数据导出',
                relDir: '2 AH领域·Areas/2026_靖蜀黍/05_数据复盘/数据导出',
              },
            ];
            const hit = mockTargets.find((t) => acct && (t.account === acct || t.areaDir.includes(acct)));
            cb?.({
              ok: true,
              data: {
                ok: true,
                targets: mockTargets,
                matched: Boolean(hit),
                account: hit ? hit.account : acct,
                areaDir: hit ? hit.areaDir : '',
                destDir: hit ? hit.destDir : '',
                relDir: hit ? hit.relDir : '',
              },
            });
            return;
          }
          if (msg.type === 'PPF_SET_EXPORT_HINT') {
            cb?.({ ok: true, account: msg.account || '' });
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
    openedUrls,
    markMockBiliPublished: () => {
      ccBiliPublishedInMock = true;
    },
    getApproveCallCount: () => ccApproveCallCount,
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

// 1. 验证发布页挂载（已配置飞书）：统一右侧分屏停靠（移除靠左停靠并替换为 💬 反馈入口）+ 顶部高危红色未同步横幅 + A/B/C 三段式极简结构
const pubEnv = createMockDomEnv('https://member.bilibili.com/platform/upload/video/frame', true);
await pubEnv.flushTimers();
const pubShadow = pubEnv.getShadowRoot();
assert.ok(pubShadow, '发布页 ShadowRoot 必须成功创建');
assert.equal(pubEnv.docEl.style.paddingRight, '368px', '默认必须采用右侧分屏停靠并推开网页右侧边距');
assert.equal(pubEnv.docEl.style.paddingLeft || '', '', '靠左停靠已彻底移除，严禁污染左侧边距');

const pubHtml = pubShadow.children.map((c) => c.innerHTML).join('\n');
assert.ok(pubHtml.includes('全平台半自动发布助手'), '必须渲染侧边栏标题');
assert.ok(!pubHtml.includes('ppf-toggle-dock-side'), '必须彻底移除靠左停靠切换按钮');
assert.ok(pubHtml.includes('ppf-open-feedback'), '必须在原靠左停靠槽位渲染 💬 反馈按钮');
assert.ok(pubHtml.includes('border:2px solid #dc2626'), '同步前顶部状态栏必须为高危红色 (#dc2626)');
assert.ok(pubHtml.includes('未同步真实发布时间'), '同步前顶部必须醒目提示未同步真实发布时间');
assert.ok(pubHtml.includes('ppf-sec-local') && pubHtml.includes('ppf-open-local-dir'), 'A区必须展示极简本地路径与打开路径按钮');
assert.ok(pubHtml.includes('20261102_百元AI大脑'), 'A区必须展示干净的本地作品目录标识');
assert.ok(!pubHtml.includes('选成品包目录') && !pubHtml.includes('粘贴JSON') && !pubHtml.includes('云文案'), '已按要求移除选成品包/粘贴JSON/云文案冗余按钮');
assert.ok(pubHtml.includes('⏳@B站·靖蜀黍_018｜百元AI大脑'), 'B区必须重点展示飞书发布记录名称');
assert.ok(pubHtml.includes('id="ppf-feishu-real-time"') && !pubHtml.includes('2026-11-19 18:00'), '未点同步前飞书真实发布时间必须为空');
assert.ok(pubHtml.includes('C 发布包'), 'C区必须清晰分隔展示发布包内容');

// 验证点击同步后：顶部状态横幅翻绿 + B区记录变 ✅ + 回显飞书真实发布时间
const syncBtn = pubShadow.getElementById('ppf-panel-sync-pub');
assert.ok(syncBtn && typeof syncBtn.onclick === 'function', '必须绑定顶部红色同步按钮点击事件');
await syncBtn.onclick();
const greenHtml = pubShadow.children.map((c) => c.innerHTML).join('\n');
assert.ok(greenHtml.includes('border:2px solid #10b981'), '点击同步后顶部状态栏必须翻为安全绿 (#10b981)');
assert.ok(greenHtml.includes('已同步真实发布时间 (2026-11-19 18:00)'), '点击同步后顶部必须展示飞书真实发布时间');
assert.ok(greenHtml.includes('✅@B站·靖蜀黍_018｜百元AI大脑'), '点击同步后B区发布记录名称必须切换为 ✅');
assert.ok(greenHtml.includes('>2026-11-19 18:00</span>'), '点击同步后B区必须展示飞书真实发布时间');

// 2. 验证发布页挂载（新设备尚未配置飞书）：必须渲染高危红顶部警示与跨设备 PPF2 配置码激活入口，不崩溃
const unconfEnv = createMockDomEnv('https://channels.weixin.qq.com/platform/post/create', false);
await unconfEnv.flushTimers();
const unconfHtml = unconfEnv.getShadowRoot().children.map((c) => c.innerHTML).join('\n');
assert.ok(unconfHtml.includes('粘贴配置码秒连'), '未配置飞书时必须展示跨设备配置码秒连入口');
assert.ok(unconfHtml.includes('border:2px solid #dc2626'), '未配置飞书时顶部也必须展示高危红色状态警示');

// 3. 验证发布页折叠态：未同步时必须展示右侧红色高危未同步浮窗与一键同步快捷按钮，点击快捷同步后立即翻绿
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
  assert.equal(idleEnv.docEl.style.paddingRight || '', '', `非发布页 (${nonPubUrl}) 严禁修改页面边距`);
}

// 5. 验证数据中心页挂载：强制归属账号门禁 + 手动输入框兜底 + 下载前归档目录回显
const dataEnv = createMockDomEnv('https://creator.douyin.com/creator-micro/data-center/operation', true);
await dataEnv.flushTimers();
const dataShadow = dataEnv.getShadowRoot();
const dataHtml = dataShadow.children.map((c) => c.innerHTML).join('\n');
assert.ok(dataHtml.includes('ppf-btn-exp-account'), '数据中心页必须渲染账号导出按钮');
assert.ok(dataHtml.includes('ppf-btn-exp-works'), '数据中心页必须渲染作品导出按钮');
assert.ok(dataHtml.includes('ppf-export-custom-inp'), '未自动识别到账号时必须直接展开手动输入框');
assert.ok(dataHtml.includes('未识别到当前账号'), '未指定账号时必须在目录回显栏高亮警示禁止无账号盲下');

// 未选账号直接点「📊 账号」：必须被硬门禁拦截
await dataShadow.getElementById('ppf-btn-exp-account').onclick();
const blockedHtml = dataShadow.children.map((c) => c.innerHTML).join('\n');
assert.ok(blockedHtml.includes('未识别到归属账号'), '未指定账号时点击导出必须被硬门禁拦截');

// 在输入框填入「靖蜀黍」后：导出前目录回显栏必须实时回显真实归档路径！
const customInp = dataShadow.getElementById('ppf-export-custom-inp');
customInp.value = '靖蜀黍';
customInp.oninput({ target: customInp });
await dataEnv.flushTimers();
const echoHtmlMatched = dataShadow.children.map((c) => c.innerHTML).join('\n');
assert.ok(
  echoHtmlMatched.includes('2 AH领域·Areas/2026_靖蜀黍/05_数据复盘/数据导出/'),
  '输入已存在账号后必须在导出前实时回显目标归档目录路径'
);

// 输入本机不存在目录的野生账号名：回显「保留在 ~/Downloads（绝不新建目录或乱移文件）」
const customInp2 = dataShadow.getElementById('ppf-export-custom-inp');
customInp2.value = '测试新号X';
customInp2.oninput({ target: customInp2 });
await dataEnv.flushTimers();
const echoHtmlUnmatched = dataShadow.children.map((c) => c.innerHTML).join('\n');
assert.ok(
  echoHtmlUnmatched.includes('绝不新建目录或乱移文件'),
  '未匹配本地目录的账号必须明确回显保留在 ~/Downloads 且绝不新建目录'
);

// 6. 验证飞书通用「用户反馈收集表」契约：点击 💬 按钮必须准确拼接全部 8 个 prefill_ 与 hide_=1 参数且剥离隐私查询串
const fbEnv = createMockDomEnv('https://creator.xiaohongshu.com/publish/publish?secret_token=abc123', true);
await fbEnv.flushTimers();
const fbBtn = fbEnv.getShadowRoot().getElementById('ppf-open-feedback');
assert.ok(fbBtn && typeof fbBtn.onclick === 'function', '顶部栏必须挂载 💬 反馈按钮');
await fbBtn.onclick();
assert.equal(fbEnv.openedUrls.length, 1, '点击反馈按钮应打开飞书表单新标签页');
const fbUrl = new URL(fbEnv.openedUrls[0]);
assert.equal(
  `${fbUrl.origin}${fbUrl.pathname}`,
  'https://my.feishu.cn/share/base/shrcnRMlf6gosr0Werh6Oazu3Q9',
  '反馈表单基础链接必须对齐契约'
);
for (const key of ['所属产品', '产品代号', '产品形态', '版本号', '页面路径', '运行环境', '设备标识', '诊断信息']) {
  assert.ok(fbUrl.searchParams.get(`prefill_${key}`), `必须携带 prefill_${key}`);
  assert.equal(fbUrl.searchParams.get(`hide_${key}`), '1', `必须携带 hide_${key}=1`);
}
assert.equal(fbUrl.searchParams.get('prefill_所属产品'), '全平台发布助手');
assert.equal(fbUrl.searchParams.get('prefill_产品代号'), 'publish-pack-filler');
assert.equal(fbUrl.searchParams.get('prefill_产品形态'), '浏览器插件');
assert.equal(fbUrl.searchParams.get('prefill_版本号'), '2.5.3');
assert.equal(
  fbUrl.searchParams.get('prefill_页面路径'),
  '[小红书发布页] https://creator.xiaohongshu.com/publish/publish',
  '页面路径必须剥离 URL 中可能含隐私的 query 参数'
);
assert.ok(fbUrl.searchParams.get('prefill_运行环境').includes('macOS · Chrome 131 · 右侧分屏停靠'));
assert.match(fbUrl.searchParams.get('prefill_设备标识'), /^ppf_[a-z0-9]{10}$/);

// 7. 验证 Cutcheck 在线审片统一右侧工作台：与主助手一致支持右侧分屏停靠 / 自由悬浮窗 / 贴边收起 + 待审队列快切 + 一键审片通过生成发布任务
const ccEnv = createMockDomEnv(
  'https://cutcheck-alpha.vercel.app/#file=%2Ftmp%2F20261118_%E5%BC%80%E6%BA%90%E7%88%AC%E5%A2%99%E7%94%BB%E7%94%BB%E7%9B%92%2Fdemo_v2.mp4&project=%E5%BC%80%E6%BA%90%E7%88%AC%E5%A2%99%E7%94%BB%E7%94%BB%E7%9B%92&version=v2',
  true
);
await ccEnv.flushTimers();
assert.equal(ccEnv.docEl.style.paddingRight, '368px', 'Cutcheck 审片页默认采用右侧分屏停靠推开页面防遮挡');
assert.equal(ccEnv.docEl.style.paddingLeft || '', '', 'Cutcheck 审片页不污染左侧边距');
const ccShadow = ccEnv.getShadowRoot();
assert.ok(ccShadow, 'Cutcheck 审片页必须挂载统一右侧工作台');
const ccHtmlBefore = ccShadow.children.map((c) => c.innerHTML).join('\n');
assert.ok(ccHtmlBefore.includes('全平台半自动发布助手') && ccHtmlBefore.includes('🎬 飞书审片'), '头部保持与主助手一致的统一顶栏');
assert.ok(ccHtmlBefore.includes('ppf-toggle-layout') && ccHtmlBefore.includes('ppf-open-feedback'), 'Cutcheck 面板顶栏必须提供分屏/悬浮窗切换与 💬 反馈入口');
assert.ok(ccHtmlBefore.includes('待审 2 部') && ccHtmlBefore.includes('ppf-cc-queue-select') && ccHtmlBefore.includes('ppf-cc-queue-list'), '必须渲染飞书待审队列下拉与可点选列表');
assert.ok(ccHtmlBefore.includes('ppf-cc-next-btn'), '多条待审时必须提供下一部快切按钮');

// 切换为自由悬浮窗模式：自动释放网页右侧 padding 并渲染左下角缩放柄
const ccToggleLayout = ccShadow.getElementById('ppf-toggle-layout');
ccToggleLayout.onclick();
assert.equal(ccEnv.docEl.style.paddingRight || '', '', '切换为自由悬浮窗后应释放网页右侧边距');
assert.ok(ccShadow.children.map((c) => c.innerHTML).join('\n').includes('ppf-resize-sw'), '自由悬浮窗模式必须提供自由拖拽缩放柄');

// 一键审片通过（模拟手抖连续三连击按钮）：同步防重锁拦截连点，仅发 1 次审片消息，默认不自动拉取发布任务
const ccApproveBtn = ccShadow.getElementById('ppf-cc-approve-btn');
assert.ok(ccApproveBtn && typeof ccApproveBtn.onclick === 'function', '必须渲染一键审片通过按钮');
await Promise.all([ccApproveBtn.onclick(), ccApproveBtn.onclick(), ccApproveBtn.onclick()]);
assert.equal(ccEnv.getApproveCallCount(), 1, '连续三连击审片按钮必须严格去重，仅发送 1 次 PPF_FEISHU_APPROVE_REVIEW 请求');
const ccHtmlAfterApprove = ccShadow.children.map((c) => c.innerHTML).join('\n');
assert.ok(ccHtmlAfterApprove.includes('B12等待发布至平台'), '点击审片通过后必须展示 B12 状态');
assert.ok(!ccHtmlAfterApprove.includes('ppf-cc-tasks-wrap'), '审片完成后默认绝不自动拉取发布任务');
assert.ok(ccHtmlAfterApprove.includes('ppf-cc-fetch-tasks-btn') && ccHtmlAfterApprove.includes('获取发布任务'), '审片完成后必须展示「获取发布任务」入口');
assert.ok(ccHtmlAfterApprove.includes('ppf-cc-refresh-status-btn') && ccHtmlAfterApprove.includes('刷新状态'), '必须提供显式「刷新状态」按钮');

// 点击「📥 获取发布任务」后按需拉取任务：待发渠道可点直达，已发布渠道自动置灰 (is-done)
const ccFetchTasksBtn = ccShadow.getElementById('ppf-cc-fetch-tasks-btn');
await ccFetchTasksBtn.onclick();
const ccHtmlWithTasks = ccShadow.children.map((c) => c.innerHTML).join('\n');
assert.ok(ccHtmlWithTasks.includes('待发 1 · 已发 1'), '点击获取发布任务后必须展示待发与已发计数');
assert.ok(ccHtmlWithTasks.includes('ppf-cc-refresh-tasks-btn'), '任务列表旁必须提供「刷新任务」按钮');
assert.ok(ccHtmlWithTasks.includes('ppf-cc-pill is-done') && ccHtmlWithTasks.includes('✓ 小红书·靖蜀黍 (已发布)'), '已发布渠道必须置灰显示');
assert.ok(ccHtmlWithTasks.includes('🚀 B站·靖蜀黍'), '未发布渠道保持高亮可点击去发布');

// 模拟 B站 也发布完成后，点击「🔄 刷新任务」按钮：B站 立即同步变为已发布置灰态！
ccEnv.markMockBiliPublished();
const ccRefreshTasksBtn = ccShadow.getElementById('ppf-cc-refresh-tasks-btn');
await ccRefreshTasksBtn.onclick();
const ccHtmlRefreshed = ccShadow.children.map((c) => c.innerHTML).join('\n');
assert.ok(ccHtmlRefreshed.includes('待发 0 · 已发 2') && ccHtmlRefreshed.includes('✓ B站·靖蜀黍 (已发布)'), '点击刷新按钮后最新已发布任务必须立即置灰');

// 贴边收起为右侧悬停胶囊
const ccCollapseBtn = ccShadow.getElementById('ppf-collapse-btn');
ccCollapseBtn.onclick();
assert.ok(ccShadow.children.map((c) => c.innerHTML).join('\n').includes('ppf-cc-collapsed-pill'), '点击收起后必须在右侧边缘悬停展示审片迷你胶囊');

console.log('✅ UI Mount & Render Smoke Tests (Right-Side Dock + Feedback Slot + Collapsed Red/Green + Unified Cutcheck Workbench) ALL PASSED!');
