import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const clientCode = fs.readFileSync(
  new URL('../extension/feishu_client.js', import.meta.url),
  'utf8'
);

const memStore = {};
const sandbox = {
  self: {},
  btoa: (str) => Buffer.from(str, 'binary').toString('base64'),
  atob: (b64) => Buffer.from(b64, 'base64').toString('binary'),
  TextEncoder,
  TextDecoder,
  URL,
  URLSearchParams,
  Date,
  Math,
  JSON,
  Promise,
  Map,
  Set,
  Number,
  String,
  Boolean,
  Array,
  Object,
  RegExp,
  Error,
  setTimeout,
  clearTimeout,
  chrome: {
    storage: {
      local: {
        get: async (k) => ({ [k]: memStore[k] }),
        set: async (obj) => Object.assign(memStore, obj),
      },
    },
  },
  fetch: async () => {
    throw new Error('offline unit test');
  },
};

vm.createContext(sandbox);
vm.runInContext(clientCode, sandbox);

const {
  saveFeishuConfig,
  exportFeishuConfigCode,
  importFeishuConfigCode,
  extractCleanWorkSlug,
  buildSafeWriteFields,
  buildSafeV3WriteFields,
  smartBatchUpdateRecord,
  smartBatchCreateRecord,
  evaluateScheduleConflicts,
  queryFeishuPublishContext,
  syncPrePublishToFeishu,
  queryFeishuReviewQueue,
  approveWorkReviewInFeishu,
  buildCTasksMapByBId,
} = sandbox.self.PPFFeishuClient;

// ==================== Test 1: 跨机器绝对路径净化为纯 WorkSlug ====================
assert.equal(
  extractCleanWorkSlug('/Users/demo_user/Desktop/AIHub/2 AH领域·Areas/2026_靖蜀黍/04_作品/20261102_百元AI大脑/成片'),
  '20261102_百元AI大脑'
);
assert.equal(
  extractCleanWorkSlug('D:\\NAS\\AIHub\\04_作品\\20261016_特斯拉飞行汽车短视频\\04_成片'),
  '20261016_特斯拉飞行汽车短视频'
);
assert.equal(
  extractCleanWorkSlug('20261117_天津城市变迁'),
  '20261117_天津城市变迁'
);
assert.equal(
  extractCleanWorkSlug('custom_project_folder/成片'),
  'custom_project_folder'
);
assert.equal(
  extractCleanWorkSlug('04_发布与成片'),
  '',
  '单独的 04_发布与成片 子目录名严禁误识别为作品 slug'
);

// ==================== Test 2: PPF2:... 跨设备配置码导出与导入无损往返 ====================
const sampleCfg = {
  apiDomain: 'feishu',
  authMode: 'app',
  appId: 'cli_test_demo_001',
  appSecret: 'sec_demo_xyz_999',
  baseToken: 'bascnDemoToken12345',
  schemaMode: 'multi_table',
  minGapHours: 6,
  tables: {
    accounts: 'tblAcc01',
    works: 'tblWrk02',
    publishes: 'tblPub03',
  },
};

const fullCode = exportFeishuConfigCode(sampleCfg, { includeSecret: true });
assert.ok(fullCode.startsWith('PPF2:'), '配置码必须以 PPF2: 开头');
const restoredFull = importFeishuConfigCode(fullCode);
assert.equal(restoredFull.appId, 'cli_test_demo_001');
assert.equal(restoredFull.appSecret, 'sec_demo_xyz_999');
assert.equal(restoredFull.baseToken, 'bascnDemoToken12345');
assert.equal(restoredFull.tables.publishes, 'tblPub03');

const desensitizedCode = exportFeishuConfigCode(sampleCfg, { includeSecret: false });
const restoredSafe = importFeishuConfigCode(desensitizedCode);
assert.equal(restoredSafe.appId, 'cli_test_demo_001');
assert.equal(restoredSafe.appSecret, '');

// ==================== Test 3: 飞书字段类型安全组装 (杜绝 1254062 报错) ====================
const mockFieldsMeta = [
  { field_name: '状态', type: 3, property: { options: [{ name: 'C00未发布' }, { name: 'C10等待定时发布' }, { name: 'C21已发布' }] } },
  { field_name: '话题标签', type: 4 },
  { field_name: '计划发布时间', type: 5 },
  { field_name: '内容运营表', type: 21 },
  { field_name: '标题', type: 1 },
  { field_name: '只读公式列', type: 20 },
];

