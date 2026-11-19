'use strict';

let currentConfig = null;
let discoveredTables = [];

const STORAGE_KEY_DEVICE_ID = 'ppf_device_id_v1';
const FEISHU_FEEDBACK_FORM_URL = 'https://my.feishu.cn/share/base/shrcnRMlf6gosr0Werh6Oazu3Q9';

async function getOrCreateDeviceId() {
  const res = await chrome.storage.local.get(STORAGE_KEY_DEVICE_ID);
  let devId = String(res?.[STORAGE_KEY_DEVICE_ID] || '').trim();
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

async function openOptionsFeedbackForm() {
  const ver = chrome.runtime.getManifest?.()?.version || '2.2.0';
  const deviceId = await getOrCreateDeviceId();
  let bridgeState = 'offline';
  try {
    const r = await Promise.race([
      fetch('http://127.0.0.1:8765/api/status', { cache: 'no-store' }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 500)),
    ]);
    if (r && r.ok) bridgeState = 'online';
  } catch {
    bridgeState = 'offline';
  }
  const cfg = currentConfig || {};
  const tblCount = Object.values(cfg.tables || {}).filter(Boolean).length;
  const diag = `bridge:${bridgeState} | feishu:${cfg.enabled ? `enabled(${cfg.authType || 'app'})` : 'disabled'} | schema:${
    cfg.schemaMode || 'multi_table'
  } | syncMode:${cfg.statusSyncMode || 'auto'} | tables:${tblCount}`;

  const fields = {
    所属产品: '全平台发布助手',
    产品代号: 'publish-pack-filler',
    产品形态: '浏览器插件',
    版本号: ver,
    页面路径: '[插件配置页] options.html',
    运行环境: `${detectRuntimeOsAndBrowser()} · 扩展配置页`,
    设备标识: deviceId,
    诊断信息: diag.slice(0, 280),
  };
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) {
    qs.set(`prefill_${k}`, String(v));
    qs.set(`hide_${k}`, '1');
  }
  window.open(`${FEISHU_FEEDBACK_FORM_URL}?${qs.toString()}`, '_blank', 'noopener,noreferrer');
}

function showMessage(text, isError = false) {
  const box = document.getElementById('global-msg');
  box.textContent = text;
  box.className = `status-box ${isError ? 'err' : 'ok'}`;
}

function sendBg(msg) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, (resp) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!resp || resp.ok === false) {
        reject(new Error(resp?.error || '操作失败'));
        return;
      }
      resolve(resp);
    });
  });
}

function toggleAuthFields() {
  const mode = document.getElementById('auth-type').value;
  document.getElementById('app-auth-fields').style.display = mode === 'app' ? 'grid' : 'none';
  document.getElementById('pt-auth-fields').style.display = mode === 'personal_token' ? 'block' : 'none';
}

function populateTableSelects(tables, selected = {}) {
  discoveredTables = tables || discoveredTables;
  const defs = [
    { id: 'tbl-accounts', emptyText: '（不使用独立账号表）', val: selected.accounts || '' },
    { id: 'tbl-works', emptyText: '（不使用独立内容表）', val: selected.works || '' },
    { id: 'tbl-publishes', emptyText: '请选择发布记录表', val: selected.publishes || '' },
  ];
  for (const d of defs) {
    const sel = document.getElementById(d.id);
    sel.innerHTML = '';
    const opt0 = document.createElement('option');
    opt0.value = '';
    opt0.textContent = d.emptyText;
    sel.appendChild(opt0);

    const list = [...discoveredTables];
    if (d.val && !list.some((t) => t.table_id === d.val)) {
      list.push({ table_id: d.val, name: `已绑定 (${d.val})` });
    }
    for (const t of list) {
      const opt = document.createElement('option');
      opt.value = t.table_id;
      opt.textContent = `${t.name} (${t.table_id})`;
      if (t.table_id === d.val) opt.selected = true;
      sel.appendChild(opt);
    }
  }
}

