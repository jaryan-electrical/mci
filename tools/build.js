#!/usr/bin/env node
/*
 * ساخت فایل apps-script/Code.gs
 *   shared.js + engine.js + backend.js  →  یک فایل برای چسباندن در Google Apps Script
 *
 * اجرا:  node tools/build.js
 * (هر وقت یکی از این سه فایل عوض شد دوباره اجرا کنید، سپس Code.gs را در Apps Script جایگزین کنید.)
 */
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');

/** فایل‌های UMD را بدون تغییر درون یک تابع می‌گذاریم تا در Apps Script هم `JR` و `JREngine` ساخته شوند */
function wrap(varName, src, deps) {
  const pre = Object.keys(deps || {}).map((k) => '__root.' + k + ' = ' + deps[k] + ';').join(' ');
  return [
    'var ' + varName + ' = (function () {',
    '  var module = undefined, exports = undefined, self = undefined, __root = {};',
    '  ' + pre,
    '  (function () {',
    src.replace(/^/gm, '    ').replace(/[ \t]+$/gm, ''),
    '  }).call(__root);',
    '  return __root.' + varName + ';',
    '})();',
    ''
  ].join('\n');
}

const head = `/* ═══════════════════════════════════════════════════════════════════════
 * Code.gs — پشتیبانِ ثبت‌نام اردو (مجموعه‌ی جریان) روی Google Apps Script
 * ───────────────────────────────────────────────────────────────────────
 * این فایل خودکار ساخته شده است (node tools/build.js)؛ دستی ویرایشش نکنید.
 * راهنمای نصب: README.md در مخزن.
 *
 * مراحل خلاصه:
 *   ۱) در Google Sheet:  افزونه‌ها ← Apps Script  و این کد را کامل جایگزین Code.gs کنید.
 *   ۲) تابع setup را یک بار اجرا کنید (مجوزها را تأیید کنید) و رمز مدیر را از Execution log بردارید.
 *   ۳) Deploy ← New deployment ← Web app  (Execute as: Me — Who has access: Anyone)
 *   ۴) نشانی /exec را در docs/js/config.js بگذارید.
 * ═══════════════════════════════════════════════════════════════════════ */
`;

const parts = [
  head,
  '/* ───────────── shared.js ───────────── */',
  wrap('JR', read('docs/js/shared.js')),
  '/* ───────────── engine.js ───────────── */',
  wrap('JREngine', read('src/engine.js'), { JR: 'JR' }),
  read('src/backend.js')
];

const out = parts.join('\n');
fs.mkdirSync(path.join(root, 'apps-script'), { recursive: true });
fs.writeFileSync(path.join(root, 'apps-script', 'Code.gs'), out);
console.log('apps-script/Code.gs ساخته شد (' + Math.round(out.length / 1024) + ' KB، ' + out.split('\n').length + ' خط)');