const safePayload = JSON.parse(
  JSON.stringify(
    buildSafeWriteFields(mockFieldsMeta, {
      状态: ['C10等待定时发布'], // 即使误传数组也会自动转单选字符串并精准匹配 option
      话题标签: '#天津 #城市变迁,GIS',
      计划发布时间: '2026-11-19 20:00',
      内容运营表: 'recWork123',
      标题: '紧挨北京装下2个上海',
      只读公式列: '会被自动忽略',
      不存在的列: '同样安全忽略',
    })
  )
);

assert.equal(safePayload['状态'], 'C10等待定时发布');
assert.deepEqual(safePayload['话题标签'], ['天津', '城市变迁', 'GIS']);
assert.equal(typeof safePayload['计划发布时间'], 'number');
assert.deepEqual(safePayload['内容运营表'], ['recWork123']);
assert.equal(safePayload['只读公式列'], undefined);
assert.equal(safePayload['不存在的列'], undefined);

// ==================== Test 3b: Base v3 动态引用选项兼容格式核验 (根治 1254062 & 800010409) ====================
const mockDynamicMeta = [
  { field_name: '状态', type: 3, property: { options: [{ name: 'C00未发布' }, { name: 'C10等待定时发布' }, { name: 'C21已发布' }] } },
  { field_name: '话题标签', type: 4, property: { options: [{ name: 'ESP32' }, { name: '3D打印' }] } },
  { field_name: '计划发布时间', type: 5 },
  { field_name: '真实发布日期', type: 5 },
  { field_name: '内容运营表', type: 21 },
];

const safeV3Strict = JSON.parse(
  JSON.stringify(
    buildSafeV3WriteFields(
      mockDynamicMeta,
      {
        状态: 'C10等待定时发布',
        话题标签: ['esp32', '未收录的新词XYZ', '3D打印'],
        计划发布时间: '2026-11-19 17:00',
        真实发布日期: null,
        内容运营表: ['recWork123'],
      },
      { strictKnownOptionsOnly: true }
    )
  )
);

assert.deepEqual(safeV3Strict['状态'], ['C10等待定时发布']);
assert.deepEqual(safeV3Strict['话题标签'], ['ESP32', '3D打印']); // 自动大小写对齐且剔除动态库未收录新词
assert.equal(safeV3Strict['计划发布时间'], '2026-11-19 17:00');
assert.equal(safeV3Strict['真实发布日期'], null);
assert.deepEqual(safeV3Strict['内容运营表'], [{ id: 'recWork123' }]);

// ==================== Test 4: 同账号 6h 排期防撞雷达检测（仅依赖单一「真实发布日期」列） ====================
const baseMs = new Date('2026-11-19T18:00:00+08:00').getTime();
const conflictCheck = evaluateScheduleConflicts({
  cRows: [
    {
      record_id: 'recC_existing',
      fields: {
        分发账号: [{ id: 'recAcc_Bili' }],
        内容运营表: [{ id: 'recB_other' }],
        状态: 'C21已发布',
        真实发布日期: baseMs + 2 * 3600 * 1000, // 20:00 (仅隔 2 小时 -> 撞车!)
        标题: '上一条待发视频',
      },
    },
  ],
  bById: new Map(),
  fmPub: {
    accountLink: '分发账号',
    workLink: '内容运营表',
    status: '状态',
    publishedAt: '真实发布日期',
    title: '标题',
  },
  fmWork: { title: '作品名称' },
  accountId: 'recAcc_Bili',
  platCn: 'B站',
  targetMs: baseMs,
  excludeBId: 'recB_current',
  excludeCId: '',
  minGapHours: 6,
});

assert.equal(conflictCheck.hasConflict, true);
assert.equal(conflictCheck.conflicts.length, 1);
assert.equal(conflictCheck.conflicts[0].diffHours, 2);