function fillFormFromConfig(cfg) {
  currentConfig = cfg;
  document.getElementById('auth-type').value = cfg.authType || 'app';
  document.getElementById('api-domain').value = cfg.apiDomain || 'https://open.feishu.cn';
  document.getElementById('base-url').value = cfg.baseUrl || cfg.baseToken || '';
  document.getElementById('app-id').value = cfg.appId || '';
  document.getElementById('app-secret').value = cfg.appSecret || '';
  document.getElementById('personal-token').value = cfg.personalBaseToken || '';
  document.getElementById('status-sync-mode').value = cfg.statusSyncMode || 'auto';
  document.getElementById('schema-mode').value = cfg.schemaMode || 'multi_table';
  document.getElementById('min-gap-hours').value = cfg.minGapHours ?? 6;

  populateTableSelects(discoveredTables, cfg.tables || {});

  document.getElementById('fm-work-title').value = cfg.fieldMap?.works?.title || '选题方向';
  document.getElementById('fm-work-slug').value = cfg.fieldMap?.works?.slug || '本地作品目录';
  document.getElementById('fm-work-snapshot').value = cfg.fieldMap?.works?.packSnapshot || '发布包快照';
  document.getElementById('fm-work-fb-title').value = cfg.fieldMap?.works?.fallbackTitle || '通用标题';
  document.getElementById('fm-work-fb-body').value = cfg.fieldMap?.works?.fallbackBody || '通用文案';

  document.getElementById('fm-pub-status').value = cfg.fieldMap?.publishes?.status || '状态';
  document.getElementById('fm-pub-serial').value = cfg.fieldMap?.publishes?.serialNo || '发布编号';
  document.getElementById('fm-pub-published').value = cfg.fieldMap?.publishes?.publishedAt || '真实发布日期';
  document.getElementById('fm-pub-title').value = cfg.fieldMap?.publishes?.title || '标题';
  document.getElementById('fm-pub-body').value = cfg.fieldMap?.publishes?.body || '正文';
  document.getElementById('fm-pub-tags').value = cfg.fieldMap?.publishes?.tags || '话题标签';
  document.getElementById('fm-pub-url').value = cfg.fieldMap?.publishes?.postUrl || '发布内容链接';

  document.getElementById('st-pub-pending').value = cfg.statusValues?.pubPending || 'C00未发布';
  document.getElementById('st-pub-scheduled').value = cfg.statusValues?.pubScheduled || 'C21已发布';
  document.getElementById('st-pub-published').value = cfg.statusValues?.pubPublished || 'C21已发布';

  toggleAuthFields();
}

