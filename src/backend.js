/* ═══════════════════════════════════════════════════════════════════════
 * پشتیبان (Backend) روی Google Apps Script — داده‌ها در Google Sheet
 *
 * این بخش با shared.js و engine.js یکی می‌شود و فایل Code.gs ساخته می‌شود
 * (node tools/build.js). همه‌ی قوانین ثبت‌نام (زمان، ظرفیت، قفل، لیست انتظار …)
 * در engine.js است؛ اینجا فقط ذخیره‌سازی در Sheet، قفل اتمیک، ورود و مسیریابی است.
 *
 * مسیرهای وب‌اپ:
 *   GET  ?p=status                      وضعیت عمومی (برای آزمایش اتصال)
 *   POST  { p, m, t, b, q }             p = مسیر (مثلاً register یا admin/data)،
 *                                       t = توکن ورود، b = بدنه، q = پارامترها
 * ═══════════════════════════════════════════════════════════════════════ */

var JR_SHEETS_ = { settings: 'تنظیمات', regs: 'ثبت‌نام‌ها', wl: 'فهرست دانشجویان', exp: 'هزینه‌ها', task: 'چک‌لیست', users: 'کاربران', audit: 'گزارش' };
var JR_SESSION_TTL_ = 21600;        // ۶ ساعت (سقف CacheService)
var JR_LOCK_WAIT_MS_ = 25000;
var JR_PW_ITER_ = 500;
var JR_STATUS_FA_ = { confirmed: 'قطعی', waitlist: 'لیست انتظار', cancelled: 'لغو شده' };
var JR_PAY_FA_ = { paid: 'پرداخت شد', unpaid: 'پرداخت نشده', refunded: 'بازگشت وجه' };
var JR_STAFF_ACTIONS_ = { checkIn: 1, setPayment: 1, note: 1 };

/* ───────────── ستون‌های برگه‌ها ───────────── */
var JR_REG_COLS_ = ['seq', 'code', 'status', 'firstName', 'lastName', 'studentId', 'nationalId', 'phone', 'degree', 'major', 'payment', 'paidAmount', 'payRef', 'checkedIn', 'note', 'createdAtFa', 'createdAt', 'id', 'extra', 'gender', 'entryYear'];
var JR_REG_HEAD_ = ['ردیف', 'کد پیگیری', 'وضعیت', 'نام', 'نام خانوادگی', 'شماره دانشجویی', 'کد ملی', 'موبایل', 'مقطع', 'گرایش (قدیمی)', 'پرداخت', 'مبلغ پرداختی', 'شماره پیگیری پرداخت', 'حضور', 'یادداشت', 'زمان ثبت‌نام', 'زمان (میلی‌ثانیه)', 'شناسه', 'اطلاعات فنی', 'جنسیت', 'ورودی'];
var JR_REG_NUM_ = { seq: 1, paidAmount: 1, createdAt: 1 };
var JR_REG_MAIN_ = { seq: 1, code: 1, status: 1, firstName: 1, lastName: 1, studentId: 1, nationalId: 1, phone: 1, degree: 1, major: 1, payment: 1, paidAmount: 1, payRef: 1, checkedIn: 1, note: 1, createdAt: 1, id: 1, gender: 1, entryYear: 1 };
var JR_COLL_ = {
  exp: { cols: ['id', 'title', 'amountToman', 'note', 'createdAt'], head: ['شناسه', 'عنوان', 'مبلغ (تومان)', 'توضیح', 'زمان'], num: { amountToman: 1, createdAt: 1 }, bool: {} },
  task: { cols: ['id', 'title', 'done', 'createdAt', 'doneAt'], head: ['شناسه', 'کار', 'انجام شده', 'زمان ایجاد', 'زمان انجام'], num: { createdAt: 1, doneAt: 1 }, bool: { done: 1 } },
  users: { cols: ['id', 'username', 'name', 'role', 'salt', 'hash', 'mustChange', 'createdAt', 'lastLoginAt', 'epoch'], head: ['شناسه', 'نام‌کاربری', 'نام', 'نقش', 'نمک', 'رمز (درهم‌شده)', 'تغییر رمز اجباری', 'ساخت', 'آخرین ورود', 'دوره'], num: { createdAt: 1, lastLoginAt: 1, epoch: 1 }, bool: { mustChange: 1 } }
};
var JR_AUDIT_HEAD_ = ['زمان (میلی‌ثانیه)', 'زمان', 'کاربر', 'رویداد', 'توضیح'];

/* ───────────── دسترسی به Sheet ───────────── */
var jrSs_ = null, jrSheets_ = {};
function jrSs() {
  if (!jrSs_) {
    var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
    if (!id) throw new Error('هنوز اتصال به Google Sheet ساخته نشده است؛ تابع setup را یک بار اجرا کنید.');
    jrSs_ = SpreadsheetApp.openById(id);
  }
  return jrSs_;
}
function jrSheet(key) {
  if (!jrSheets_[key]) {
    var sh = jrSs().getSheetByName(JR_SHEETS_[key]);
    if (!sh) throw new Error('برگه‌ی «' + JR_SHEETS_[key] + '» پیدا نشد؛ تابع setup را اجرا کنید.');
    jrSheets_[key] = sh;
  }
  return jrSheets_[key];
}
function jrRead(key, ncols) {
  var sh = jrSheet(key), last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, ncols).getValues();
}
function jrEnsureRows(sh, endRow) {
  var max = sh.getMaxRows();
  if (endRow > max) sh.insertRowsAfter(max, endRow - max + 100);
}
/** قالب هر ستون: «متن ساده» (@) برای همه‌ی ستون‌های متنی تا صفر ابتدای موبایل/کد ملی نماند و هیچ مقداری فرمول نشود؛ «عدد» (0) برای ستون‌های عددی */
function jrFmts(key) {
  var cols, num;
  if (key === 'regs') { cols = JR_REG_COLS_; num = JR_REG_NUM_; }
  else if (key === 'audit') return ['0', '@', '@', '@', '@'];
  else if (key === 'settings') return ['@', '@'];
  else if (key === 'wl') return ['@'];
  else { cols = JR_COLL_[key].cols; num = JR_COLL_[key].num; }
  return cols.map(function (c) { return num[c] ? '0' : '@'; });
}
/** قبل از هر نوشتنِ سلول‌های تازه، قالب را روی همان محدوده می‌گذاریم (به ارثبری قالب از ردیف بالا تکیه نمی‌کنیم) */
function jrPut(sh, key, row, values) {
  var f = jrFmts(key), grid = [], i;
  for (i = 0; i < values.length; i++) grid.push(f);
  var rng = sh.getRange(row, 1, values.length, f.length);
  rng.setNumberFormats(grid);
  rng.setValues(values);
}