// ==================== Test 5: 飞书自动化模式兼容 (状态仍为 C00未发布但已写入真实发布日期时，雷达照常防撞且零依赖计划发布时间) ====================
const autoRadarCheck = evaluateScheduleConflicts({
  cRows: [
    {
      record_id: 'recC_auto_pending',
      fields: {
        分发账号: [{ id: 'recAcc_Bili' }],
        内容运营表: [{ id: 'recB_other2' }],
        状态: 'C00未发布',
        真实发布日期: baseMs + 1.5 * 3600 * 1000,
        计划发布时间: baseMs + 48 * 3600 * 1000, // 即使旧表残留计划发布时间列，也完全忽略不参与计算
        标题: '刚写入时间待自动化流转的视频',
      },
    },
  ],
  bById: new Map(),
  fmPub: {
    accountLink: '分发账号',
    workLink: '内容运营表',
    status: '状态',
    publishedAt: '真实发布日期',
    title: '标题',
  },
  fmWork: { title: '作品名称' },
  accountId: 'recAcc_Bili',
  platCn: 'B站',
  targetMs: baseMs,
  excludeBId: 'recB_current',
  excludeCId: '',
  minGapHours: 6,
});
assert.equal(autoRadarCheck.hasConflict, true);
assert.equal(autoRadarCheck.conflicts[0].diffHours, 1.5);

// ==================== Test 6: 模拟 1254062 SingleSelectFieldConvFail & 权限降级三级自愈实测 ====================
const httpCalls = [];
sandbox.fetch = async (url, init = {}) => {
  const bodyObj = init.body ? JSON.parse(init.body) : null;
  httpCalls.push({ url, method: init.method, body: bodyObj });

  if (url.includes('/tenant_access_token/internal')) {
    return {
      ok: true,
      status: 200,
      json: async () => ({ code: 0, tenant_access_token: 'tat_mock_ok', expire: 7200 }),
    };
  }
  // 模拟应用仅开通 bitable:app 未开通 base/v3 权限 -> 返回 403 / 99991672
  if (url.includes('/open-apis/base/v3/')) {
    return {
      ok: false,
      status: 403,
      json: async () => ({ code: 99991672, msg: 'Access denied. Required scope base:record:update missing' }),
    };
  }
  // 模拟 Bitable v1 遇到「引用选项单选列」：只要带了 `状态` 就报 1254062 SingleSelectFieldConvFail！
  if (url.includes('/open-apis/bitable/v1/')) {
    const recFields = bodyObj?.records?.[0]?.fields || {};
    if ('状态' in recFields) {
      return {
        ok: false,
        status: 400,
        json: async () => ({ code: 1254062, msg: 'SingleSelectFieldConvFail' }),
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ code: 0, data: { records: [{ record_id: 'recCreatedOrUpdated01' }] } }),
    };
  }
  throw new Error(`Unexpected URL: ${url}`);
};

const appCfgOnlyV1 = {
  authType: 'app',
  apiDomain: 'https://open.feishu.cn',
  appId: 'cli_only_v1',
  appSecret: 'sec_only_v1',
  baseToken: 'bascnTestV1',
  statusSyncMode: 'auto',
};

// 第一次写入：base/v3 403 -> 降级 v1 -> 命中 1254062 -> 自动剥离「状态」并剔除未收录新词，保留计划发布时间+标题+已收录标签成功落表！
const healRes1 = await smartBatchUpdateRecord(appCfgOnlyV1, 'tblPubDynamic', 'recRow001', mockDynamicMeta, {
  状态: 'C10等待定时发布',
  计划发布时间: '2026-11-19 17:00',
  真实发布日期: null,
  话题标签: ['ESP32', '未收录野生词ABC'],
  内容运营表: ['recWork123'],
});
assert.equal(healRes1.skippedSingleSelect, true);
const lastV1Body1 = httpCalls[httpCalls.length - 1].body.records[0].fields;
assert.equal('状态' in lastV1Body1, false, '自动剥离动态引用单选状态列');
assert.equal(typeof lastV1Body1['计划发布时间'], 'number', '计划发布时间毫秒时间戳必须成功写入');
assert.deepEqual(lastV1Body1['话题标签'], ['ESP32'], '仅保留已收录标签防 1254063');

// 第二次同表写入（已记住 tblPubDynamic 的引用选项特征）：v1 首轮即自动跳过状态列，不再触发 1254062！
const countBefore = httpCalls.length;
const ptCfg = {
  authType: 'personal_token',
  apiDomain: 'https://open.feishu.cn',
  personalBaseToken: 'pt-demo-token',
  baseToken: 'bascnTestV1',
  statusSyncMode: 'auto',
};
const healRes2 = await smartBatchUpdateRecord(ptCfg, 'tblPubDynamic', 'recRow002', mockDynamicMeta, {
  状态: 'C21已发布',
  真实发布日期: '2026-11-19 18:30',
});
assert.equal(healRes2.skippedSingleSelect, true);
assert.equal(httpCalls.length - countBefore, 1, '已记忆动态状态表在个人授权码下仅需 1 次 HTTP 请求直通');

