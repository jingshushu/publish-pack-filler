#!/usr/bin/env node
/**
 * 一键构建脚本：
 * 1. 生成 Chrome 插件图标 (16/32/48/128 PNG)
 * 2. 从单一源码 publish-pack-filler.user.js 同步生成 Chrome MV3 content.js
 * 3. 打包可直接分发安装的 dist/publish-pack-filler-chrome-v1.2.0.zip
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const userScriptPath = path.join(rootDir, 'publish-pack-filler.user.js');
const extDir = path.join(rootDir, 'extension');
const distDir = path.join(rootDir, 'dist');
const manifest = JSON.parse(fs.readFileSync(path.join(extDir, 'manifest.json'), 'utf8'));

// 1. 生成图标
execFileSync('python3', [path.join(rootDir, 'scripts', 'gen_icons.py')], { stdio: 'inherit' });

// 2. 剥离 ==UserScript== 头部生成干净的 Chrome MV3 content.js（双端同源零分叉）
const userScriptSrc = fs.readFileSync(userScriptPath, 'utf8');
const strippedContent = userScriptSrc.replace(/^\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==\s*/, '');
const banner = `// Auto-generated from publish-pack-filler.user.js (v${manifest.version}) — DO NOT EDIT DIRECTLY\n`;
fs.writeFileSync(path.join(extDir, 'content.js'), banner + strippedContent, 'utf8');
console.log('✅ Synced extension/content.js');

// 3. 打包 Chrome 插件 ZIP 分发包
fs.mkdirSync(distDir, { recursive: true });
const zipName = `publish-pack-filler-chrome-v${manifest.version}.zip`;
const zipPath = path.join(distDir, zipName);
if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

execFileSync(
  'zip',
  ['-r', '-q', zipPath, 'manifest.json', 'background.js', 'feishu_client.js', 'content.js', 'popup.html', 'popup.js', 'options.html', 'options.js', 'icons'],
  {
    cwd: extDir,
  }
);
console.log(`✅ Packaged Chrome Extension: dist/${zipName}`);