/* ───────────── تبدیل ثبت‌نام ⇄ ردیف ───────────── */
function jrRegToRow(r) {
  var extra = {};
  Object.keys(r).forEach(function (k) { if (!JR_REG_MAIN_[k]) extra[k] = r[k]; });
  return [r.seq, String(r.code), JR_STATUS_FA_[r.status] || r.status, r.firstName, r.lastName, String(r.studentId), String(r.nationalId), String(r.phone), r.degree, r.major || '',
    JR_PAY_FA_[r.payment] || r.payment, r.paidAmount == null ? '' : r.paidAmount, r.payRef || '', r.checkedIn ? 'حاضر' : '', r.note || '',
    JR.fmtShort(r.createdAt) + ' ' + JR.fmtTime(r.createdAt, true), r.createdAt, r.id, JSON.stringify(extra), r.gender || '', r.entryYear || ''];
}
function jrReverse(map) { var o = {}; Object.keys(map).forEach(function (k) { o[map[k]] = k; }); return o; }
function jrRowToReg(v, rowNo) {
  var statusRev = jrReverse(JR_STATUS_FA_), payRev = jrReverse(JR_PAY_FA_), extra = {};
  try { extra = JSON.parse(String(v[18] || '{}')); } catch (e) { extra = {}; }
  var r = {
    id: String(v[17]), seq: Number(v[0]), code: String(v[1]), status: statusRev[v[2]] || String(v[2]),
    firstName: String(v[3]), lastName: String(v[4]), studentId: String(v[5]), nationalId: String(v[6]), phone: String(v[7]), degree: String(v[8]), major: String(v[9] || ''),
    payment: payRev[v[10]] || String(v[10]), paidAmount: v[11] === '' || v[11] == null ? null : Number(v[11]), payRef: String(v[12] || ''),
    checkedIn: v[13] === 'حاضر', note: String(v[14] || ''), createdAt: Number(v[16]),
    gender: String(v[19] || ''), entryYear: String(v[20] || '')
  };
  Object.keys(extra).forEach(function (k) { r[k] = extra[k]; });
  Object.defineProperty(r, '__row', { value: rowNo, enumerable: false, writable: true });
  return r;
}
function jrReadRegs() {
  var rows = jrRead('regs', JR_REG_COLS_.length), out = [];
  rows.forEach(function (v, i) { if (v[17] === '' || v[0] === '') return; out.push(jrRowToReg(v, i + 2)); });
  return out;
}

/* ───────────── مجموعه‌های ساده (هزینه، کار، کاربر) ───────────── */
function jrCollToRow(spec, o) {
  return spec.cols.map(function (c) {
    var v = o[c];
    if (spec.bool[c]) return v ? 'بله' : '';
    if (spec.num[c]) return v == null ? '' : v;
    return v == null ? '' : String(v);
  });
}
function jrRowToColl(spec, v) {
  var o = {};
  spec.cols.forEach(function (c, i) {
    var x = v[i];
    if (spec.bool[c]) o[c] = x === 'بله';
    else if (spec.num[c]) o[c] = x === '' || x == null ? null : Number(x);
    else o[c] = x == null ? '' : String(x);
  });
  return o;
}
function jrReadColl(key) {
  var spec = JR_COLL_[key], out = [];
  jrRead(key, spec.cols.length).forEach(function (v) { if (v[0] !== '') out.push(jrRowToColl(spec, v)); });
  return out;
}
function jrWriteColl(key, list) {
  var spec = JR_COLL_[key], sh = jrSheet(key), n = spec.cols.length;
  var max = sh.getMaxRows();
  if (max > 1) sh.getRange(2, 1, max - 1, n).clearContent();
  if (!list.length) return;
  jrEnsureRows(sh, list.length + 1);
  jrPut(sh, key, 2, list.map(function (o) { return jrCollToRow(spec, o); }));
}

/* ───────────── تنظیمات و فهرست دانشجویان ───────────── */
function jrReadSettings(db) {
  var rows = jrRead('settings', 2), s = {}, locked = null;
  rows.forEach(function (r) {
    var k = String(r[0]); if (!k) return;
    var v; try { v = JSON.parse(String(r[1])); } catch (e) { v = undefined; }
    if (k === '__lockedFullAt') locked = v == null ? null : Number(v);
    else if (v !== undefined) s[k] = v;
  });
  db.settings = s; db.lockedFullAt = locked;
}
function jrWriteSettings(db) {
  var sh = jrSheet('settings'), rows = [['__lockedFullAt', JSON.stringify(db.lockedFullAt == null ? null : db.lockedFullAt)]];
  Object.keys(db.settings).forEach(function (k) { rows.push([k, JSON.stringify(db.settings[k])]); });
  var max = sh.getMaxRows();
  if (max > 1) sh.getRange(2, 1, max - 1, 2).clearContent();
  jrEnsureRows(sh, rows.length + 1);
  jrPut(sh, 'settings', 2, rows);
}
function jrReadWl() {
  var sh = jrSheet('wl'), last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, 1).getValues().map(function (r) { return String(r[0]); }).filter(Boolean);
}
function jrWriteWl(list) {
  var sh = jrSheet('wl'), max = sh.getMaxRows();
  if (max > 1) sh.getRange(2, 1, max - 1, 1).clearContent();
  if (!list.length) return;
  jrEnsureRows(sh, list.length + 1);
  jrPut(sh, 'wl', 2, list.map(function (x) { return [String(x)]; }));
}

/* ───────────── حافظه‌ی نهان ───────────── */
function jrCache() { return CacheService.getScriptCache(); }
function jrCacheGet(key) { try { var t = jrCache().get(key); return t ? JSON.parse(t) : null; } catch (e) { return null; } }
function jrCachePut(key, obj, ttl) { try { jrCache().put(key, JSON.stringify(obj), ttl || 600); } catch (e) { /* بزرگ‌تر از ۱۰۰KB یا خطا: بدون کش ادامه می‌دهیم */ } }
function jrCacheDel(keys) { try { jrCache().removeAll(keys); } catch (e) { /* ignore */ } }
function jrInvalidate() { jrCacheDel(['jr_snap']); }