// 显式开启 time_only 模式：全新表也直接 1 次请求仅写时间与文案
const countBefore3 = httpCalls.length;
const createdId = await smartBatchCreateRecord(
  { ...ptCfg, statusSyncMode: 'time_only' },
  'tblBrandNew',
  mockDynamicMeta,
  {
    状态: 'C10等待定时发布',
    计划发布时间: '2026-11-20 12:00',
    内容运营表: ['recWork999'],
  }
);
assert.equal(createdId, 'recCreatedOrUpdated01');
assert.equal(httpCalls.length - countBefore3, 1, 'time_only 模式首轮直接 1 次请求写入成功');

// ==================== Test 7: HTTP 429 自动退避重试 & 并发快照合并去重防刷爆 QPS ====================
await saveFeishuConfig({
  authType: 'personal_token',
  apiDomain: 'https://open.feishu.cn',
  personalBaseToken: 'pt-rate-limit-test',
  baseToken: 'bascnRateTest',
  schemaMode: 'multi_table',
  tables: {
    accounts: 'tblAcc01',
    works: 'tblWork01',
    publishes: 'tblPub01',
  },
});

let listCalls = 0;
let injected429Count = 0;
sandbox.fetch = async (url) => {
  listCalls++;
  // 前 2 次请求故意返回 HTTP 429，测试自动指数退避重试能否无感恢复
  if (injected429Count < 2) {
    injected429Count++;
    return {
      ok: false,
      status: 429,
      headers: { get: (h) => (h === 'Retry-After' ? '0.02' : null) },
      json: async () => ({ code: 429, msg: 'Too Many Requests' }),
    };
  }
  if (url.includes('/tables/tblAcc01/records')) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        code: 0,
        data: {
          items: [{ record_id: 'recAccX', fields: { 账号名称: 'B站·靖蜀黍', 平台: 'B站', 所属品牌: '靖蜀黍', 账号状态: 'Z310运营中' } }],
        },
      }),
    };
  }
  if (url.includes('/tables/tblWork01/records')) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        code: 0,
        data: {
          items: [
            { record_id: 'recWorkPending', fields: { 选题方向: '十只机械眼同时盯住你', 本地作品目录: '20261119_机械眼', 状态: 'B11待审核', 所属品牌: '靖蜀黍' } },
            { record_id: 'recWorkApproved', fields: { 选题方向: '015｜贵阳', 本地作品目录: '20261116_贵阳城市变迁', 状态: 'B12等待发布至平台', 所属品牌: '靖蜀黍' } },
          ],
        },
      }),
    };
  }
  return {
    ok: true,
    status: 200,
    json: async () => ({
      code: 0,
      data: {
        items: [
          {
            record_id: 'recCPubDone',
            fields: {
              内容运营表: [{ id: 'recWorkApproved' }],
              分发账号: [{ id: 'recAccX' }],
              状态: 'C21已发布',
              真实发布日期: new Date('2026-11-19T18:00:00+08:00').getTime(),
            },
          },
        ],
      },
    }),
  };
};

// 1) 验证默认审片队列查询（includePublishTasks=false）：仅查 B 表（1次请求 + 2次429重试 = 3次），绝不提前拉取 Z3 / C 表！
const [qRev1, qRev2] = await Promise.all([
  queryFeishuReviewQueue({ workSlug: '20261119_机械眼' }),
  queryFeishuReviewQueue({ workSlug: '20261119_机械眼' }),
]);
assert.equal(qRev1.pendingWorks.length, 1, 'HTTP 429 自动重试后必须成功返回待审列表');
assert.equal(qRev2.activeWork?.title, '十只机械眼同时盯住你');
assert.equal(listCalls, 3, '默认审片列表查询仅请求 B 表 1 次（含2次429退避重试共3次），不拉取 C 发布记录表');

// 2) 验证按需拉取发布任务（includePublishTasks=true）：复用已缓存的 B 表，仅补拉 Z3 + C 表（2次请求），且准确标记 isPublished=true 供前端置灰！
const qWithTasks = await queryFeishuReviewQueue({
  bRecordId: 'recWorkApproved',
  includePublishTasks: true,
});
assert.equal(qWithTasks.activeWork?.cTasks?.length, 1);
assert.equal(qWithTasks.activeWork?.cTasks[0].isPublished, true, 'C21已发布任务必须标记 isPublished=true 供前端置灰');
assert.equal(listCalls, 5, '按需拉取任务时自动复用 20s 内的 B 表缓存，仅补拉 Z3 + C 表');

