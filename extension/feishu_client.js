// Pure-JS Zero-Dependency Feishu / Lark Bitable Engine (v2.0.0)
// Runs inside Chrome MV3 Service Worker (background.js) — 100% decoupled from local Python / CLI / OS environment.
// Supports both Feishu Custom App (App ID + App Secret) and Personal Base Token, Multi-Table (Z3/B/C) & Single-Table schemas,
// Schema Auto-Discovery, Cloud PublishPack Snapshot Fallback, and 6h Schedule Conflict Detection.

'use strict';

const FEISHU_CONFIG_STORAGE_KEY = 'ppf_feishu_config_v1';
const FEISHU_SCHEMA_CACHE_KEY = 'ppf_feishu_schema_cache_v1';
const FEISHU_TAT_CACHE_KEY = 'ppf_feishu_tat_cache_v1';

const DEFAULT_FEISHU_CONFIG = {
  enabled: false,
  authType: 'app', // 'app' | 'personal_token'
  apiDomain: 'https://open.feishu.cn', // or 'https://open.larksuite.com'
  appId: '',
  appSecret: '',
  personalBaseToken: '',
  baseUrl: '',
  baseToken: '',
  schemaMode: 'multi_table', // 'multi_table' | 'single_table'
  minGapHours: 6,
  tables: {
    accounts: '',
    works: '',
    publishes: '',
  },
  fieldMap: {
    accounts: {
      name: '账号名称',
      nickname: '账号昵称',
      platform: '平台',
      brand: '所属品牌',
      status: '账号状态',
      goldenWindows: '黄金发布时段',
      defaultCollection: '默认合集兜底',
    },
    works: {
      title: '选题方向',
      slug: '本地作品目录',
      status: '状态',
      brand: '所属品牌',
      fallbackTitle: '通用标题',
      fallbackBody: '通用文案',
      packSnapshot: '发布包快照',
    },
    publishes: {
      workLink: '内容运营表',
      accountLink: '分发账号',
      accountText: '分发账号',
      platformText: '平台',
      workTitleText: '作品名称',
      status: '状态',
      plannedAt: '计划发布时间',
      publishedAt: '真实发布日期',
      title: '标题',
      body: '正文',
      tags: '话题标签',
      postUrl: '发布内容链接',
      notes: '备注',
    },
  },
  statusValues: {
    accountActive: 'Z310运营中',
    workReady: 'B12等待发布至平台',
    workCompleted: 'B21已完成',
    pubPending: 'C00未发布',
    pubScheduled: 'C10等待定时发布',
    pubPublished: 'C21已发布',
  },
};

let memQueryCache = {
  key: '',
  ts: 0,
  data: null,
};

function invalidateFeishuMemCache() {
  memQueryCache = { key: '', ts: 0, data: null };
}

function deepMergeConfig(saved = {}) {
  const out = {
    ...DEFAULT_FEISHU_CONFIG,
    ...(saved || {}),
    tables: { ...DEFAULT_FEISHU_CONFIG.tables, ...(saved?.tables || {}) },
    fieldMap: {
      accounts: { ...DEFAULT_FEISHU_CONFIG.fieldMap.accounts, ...(saved?.fieldMap?.accounts || {}) },
      works: { ...DEFAULT_FEISHU_CONFIG.fieldMap.works, ...(saved?.fieldMap?.works || {}) },
      publishes: { ...DEFAULT_FEISHU_CONFIG.fieldMap.publishes, ...(saved?.fieldMap?.publishes || {}) },
    },
    statusValues: { ...DEFAULT_FEISHU_CONFIG.statusValues, ...(saved?.statusValues || {}) },
  };
  if (out.baseUrl && !out.baseToken) {
    out.baseToken = extractBaseTokenFromUrl(out.baseUrl);
  }
  out.enabled = Boolean(
    out.baseToken &&
      ((out.authType === 'personal_token' && out.personalBaseToken) || (out.appId && out.appSecret))
  );
  return out;
}

function extractBaseTokenFromUrl(input = '') {
  const s = String(input || '').trim();
  if (!s) return '';
  const m = s.match(/\/base\/([A-Za-z0-9_-]{12,})/);
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]{15,}$/.test(s) && !s.includes('/')) return s;
  return '';
}

function detectApiDomainFromUrl(input = '', current = 'https://open.feishu.cn') {
  const s = String(input || '').toLowerCase();
  if (s.includes('larksuite.com') || s.includes('larkoffice.com')) {
    return 'https://open.larksuite.com';
  }
  if (s.includes('feishu.cn')) {
    return 'https://open.feishu.cn';
  }
  return current || 'https://open.feishu.cn';
}