/* ───────────── بارگذاری و ذخیره‌ی db ───────────── */
function jrLoadDb(parts, now) {
  var db = { version: 1, settings: null, whitelist: [], registrations: [], seq: 0, lockedFullAt: null, expenses: [], tasks: [], users: [], sessions: [], audit: [] };
  if (parts.settings) jrReadSettings(db);        // تنظیمات همیشه تازه از Sheet خوانده می‌شود (بدون کش، تا تغییر مدیر فوری اعمال شود)
  if (parts.regs) {
    db.registrations = jrReadRegs();
    db.registrations.forEach(function (r) { if (r.seq > db.seq) db.seq = r.seq; });
  }
  if (parts.wl === true || (parts.wl === 'if' && db.settings && db.settings.whitelistEnabled)) db.whitelist = jrReadWl();
  if (parts.exp) db.expenses = jrReadColl('exp');
  if (parts.task) db.tasks = jrReadColl('task');
  if (parts.users) db.users = jrReadColl('users');
  if (!db.settings) db.settings = {};
  JREngine.migrate(db, now);
  return db;
}
function jrSnapshot(db, parts) {
  var s = {};
  if (parts.settings) { s.set = JSON.stringify(db.settings); s.locked = db.lockedFullAt; }
  if (parts.regs) s.regs = db.registrations.map(function (r) { return JSON.stringify(jrRegToRow(r)); });
  if (parts.wl === true || (parts.wl === 'if' && db.settings.whitelistEnabled)) s.wl = db.whitelist.join('\n');
  if (parts.exp) s.exp = JSON.stringify(db.expenses);
  if (parts.task) s.task = JSON.stringify(db.tasks);
  if (parts.users) s.users = JSON.stringify(db.users);
  return s;
}
function jrSaveRegs(db, beforeSigs) {
  var list = db.registrations, sh = jrSheet('regs'), n = JR_REG_COLS_.length, i, r;
  if (list.length < beforeSigs.length) {                       // پاک‌سازی همه‌ی ثبت‌نام‌ها
    var max = sh.getMaxRows();
    if (max > 1) sh.getRange(2, 1, max - 1, n).clearContent();
    if (list.length) { jrEnsureRows(sh, list.length + 1); jrPut(sh, 'regs', 2, list.map(jrRegToRow)); }
    return;
  }
  var appends = [];
  for (i = 0; i < list.length; i++) {
    r = list[i];
    if (!r.__row) { appends.push(r); continue; }
    if (i < beforeSigs.length) {
      var row = jrRegToRow(r);
      if (JSON.stringify(row) !== beforeSigs[i]) sh.getRange(r.__row, 1, 1, n).setValues([row]);
    }
  }
  if (appends.length) {
    var start = Math.max(sh.getLastRow(), 1) + 1;
    jrEnsureRows(sh, start + appends.length - 1);
    jrPut(sh, 'regs', start, appends.map(jrRegToRow));
    appends.forEach(function (a, k) { Object.defineProperty(a, '__row', { value: start + k, enumerable: false, writable: true }); });
  }
}
function jrAppendAudit(list) {
  if (!list.length) return;
  var sh = jrSheet('audit'), start = Math.max(sh.getLastRow(), 1) + 1;
  jrEnsureRows(sh, start + list.length - 1);
  jrPut(sh, 'audit', start, list.map(function (a) { return [a.t, JR.fmtShort(a.t) + ' ' + JR.fmtTime(a.t, true), String(a.by), String(a.act), String(a.detail || '')]; }));
  if (start + list.length > 3500) sh.deleteRows(2, 500);
}
function jrSaveDb(db, before, parts) {
  if (parts.regs) jrSaveRegs(db, before.regs);
  if (parts.settings && (JSON.stringify(db.settings) !== before.set || db.lockedFullAt !== before.locked)) {
    jrWriteSettings(db);
  }
  var wlOn = parts.wl === true || (parts.wl === 'if' && db.settings.whitelistEnabled);
  if (wlOn && db.whitelist.join('\n') !== before.wl) jrWriteWl(db.whitelist);
  if (parts.exp && JSON.stringify(db.expenses) !== before.exp) jrWriteColl('exp', db.expenses);
  if (parts.task && JSON.stringify(db.tasks) !== before.task) jrWriteColl('task', db.tasks);
  if (parts.users && JSON.stringify(db.users) !== before.users) jrWriteColl('users', db.users);
  jrAppendAudit(db.audit);
  db.audit = [];
}

/* ───────────── قفل و تراکنش ───────────── */
function jrBusy() { return jrFail(503, 'BUSY', 'سامانه شلوغ است؛ چند لحظه بعد دوباره تلاش کنید.'); }
function jrWithLock(fn) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(JR_LOCK_WAIT_MS_); } catch (e) { return jrBusy(); }
  try { return fn(); }
  finally { try { SpreadsheetApp.flush(); } catch (e2) { /* ignore */ } lock.releaseLock(); }
}
/** خواندن، اجرای fn(db, now) روی داده، و ذخیره‌ی تغییرات؛ همه داخل یک قفل */
function jrMutate(parts, fn) {
  return jrWithLock(function () {
    var now = Date.now();
    var db = jrLoadDb(parts, now);
    var before = jrSnapshot(db, parts);
    var res = fn(db, now);
    if (res && res.ok !== false) { jrSaveDb(db, before, parts); jrInvalidate(); }
    return res;
  });
}

/* ───────────── پاسخ‌ها ───────────── */
function jrOk(obj) { return Object.assign({ ok: true, _s: 200 }, obj || {}); }
function jrFail(status, code, message, extra) { return Object.assign({ ok: false, code: code, message: message, _s: status }, extra || {}); }
function jrEngineStatus(res) {
  var c = res.code;
  return c === 'NOT_FOUND' ? 404 : (c === 'FULL' || c === 'DUPLICATE' || c === 'NOT_OPEN' || c === 'CLOSED' || c === 'NOT_ELIGIBLE' || c === 'NO_CHANGE') ? 409 : 400;
}
function jrEng(r, okBody) {
  if (r.ok) return jrOk(okBody || r);
  return jrFail(jrEngineStatus(r), r.code, r.message, { errors: r.errors, opensInMs: r.opensInMs });
}
function jrOut(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }

/* ───────────── وضعیت عمومی (با کش) ───────────── */
function jrBuildSnap(db, now) {
  var s = db.settings;
  return {
    settings: { mode: s.mode, openAtMs: s.openAtMs, closeAtMs: s.closeAtMs, capacity: s.capacity, waitlistEnabled: s.waitlistEnabled },
    lockedFullAt: db.lockedFullAt, taken: JREngine.count(db, 'confirmed'),
    status: JREngine.publicStatus(db, now)
  };
}
function jrStub(n) { var a = []; for (var i = 0; i < n; i++) a.push({ status: 'confirmed' }); return a; }
function jrPhase(snap, now) { return JREngine.phase({ settings: snap.settings, lockedFullAt: snap.lockedFullAt, registrations: jrStub(snap.taken) }, now); }
function jrGetSnap() {
  var snap = jrCacheGet('jr_snap');
  if (snap && snap.status) return snap;
  var now = Date.now(), db = jrLoadDb({ settings: 1, regs: 1 }, now);
  snap = jrBuildSnap(db, now);
  jrCachePut('jr_snap', snap, 30);
  return snap;
}
function jrStatusBody(snap, now) {
  var ph = jrPhase(snap, now), st = Object.assign({}, snap.status);
  st.serverTime = now; st.phase = ph.name; st.closedReason = ph.reason || null;
  st.waitlist = Object.assign({}, st.waitlist, { open: ph.name === 'full' && !!snap.settings.waitlistEnabled });
  return jrOk(st);
}

/* ───────────── مسیرهای عمومی ───────────── */
function jrCleanRid(v) { var t = String(v || ''); return /^[A-Za-z0-9_-]{8,40}$/.test(t) ? t : ''; }