// 3) 再次调用发布上下文查询直接命中 20s 全表快照缓存（0 次额外 HTTP 请求）
const qPub1 = await queryFeishuPublishContext({ platform: 'bilibili' });
assert.equal(qPub1.accountName, 'B站·靖蜀黍');
assert.equal(listCalls, 5, '20s 内跨场景查询直接命中快照缓存');

// ==================== Test 8: 防误触与「一个账号一条内容」铁律验证（并发点击合并去重 + 审片幂等 + 同号同内容绝不重建） ====================
const dedupTasksMap = buildCTasksMapByBId(
  [
    { record_id: 'recAccDy', fields: { 账号名称: '抖音·万物有数', 账号昵称: '万物有数' } },
    { record_id: 'recAccXhs', fields: { 账号名称: '小红书·万物有数', 账号昵称: '万物有数' } },
  ],
  [
    {
      record_id: 'recC_ghost_blank',
      fields: {
        发布编号: 'C00276',
        内容运营表: [{ id: 'recB_110' }],
        分发账号: [{ id: 'recAccDy' }],
        状态: '',
      },
    },
    {
      record_id: 'recC_valid_pending',
      fields: {
        发布编号: 'C00275',
        内容运营表: [{ id: 'recB_110' }],
        分发账号: [{ id: 'recAccDy' }],
        状态: 'C00未发布',
      },
    },
    {
      record_id: 'recC_auto_blocked',
      fields: {
        发布编号: 'C00277',
        内容运营表: [{ id: 'recB_110' }],
        分发账号: [{ id: 'recAccDy' }],
        状态: 'C23取消/暂不发布',
        备注: '⚠️ 防重自动拦截：同一账号同一内容仅保留首条记录',
      },
    },
    {
      record_id: 'recC_xhs_done',
      fields: {
        发布编号: 'C00278',
        内容运营表: [{ id: 'recB_110' }],
        分发账号: [{ id: 'recAccXhs' }],
        状态: 'C21已发布',
      },
    },
  ],
  { name: '账号名称', nickname: '账号昵称' },
  {
    serialNo: '发布编号',
    workLink: '内容运营表',
    accountLink: '分发账号',
    accountText: '分发账号',
    platformText: '平台',
    status: '状态',
    publishedAt: '真实发布日期',
    notes: '备注',
  }
);
const tasksFor110 = dedupTasksMap.get('recB_110') || [];
assert.equal(tasksFor110.length, 2, '同一作品下每个账号严格只保留唯一1条记录（彻底剔除空白重行与防重拦截行）');
assert.equal(tasksFor110[0].cRecordId, 'recC_valid_pending', '同账号多条时优先锁定有明确状态的 C00275 主记录');
assert.equal(tasksFor110[1].cRecordId, 'recC_xhs_done');

let bBatchUpdateCount = 0;
let cBatchUpdateCount = 0;
let cBatchCreateCount = 0;
let workApprovedFlag = false;

await saveFeishuConfig({
  authType: 'personal_token',
  apiDomain: 'https://open.feishu.cn',
  personalBaseToken: 'pt-idemp-test',
  baseToken: 'bascnIdempTest',
  schemaMode: 'multi_table',
  statusSyncMode: 'time_only',
  tables: {
    accounts: 'tblAccIdemp',
    works: 'tblWorkIdemp',
    publishes: 'tblPubIdemp',
  },
});