function utf8ToBase64Url(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToUtf8(b64u) {
  let b64 = String(b64u || '').replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function exportFeishuConfigCode(cfg, { includeSecret = true } = {}) {
  const clean = deepMergeConfig(cfg);
  const payload = {
    v: 2,
    authType: clean.authType,
    apiDomain: clean.apiDomain,
    appId: clean.appId,
    appSecret: includeSecret ? clean.appSecret : '',
    personalBaseToken: includeSecret ? clean.personalBaseToken : '',
    baseUrl: clean.baseUrl,
    baseToken: clean.baseToken,
    schemaMode: clean.schemaMode,
    minGapHours: clean.minGapHours,
    tables: clean.tables,
    fieldMap: clean.fieldMap,
    statusValues: clean.statusValues,
  };
  return `PPF2:${utf8ToBase64Url(JSON.stringify(payload))}`;
}

function importFeishuConfigCode(codeStr) {
  const raw = String(codeStr || '').trim();
  const body = raw.startsWith('PPF2:') ? raw.slice(5) : raw;
  let obj;
  if (body.startsWith('{')) {
    obj = JSON.parse(body);
  } else {
    obj = JSON.parse(base64UrlToUtf8(body));
  }
  if (!obj || typeof obj !== 'object') {
    throw new Error('无效的配置码格式');
  }
  return deepMergeConfig(obj);
}

async function loadFeishuConfig() {
  const res = await chrome.storage.local.get(FEISHU_CONFIG_STORAGE_KEY);
  const raw = res?.[FEISHU_CONFIG_STORAGE_KEY];
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  return deepMergeConfig(parsed || {});
}

async function saveFeishuConfig(cfg) {
  const merged = deepMergeConfig(cfg);
  invalidateFeishuMemCache();
  await chrome.storage.local.set({ [FEISHU_CONFIG_STORAGE_KEY]: merged });
  return merged;
}

async function getAccessToken(cfg) {
  if (cfg.authType === 'personal_token') {
    if (!cfg.personalBaseToken) throw new Error('尚未填写多维表格个人授权码');
    return {
      token: cfg.personalBaseToken.trim(),
      baseOrigin: cfg.apiDomain.includes('larksuite')
        ? 'https://base-api.larksuite.com'
        : 'https://base-api.feishu.cn',
    };
  }

  if (!cfg.appId || !cfg.appSecret) {
    throw new Error('尚未配置飞书 App ID 或 App Secret');
  }

  const cacheKey = `${cfg.apiDomain}|${cfg.appId}`;
  const stored = await chrome.storage.local.get(FEISHU_TAT_CACHE_KEY);
  const tatMap = stored?.[FEISHU_TAT_CACHE_KEY] || {};
  const hit = tatMap[cacheKey];
  const nowSec = Math.floor(Date.now() / 1000);
  if (hit && hit.token && hit.expireAt > nowSec + 120) {
    return { token: hit.token, baseOrigin: cfg.apiDomain };
  }

  const resp = await fetch(`${cfg.apiDomain}/open-apis/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ app_id: cfg.appId.trim(), app_secret: cfg.appSecret.trim() }),
  });
  const json = await resp.json();
  if (json.code !== 0 || !json.tenant_access_token) {
    throw new Error(`飞书应用鉴权失败 (${json.code}): ${json.msg || '请检查 App ID 与 App Secret'}`);
  }

  tatMap[cacheKey] = {
    token: json.tenant_access_token,
    expireAt: nowSec + Number(json.expire || 7200),
  };
  await chrome.storage.local.set({ [FEISHU_TAT_CACHE_KEY]: tatMap });
  return { token: json.tenant_access_token, baseOrigin: cfg.apiDomain };
}

async function feishuApiRequest(cfg, method, path, { params = null, body = null } = {}) {
  if (!cfg.baseToken) {
    throw new Error('尚未配置飞书多维表格 Base Token');
  }
  const { token, baseOrigin } = await getAccessToken(cfg);
  let url = `${baseOrigin}${path}`;
  if (params && Object.keys(params).length > 0) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
    }
    const qStr = qs.toString();
    if (qStr) url += (url.includes('?') ? '&' : '?') + qStr;
  }

  const init = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    cache: 'no-store',
  };
  if (body !== null && method !== 'GET') {
    init.body = JSON.stringify(body);
  }

  const res = await fetch(url, init);
  const json = await res.json().catch(() => ({}));
  if (!res.ok || (typeof json.code === 'number' && json.code !== 0)) {
    const code = json.code ?? json.error?.code ?? res.status;
    let hint = json.msg || json.message || json.error?.message || `HTTP ${res.status}`;
    if (code === 91403 || code === 1254302) {
      hint += '（请确认已在多维表格右上角「... -> 添加文档应用」将机器人加入并设为可编辑，且应用已开通 bitable:app 权限）';
    }
    const err = new Error(`飞书接口错误 (${code}): ${hint}`);
    err.feishuCode = code;
    err.httpStatus = res.status;
    throw err;
  }
  return json.data || {};
}

async function listAllRecords(cfg, tableId, maxRecords = 500) {
  if (!tableId) return [];
  const items = [];
  let pageToken = '';
  while (items.length < maxRecords) {
    const pageSize = Math.min(500, maxRecords - items.length);
    const data = await feishuApiRequest(
      cfg,
      'GET',
      `/open-apis/bitable/v1/apps/${cfg.baseToken}/tables/${tableId}/records`,
      { params: { page_size: pageSize, page_token: pageToken } }
    );
    for (const it of data.items || []) {
      items.push({ record_id: it.record_id, fields: it.fields || {} });
    }
    if (!data.has_more || !data.page_token) break;
    pageToken = data.page_token;
  }
  return items;
}

async function getTableFieldsMeta(cfg, tableId, { forceRefresh = false } = {}) {
  if (!tableId) return [];
  const cacheKey = `${cfg.baseToken}|${tableId}`;
  if (!forceRefresh) {
    const stored = await chrome.storage.local.get(FEISHU_SCHEMA_CACHE_KEY);
    const map = stored?.[FEISHU_SCHEMA_CACHE_KEY] || {};
    if (map[cacheKey] && Date.now() - map[cacheKey].ts < 600_000) {
      return map[cacheKey].fields;
    }
  }
  const data = await feishuApiRequest(
    cfg,
    'GET',
    `/open-apis/bitable/v1/apps/${cfg.baseToken}/tables/${tableId}/fields`,
    { params: { page_size: 100 } }
  );
  const fields = data.items || [];
  const stored = await chrome.storage.local.get(FEISHU_SCHEMA_CACHE_KEY);
  const map = stored?.[FEISHU_SCHEMA_CACHE_KEY] || {};
  map[cacheKey] = { ts: Date.now(), fields };
  await chrome.storage.local.set({ [FEISHU_SCHEMA_CACHE_KEY]: map });
  return fields;
}

// 自动探测多维表格内的表结构与列名映射（支持 Z3/B/C 多表体系与单张排期表体系）
async function discoverAndSaveSchema(rawInputCfg) {
  const cfg = deepMergeConfig(rawInputCfg);
  if (cfg.baseUrl) {
    const extracted = extractBaseTokenFromUrl(cfg.baseUrl);
    if (extracted) cfg.baseToken = extracted;
    cfg.apiDomain = detectApiDomainFromUrl(cfg.baseUrl, cfg.apiDomain);
  }
  if (!cfg.baseToken) {
    throw new Error('请填写有效的飞书多维表格链接或 Base Token');
  }

  const data = await feishuApiRequest(cfg, 'GET', `/open-apis/bitable/v1/apps/${cfg.baseToken}/tables`, {
    params: { page_size: 100 },
  });
  const tables = (data.items || []).map((t) => ({ table_id: t.table_id, name: t.name }));
  if (!tables.length) {
    throw new Error('该多维表格内没有任何数据表');
  }

  // 智能匹配表：若用户尚未手选或旧表 ID 不在此 Base 中，自动按表名特征匹配
  const validIds = new Set(tables.map((t) => t.table_id));
  const findTable = (regexList) => {
    for (const re of regexList) {
      const hit = tables.find((t) => re.test(t.name));
      if (hit) return hit.table_id;
    }
    return '';
  };

  if (!validIds.has(cfg.tables.accounts)) {
    cfg.tables.accounts = findTable([/^Z3/i, /账号资产|账号管理|分发账号表|账号表/]);
  }
  if (!validIds.has(cfg.tables.works)) {
    cfg.tables.works = findTable([/^B\s|^B[内容_·]/i, /内容运营|作品管理|作品库|选题库|内容表/]);
  }
  if (!validIds.has(cfg.tables.publishes)) {
    cfg.tables.publishes =
      findTable([/^C\s|^C[发布_·]/i, /发布记录|发布排期|分发记录|排期表|发布表/]) || tables[0].table_id;
  }

  cfg.schemaMode = cfg.tables.works && cfg.tables.works !== cfg.tables.publishes ? 'multi_table' : 'single_table';

  // 自动校准列名别名（兼容不同团队的表头命名习惯）
  const matchCol = (fieldsMeta, currentName, candidates) => {
    const names = fieldsMeta.map((f) => f.field_name);
    if (currentName && names.includes(currentName)) return currentName;
    for (const cand of candidates) {
      if (typeof cand === 'string' && names.includes(cand)) return cand;
      if (cand instanceof RegExp) {
        const found = names.find((n) => cand.test(n));
        if (found) return found;
      }
    }
    return currentName;
  };

  const schemaSummary = { tables, detectedFields: {} };

  if (cfg.tables.accounts) {
    const fAcc = await getTableFieldsMeta(cfg, cfg.tables.accounts, { forceRefresh: true });
    schemaSummary.detectedFields.accounts = fAcc.map((f) => f.field_name);
    cfg.fieldMap.accounts.name = matchCol(fAcc, cfg.fieldMap.accounts.name, ['账号名称', '账号名', '名称', /账号/]);
    cfg.fieldMap.accounts.nickname = matchCol(fAcc, cfg.fieldMap.accounts.nickname, ['账号昵称', '昵称']);
    cfg.fieldMap.accounts.platform = matchCol(fAcc, cfg.fieldMap.accounts.platform, ['平台', '分发平台', '渠道']);
    cfg.fieldMap.accounts.brand = matchCol(fAcc, cfg.fieldMap.accounts.brand, ['所属品牌', '品牌', '项目']);
    cfg.fieldMap.accounts.status = matchCol(fAcc, cfg.fieldMap.accounts.status, ['账号状态', '状态']);
    cfg.fieldMap.accounts.goldenWindows = matchCol(fAcc, cfg.fieldMap.accounts.goldenWindows, ['黄金发布时段', /黄金.*时段/]);
    cfg.fieldMap.accounts.defaultCollection = matchCol(fAcc, cfg.fieldMap.accounts.defaultCollection, ['默认合集兜底', /合集/]);
  }

  if (cfg.tables.works) {
    const fWork = await getTableFieldsMeta(cfg, cfg.tables.works, { forceRefresh: true });
    schemaSummary.detectedFields.works = fWork.map((f) => f.field_name);
    cfg.fieldMap.works.title = matchCol(fWork, cfg.fieldMap.works.title, ['选题方向', '作品名称', '选题名称', '内容标题', '名称']);
    cfg.fieldMap.works.slug = matchCol(fWork, cfg.fieldMap.works.slug, ['本地作品目录', '作品目录', '本地目录', '目录名', /目录/]);
    cfg.fieldMap.works.status = matchCol(fWork, cfg.fieldMap.works.status, ['状态', '制作状态', '进度']);
    cfg.fieldMap.works.brand = matchCol(fWork, cfg.fieldMap.works.brand, ['所属品牌', '品牌', '账号归属']);
    cfg.fieldMap.works.fallbackTitle = matchCol(fWork, cfg.fieldMap.works.fallbackTitle, ['通用标题', '参考标题', '主标题']);
    cfg.fieldMap.works.fallbackBody = matchCol(fWork, cfg.fieldMap.works.fallbackBody, ['通用文案', '正文草稿', '文案']);
    cfg.fieldMap.works.packSnapshot = matchCol(fWork, cfg.fieldMap.works.packSnapshot, [
      '发布包快照',
      '发布包JSON',
      'publish_pack',
      /发布包.*快照|发布包.*json/i,
    ]);
    schemaSummary.hasPackSnapshotColumn = fWork.some((f) => f.field_name === cfg.fieldMap.works.packSnapshot);
  }

  if (cfg.tables.publishes) {
    const fPub = await getTableFieldsMeta(cfg, cfg.tables.publishes, { forceRefresh: true });
    schemaSummary.detectedFields.publishes = fPub.map((f) => f.field_name);
    cfg.fieldMap.publishes.workLink = matchCol(fPub, cfg.fieldMap.publishes.workLink, ['内容运营表', '关联内容', '关联作品', /内容|作品/]);
    cfg.fieldMap.publishes.accountLink = matchCol(fPub, cfg.fieldMap.publishes.accountLink, ['分发账号', '关联账号', '发布账号', '账号']);
    cfg.fieldMap.publishes.platformText = matchCol(fPub, cfg.fieldMap.publishes.platformText, ['平台', '发布平台', '渠道']);
    cfg.fieldMap.publishes.status = matchCol(fPub, cfg.fieldMap.publishes.status, ['状态', '发布状态']);
    cfg.fieldMap.publishes.plannedAt = matchCol(fPub, cfg.fieldMap.publishes.plannedAt, ['计划发布时间', '排期时间', '定时发布时间', /计划.*时间/]);
    cfg.fieldMap.publishes.publishedAt = matchCol(fPub, cfg.fieldMap.publishes.publishedAt, ['真实发布日期', '发布日期', '实际发布时间', '发布时间']);
    cfg.fieldMap.publishes.title = matchCol(fPub, cfg.fieldMap.publishes.title, ['标题', '实发标题', '发布标题']);
    cfg.fieldMap.publishes.body = matchCol(fPub, cfg.fieldMap.publishes.body, ['正文', '描述', '实发正文', '文案']);
    cfg.fieldMap.publishes.tags = matchCol(fPub, cfg.fieldMap.publishes.tags, ['话题标签', '标签', '话题']);
    cfg.fieldMap.publishes.postUrl = matchCol(fPub, cfg.fieldMap.publishes.postUrl, ['发布内容链接', '作品链接', '线上链接', '链接']);
    cfg.fieldMap.publishes.notes = matchCol(fPub, cfg.fieldMap.publishes.notes, ['备注', '说明']);
  }

  const saved = await saveFeishuConfig(cfg);
  return { config: saved, schemaSummary };
}

async function ensurePackSnapshotColumn() {
  const cfg = await loadFeishuConfig();
  if (!cfg.tables.works) {
    throw new Error('当前未映射「内容表(B表)」，请先探测并选择内容表');
  }
  const colName = (cfg.fieldMap.works.packSnapshot || '发布包快照').trim();
  const fields = await getTableFieldsMeta(cfg, cfg.tables.works, { forceRefresh: true });
  const exists = fields.find((f) => f.field_name === colName);
  if (exists) {
    return { created: false, fieldName: colName };
  }
  await feishuApiRequest(
    cfg,
    'POST',
    `/open-apis/bitable/v1/apps/${cfg.baseToken}/tables/${cfg.tables.works}/fields`,
    { body: { field_name: colName, type: 1 } }
  );
  await getTableFieldsMeta(cfg, cfg.tables.works, { forceRefresh: true });
  return { created: true, fieldName: colName };
}

// ==================== 字段读取与类型安全写入转换工具 ====================
function cellText(val) {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
    return String(val).trim();
  }
  if (Array.isArray(val)) {
    if (!val.length) return '';
    // Feishu rich text segment array: [{ type: 'text', text: '...' }, ...]
    if (val.every((item) => item && typeof item === 'object' && 'text' in item && !('record_ids' in item))) {
      return val.map((item) => item.text || '').join('').trim();
    }
    const first = val[0];
    if (first && typeof first === 'object') {
      return String(first.text || first.name || first.link || first.id || '').trim();
    }
    return val.map((x) => String(x)).join(', ').trim();
  }
  if (typeof val === 'object') {
    if (Array.isArray(val.text_arr)) return val.text_arr.join(', ').trim();
    return String(val.text || val.name || val.link || '').trim();
  }
  return '';
}

function cellLinkIds(val) {
  if (!val) return [];
  if (typeof val === 'object' && !Array.isArray(val)) {
    if (Array.isArray(val.link_record_ids)) return val.link_record_ids.map(String);
    if (Array.isArray(val.record_ids)) return val.record_ids.map(String);
  }
  if (Array.isArray(val)) {
    const out = [];
    for (const item of val) {
      if (typeof item === 'string') out.push(item);
      else if (item && typeof item === 'object') {
        if (item.id) out.push(String(item.id));
        if (Array.isArray(item.record_ids)) out.push(...item.record_ids.map(String));
        if (Array.isArray(item.link_record_ids)) out.push(...item.link_record_ids.map(String));
      }
    }
    return out;
  }
  return [];
}

function parseDateTimeMs(val) {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') {
    return val > 1e11 ? Math.round(val) : Math.round(val * 1000);
  }
  const s = String(val).trim();
  if (/^\d{10,13}$/.test(s)) {
    const n = Number(s);
    return n > 1e11 ? n : n * 1000;
  }
  const m = s.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    const d = new Date(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3]),
      Number(m[4] || 0),
      Number(m[5] || 0),
      Number(m[6] || 0)
    );
    return d.getTime();
  }
  const parsed = Date.parse(s);
  return Number.isNaN(parsed) ? null : parsed;
}

function formatMsLocalHM(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function normalizeTitleKey(str = '') {
  return String(str || '')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}_]+/gu, '');
}

function extractCleanWorkSlug(raw = '') {
  const s = String(raw || '').trim().replace(/\\/g, '/').replace(/\/+$/, '');
  if (!s) return '';
  const slugMatch = s.match(/(\d{8}_[^/#?\s]+)/);
  if (slugMatch) return slugMatch[1];
  const parts = s.split('/').filter(Boolean);
  if (!parts.length) return '';
  let last = parts[parts.length - 1];
  if (/^(?:成片|04_成片|04_发布与成片|09_发布与交付|publish_pack)$/i.test(last) && parts.length >= 2) {
    last = parts[parts.length - 2];
  }
  // 排除把磁盘盘符或纯系统目录误当成 slug
  if (/^(?:Users|Desktop|AIHub|Code|Downloads|Volumes)$/i.test(last)) return '';
  return last;
}

function normalizePlatformCn(plat = '') {
  const p = String(plat || '').toLowerCase();
  if (p.includes('xiaohongshu') || p === 'xhs' || p.includes('小红书')) return '小红书';
  if (p.includes('douyin') || p === 'dy' || p.includes('抖音')) return '抖音';
  if (p.includes('weixin_mp') || p === 'mp' || p.includes('公众号')) return '公众号';
  if (p.includes('weixin') || p === 'wx' || p === 'sph' || p.includes('视频号')) return '视频号';
  if (p.includes('bilibili') || p === 'bili' || p.includes('b站') || p.includes('哔哩')) return 'B站';
  if (p.includes('kuaishou') || p === 'ks' || p.includes('快手')) return '快手';
  return plat;
}

function platformMatches(rowPlatText, targetPlatCn) {
  const a = normalizePlatformCn(rowPlatText);
  const b = normalizePlatformCn(targetPlatCn);
  return Boolean(a && b && a === b);
}

function resolveSingleSelectOptionName(meta, rawVal) {
  const desired = Array.isArray(rawVal) ? String(rawVal[0] || '').trim() : String(rawVal).trim();
  if (!desired) return '';
  const opts = meta?.property?.options || [];
  if (opts.length > 0) {
    const exact = opts.find((o) => o.name === desired);
    const fuzzy =
      exact ||
      opts.find((o) => o.name.includes(desired) || desired.includes(o.name)) ||
      (/定时/.test(desired) && opts.find((o) => /定时|排期|C10/.test(o.name))) ||
      (/已发布|已完成/.test(desired) && opts.find((o) => /已发布|已完成|C21|B21/.test(o.name))) ||
      (/未发布|待发布/.test(desired) && opts.find((o) => /未发布|待发布|C00|B12/.test(o.name)));
    return fuzzy ? fuzzy.name : desired;
  }
  return desired;
}

function resolveMultiSelectOptionNames(meta, rawVal, strictKnownOptionsOnly = false) {
  const arr = Array.isArray(rawVal)
    ? rawVal
    : String(rawVal)
        .split(/[,，\s#]+/)
        .filter(Boolean);
  const cleaned = arr.map((x) => String(x).replace(/^#+/, '').trim()).filter(Boolean);
  const opts = meta?.property?.options || [];
  if (!opts.length) {
    return strictKnownOptionsOnly ? [] : cleaned;
  }
  const byLower = new Map(opts.map((o) => [String(o.name || '').toLowerCase(), o.name]));
  const result = [];
  for (const item of cleaned) {
    const known = byLower.get(item.toLowerCase());
    if (known) {
      if (!result.includes(known)) result.push(known);
    } else if (!strictKnownOptionsOnly) {
      if (!result.includes(item)) result.push(item);
    }
  }
  return result;
}

// 组装飞书 Bitable v1 接口字段格式（适用于个人授权码 pt-... 模式及普通单选表）
function buildSafeWriteFields(fieldsMeta, rawEntries, { strictKnownOptionsOnly = false } = {}) {
  const byName = new Map();
  for (const f of fieldsMeta || []) {
    // 跳过公式(20)、查找引用(19)、按钮(3001)、创建时间(1001)、自动编号(1005) 等只读字段
    if ([19, 20, 1001, 1002, 1003, 1004, 1005, 3001].includes(f.type)) continue;
    byName.set(f.field_name, f);
  }

  const out = {};
  for (const [colName, rawVal] of Object.entries(rawEntries)) {
    if (!colName || rawVal === undefined) continue;
    const meta = byName.get(colName);
    if (!meta) continue;

    if (rawVal === null) {
      out[colName] = null;
      continue;
    }

    switch (meta.type) {
      case 1: // Text
      case 13: // Phone
        out[colName] = String(rawVal);
        break;
      case 2: { // Number
        const n = Number(rawVal);
        if (!Number.isNaN(n)) out[colName] = n;
        break;
      }
      case 3: { // SingleSelect (v1 传纯字符串)
        const optName = resolveSingleSelectOptionName(meta, rawVal);
        if (optName) out[colName] = optName;
        break;
      }
      case 4: { // MultiSelect
        const multi = resolveMultiSelectOptionNames(meta, rawVal, strictKnownOptionsOnly);
        if (multi.length > 0) out[colName] = multi;
        break;
      }
      case 5: { // DateTime (v1 传毫秒时间戳)
        const ms = parseDateTimeMs(rawVal);
        if (ms !== null) out[colName] = ms;
        break;
      }
      case 7: // Checkbox
        out[colName] = Boolean(rawVal);
        break;
      case 15: { // Url
        const u = typeof rawVal === 'object' ? rawVal.link || rawVal.url || '' : String(rawVal).trim();
        if (u) out[colName] = { link: u, text: typeof rawVal === 'object' && rawVal.text ? rawVal.text : u };
        break;
      }
      case 18:
      case 21: { // SingleLink / DuplexLink (v1 传 ["recXXX"])
        const ids = Array.isArray(rawVal)
          ? rawVal.map((x) => (typeof x === 'object' ? x.id : String(x))).filter(Boolean)
          : [String(rawVal)].filter(Boolean);
        if (ids.length) out[colName] = ids;
        break;
      }
      default:
        out[colName] = rawVal;
    }
  }
  return out;
}

// 组装飞书 Base v3 接口字段格式（完美兼容飞书「引用选项 dynamic_options_source」全局状态流转列，彻底解决 v1 的 1254062 SingleSelectFieldConvFail！）
function buildSafeV3WriteFields(fieldsMeta, rawEntries, { strictKnownOptionsOnly = false } = {}) {
  const byName = new Map();
  for (const f of fieldsMeta || []) {
    if ([19, 20, 1001, 1002, 1003, 1004, 1005, 3001].includes(f.type)) continue;
    byName.set(f.field_name, f);
  }

  const out = {};
  for (const [colName, rawVal] of Object.entries(rawEntries)) {
    if (!colName || rawVal === undefined) continue;
    const meta = byName.get(colName);
    if (!meta) continue;

    if (rawVal === null) {
      out[colName] = null;
      continue;
    }

    switch (meta.type) {
      case 1: // Text
      case 13: // Phone
        out[colName] = String(rawVal);
        break;
      case 2: { // Number
        const n = Number(rawVal);
        if (!Number.isNaN(n)) out[colName] = n;
        break;
      }
      case 3: { // SingleSelect (Base v3 传单元素字符串数组 ["C10等待定时发布"])
        const optName = resolveSingleSelectOptionName(meta, rawVal);
        if (optName) out[colName] = [optName];
        break;
      }
      case 4: { // MultiSelect
        const multi = resolveMultiSelectOptionNames(meta, rawVal, strictKnownOptionsOnly);
        if (multi.length > 0) out[colName] = multi;
        break;
      }
      case 5: { // DateTime (Base v3 传本地标准时间字符串 "YYYY-MM-DD HH:mm")
        const ms = parseDateTimeMs(rawVal);
        if (ms !== null) out[colName] = formatMsLocalHM(ms);
        break;
      }
      case 7: // Checkbox
        out[colName] = Boolean(rawVal);
        break;
      case 15: { // Url (Base v3 传纯链接字符串)
        const u = typeof rawVal === 'object' ? rawVal.link || rawVal.url || '' : String(rawVal).trim();
        if (u) out[colName] = u;
        break;
      }
      case 18:
      case 21: { // SingleLink / DuplexLink (Base v3 传 [{"id": "recXXX"}])
        const ids = Array.isArray(rawVal)
          ? rawVal.map((x) => (typeof x === 'object' ? x.id : String(x))).filter(Boolean)
          : [String(rawVal)].filter(Boolean);
        if (ids.length) out[colName] = ids.map((id) => ({ id }));
        break;
      }
      default:
        out[colName] = rawVal;
    }
  }
  return out;
}

// 双协议自适应写入引擎：自建应用模式优先走 Base v3（原生支持动态引用选项状态列，零 1254062 报错），并在动态标签库遇到新词报 800010409 时自动过滤未知新词重试；个人授权码模式自动走 v1。
async function smartBatchUpdateRecord(cfg, tableId, recordId, fieldsMeta, rawEntries) {
  if (cfg.authType !== 'personal_token') {
    const v3Fields = buildSafeV3WriteFields(fieldsMeta, rawEntries, { strictKnownOptionsOnly: false });
    if (Object.keys(v3Fields).length === 0) return;
    try {
      await feishuApiRequest(
        cfg,
        'POST',
        `/open-apis/base/v3/bases/${cfg.baseToken}/tables/${tableId}/records/batch_update`,
        { body: { update_records: { [recordId]: v3Fields } } }
      );
      return;
    } catch (err) {
      // 若多选字段引用了动态标签表且遇到未收录新词 (800010409 validation_error)，自动收敛为仅保留已收录标签重试
      if (err?.feishuCode === 800010409 || /validation_error/i.test(err?.message || '')) {
        const v3Strict = buildSafeV3WriteFields(fieldsMeta, rawEntries, { strictKnownOptionsOnly: true });
        if (Object.keys(v3Strict).length > 0) {
          await feishuApiRequest(
            cfg,
            'POST',
            `/open-apis/base/v3/bases/${cfg.baseToken}/tables/${tableId}/records/batch_update`,
            { body: { update_records: { [recordId]: v3Strict } } }
          );
          return;
        }
      }
      // 仅当网关不支持 base/v3 (404) 时降级尝试 v1
      if (err?.httpStatus !== 404) {
        throw err;
      }
    }
  }

  const v1Fields = buildSafeWriteFields(fieldsMeta, rawEntries, { strictKnownOptionsOnly: false });
  if (Object.keys(v1Fields).length === 0) return;
  try {
    await feishuApiRequest(
      cfg,
      'POST',
      `/open-apis/bitable/v1/apps/${cfg.baseToken}/tables/${tableId}/records/batch_update`,
      { body: { records: [{ record_id: recordId, fields: v1Fields }] } }
    );
  } catch (err) {
    if (/MultiSelectFieldConvFail/i.test(err?.message || '')) {
      const v1Strict = buildSafeWriteFields(fieldsMeta, rawEntries, { strictKnownOptionsOnly: true });
      await feishuApiRequest(
        cfg,
        'POST',
        `/open-apis/bitable/v1/apps/${cfg.baseToken}/tables/${tableId}/records/batch_update`,
        { body: { records: [{ record_id: recordId, fields: v1Strict }] } }
      );
      return;
    }
    throw err;
  }
}

async function smartBatchCreateRecord(cfg, tableId, fieldsMeta, rawEntries) {
  if (cfg.authType !== 'personal_token') {
    const v3Fields = buildSafeV3WriteFields(fieldsMeta, rawEntries, { strictKnownOptionsOnly: false });
    try {
      const created = await feishuApiRequest(
        cfg,
        'POST',
        `/open-apis/base/v3/bases/${cfg.baseToken}/tables/${tableId}/records/batch_create`,
        { body: { create_records: [v3Fields] } }
      );
      return created.record_id_list?.[0] || created.records?.[0]?.record_id || '';
    } catch (err) {
      if (err?.feishuCode === 800010409 || /validation_error/i.test(err?.message || '')) {
        const v3Strict = buildSafeV3WriteFields(fieldsMeta, rawEntries, { strictKnownOptionsOnly: true });
        const created = await feishuApiRequest(
          cfg,
          'POST',
          `/open-apis/base/v3/bases/${cfg.baseToken}/tables/${tableId}/records/batch_create`,
          { body: { create_records: [v3Strict] } }
        );
        return created.record_id_list?.[0] || created.records?.[0]?.record_id || '';
      }
      if (err?.httpStatus !== 404) {
        throw err;
      }
    }
  }

  const v1Fields = buildSafeWriteFields(fieldsMeta, rawEntries, { strictKnownOptionsOnly: false });
  try {
    const created = await feishuApiRequest(
      cfg,
      'POST',
      `/open-apis/bitable/v1/apps/${cfg.baseToken}/tables/${tableId}/records/batch_create`,
      { body: { records: [{ fields: v1Fields }] } }
    );
    return created.records?.[0]?.record_id || created.record_id_list?.[0] || '';
  } catch (err) {
    if (/MultiSelectFieldConvFail/i.test(err?.message || '')) {
      const v1Strict = buildSafeWriteFields(fieldsMeta, rawEntries, { strictKnownOptionsOnly: true });
      const created = await feishuApiRequest(
        cfg,
        'POST',
        `/open-apis/bitable/v1/apps/${cfg.baseToken}/tables/${tableId}/records/batch_create`,
        { body: { records: [{ fields: v1Strict }] } }
      );
      return created.records?.[0]?.record_id || created.record_id_list?.[0] || '';
    }
    throw err;
  }
}

// ==================== 核心业务 1：匹配账号、拉取待发作品关联池（含云端兜底）与 6h 排期防撞雷达 ====================
function matchAccountRecord(z3Rows, fmAcc, platCn, accountHint = '') {
  const samePlat = z3Rows.filter((r) => platformMatches(cellText(r.fields[fmAcc.platform]), platCn));
  if (!samePlat.length) return null;

  const cleanHint = String(accountHint || '')
    .replace(/^(?:小红书|抖音|微信视频号|视频号|B站|哔哩哔哩|快手)[·・:：\-\s]*/i, '')
    .replace(/[.。]+$/, '')
    .trim()
    .toLowerCase();

  if (cleanHint && cleanHint !== 'auto' && cleanHint !== '创作者账号') {
    for (const r of samePlat) {
      const hay = [
        cellText(r.fields[fmAcc.name]),
        cellText(r.fields[fmAcc.nickname]),
        cellText(r.fields[fmAcc.brand]),
      ]
        .join(' ')
        .toLowerCase();
      if (hay.includes(cleanHint) || (cleanHint.length >= 2 && hay.replace(/\s+/g, '').includes(cleanHint))) {
        return r;
      }
    }
  }

  // 优先返回运营中状态的第一个同平台账号
  const active = samePlat.find((r) => {
    const st = cellText(r.fields[fmAcc.status]);
    return !st || /运营中|启用|正常|Z310/i.test(st);
  });
  return active || samePlat[0];
}

function evaluateScheduleConflicts({ cRows, bById, fmPub, fmWork, accountId, platCn, targetMs, excludeBId, excludeCId, minGapHours = 6 }) {
  const gapMs = Math.max(0.5, Number(minGapHours || 6)) * 3600 * 1000;
  const conflicts = [];
  let lastPublished = null;
  const futureScheduled = [];
  const nowMs = Date.now();

  for (const cr of cRows) {
    if (excludeCId && cr.record_id === excludeCId) continue;
    const cf = cr.fields;

    if (accountId) {
      const linkedAccIds = cellLinkIds(cf[fmPub.accountLink]);
      if (linkedAccIds.length > 0 && !linkedAccIds.includes(accountId)) continue;
    } else if (fmPub.platformText && cf[fmPub.platformText]) {
      if (!platformMatches(cellText(cf[fmPub.platformText]), platCn)) continue;
    }

    const bIds = cellLinkIds(cf[fmPub.workLink]);
    if (excludeBId && bIds.includes(excludeBId)) continue;

    const st = cellText(cf[fmPub.status]);
    if (/取消|废弃|未通过|隐藏|C22|C23|C24/.test(st)) continue;

    const pubMs = parseDateTimeMs(cf[fmPub.publishedAt]);
    const planMs = parseDateTimeMs(cf[fmPub.plannedAt]);
    const effMs =
      /已发布|已完成|C21/.test(st) ? pubMs || planMs : /定时|等待|排期|C10/.test(st) ? planMs : null;
    if (!effMs) continue;

    const linkedB = bIds[0] && bById.get(bIds[0]);
    const itemTitle =
      cellText(cf[fmPub.title]) ||
      (linkedB ? cellText(linkedB.fields[fmWork.title]) : '') ||
      cellText(cf[fmPub.workTitleText]) ||
      '未命名排期';

    const recInfo = {
      cRecordId: cr.record_id,
      title: itemTitle,
      status: st,
      timeMs: effMs,
      timeStr: formatMsLocalHM(effMs),
      diffHours: Math.round((Math.abs(targetMs - effMs) / 3600000) * 10) / 10,
    };

    if (/已发布|C21/.test(st) && (!lastPublished || effMs > lastPublished.timeMs)) {
      lastPublished = recInfo;
    }
    if (effMs > nowMs - 1800_000 && /定时|等待|C10/.test(st)) {
      futureScheduled.push(recInfo);
    }
    if (Math.abs(targetMs - effMs) < gapMs) {
      conflicts.push(recInfo);
    }
  }

  futureScheduled.sort((a, b) => a.timeMs - b.timeMs);
  conflicts.sort((a, b) => a.diffHours - b.diffHours);

  let summary = '';
  if (conflicts.length > 0) {
    const first = conflicts[0];
    summary = `🔴 排期撞车预警：与《${first.title}》(${first.timeStr}) 仅隔 ${first.diffHours}h (<${minGapHours}h)`;
  } else if (lastPublished) {
    const hrs = Math.round(((targetMs - lastPublished.timeMs) / 3600000) * 10) / 10;
    summary = `🟢 排期安全（上条《${lastPublished.title}》于 ${lastPublished.timeStr}，间隔 ${hrs}h）`;
  } else {
    summary = `🟢 排期安全（近 ${minGapHours}h 内无同号冲突排期）`;
  }

  return {
    hasConflict: conflicts.length > 0,
    conflicts,
    lastPublished,
    futureScheduled: futureScheduled.slice(0, 5),
    summary,
  };
}

async function queryFeishuPublishContext(params = {}) {
  const cfg = await loadFeishuConfig();
  if (!cfg.enabled) {
    return { ok: true, configured: false, summary: '尚未配置飞书多维表连接' };
  }

  const platCn = normalizePlatformCn(params.platform || '');
  const accountHint = String(params.account || '').trim();
  const cleanSlug = extractCleanWorkSlug(params.workSlug || params.work || '');
  const titleHint = String(params.title || '').trim();
  const explicitCId = String(params.cRecordId || '').trim();
  const explicitBId = String(params.bRecordId || '').trim();
  const targetMs = parseDateTimeMs(params.plannedAt) || Date.now();

  const cacheSig = `${cfg.baseToken}|${platCn}|${accountHint}`;
  let baseData = null;
  if (!params.forceRefresh && memQueryCache.key === cacheSig && Date.now() - memQueryCache.ts < 15_000 && memQueryCache.data) {
    baseData = memQueryCache.data;
  } else {
    const [z3Rows, bRows, cRows] = await Promise.all([
      cfg.tables.accounts ? listAllRecords(cfg, cfg.tables.accounts, 200) : Promise.resolve([]),
      cfg.schemaMode === 'multi_table' && cfg.tables.works ? listAllRecords(cfg, cfg.tables.works, 500) : Promise.resolve([]),
      cfg.tables.publishes ? listAllRecords(cfg, cfg.tables.publishes, 500) : Promise.resolve([]),
    ]);
    baseData = { z3Rows, bRows, cRows };
    memQueryCache = { key: cacheSig, ts: Date.now(), data: baseData };
  }

  const { z3Rows, bRows, cRows } = baseData;
  const fmAcc = cfg.fieldMap.accounts;
  const fmWork = cfg.fieldMap.works;
  const fmPub = cfg.fieldMap.publishes;

  // 同平台全部可选账号（供用户在多矩阵号时切换）
  const platformAccounts = z3Rows
    .filter((r) => platformMatches(cellText(r.fields[fmAcc.platform]), platCn))
    .map((r) => ({
      recordId: r.record_id,
      name: cellText(r.fields[fmAcc.name]) || cellText(r.fields[fmAcc.nickname]) || r.record_id,
      brand: cellText(r.fields[fmAcc.brand]),
      goldenWindows: cellText(r.fields[fmAcc.goldenWindows]),
      defaultCollection: cellText(r.fields[fmAcc.defaultCollection]),
    }));

  const matchedAccRow = params.accountRecordId
    ? z3Rows.find((r) => r.record_id === params.accountRecordId) || matchAccountRecord(z3Rows, fmAcc, platCn, accountHint)
    : matchAccountRecord(z3Rows, fmAcc, platCn, accountHint);

  const accountId = matchedAccRow?.record_id || '';
  const accountName = matchedAccRow
    ? cellText(matchedAccRow.fields[fmAcc.name]) || cellText(matchedAccRow.fields[fmAcc.nickname])
    : accountHint || platCn;
  const accountBrand = matchedAccRow ? cellText(matchedAccRow.fields[fmAcc.brand]) : '';
  const goldenWindows = matchedAccRow ? cellText(matchedAccRow.fields[fmAcc.goldenWindows]) : '';
  const defaultCollection = matchedAccRow ? cellText(matchedAccRow.fields[fmAcc.defaultCollection]) : '';

  const bById = new Map(bRows.map((r) => [r.record_id, r]));

  // 构建该账号下的候选关联作品列表（包含待发排期与近期作品，并携带云端兜底文案！）
  const cByBIdForAcc = new Map();
  for (const cr of cRows) {
    const cf = cr.fields;
    if (accountId) {
      const accIds = cellLinkIds(cf[fmPub.accountLink]);
      if (accIds.length > 0 && !accIds.includes(accountId)) continue;
    }
    const bIds = cellLinkIds(cf[fmPub.workLink]);
    if (bIds[0]) {
      cByBIdForAcc.set(bIds[0], cr);
    }
  }

  const candidates = [];
  if (cfg.schemaMode === 'multi_table' && bRows.length > 0) {
    for (const br of bRows) {
      const bf = br.fields;
      const bBrand = cellText(bf[fmWork.brand]);
      if (accountBrand && bBrand && bBrand !== accountBrand) continue;
      const bSt = cellText(bf[fmWork.status]);
      if (/废弃|B22/.test(bSt)) continue;

      const linkedC = cByBIdForAcc.get(br.record_id);
      const cSt = linkedC ? cellText(linkedC.fields[fmPub.status]) : '';
      const isPendingOnThisPlat = !cSt || /未发布|待发布|定时|上传中|C00|C10/.test(cSt);
      // P1 审片闸门保护：默认仅纳入已审片放行的 B12等待发布至平台 / B21已完成 作品，拦截 B00/B10/B11 未审作品防误发
      const isReadyB = /等待发布|已完成|B12|B21/.test(bSt);
      if (!isPendingOnThisPlat && br.record_id !== explicitBId && linkedC?.record_id !== explicitCId) {
        // 已在本平台发完的作品放低优先级，仅保留少量近期项以备重发核对
        continue;
      }
      if (!isReadyB && br.record_id !== explicitBId && linkedC?.record_id !== explicitCId) continue;

      const label = cellText(bf[fmWork.title]) || cellText(bf[fmWork.slug]) || br.record_id;
      const slug = extractCleanWorkSlug(cellText(bf[fmWork.slug]));
      const plannedMs = linkedC ? parseDateTimeMs(linkedC.fields[fmPub.plannedAt]) : null;
      const snapshotRaw = fmWork.packSnapshot ? cellText(bf[fmWork.packSnapshot]) : '';

      candidates.push({
        bRecordId: br.record_id,
        cRecordId: linkedC?.record_id || '',
        label,
        slug,
        bStatus: bSt,
        cStatus: cSt || '未建排期行',
        plannedAt: plannedMs ? formatMsLocalHM(plannedMs) : '',
        hasCloudPack: Boolean(snapshotRaw && snapshotRaw.startsWith('{')),
        packSnapshot: snapshotRaw,
        fallbackTitle: cellText(bf[fmWork.fallbackTitle]) || label,
        fallbackBody: cellText(bf[fmWork.fallbackBody]),
        defaultCollection,
        priority: /C00|C10|未发布|定时/.test(cSt) ? 3 : /B12|等待发布/.test(bSt) ? 2 : /B11|待审核/.test(bSt) ? 1 : 0,
      });
    }
  } else {
    // 极简单表模式：直接把发布记录表中的未发布/待发记录作为候选池
    for (const cr of cRows) {
      const cf = cr.fields;
      const cSt = cellText(cf[fmPub.status]);
      if (/已发布|取消|废弃|C21|C23/.test(cSt) && cr.record_id !== explicitCId) continue;
      const label = cellText(cf[fmPub.title]) || cellText(cf[fmPub.workTitleText]) || cr.record_id;
      const plannedMs = parseDateTimeMs(cf[fmPub.plannedAt]);
      candidates.push({
        bRecordId: '',
        cRecordId: cr.record_id,
        label,
        slug: '',
        bStatus: '',
        cStatus: cSt || '待发布',
        plannedAt: plannedMs ? formatMsLocalHM(plannedMs) : '',
        hasCloudPack: false,
        packSnapshot: '',
        fallbackTitle: cellText(cf[fmPub.title]),
        fallbackBody: cellText(cf[fmPub.body]),
        defaultCollection,
        priority: 2,
      });
    }
  }

  candidates.sort((a, b) => {
    if (a.priority !== b.priority) return b.priority - a.priority;
    return b.label.localeCompare(a.label, 'zh-CN', { numeric: true });
  });

  // 四级精准自动匹配当前正在操作的作品（绝不依赖某台电脑的本地绝对路径）
  let matchedCandidate = null;
  let matchReason = '';

  if (explicitCId) {
    matchedCandidate = candidates.find((c) => c.cRecordId === explicitCId) || null;
    if (matchedCandidate) matchReason = '飞书排期直连';
  }
  if (!matchedCandidate && explicitBId) {
    matchedCandidate = candidates.find((c) => c.bRecordId === explicitBId) || null;
    if (matchedCandidate) matchReason = '手动指定作品';
  }
  if (!matchedCandidate && cleanSlug) {
    matchedCandidate = candidates.find((c) => c.slug && c.slug === cleanSlug) || null;
    if (matchedCandidate) matchReason = '作品目录名精确匹配';
  }
  if (!matchedCandidate && (titleHint || cleanSlug)) {
    const probeNorm = normalizeTitleKey(titleHint || cleanSlug.replace(/^\d{8}_/, ''));
    if (probeNorm.length >= 2) {
      matchedCandidate =
        candidates.find((c) => {
          const tNorm = normalizeTitleKey(c.fallbackTitle);
          const lNorm = normalizeTitleKey(c.label.replace(/^[0-9？?]+｜/, ''));
          return (
            (tNorm.length >= 4 && (probeNorm.includes(tNorm.slice(0, 8)) || tNorm.includes(probeNorm.slice(0, 8)))) ||
            (lNorm.length >= 2 && probeNorm.includes(lNorm))
          );
        }) || null;
      if (matchedCandidate) matchReason = '标题特征匹配';
    }
  }

  const radar = evaluateScheduleConflicts({
    cRows,
    bById,
    fmPub,
    fmWork,
    accountId,
    platCn,
    targetMs,
    excludeBId: matchedCandidate?.bRecordId || explicitBId || '',
    excludeCId: matchedCandidate?.cRecordId || explicitCId || '',
    minGapHours: cfg.minGapHours,
  });

  return {
    ok: true,
    configured: true,
    schemaMode: cfg.schemaMode,
    accountId,
    accountName,
    accountBrand,
    goldenWindows,
    defaultCollection,
    platformAccounts,
    candidates: candidates.slice(0, 60),
    matchedCandidate,
    matchReason,
    ...radar,
  };
}

// ==================== 核心业务 2：发布前一键同步排期时间 / 文案到飞书并备份云端快照 ====================
async function syncPrePublishToFeishu(payload = {}) {
  const cfg = await loadFeishuConfig();
  if (!cfg.enabled) {
    throw new Error('尚未配置飞书连接，请先点击「⚙️ 设置飞书」导入配置码或填写应用凭证');
  }

  const platCn = normalizePlatformCn(payload.platform || '');
  const fmAcc = cfg.fieldMap.accounts;
  const fmWork = cfg.fieldMap.works;
  const fmPub = cfg.fieldMap.publishes;

  const [z3Rows, bRows, cRows, pubFieldsMeta, workFieldsMeta] = await Promise.all([
    cfg.tables.accounts ? listAllRecords(cfg, cfg.tables.accounts, 200) : Promise.resolve([]),
    cfg.schemaMode === 'multi_table' && cfg.tables.works ? listAllRecords(cfg, cfg.tables.works, 500) : Promise.resolve([]),
    cfg.tables.publishes ? listAllRecords(cfg, cfg.tables.publishes, 500) : Promise.resolve([]),
    getTableFieldsMeta(cfg, cfg.tables.publishes),
    cfg.schemaMode === 'multi_table' && cfg.tables.works ? getTableFieldsMeta(cfg, cfg.tables.works) : Promise.resolve([]),
  ]);

  const matchedAccRow = payload.accountRecordId
    ? z3Rows.find((r) => r.record_id === payload.accountRecordId) || matchAccountRecord(z3Rows, fmAcc, platCn, payload.account)
    : matchAccountRecord(z3Rows, fmAcc, platCn, payload.account);

  const accountId = matchedAccRow?.record_id || '';
  const accountName = matchedAccRow
    ? cellText(matchedAccRow.fields[fmAcc.name]) || cellText(matchedAccRow.fields[fmAcc.nickname])
    : payload.account || platCn;
  const accountBrand = matchedAccRow ? cellText(matchedAccRow.fields[fmAcc.brand]) : '';

  const nowMs = Date.now();
  const parsedPlanMs = parseDateTimeMs(payload.plannedAt);
  const isScheduled = payload.mode === 'scheduled' || Boolean(parsedPlanMs && parsedPlanMs > nowMs + 5 * 60_000);
  const targetMs = isScheduled && parsedPlanMs ? parsedPlanMs : nowMs;
  const timeStr = formatMsLocalHM(targetMs);

  const bById = new Map(bRows.map((r) => [r.record_id, r]));
  let targetBId = payload.createNewWork ? '' : String(payload.bRecordId || '').trim();
  let targetCId = payload.createNewWork ? '' : String(payload.cRecordId || '').trim();
  const cleanSlug = extractCleanWorkSlug(payload.workSlug || payload.work || '');

  // 若未显式传 bRecordId 且非强制新建，按纯 slug 查找已有 B 记录
  if (cfg.schemaMode === 'multi_table' && !targetBId && !payload.createNewWork && cleanSlug) {
    const hitB = bRows.find((r) => {
      const bBrand = cellText(r.fields[fmWork.brand]);
      if (accountBrand && bBrand && bBrand !== accountBrand) return false;
      return extractCleanWorkSlug(cellText(r.fields[fmWork.slug])) === cleanSlug;
    });
    if (hitB) targetBId = hitB.record_id;
  }

  // 1. 6h 排期防撞校验
  const radar = evaluateScheduleConflicts({
    cRows,
    bById,
    fmPub,
    fmWork,
    accountId,
    platCn,
    targetMs,
    excludeBId: targetBId,
    excludeCId: targetCId,
    minGapHours: cfg.minGapHours,
  });

  if (radar.hasConflict && !payload.force) {
    return {
      ok: true,
      saved: false,
      needsConfirm: true,
      accountName,
      ...radar,
    };
  }

  // 2. 多表模式下：确保 B 内容表记录存在，并顺手把本机完整发布包快照或通用兜底文案备份上云（供 NAS 未同步的另一台电脑秒拉兜底！）
  let workLabel = String(payload.workLabel || '').trim();
  if (cfg.schemaMode === 'multi_table' && cfg.tables.works) {
    if (targetBId && bById.has(targetBId)) {
      const existB = bById.get(targetBId);
      workLabel = cellText(existB.fields[fmWork.title]) || workLabel || cleanSlug;
      const bUpdates = {};
      if (payload.packSnapshotJson && fmWork.packSnapshot) {
        const curSnap = cellText(existB.fields[fmWork.packSnapshot]);
        if (curSnap !== payload.packSnapshotJson && payload.packSnapshotJson.length < 45_000) {
          bUpdates[fmWork.packSnapshot] = payload.packSnapshotJson;
        }
      }
      if (cleanSlug && !cellText(existB.fields[fmWork.slug])) {
        bUpdates[fmWork.slug] = cleanSlug;
      }
      if (payload.title && fmWork.fallbackTitle && !cellText(existB.fields[fmWork.fallbackTitle])) {
        bUpdates[fmWork.fallbackTitle] = payload.title;
      }
      if (payload.body && fmWork.fallbackBody && !cellText(existB.fields[fmWork.fallbackBody])) {
        bUpdates[fmWork.fallbackBody] = payload.body.slice(0, 1800);
      }
      if (Object.keys(bUpdates).length > 0) {
        await smartBatchUpdateRecord(cfg, cfg.tables.works, targetBId, workFieldsMeta, bUpdates).catch(() => {});
      }
    } else {
      workLabel =
        workLabel ||
        (cleanSlug ? cleanSlug.replace(/^\d{8}_/, '') : '') ||
        (payload.title || '未命名作品').slice(0, 28);
      const rawBCreate = {
        [fmWork.title]: workLabel,
        [fmWork.status]: cfg.statusValues.workReady,
      };
      if (accountBrand && fmWork.brand) rawBCreate[fmWork.brand] = accountBrand;
      if (cleanSlug && fmWork.slug) rawBCreate[fmWork.slug] = cleanSlug;
      if (payload.title && fmWork.fallbackTitle) rawBCreate[fmWork.fallbackTitle] = payload.title;
      if (payload.body && fmWork.fallbackBody) rawBCreate[fmWork.fallbackBody] = payload.body.slice(0, 1800);
      if (payload.packSnapshotJson && fmWork.packSnapshot && payload.packSnapshotJson.length < 45_000) {
        rawBCreate[fmWork.packSnapshot] = payload.packSnapshotJson;
      }
      targetBId = await smartBatchCreateRecord(cfg, cfg.tables.works, workFieldsMeta, rawBCreate);
    }
  } else {
    workLabel = workLabel || (payload.title || '当前作品').slice(0, 28);
  }

  // 3. 定位或新建 C 发布记录行，并写入状态 + 时间 + 实发标题/正文/话题标签（优先走 Base v3 彻底规避 1254062）
  if (!targetCId && targetBId) {
    const existC = cRows.find((cr) => {
      const bIds = cellLinkIds(cr.fields[fmPub.workLink]);
      if (!bIds.includes(targetBId)) return false;
      if (accountId) {
        const aIds = cellLinkIds(cr.fields[fmPub.accountLink]);
        return aIds.includes(accountId);
      }
      return true;
    });
    if (existC) targetCId = existC.record_id;
  }

  const desiredStatus = isScheduled ? cfg.statusValues.pubScheduled : cfg.statusValues.pubPublished;
  const rawCFields = {
    [fmPub.status]: desiredStatus,
  };
  if (targetBId && fmPub.workLink) rawCFields[fmPub.workLink] = [targetBId];
  if (accountId && fmPub.accountLink) rawCFields[fmPub.accountLink] = [accountId];
  if (fmPub.platformText) rawCFields[fmPub.platformText] = platCn;
  if (fmPub.workTitleText && workLabel) rawCFields[fmPub.workTitleText] = workLabel;

  if (isScheduled) {
    if (fmPub.plannedAt) rawCFields[fmPub.plannedAt] = targetMs;
    if (fmPub.publishedAt) rawCFields[fmPub.publishedAt] = null;
  } else {
    if (fmPub.publishedAt) rawCFields[fmPub.publishedAt] = targetMs;
  }
  if (payload.title && fmPub.title) rawCFields[fmPub.title] = payload.title;
  if (payload.body && fmPub.body) rawCFields[fmPub.body] = payload.body.slice(0, 2000);
  if (Array.isArray(payload.tags) && payload.tags.length > 0 && fmPub.tags) {
    rawCFields[fmPub.tags] = payload.tags;
  }
  if (payload.postUrl && fmPub.postUrl) rawCFields[fmPub.postUrl] = payload.postUrl;
  if (payload.notes && fmPub.notes) rawCFields[fmPub.notes] = payload.notes;

  if (targetCId) {
    await smartBatchUpdateRecord(cfg, cfg.tables.publishes, targetCId, pubFieldsMeta, rawCFields);
  } else {
    targetCId = await smartBatchCreateRecord(cfg, cfg.tables.publishes, pubFieldsMeta, rawCFields);
  }

  let bAutoClosed = false;
  if (
    cfg.schemaMode === 'multi_table' &&
    cfg.tables.works &&
    targetBId &&
    bById.has(targetBId) &&
    /已发布|C21/.test(desiredStatus)
  ) {
    const curB = bById.get(targetBId);
    const curBSt = cellText(curB.fields[fmWork.status]);
    if (/等待发布|B12/.test(curBSt)) {
      const siblingStates = [];
      let matchedExisting = false;
      for (const cr of cRows) {
        const bIds = cellLinkIds(cr.fields[fmPub.workLink]);
        if (!bIds.includes(targetBId)) continue;
        if (cr.record_id === targetCId) {
          siblingStates.push(desiredStatus);
          matchedExisting = true;
        } else {
          siblingStates.push(cellText(cr.fields[fmPub.status]));
        }
      }
      if (!matchedExisting) siblingStates.push(desiredStatus);
      const allTerminal =
        siblingStates.length > 0 &&
        siblingStates.every((s) => /已发布|取消|暂不发布|C21|C23/.test(s)) &&
        siblingStates.some((s) => /已发布|C21/.test(s));
      if (allTerminal) {
        await smartBatchUpdateRecord(cfg, cfg.tables.works, targetBId, workFieldsMeta, {
          [fmWork.status]: cfg.statusValues.workCompleted || 'B21已完成',
        })
          .then(() => {
            bAutoClosed = true;
          })
          .catch(() => {});
      }
    }
  }

  invalidateFeishuMemCache();
  const modeCn = isScheduled ? `定时 ${timeStr.slice(5)}` : `立即发布 (${timeStr.slice(11)})`;
  const closeSuffix = bAutoClosed ? '（全渠道收口 → B21已完成）' : '';
  return {
    ok: true,
    saved: true,
    needsConfirm: false,
    bRecordId: targetBId,
    cRecordId: targetCId,
    bAutoClosed,
    workLabel,
    accountName,
    recordedState: desiredStatus,
    recordedTime: timeStr,
    summary: `✅ 已同步飞书：${accountName}《${workLabel}》→ ${modeCn}${closeSuffix}`,
  };
}

self.PPFFeishuClient = {
  loadFeishuConfig,
  saveFeishuConfig,
  exportFeishuConfigCode,
  importFeishuConfigCode,
  discoverAndSaveSchema,
  ensurePackSnapshotColumn,
  queryFeishuPublishContext,
  syncPrePublishToFeishu,
  extractCleanWorkSlug,
  buildSafeWriteFields,
  buildSafeV3WriteFields,
  smartBatchUpdateRecord,
  smartBatchCreateRecord,
  evaluateScheduleConflicts,
};