function jrRegister(body) {
  body = body || {};
  if (body.website) return jrFail(400, 'BAD_REQUEST', 'درخواست نامعتبر.');
  var rid = jrCleanRid(body.rid), retry = !!rid && !!body.retry;
  if (retry) {                                            // ارسال مجدد (مثلاً قطع شدن پاسخ): اگر قبلاً موفق بوده همان نتیجه
    var done = jrCacheGet('rg_' + rid);
    if (done) return jrOk(Object.assign({}, done, { serverTime: Date.now(), repeated: true }));
  }
  var snap = jrGetSnap(), now = Date.now(), ph = jrPhase(snap, now);
  // رد سریع بدون قفل و بدون خواندن برگه (فشار روی سامانه را در لحظه‌ی شلوغی کم می‌کند)
  if (ph.name === 'before') return jrFail(409, 'NOT_OPEN', 'ثبت‌نام هنوز شروع نشده است.', { opensInMs: snap.settings.openAtMs != null ? Math.max(0, snap.settings.openAtMs - now) : null, serverTime: now });
  if (ph.name === 'closed') return jrFail(409, 'CLOSED', ph.reason === 'time' ? 'مهلت ثبت‌نام به پایان رسیده است.' : 'ثبت‌نام بسته شده است.', { serverTime: now });
  if (ph.name === 'full' && !snap.settings.waitlistEnabled && !retry) return jrFail(409, 'FULL', 'ظرفیت تکمیل شد و ثبت‌نام بسته شده است.', { serverTime: now });

  var parts = { settings: 1, regs: 1, wl: 'if' };
  return jrWithLock(function () {
    var t = Date.now();                                   // زمان واقعیِ لحظه‌ی ورود به قفل؛ مبنای ترتیب ثبت‌نام
    var db = jrLoadDb(parts, t), before = jrSnapshot(db, parts);
    if (rid) {                                            // تلاش مجدد با همان کد درخواست: نتیجه‌ی قبلی را برگردان
      for (var i = 0; i < db.registrations.length; i++) {
        var p = db.registrations[i];
        if (p.reqId === rid && p.status !== 'cancelled') return jrOk({ status: p.status, registration: JREngine.selfView(db, p), serverTime: t });
      }
    }
    var r = JREngine.register(db, body, t, { meta: { ipTag: '' } });
    if (!r.ok) return jrFail(jrEngineStatus(r), r.code, r.message, { errors: r.errors, opensInMs: r.opensInMs, serverTime: t });
    if (rid) r._reg.reqId = rid;
    jrSaveDb(db, before, parts);
    jrCachePut('jr_snap', jrBuildSnap(db, t), 30);
    if (rid) jrCachePut('rg_' + rid, { status: r.status, registration: r.registration }, 21600);
    return jrOk({ status: r.status, registration: r.registration, serverTime: t });
  });
}

function jrThrottle(key, max, ttl) {
  var c = jrCache(), n = Number(c.get(key) || 0) + 1;
  try { c.put(key, String(n), ttl); } catch (e) { /* ignore */ }
  return n <= max;
}
function jrThrottleCheck(key, max) { return Number(jrCache().get(key) || 0) < max; }
function jrLookup(body) {
  body = body || {};
  var sid = JR.normStudentId(body.studentId);
  if (sid && !jrThrottle('lk_' + sid, 15, 600)) return jrFail(429, 'RATE', 'تعداد تلاش‌ها زیاد بود؛ ۱۰ دقیقه بعد دوباره امتحان کنید.');
  var db = jrLoadDb({ settings: 1, regs: 1 }, Date.now());
  return jrEng(JREngine.lookup(db, body.code, body.studentId));
}