function readFormToConfig() {
  const base = currentConfig || {};
  const baseInput = document.getElementById('base-url').value.trim();
  return {
    ...base,
    authType: document.getElementById('auth-type').value,
    apiDomain: document.getElementById('api-domain').value,
    baseUrl: baseInput,
    baseToken: baseInput.includes('/base/') ? '' : baseInput,
    appId: document.getElementById('app-id').value.trim(),
    appSecret: document.getElementById('app-secret').value.trim(),
    personalBaseToken: document.getElementById('personal-token').value.trim(),
    statusSyncMode: document.getElementById('status-sync-mode').value || 'auto',
    schemaMode: document.getElementById('schema-mode').value,
    minGapHours: Number(document.getElementById('min-gap-hours').value || 6),
    tables: {
      accounts: document.getElementById('tbl-accounts').value,
      works: document.getElementById('tbl-works').value,
      publishes: document.getElementById('tbl-publishes').value,
    },
    fieldMap: {
      ...(base.fieldMap || {}),
      works: {
        ...(base.fieldMap?.works || {}),
        title: document.getElementById('fm-work-title').value.trim(),
        slug: document.getElementById('fm-work-slug').value.trim(),
        packSnapshot: document.getElementById('fm-work-snapshot').value.trim(),
        fallbackTitle: document.getElementById('fm-work-fb-title').value.trim(),
        fallbackBody: document.getElementById('fm-work-fb-body').value.trim(),
      },
      publishes: {
        ...(base.fieldMap?.publishes || {}),
        status: document.getElementById('fm-pub-status').value.trim(),
        serialNo: document.getElementById('fm-pub-serial').value.trim(),
        publishedAt: document.getElementById('fm-pub-published').value.trim(),
        title: document.getElementById('fm-pub-title').value.trim(),
        body: document.getElementById('fm-pub-body').value.trim(),
        tags: document.getElementById('fm-pub-tags').value.trim(),
        postUrl: document.getElementById('fm-pub-url').value.trim(),
      },
    },
    statusValues: {
      ...(base.statusValues || {}),
      pubPending: document.getElementById('st-pub-pending').value.trim(),
      pubScheduled: document.getElementById('st-pub-scheduled').value.trim(),
      pubPublished: document.getElementById('st-pub-published').value.trim(),
    },
  };
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const res = await sendBg({ type: 'PPF_FEISHU_GET_CONFIG' });
    fillFormFromConfig(res.config);
    if (res.config.enabled) {
      showMessage(`🟢 当前飞书直连已就绪（Base: ${res.config.baseToken} · 模式: ${res.config.schemaMode === 'multi_table' ? '多表协同' : '极简单表'}）`);
    }
  } catch (err) {
    showMessage(`读取配置失败: ${err.message}`, true);
  }

  document.getElementById('auth-type').addEventListener('change', toggleAuthFields);

  document.getElementById('btn-discover').addEventListener('click', async () => {
    try {
      showMessage('⏳ 正在连接飞书开放平台并自动探测表结构...');
      const draft = readFormToConfig();
      const res = await sendBg({ type: 'PPF_FEISHU_DISCOVER', config: draft });
      discoveredTables = res.schemaSummary?.tables || [];
      fillFormFromConfig(res.config);
      document.getElementById('advanced-details').open = true;
      const snapTip = res.schemaSummary?.hasPackSnapshotColumn
        ? '已检测到「发布包快照」云端兜底列 ✅'
        : '提示：可点旁边「☁️ 一键创建发布包快照列」开启完整四端云端文案兜底';
      showMessage(
        `✅ 连接成功！共发现 ${discoveredTables.length} 张表，已自动绑定并保存映射（${snapTip}）。`
      );
    } catch (err) {
      showMessage(`❌ 连接失败：${err.message}`, true);
    }
  });

  document.getElementById('btn-save-only').addEventListener('click', async () => {
    try {
      const draft = readFormToConfig();
      const res = await sendBg({ type: 'PPF_FEISHU_SAVE_CONFIG', config: draft });
      fillFormFromConfig(res.config);
      showMessage('✅ 配置已保存！');
    } catch (err) {
      showMessage(`❌ 保存失败：${err.message}`, true);
    }
  });

  document.getElementById('btn-ensure-snapshot').addEventListener('click', async () => {
    try {
      const draft = readFormToConfig();
      await sendBg({ type: 'PPF_FEISHU_SAVE_CONFIG', config: draft });
      const res = await sendBg({ type: 'PPF_FEISHU_ENSURE_SNAPSHOT_COL' });
      showMessage(
        res.created
          ? `✅ 已在内容表自动创建「${res.fieldName}」列！今后主力机同步时会自动备份四端文案上云，NAS 未同步的电脑也能秒拉完整发布包。`
          : `✅ 内容表中已存在「${res.fieldName}」列，无需重复创建！`
      );
    } catch (err) {
      showMessage(`❌ 创建列失败：${err.message}`, true);
    }
  });

  document.getElementById('btn-export-full').addEventListener('click', async () => {
    try {
      const draft = readFormToConfig();
      await sendBg({ type: 'PPF_FEISHU_SAVE_CONFIG', config: draft });
      const res = await sendBg({ type: 'PPF_FEISHU_EXPORT_CODE', includeSecret: true });
      await navigator.clipboard.writeText(res.code);
      document.getElementById('config-code-input').value = res.code;
      showMessage('📋 已复制「完整跨设备配置码」（含密钥，仅限本人其它电脑粘贴激活，请勿公开群发）！');
    } catch (err) {
      showMessage(`❌ 导出失败：${err.message}`, true);
    }
  });

  document.getElementById('btn-export-template').addEventListener('click', async () => {
    try {
      const draft = readFormToConfig();
      const res = await sendBg({ type: 'PPF_FEISHU_EXPORT_CODE', config: draft, includeSecret: false });
      await navigator.clipboard.writeText(res.code);
      document.getElementById('config-code-input').value = res.code;
      showMessage('📋 已复制「脱敏模板配置码」（不含密钥，可安全分享给团队成员或开源用户）！');
    } catch (err) {
      showMessage(`❌ 导出失败：${err.message}`, true);
    }
  });

  document.getElementById('btn-import-code').addEventListener('click', async () => {
    const code = document.getElementById('config-code-input').value.trim();
    if (!code) {
      showMessage('⚠️ 请先粘贴 PPF2:... 配置码', true);
      return;
    }
    try {
      showMessage('⏳ 正在导入配置码并验证飞书连通性...');
      const res = await sendBg({ type: 'PPF_FEISHU_IMPORT_CODE', code });
      discoveredTables = res.schemaSummary?.tables || [];
      fillFormFromConfig(res.config);
      showMessage('✅ 跨设备配置码激活成功！所有创作者发布页现已直连飞书多维表格。');
    } catch (err) {
      showMessage(`❌ 导入或连接验证失败：${err.message}`, true);
    }
  });

  const verEl = document.getElementById('ext-ver');
  const mfVer = chrome.runtime.getManifest?.()?.version;
  if (verEl && mfVer) {
    verEl.textContent = `v${mfVer} · 零本地依赖`;
  }
  const fbBtn = document.getElementById('btn-open-feedback');
  if (fbBtn) {
    fbBtn.addEventListener('click', openOptionsFeedbackForm);
  }

  document.getElementById('btn-load-local-bridge').addEventListener('click', async () => {
    try {
      const resp = await fetch('http://127.0.0.1:8765/api/feishu-bootstrap', { cache: 'no-store' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      if (!data.found) {
        showMessage(
          'ℹ️ 本机 .bridge.local.json / ~/.aihub/.env 中暂未填写 FEISHU_APP_SECRET，请在下方手动填一次后即可生成跨设备配置码。',
          true
        );
        return;
      }
      const merged = {
        ...readFormToConfig(),
        ...(data.baseToken ? { baseUrl: data.baseToken, baseToken: data.baseToken } : {}),
        ...(data.appId ? { appId: data.appId } : {}),
        ...(data.appSecret ? { appSecret: data.appSecret } : {}),
      };
      fillFormFromConfig(merged);
      showMessage('🔌 已从本机环境读取凭证，请点击「🔍 测试连接并自动识别数据表与字段」完成保存！');
    } catch {
      showMessage('⚠️ 本地桥接服务 (127.0.0.1:8765) 未开启，请直接在下方填写或粘贴配置码。', true);
    }
  });
});