sandbox.fetch = async (url, init = {}) => {
  const method = init.method || 'GET';
  if (url.includes('/fields') && method === 'GET') {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        code: 0,
        data: {
          items: [
            { field_name: '选题方向', type: 1 },
            { field_name: '本地作品目录', type: 1 },
            { field_name: '状态', type: 3, property: { options: [] } },
            { field_name: '审片通过时间', type: 5 },
            { field_name: '内容运营表', type: 18 },
            { field_name: '分发账号', type: 18 },
            { field_name: '真实发布日期', type: 5 },
            { field_name: '标题', type: 1 },
            { field_name: '正文', type: 1 },
          ],
        },
      }),
    };
  }
  if (url.includes('/tables/tblWorkIdemp/records/batch_update')) {
    bBatchUpdateCount++;
    workApprovedFlag = true;
    return {
      ok: true,
      status: 200,
      json: async () => ({ code: 0, data: { records: [{ record_id: 'recWork110' }] } }),
    };
  }
  if (url.includes('/tables/tblPubIdemp/records/batch_update')) {
    cBatchUpdateCount++;
    return {
      ok: true,
      status: 200,
      json: async () => ({ code: 0, data: { records: [{ record_id: 'recCExisting110' }] } }),
    };
  }
  if (url.includes('/tables/tblPubIdemp/records/batch_create')) {
    cBatchCreateCount++;
    return {
      ok: true,
      status: 200,
      json: async () => ({ code: 0, data: { records: [{ record_id: 'recCDupBad' }] } }),
    };
  }
  if (url.includes('/tables/tblAccIdemp/records')) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        code: 0,
        data: {
          items: [{ record_id: 'recAccBili110', fields: { 账号名称: 'B站·万物有数可视化', 平台: 'B站', 所属品牌: '万物皆有数', 账号状态: 'Z310运营中' } }],
        },
      }),
    };
  }
  if (url.includes('/tables/tblWorkIdemp/records')) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        code: 0,
        data: {
          items: [
            {
              record_id: 'recWork110',
              fields: {
                选题方向: '110｜珠江口三虎',
                本地作品目录: '20261118_珠江口三虎',
                状态: workApprovedFlag ? 'B12等待发布至平台' : 'B11待审核',
                审片通过时间: workApprovedFlag ? Date.now() : null,
                所属品牌: '万物皆有数',
              },
            },
          ],
        },
      }),
    };
  }
  if (url.includes('/tables/tblPubIdemp/records')) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        code: 0,
        data: {
          items: [
            {
              record_id: 'recCExisting110',
              fields: {
                发布编号: 'C00280',
                内容运营表: [{ id: 'recWork110' }],
                分发账号: [{ id: 'recAccBili110' }],
                状态: 'C00未发布',
              },
            },
          ],
        },
      }),
    };
  }
  throw new Error(`Unexpected URL in Test 8: ${url}`);
};

// 8a) 模拟手抖同时三连击「审片通过」：并发锁合并后严格只发 1 次 batch_update！
const [ap1, ap2, ap3] = await Promise.all([
  approveWorkReviewInFeishu({ bRecordId: 'recWork110', workSlug: '20261118_珠江口三虎' }),
  approveWorkReviewInFeishu({ bRecordId: 'recWork110', workSlug: '20261118_珠江口三虎' }),
  approveWorkReviewInFeishu({ bRecordId: 'recWork110', workSlug: '20261118_珠江口三虎' }),
]);
assert.equal(ap1.approved, true);
assert.equal(ap2.approved, true);
assert.equal(ap3.approved, true);
assert.equal(bBatchUpdateCount, 1, '同时三连击审片通过严格只允许写入 B 表 1 次，杜绝并发触发自动化翻倍建行');

// 8b) 审片完成后再次点击（已处于 B12 / 已填审片通过时间）：幂等拦截，0 次写入！
const apAgain = await approveWorkReviewInFeishu({ bRecordId: 'recWork110', workSlug: '20261118_珠江口三虎' });
assert.equal(apAgain.alreadyApproved, true, '已审片作品再次点击必须命中幂等防重保护');
assert.equal(bBatchUpdateCount, 1, '已审片作品再次点击必须 0 次写入 B 表');

// 8c) 同步发布时间时即使未传 cRecordId 且手抖并发双点：必须自动反查命中已有 (作品, 账号) 行执行 batch_update，0 次 batch_create！
const [sp1, sp2] = await Promise.all([
  syncPrePublishToFeishu({
    platform: 'bilibili',
    bRecordId: 'recWork110',
    workSlug: '20261118_珠江口三虎',
    title: '珠江口三虎测试标题',
    force: true,
  }),
  syncPrePublishToFeishu({
    platform: 'bilibili',
    bRecordId: 'recWork110',
    workSlug: '20261118_珠江口三虎',
    title: '珠江口三虎测试标题',
    force: true,
  }),
]);
assert.equal(sp1.cRecordId, 'recCExisting110');
assert.equal(sp2.cRecordId, 'recCExisting110');
assert.equal(cBatchCreateCount, 0, '同一账号同一内容严禁调用 batch_create 新建重复记录');
assert.equal(cBatchUpdateCount, 1, '并发点击发前同步严格只发 1 次 batch_update 更新原记录');

console.log('✅ All Feishu pure-JS client, 429 retry + anti-duplicate idempotency + 1-account-1-content tests passed!');
