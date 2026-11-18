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
  exportFeishuConfigCode,
  importFeishuConfigCode,
  extractCleanWorkSlug,
  buildSafeWriteFields,
  evaluateScheduleConflicts,
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

// ==================== Test 4: 同账号 6h 排期防撞雷达检测 ====================
const baseMs = new Date('2026-11-19T18:00:00+08:00').getTime();
const conflictCheck = evaluateScheduleConflicts({
  cRows: [
    {
      record_id: 'recC_existing',
      fields: {
        分发账号: [{ id: 'recAcc_Bili' }],
        内容运营表: [{ id: 'recB_other' }],
        状态: 'C10等待定时发布',
        计划发布时间: baseMs + 2 * 3600 * 1000, // 20:00 (仅隔 2 小时 -> 撞车!)
        标题: '上一条待发视频',
      },
    },
  ],
  bById: new Map(),
  fmPub: {
    accountLink: '分发账号',
    workLink: '内容运营表',
    status: '状态',
    plannedAt: '计划发布时间',
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

console.log('✅ All Feishu pure-JS client, config code migration & conflict radar tests passed!');
