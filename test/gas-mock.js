'use strict';
/*
 * شبیه‌ساز Google Apps Script برای آزمایش Code.gs در Node.
 * رفتارهای مهمِ واقعی که این‌جا مدل شده‌اند (و در تست‌ها بررسی می‌شوند):
 *   - ستون «متن ساده» (@) مقدار را متن نگه می‌دارد؛ ستون عادی، رشته‌ی عددی را به عدد (و صفر ابتدایی را حذف) و «=…» را فرمول می‌کند
 *   - getRange خارج از ردیف‌های موجود خطا می‌دهد (بدون insertRows نمی‌شود نوشت)
 *   - CacheService: سقف ۱۰۰KB برای مقدار، حداکثر TTL شش ساعت، انقضا با ساعت قابل‌کنترل
 *   - LockService: اگر قفل در دست دیگری باشد waitLock خطا می‌دهد؛ قفل‌های رهانشده شمارش می‌شوند
 *   - Utilities.computeDigest بایت‌های «علامت‌دار» جاوا (−128..127) برمی‌گرداند
 *   - ساعت (Date.now / new Date()) قابل‌کنترل است
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const CODE = path.join(__dirname, '..', 'apps-script', 'Code.gs');

function colLetter(n) { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }

class Sheet {
  constructor(name, stats) {
    this._name = name; this._stats = stats;
    this.maxRows = 1000; this.maxCols = 26;
    this.cells = new Map();          // 'r,c' → مقدار
    this.fmt = new Map();            // 'r,c' → قالب
    this.formulaCells = 0;
    this.frozen = 0; this.rtl = false;
  }
  getName() { return this._name; }
  getMaxRows() { return this.maxRows; }
  getMaxColumns() { return this.maxCols; }
  getLastRow() { let last = 0; for (const [k, v] of this.cells) { if (v !== '' && v != null) last = Math.max(last, +k.split(',')[0]); } return last; }
  insertRowsAfter(pos, n) { if (n < 1) throw new Error('bad insert'); this.maxRows += n; this._stats.inserts++; }
  deleteRows(start, n) {
    const nc = new Map(), nf = new Map();
    for (const [k, v] of this.cells) { const [r, c] = k.split(',').map(Number); if (r < start) nc.set(k, v); else if (r >= start + n) nc.set((r - n) + ',' + c, v); }
    for (const [k, v] of this.fmt) { const [r, c] = k.split(',').map(Number); if (r < start) nf.set(k, v); else if (r >= start + n) nf.set((r - n) + ',' + c, v); }
    this.cells = nc; this.fmt = nf; this.maxRows -= n;
  }
  setFrozenRows(n) { this.frozen = n; return this; }
  setRightToLeft(b) { this.rtl = !!b; return this; }
  setColumnWidth() { return this; }
  hideColumns() { return this; }
  getRange(r, c, nr, nc) {
    nr = nr == null ? 1 : nr; nc = nc == null ? 1 : nc;
    if (!(r >= 1 && c >= 1 && nr >= 1 && nc >= 1)) throw new Error('The coordinates or dimensions of the range are invalid.');
    if (r + nr - 1 > this.maxRows) throw new Error('The coordinates or dimensions of the range are outside the dimensions of the sheet (' + colLetter(c) + r + ' rows>' + this.maxRows + ').');
    if (c + nc - 1 > this.maxCols) throw new Error('The coordinates or dimensions of the range are outside the dimensions of the sheet (cols).');
    return new Range(this, r, c, nr, nc);
  }
}
class Range {
  constructor(sh, r, c, nr, nc) { this.sh = sh; this.r = r; this.c = c; this.nr = nr; this.nc = nc; }
  getValues() {
    this.sh._stats.reads++;
    const out = [];
    for (let i = 0; i < this.nr; i++) {
      const row = [];
      for (let j = 0; j < this.nc; j++) { const v = this.sh.cells.get((this.r + i) + ',' + (this.c + j)); row.push(v === undefined ? '' : v); }
      out.push(row);
    }
    return out;
  }
  setValues(vals) {
    this.sh._stats.writes++;
    if (!Array.isArray(vals) || vals.length !== this.nr || vals.some((row) => !Array.isArray(row) || row.length !== this.nc)) {
      throw new Error('The number of rows in the data does not match the number of rows in the range. The data has ' + (vals && vals.length) + ' but the range has ' + this.nr + '.');
    }
    for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) {
      const key = (this.r + i) + ',' + (this.c + j);
      let v = vals[i][j];
      if (v === undefined || v === null) v = '';
      if (typeof v === 'object') throw new Error('Cannot convert object to cell value');
      const f = this.sh.fmt.get(key) || 'General';
      if (f === '@') v = String(v);
      else if (typeof v === 'string') {
        if (v[0] === '=') { this.sh.formulaCells++; v = '#FORMULA'; }
        else if (/^[+-]?\d+(\.\d+)?$/.test(v.trim()) && v.trim() !== '') v = Number(v);
        else if (/^(true|false)$/i.test(v)) v = v.toLowerCase() === 'true';
      }
      this.sh.cells.set(key, v);
    }
    return this;
  }
  setNumberFormats(grid) {
    this.sh._stats.writes++;
    if (grid.length !== this.nr || grid.some((row) => row.length !== this.nc)) throw new Error('bad formats size');
    for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) this.sh.fmt.set((this.r + i) + ',' + (this.c + j), grid[i][j]);
    return this;
  }
  setNumberFormat(f) {
    for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) this.sh.fmt.set((this.r + i) + ',' + (this.c + j), f);
    return this;
  }
  clearContent() { for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) this.sh.cells.delete((this.r + i) + ',' + (this.c + j)); return this; }
  setFontWeight() { return this; }
  setBackground() { return this; }
}
class Spreadsheet {
  constructor(id, stats) { this.id = id; this.stats = stats; this.sheets = [new Sheet('Sheet1', stats)]; }
  getId() { return this.id; }
  getSheetByName(n) { return this.sheets.find((s) => s.getName() === n) || null; }
  insertSheet(n) { if (this.getSheetByName(n)) throw new Error('A sheet with the name "' + n + '" already exists.'); const s = new Sheet(n, this.stats); this.sheets.push(s); return s; }
  getSheets() { return this.sheets.slice(); }
  deleteSheet(sh) { this.sheets = this.sheets.filter((s) => s !== sh); }
}

/** یک «Google» تازه می‌سازد و Code.gs را در آن بارگذاری می‌کند. */
function createGas(opts) {
  opts = opts || {};
  const stats = { reads: 0, writes: 0, inserts: 0 };
  const clock = { t: opts.now || Date.UTC(2026, 9, 28, 12, 0, 0) };
  const spreadsheet = new Spreadsheet('SHEET_TEST_ID', stats);
  const props = new Map();
  const cacheStore = new Map();
  const lock = { held: false, acquired: 0, released: 0, busy: false };
  const out = { sleeps: 0, logs: [], tooLarge: 0 };

  class MockDate extends Date {
    constructor(...a) { if (a.length === 0) super(clock.t); else super(...a); }
    static now() { return clock.t; }
  }
  const sandbox = {
    console: { log: (m) => out.logs.push(String(m)), error: (m) => out.logs.push('ERR ' + m), warn() {} },
    Date: MockDate,
    Logger: { log: (m) => out.logs.push(String(m)) },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'SHA_256' }, Charset: { UTF_8: 'UTF_8' },
      getUuid: () => crypto.randomUUID(),
      computeDigest(alg, str, cs) {
        if (alg !== 'SHA_256' || cs !== 'UTF_8') throw new Error('unsupported digest args');
        return Array.from(crypto.createHash('sha256').update(String(str), 'utf8').digest()).map((b) => (b > 127 ? b - 256 : b));
      },
      sleep() { out.sleeps++; }
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (props.has(k) ? props.get(k) : null),
        setProperty: (k, v) => { props.set(k, String(v)); },
        deleteProperty: (k) => { props.delete(k); }
      })
    },
    CacheService: {
      getScriptCache: () => ({
        get(k) { const e = cacheStore.get(k); if (!e) return null; if (e.exp <= clock.t) { cacheStore.delete(k); return null; } return e.v; },
        put(k, v, ttl) {
          if (String(k).length > 250) throw new Error('Argument too large: key');
          if (typeof v !== 'string') throw new Error('Invalid argument: value');
          if (Buffer.byteLength(v, 'utf8') > 100 * 1024) { out.tooLarge++; throw new Error('Argument too large: value'); }
          ttl = Math.min(ttl == null ? 600 : ttl, 21600);
          cacheStore.set(k, { v, exp: clock.t + ttl * 1000 });
        },
        remove(k) { cacheStore.delete(k); },
        removeAll(keys) { keys.forEach((k) => cacheStore.delete(k)); }
      })
    },
    LockService: {
      getScriptLock: () => ({
        waitLock() { if (lock.held || lock.busy) throw new Error('Lock timeout: another process was holding the lock for too long.'); lock.held = true; lock.acquired++; },
        releaseLock() { if (!lock.held) throw new Error('not held'); lock.held = false; lock.released++; }
      })
    },
    SpreadsheetApp: {
      openById: (id) => { if (id !== spreadsheet.id) throw new Error('Unexpected error while getting the Spreadsheet: ' + id); return spreadsheet; },
      getActiveSpreadsheet: () => (opts.noActive ? null : spreadsheet),
      flush() {}
    },
    ContentService: {
      MimeType: { JSON: 'JSON' },
      createTextOutput: (t) => ({ text: t, mime: null, setMimeType(m) { this.mime = m; return this; } })
    }
  };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(CODE, 'utf8'), ctx, { filename: 'Code.gs' });

  const g = {
    ctx, stats, clock, spreadsheet, props, cacheStore, lock, out,
    sheet: (name) => spreadsheet.getSheetByName(name),
    advance(ms) { clock.t += ms; },
    set now(v) { clock.t = v; },
    get now() { return clock.t; },
    run(code) { return vm.runInContext(code, ctx); },
    setup() { return ctx.setup(); },
    /** POST به /exec */
    post(p, body, token, q, m) {
      const res = ctx.doPost({ postData: { contents: JSON.stringify({ p, m: m || 'POST', b: body || {}, t: token || '', q: q || {} }) } });
      return JSON.parse(res.text);
    },
    get(p, q, token) { return g.post(p, null, token, q, 'GET'); },
    rawPost(text) { return JSON.parse(ctx.doPost({ postData: { contents: text } }).text); },
    doGet(p) { return JSON.parse(ctx.doGet({ parameter: p ? { p } : {} }).text); },
    /** مدیر را وارد می‌کند و توکن را برمی‌گرداند (رمز مدیر را از گزارش setup می‌خواند) */
    adminPassword() { const m = out.logs.join('\n').match(/رمز عبور:\s+([0-9a-f]{12})/); return m ? m[1] : null; }
  };
  return g;
}

module.exports = { createGas };