/* ───────────── رمز و نشست ───────────── */
function jrBytesToHex(bytes) {
  var s = '';
  for (var i = 0; i < bytes.length; i++) { var b = bytes[i]; if (b < 0) b += 256; s += (b < 16 ? '0' : '') + b.toString(16); }
  return s;
}
function jrSha256(str) { return jrBytesToHex(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, str, Utilities.Charset.UTF_8)); }
function jrPepper() { return PropertiesService.getScriptProperties().getProperty('PEPPER') || ''; }
function jrHashPw(pw, salt) {
  var pep = jrPepper(), h = pep + ':' + salt + ':' + pw;
  for (var i = 0; i < JR_PW_ITER_; i++) h = jrSha256(h + salt + pep);
  return h;
}
function jrSameStr(a, b) { a = String(a); b = String(b); if (a.length !== b.length) return false; var d = 0; for (var i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }
function jrRandHex(n) { var h = ''; while (h.length < n) h += Utilities.getUuid().replace(/-/g, ''); return h.slice(0, n); }
function jrValidUsername(u) { return /^[a-z0-9._-]{3,24}$/.test(u); }
function jrValidPassword(p) { return typeof p === 'string' && p.length >= 8 && p.length <= 100 && !/^(.)\1+$/.test(p); }
function jrUserPublic(u) { return { id: u.id, username: u.username, name: u.name, role: u.role, mustChange: !!u.mustChange, lastLoginAt: u.lastLoginAt || null }; }
function jrNewUser(username, name, role, password, mustChange, now) {
  var salt = jrRandHex(24);
  return { id: JREngine.uid(), username: username, name: name, role: role, salt: salt, hash: jrHashPw(password, salt), mustChange: mustChange, createdAt: now, lastLoginAt: null, epoch: 1 };
}

function jrLogin(body) {
  body = body || {};
  var username = String(body.username || '').trim().toLowerCase().slice(0, 40), password = String(body.password || '').slice(0, 200), now = Date.now();
  if (!jrThrottleCheck('lf_all', 80)) return jrFail(429, 'RATE', 'تعداد تلاش‌های ورود زیاد است؛ چند دقیقه بعد دوباره امتحان کنید.');
  var lkKey = 'lf_' + jrSha256(username).slice(0, 24), lk = jrCacheGet(lkKey) || { n: 0, until: 0 };
  if (lk.until > now) return jrFail(429, 'LOCKED', 'به‌دلیل تلاش‌های ناموفق، ورود موقتاً قفل شده است. حدود ' + Math.ceil((lk.until - now) / 60000) + ' دقیقه دیگر دوباره تلاش کنید.');
  var users = jrReadColl('users'), user = null;
  users.forEach(function (u) { if (u.username === username) user = u; });
  var ok = user ? jrSameStr(jrHashPw(password, user.salt), user.hash) : (jrHashPw(password, 'x'), false);   // برای کاربر ناموجود هم همان هزینه
  if (!ok) {
    lk.n += 1;
    var locked = lk.n >= 5;
    if (locked) { lk.until = now + 15 * 60000; lk.n = 0; }
    jrCachePut(lkKey, lk, 1000);
    jrThrottle('lf_all', 80, 300);                        // شمارنده‌ی کلِ تلاش‌های ناموفق (جلوگیری از فشار روی سامانه)
    Utilities.sleep(600);
    if (locked) jrMutate({}, function (db, t) { JREngine.audit(db, username || '—', 'login-lock', 'قفل ۱۵ دقیقه‌ای پس از ۵ تلاش ناموفق', t); return { ok: true }; });
    return jrFail(401, 'BAD_LOGIN', 'نام‌کاربری یا رمز عبور درست نیست.');
  }
  jrCacheDel([lkKey]);
  var token = jrRandHex(64);
  jrCachePut('ss_' + jrSha256(token), { uid: user.id, epoch: user.epoch || 0 }, JR_SESSION_TTL_);
  jrMutate({ users: 1 }, function (db, t) {
    db.users.forEach(function (u) { if (u.id === user.id) u.lastLoginAt = t; });
    JREngine.audit(db, user.username, 'login', '', t);
    return { ok: true };
  });
  return jrOk({ user: jrUserPublic(user), token: token });
}
/** نشست معتبر؟ نتیجه: { user, key, ses } یا null */
function jrAuth(req) {
  var tok = String(req.t || '');
  if (tok.length < 32 || tok.length > 128) return null;
  var key = 'ss_' + jrSha256(tok), ses = jrCacheGet(key);
  if (!ses) return null;
  var user = null;
  jrReadColl('users').forEach(function (u) { if (u.id === ses.uid) user = u; });
  if (!user || (user.epoch || 0) !== (ses.epoch || 0)) return null;
  jrCachePut(key, ses, JR_SESSION_TTL_);                 // نشست با هر استفاده تمدید می‌شود
  return { user: user, key: key, ses: ses };
}

/* ───────────── مسیرهای مدیریت ───────────── */
function jrAdmin(a, method, body, q, req) {
  body = body || {}; q = q || {};
  if (a === 'login' && method === 'POST') return jrLogin(body);
  var au = jrAuth(req);
  if (!au) return jrFail(401, 'AUTH', 'ابتدا وارد شوید.');
  var user = au.user, isAdmin = user.role === 'admin', now = Date.now(), m;

  if (a === 'logout') { jrCacheDel([au.key]); return jrOk(); }
  if (user.mustChange && a !== 'me' && a !== 'password') return jrFail(403, 'MUST_CHANGE', 'ابتدا رمز عبور را تغییر دهید.');
  if (a === 'me') return jrOk({ user: jrUserPublic(user), csrf: 'token', now: now });

  if (a === 'password' && method === 'POST') {
    if (!jrSameStr(jrHashPw(String(body.current || ''), user.salt), user.hash)) return jrFail(400, 'BAD_PASSWORD', 'رمز فعلی درست نیست.');
    if (!jrValidPassword(body.next)) return jrFail(400, 'WEAK', 'رمز جدید باید دست‌کم ۸ نویسه باشد.');
    if (body.next === body.current) return jrFail(400, 'WEAK', 'رمز جدید باید با رمز فعلی فرق داشته باشد.');
    var newEpoch = (user.epoch || 0) + 1;
    var res = jrMutate({ users: 1 }, function (db, t) {
      db.users.forEach(function (u) { if (u.id === user.id) { u.salt = jrRandHex(24); u.hash = jrHashPw(body.next, u.salt); u.mustChange = false; u.epoch = newEpoch; } });
      JREngine.audit(db, user.username, 'password', 'تغییر رمز', t);
      return { ok: true };
    });
    if (res.ok === false) return res;
    jrCachePut(au.key, { uid: user.id, epoch: newEpoch }, JR_SESSION_TTL_);       // نشست فعلی می‌ماند، بقیه‌ی نشست‌های این کاربر بسته می‌شود
    return jrOk();
  }

  if (a === 'data' && method === 'GET') {
    var db = jrLoadDb({ settings: 1, regs: 1, exp: isAdmin ? 1 : 0, task: 1, users: isAdmin ? 1 : 0 }, now);
    var regs = db.registrations.slice().sort(function (x, y) { return x.seq - y.seq; });
    var stats = JREngine.adminStats(db, now);
    regs = regs.map(function (r) { return jrPanelReg(r, isAdmin); });
    if (!isAdmin) stats.finance = null;
    var wlSh = jrSheet('wl'), wlCount = Math.max(0, wlSh.getLastRow() - 1);
    return jrOk({ now: now, user: jrUserPublic(user), settings: db.settings, stats: stats, registrations: regs, whitelistCount: wlCount,
      expenses: isAdmin ? db.expenses : [], tasks: db.tasks, users: isAdmin ? db.users.map(jrUserPublic) : [], publicPhase: JREngine.phase(db, now) });
  }
  if (a === 'audit' && method === 'GET') {
    if (!isAdmin) return jrFail(403, 'FORBIDDEN', 'دسترسی ندارید.');
    var sh = jrSheet('audit'), last = sh.getLastRow(), rows = last < 2 ? [] : sh.getRange(Math.max(2, last - 399), 1, last - Math.max(2, last - 399) + 1, 5).getValues();
    return jrOk({ audit: rows.map(function (r) { return { t: Number(r[0]), by: String(r[2]), act: String(r[3]), detail: String(r[4]) }; }).reverse() });
  }

  if (a === 'receipt' && method === 'GET') {                     // نمایش تصویر رسید (مدیر و همکار ستاد)
    var dbR = jrLoadDb({ regs: 1 }, now), regR = null, idx = parseInt(q.i, 10);
    dbR.registrations.forEach(function (x) { if (x.id === String(q.reg || '')) regR = x; });
    var rec = regR && regR.receipts && idx >= 0 ? regR.receipts[idx] : null;
    if (!rec) return jrFail(404, 'NOT_FOUND', 'رسید پیدا نشد.');
    var blob;
    try { blob = DriveApp.getFileById(rec.id).getBlob(); } catch (eR) { return jrFail(404, 'FILE_GONE', 'فایل رسید در Drive پیدا نشد (شاید حذف شده است).'); }
    return jrOk({ mime: rec.m || blob.getContentType(), at: rec.at, data: Utilities.base64Encode(blob.getBytes()) });
  }

  if ((m = a.match(/^reg\/([a-f0-9]{16})$/)) && method === 'POST') {
    if (!isAdmin && !JR_STAFF_ACTIONS_[body.action]) return jrFail(403, 'FORBIDDEN', 'این عملیات فقط برای مدیر است.');
    return jrMutate({ settings: 1, regs: 1 }, function (db, t) {
      var r = JREngine.regAction(db, user.username, m[1], body.action, body, t);
      if (!r.ok) return jrFail(jrEngineStatus(r), r.code, r.message, { errors: r.errors });
      // پاسخ برای همکار ستاد بدون کد ملی؛ برای همه بدون شناسه‌ی فایل‌های Drive
      r = Object.assign({}, r, { registration: jrPanelReg(r.registration, isAdmin), promoted: jrPanelReg(r.promoted, isAdmin) });
      return jrOk(r);
    });
  }

  if (a === 'task' && method === 'POST') {
    return jrMutate({ task: 1 }, function (db, t) { return jrEng(JREngine.taskAction(db, user.username, body.action, body, t)); });
  }
  if (!isAdmin) return jrFail(403, 'FORBIDDEN', 'دسترسی ندارید.');

  if (a === 'reg' && method === 'POST') return jrMutate({ settings: 1, regs: 1 }, function (db, t) { return jrEng(JREngine.addManual(db, user.username, body, t)); });
  if (a === 'settings' && method === 'POST') {
    return jrMutate({ settings: 1, regs: 1 }, function (db, t) {
      var r = JREngine.applySettings(db, user.username, body, t);
      return r.ok ? jrOk(r) : jrFail(400, r.code, r.message, { errors: r.errors });
    });
  }
  if (a === 'control' && method === 'POST') return jrMutate({ settings: 1, regs: 1 }, function (db, t) { return jrEng(JREngine.control(db, user.username, body.action, t)); });
  if (a === 'whitelist') {
    if (method === 'GET') { var list = jrReadWl(); return jrOk({ text: list.join('\n'), count: list.length }); }
    return jrMutate({ settings: 1, wl: true }, function (db, t) {
      var r = JREngine.setWhitelist(db, user.username, body.text, t);
      return r.ok ? jrOk(r) : jrFail(400, r.code, r.message);
    });
  }
  if (a === 'expense' && method === 'POST') return jrMutate({ exp: 1 }, function (db, t) { return jrEng(JREngine.expenseAction(db, user.username, body.action, body, t)); });
  if (a === 'reset' && method === 'POST') {
    if (body.phrase !== 'پاک شود') return jrFail(400, 'CONFIRM', 'عبارت تأیید درست نیست.');
    if (!jrSameStr(jrHashPw(String(body.password || ''), user.salt), user.hash)) return jrFail(400, 'BAD_PASSWORD', 'رمز عبور درست نیست.');
    var gone = [];
    var resR = jrMutate({ settings: 1, regs: 1 }, function (db, t) {
      db.registrations.forEach(function (x) { (x.receipts || []).forEach(function (f) { gone.push(f.id); }); });
      return jrOk(JREngine.resetRegistrations(db, user.username, t));
    });
    if (resR.ok) jrTrashFiles(gone);                              // رسیدهای آزمایشی هم از Drive پاک شود
    return resR;
  }
  if (a === 'export' && method === 'GET') {
    var kind = ['all', 'security', 'phones'].indexOf(q.kind) >= 0 ? q.kind : 'all';
    return jrMutate({ regs: 1 }, function (db, t) {
      JREngine.audit(db, user.username, 'export', kind, t);
      return jrOk({ _raw: JREngine.exportCsv(db, kind), _ct: 'text/csv; charset=utf-8' });
    });
  }
  if (a === 'backup' && method === 'GET') {
    return jrMutate({ settings: 1, regs: 1, wl: true, exp: 1, task: 1 }, function (db, t) {
      JREngine.audit(db, user.username, 'backup', '', t);
      var copy = { version: db.version, settings: db.settings, whitelist: db.whitelist, registrations: db.registrations, seq: db.seq, lockedFullAt: db.lockedFullAt, expenses: db.expenses, tasks: db.tasks };
      return jrOk({ _raw: JSON.stringify(copy, null, 1), _ct: 'application/json; charset=utf-8' });
    });
  }
  if (a === 'users' && method === 'POST') return jrUsers(body, user);
  return jrFail(404, 'NOT_FOUND', 'پیدا نشد.');
}

function jrUsers(body, me) {
  return jrMutate({ users: 1 }, function (db, now) {
    if (body.action === 'add') {
      var un = String(body.username || '').trim().toLowerCase();
      if (!jrValidUsername(un)) return jrFail(400, 'INVALID', 'نام‌کاربری باید ۳ تا ۲۴ نویسه‌ی انگلیسی (حرف کوچک، رقم، نقطه، خط تیره) باشد.');
      if (db.users.some(function (u) { return u.username === un; })) return jrFail(409, 'DUPLICATE', 'این نام‌کاربری قبلاً هست.');
      if (!jrValidPassword(body.password)) return jrFail(400, 'WEAK', 'رمز عبور باید دست‌کم ۸ نویسه باشد.');
      var role = body.role === 'admin' ? 'admin' : 'staff';
      db.users.push(jrNewUser(un, JR.normText(body.name).slice(0, 40) || un, role, body.password, true, now));
      JREngine.audit(db, me.username, 'user-add', un + ' (' + role + ')', now);
      return jrOk();
    }
    var target = null;
    db.users.forEach(function (u) { if (u.id === body.id) target = u; });
    if (!target) return jrFail(404, 'NOT_FOUND', 'کاربر پیدا نشد.');
    if (body.action === 'delete') {
      if (target.id === me.id) return jrFail(400, 'INVALID', 'نمی‌توانید حساب خودتان را حذف کنید.');
      db.users = db.users.filter(function (u) { return u !== target; });
      JREngine.audit(db, me.username, 'user-delete', target.username, now);
      return jrOk();
    }
    if (body.action === 'resetPassword') {
      if (!jrValidPassword(body.password)) return jrFail(400, 'WEAK', 'رمز عبور باید دست‌کم ۸ نویسه باشد.');
      target.salt = jrRandHex(24); target.hash = jrHashPw(body.password, target.salt); target.mustChange = true; target.epoch = (target.epoch || 0) + 1;
      JREngine.audit(db, me.username, 'user-reset', target.username, now);
      return jrOk();
    }
    if (body.action === 'setRole') {
      var nr = body.role === 'admin' ? 'admin' : 'staff';
      if (target.id === me.id && nr !== 'admin') return jrFail(400, 'INVALID', 'نمی‌توانید نقش خودتان را کم کنید.');
      target.role = nr;
      JREngine.audit(db, me.username, 'user-role', target.username + ' → ' + nr, now);
      return jrOk();
    }
    return jrFail(400, 'INVALID', 'عملیات نامعتبر.');
  });
}

/* ───────────── رسید واریز (تصویر در Google Drive، نشانی در Sheet) ───────────── */
var JR_RECEIPT_MAX_BYTES_ = 900 * 1024;
var JR_RECEIPT_MAX_B64_ = 1300000;
var JR_RECEIPT_MAX_COUNT_ = 5;

function jrFolder() {
  var props = PropertiesService.getScriptProperties(), id = props.getProperty('RECEIPT_FOLDER_ID'), folder = null;
  if (id) { try { folder = DriveApp.getFolderById(id); } catch (e) { folder = null; } }
  if (!folder) { folder = DriveApp.createFolder('رسیدهای اردو — جریان'); props.setProperty('RECEIPT_FOLDER_ID', folder.getId()); }
  return folder;
}
/** نوع تصویر را از «بایت‌های ابتدای فایل» تشخیص می‌دهد (به ادعای مرورگر اعتماد نمی‌کنیم) */
function jrSniffImage(bytes) {
  function b(i) { return bytes[i] & 255; }
  if (bytes.length > 12 && b(0) === 0xFF && b(1) === 0xD8 && b(2) === 0xFF) return { mime: 'image/jpeg', ext: 'jpg' };
  if (bytes.length > 12 && b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4E && b(3) === 0x47 && b(4) === 0x0D && b(5) === 0x0A && b(6) === 0x1A && b(7) === 0x0A) return { mime: 'image/png', ext: 'png' };
  if (bytes.length > 12 && b(0) === 0x52 && b(1) === 0x49 && b(2) === 0x46 && b(3) === 0x46 && b(8) === 0x57 && b(9) === 0x45 && b(10) === 0x42 && b(11) === 0x50) return { mime: 'image/webp', ext: 'webp' };
  return null;
}
function jrTrashFiles(ids) {
  ids.forEach(function (id) { try { DriveApp.getFileById(id).setTrashed(true); } catch (e) { /* ignore */ } });
}
function jrFindReg(db, code, sid) {
  for (var i = 0; i < db.registrations.length; i++) { var r = db.registrations[i]; if (r.code === code && r.studentId === sid) return r; }
  return null;
}
/** آیا این ثبت‌نام الان می‌تواند رسید بفرستد؟ null یعنی بله، وگرنه پاسخ خطا */
function jrReceiptBlock(db, reg) {
  var pay = db.settings.payment || {};
  if (!pay.enabled || pay.receiptUpload === false) return jrFail(403, 'DISABLED', 'بارگذاری رسید فعلاً فعال نیست؛ رسید را برای ستاد بفرستید.');
  if (reg.status === 'cancelled') return jrFail(409, 'CANCELLED', 'این ثبت‌نام لغو شده است.');
  if (reg.status === 'waitlist') return jrFail(409, 'WAITLIST', 'هنوز در لیست انتظار هستید؛ بعد از قطعی شدن می‌توانید رسید بفرستید.');
  if (reg.payment === 'paid') return jrFail(409, 'ALREADY_PAID', 'پرداخت شما قبلاً تأیید شده است.');
  if ((reg.receipts || []).length >= JR_RECEIPT_MAX_COUNT_) return jrFail(409, 'LIMIT', 'حداکثر ' + JR_RECEIPT_MAX_COUNT_ + ' رسید می‌شود فرستاد؛ برای تغییر با ستاد تماس بگیرید.');
  return null;
}
function jrReceiptUpload(body) {
  body = body || {};
  var sid = JR.normStudentId(body.studentId), code = JR.faToEn(body.code || '').replace(/\D/g, '');
  if (!sid || !code) return jrFail(400, 'INVALID', 'کد پیگیری و شماره دانشجویی را وارد کنید.');
  if (!jrThrottle('rc_' + sid, 8, 600)) return jrFail(429, 'RATE', 'تعداد ارسال‌ها زیاد بود؛ چند دقیقه بعد دوباره امتحان کنید.');
  var b64 = String(body.image || '').replace(/^data:[^,]*,/, '').replace(/\s+/g, '');
  if (!b64 || b64.length > JR_RECEIPT_MAX_B64_ || !/^[A-Za-z0-9+\/]+={0,2}$/.test(b64)) return jrFail(400, 'INVALID_IMAGE', 'تصویر نامعتبر است یا بیش از حد بزرگ است.');
  var bytes = null;
  try { bytes = Utilities.base64Decode(b64); } catch (e) { bytes = null; }
  if (!bytes || bytes.length < 200 || bytes.length > JR_RECEIPT_MAX_BYTES_) return jrFail(400, 'INVALID_IMAGE', 'تصویر نامعتبر است یا بیش از حد بزرگ است.');
  var kind = jrSniffImage(bytes);
  if (!kind) return jrFail(400, 'INVALID_IMAGE', 'فقط تصویر (JPG، PNG یا WebP) پذیرفته می‌شود.');
  var h = jrSha256(b64).slice(0, 24), now = Date.now();

  // بررسی اولیه بدون قفل (ساخت فایل در Drive کند است و نباید قفل ثبت‌نام را نگه دارد)
  var db0 = jrLoadDb({ settings: 1, regs: 1 }, now), reg0 = jrFindReg(db0, code, sid);
  if (!reg0) return jrFail(404, 'NOT_FOUND', 'ثبت‌نامی با این مشخصات پیدا نشد.');
  var same = (reg0.receipts || []).filter(function (x) { return x.h === h; })[0];
  if (same) return jrOk({ registration: JREngine.selfView(db0, reg0), repeated: true });
  var blocked0 = jrReceiptBlock(db0, reg0);
  if (blocked0) return blocked0;

  var file = jrFolder().createFile(Utilities.newBlob(bytes, kind.mime, 'رسید-' + reg0.seq + '-' + reg0.code + '-' + now + '.' + kind.ext));
  var res = jrMutate({ settings: 1, regs: 1 }, function (db, t) {
    var reg = jrFindReg(db, code, sid);
    if (!reg) return jrFail(404, 'NOT_FOUND', 'ثبت‌نامی با این مشخصات پیدا نشد.');
    var dup = (reg.receipts || []).filter(function (x) { return x.h === h; })[0];
    if (dup) return jrOk({ registration: JREngine.selfView(db, reg), repeated: true, _dup: true });
    var blocked = jrReceiptBlock(db, reg);
    if (blocked) return blocked;
    reg.receipts = (reg.receipts || []).concat([{ id: file.getId(), at: t, h: h, m: kind.mime }]);
    JREngine.audit(db, 'ثبت‌نام‌کننده', 'receipt', reg.firstName + ' ' + reg.lastName + ' (#' + reg.seq + ')', t);
    return jrOk({ registration: JREngine.selfView(db, reg) });
  });
  if (!res.ok || res._dup) jrTrashFiles([file.getId()]);    // فایل اضافی/بی‌صاحب نماند
  delete res._dup;
  return res;
}
/** نسخه‌ی ثبت‌نام برای پنل: شناسه‌ی فایل‌های Drive و (برای همکار ستاد) کد ملی دیده نمی‌شود */
function jrPanelReg(r, isAdmin) {
  if (!r || typeof r !== 'object') return r;
  var o = Object.assign({}, r);
  if (o.receipts) o.receipts = o.receipts.map(function (x) { return { at: x.at }; });
  if (!isAdmin) o.nationalId = '';
  return o;
}

/* ───────────── مسیریابی ───────────── */
function jrRoute(req) {
  try {
    var p = String(req.p || ''), method = String(req.m || 'GET').toUpperCase();
    if (p === 'status') return jrStatusBody(jrGetSnap(), Date.now());
    if (p === 'ping') return jrOk({ t: Date.now() });
    if (p === 'register' && method === 'POST') return jrRegister(req.b);
    if (p === 'lookup' && method === 'POST') return jrLookup(req.b);
    if (p === 'receipt' && method === 'POST') return jrReceiptUpload(req.b);
    if (p.indexOf('admin/') === 0) return jrAdmin(p.slice(6), method, req.b, req.q, req);
    return jrFail(404, 'NOT_FOUND', 'پیدا نشد.');
  } catch (e) {
    console.error(e && e.stack ? e.stack : String(e));
    return jrFail(500, 'SERVER_ERROR', 'خطای سرور: ' + (e && e.message ? e.message : e));
  }
}
function doGet(e) {
  var p = String((e && e.parameter && e.parameter.p) || 'status');
  if (p !== 'status' && p !== 'ping') return jrOut(jrFail(404, 'NOT_FOUND', 'پیدا نشد.'));
  return jrOut(jrRoute({ p: p, m: 'GET' }));
}
function doPost(e) {
  var req, txt = '';
  try {
    txt = e && e.postData ? String(e.postData.contents || '') : '';
    if (txt.length > 1600000) return jrOut(jrFail(413, 'TOO_LARGE', 'درخواست بزرگ است.'));
    req = JSON.parse(txt);
  } catch (err) { return jrOut(txt.length > 400000 ? jrFail(413, 'TOO_LARGE', 'درخواست بزرگ است.') : jrFail(400, 'BAD_REQUEST', 'درخواست نامعتبر.')); }
  if (txt.length > 400000 && (!req || req.p !== 'receipt')) return jrOut(jrFail(413, 'TOO_LARGE', 'درخواست بزرگ است.'));   // فقط بارگذاری رسید بدنه‌ی بزرگ دارد
  return jrOut(jrRoute(req || {}));
}

/* ───────────── راه‌اندازی (از داخل ویرایشگر اجرا شود) ───────────── */
function jrEnsureSheet(key, head) {
  var ss = jrSs(), name = JR_SHEETS_[key], sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  jrSheets_[key] = sh;
  var f = jrFmts(key), c;
  for (c = 1; c <= f.length; c++) sh.getRange(2, c, Math.max(sh.getMaxRows() - 1, 1), 1).setNumberFormat(f[c - 1]);   // قالب ستون‌ها (ردیف‌های داده)
  sh.getRange(1, 1, 1, head.length).setNumberFormat('@');
  sh.getRange(1, 1, 1, head.length).setValues([head]);                          // تیترها همیشه به‌روز می‌شوند (ستون‌های تازه هم اضافه می‌شود)
  try {
    sh.setFrozenRows(1); sh.setRightToLeft(true);
    sh.getRange(1, 1, 1, head.length).setFontWeight('bold').setBackground('#dbe9fb');
  } catch (e) { /* ظاهری */ }
  return sh;
}

function setup() {
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('SHEET_ID')) {
    var active = SpreadsheetApp.getActiveSpreadsheet();
    if (!active) throw new Error('این اسکریپت باید از داخل Google Sheet ساخته شود: در Sheet روی «افزونه‌ها ← Apps Script» بزنید و کد را همان‌جا بچسبانید.');
    props.setProperty('SHEET_ID', active.getId());
  }
  if (!props.getProperty('PEPPER')) props.setProperty('PEPPER', jrRandHex(40));
  jrSs_ = null; jrSheets_ = {};
  var now = Date.now();

  jrEnsureSheet('settings', ['کلید', 'مقدار (با پنل تغییر دهید، دستی ویرایش نکنید)']);
  var reg = jrEnsureSheet('regs', JR_REG_HEAD_);
  jrEnsureSheet('wl', ['شماره دانشجویی']);
  jrEnsureSheet('exp', JR_COLL_.exp.head);
  jrEnsureSheet('task', JR_COLL_.task.head);
  jrEnsureSheet('users', JR_COLL_.users.head);
  jrEnsureSheet('audit', JR_AUDIT_HEAD_);
  try { [6, 7, 8].forEach(function (c) { reg.setColumnWidth(c, 120); }); reg.hideColumns(17, 3); } catch (e) { /* ظاهری */ }

  jrFolder();                                                  // پوشه‌ی رسیدها در Google Drive (اولین بار مجوز Drive را می‌خواهد)
  var db = jrLoadDb({ settings: 1, task: 1, users: 1 }, now);
  if (!jrRead('settings', 2).length) jrWriteSettings(db);
  if (!db.tasks.length) jrWriteColl('task', JREngine.newDb(now).tasks);

  var msg;
  if (!db.users.length) {
    var envPw = props.getProperty('ADMIN_PASSWORD'), pw = envPw && jrValidPassword(envPw) ? envPw : jrRandHex(12);
    var admin = jrNewUser('admin', 'مدیر اصلی', 'admin', pw, !(envPw && jrValidPassword(envPw)), now);
    jrWriteColl('users', [admin]);
    msg = envPw && jrValidPassword(envPw) ? 'حساب مدیر ساخته شد: نام‌کاربری admin — رمز همان ADMIN_PASSWORD است.' :
      'حساب مدیر ساخته شد.\nنام‌کاربری: admin\nرمز عبور:  ' + pw + '\nاین رمز را همین حالا یادداشت کنید؛ بار دیگر نشان داده نمی‌شود. در اولین ورود از شما رمز تازه می‌خواهد.';
  } else msg = 'راه‌اندازی قبلاً انجام شده بود؛ برگه‌ها بررسی شد و داده‌ای پاک نشد.';
  jrInvalidate();
  try { // برگه‌ی پیش‌فرض خالی را برمی‌داریم
    var ss = jrSs(); ['Sheet1', 'Sheet 1', 'برگه1', 'برگه۱'].forEach(function (n) { var d = ss.getSheetByName(n); if (d && d.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(d); });
  } catch (e2) { /* ignore */ }
  console.log(msg);
  Logger.log(msg);
  return msg;
}

/** رمز مدیر را فراموش کردید؟ این تابع را اجرا کنید؛ رمز تازه در گزارش (Execution log) نوشته می‌شود. */
function resetAdminPassword() {
  var db = jrLoadDb({ users: 1 }, Date.now()), target = null;
  db.users.forEach(function (u) { if (!target && u.role === 'admin') target = u; });
  var pw = jrRandHex(12), now = Date.now();
  if (!target) { target = jrNewUser('admin', 'مدیر اصلی', 'admin', pw, true, now); db.users.push(target); }
  else { target.salt = jrRandHex(24); target.hash = jrHashPw(pw, target.salt); target.mustChange = true; target.role = 'admin'; target.epoch = (target.epoch || 0) + 1; }
  jrWriteColl('users', db.users);
  var msg = 'رمز مدیر بازنشانی شد.\nنام‌کاربری: ' + target.username + '\nرمز جدید:  ' + pw;
  console.log(msg); Logger.log(msg);
  return msg;
}

/** بررسی سلامت اتصال (فقط می‌خواند): بعد از setup اجرا کنید. */
function selfCheck() {
  var now = Date.now(), db = jrLoadDb({ settings: 1, regs: 1, wl: true, exp: 1, task: 1, users: 1 }, now);
  var st = JREngine.publicStatus(db, now);
  var folderOk = 'بله';
  try { jrFolder(); } catch (e) { folderOk = 'خیر (' + e.message + ')'; }
  var msg = 'اتصال سالم است. پوشه‌ی رسیدها: ' + folderOk + '. ظرفیت ' + db.settings.capacity + '، ثبت‌نام قطعی ' + JREngine.count(db, 'confirmed') + '، کاربران ' + db.users.length + '، وضعیت: ' + st.phase;
  console.log(msg); Logger.log(msg);
  return msg;
}
