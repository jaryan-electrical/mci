'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const JR = require('../docs/js/shared.js');
const E = require('../src/engine.js');

function makeNid(i) {
  const base = String(100000000 + i * 7919).slice(0, 9);
  let sum = 0;
  for (let k = 0; k < 9; k++) sum += +base[k] * (10 - k);
  const r = sum % 11;
  return base + (r < 2 ? r : 11 - r);
}
function person(i, extra) {
  return Object.assign({
    firstName: 'سارا', lastName: 'نمونه', studentId: String(40124000 + i), nationalId: makeNid(i),
    phone: '0912' + String(1000000 + i), degree: 'کارشناسی', major: 'قدرت', accepted: true
  }, extra || {});
}
const T0 = JR.fromTehran(1405, 8, 8, 20, 0);
function fresh(opts) {
  const db = E.newDb(T0 - 86400000);
  db.settings.openAtMs = T0;
  Object.assign(db.settings, opts || {});
  return db;
}

test('فازها: قبل از شروع، باز، پر، بسته', () => {
  const db = fresh({ capacity: 2, closeAtMs: T0 + 3600000 });
  assert.equal(E.phase(db, T0 - 1).name, 'before');
  assert.equal(E.phase(db, T0).name, 'open');
  assert.equal(E.phase(db, T0 + 3600000).name, 'closed');
  db.settings.mode = 'forceClosed';
  assert.equal(E.phase(db, T0 + 10).name, 'closed');
  db.settings.mode = 'forceOpen';
  assert.equal(E.phase(db, T0 - 99999).name, 'open');
  db.settings.mode = 'auto';
  db.settings.openAtMs = null;
  assert.equal(E.phase(db, T0 + 10).name, 'before');
});

test('قبل از شروع ثبت‌نام رد می‌شود و ثانیه‌ی دقیق شروع پذیرفته می‌شود', () => {
  const db = fresh();
  const early = E.register(db, person(1), T0 - 1);
  assert.equal(early.code, 'NOT_OPEN');
  assert.equal(early.opensInMs, 1);
  assert.equal(db.registrations.length, 0);
  const ok = E.register(db, person(1), T0);
  assert.ok(ok.ok);
  assert.equal(ok.status, 'confirmed');
  assert.equal(ok.registration.seq, 1);
  assert.match(ok.registration.code, /^\d{6}$/);
});

test('ظرفیت دقیقاً ۴۰: با ۱۰۰ تلاش فقط ۴۰ نفر و قفل روی نفر چهلم', () => {
  const db = fresh();
  assert.equal(db.settings.capacity, 40);
  let okN = 0, full = 0, lastOkAt = 0;
  for (let i = 0; i < 100; i++) {
    const now = T0 + i * 10;
    const r = E.register(db, person(i), now);
    if (r.ok) { okN++; lastOkAt = now; } else { assert.equal(r.code, 'FULL'); full++; }
  }
  assert.equal(okN, 40);
  assert.equal(full, 60);
  assert.equal(E.count(db, 'confirmed'), 40);
  assert.equal(db.lockedFullAt, lastOkAt);
  assert.equal(E.phase(db, lastOkAt + 1).name, 'full');
  const st = E.publicStatus(db, lastOkAt + 1);
  assert.equal(st.taken, 40); assert.equal(st.remaining, 0); assert.equal(st.phase, 'full');
  assert.equal(st.fillMs, lastOkAt - T0);
  // شماره‌ها پیاپی و بی‌تکرار
  const seqs = db.registrations.map((r) => r.seq);
  assert.deepEqual(seqs, Array.from({ length: 40 }, (_, i) => i + 1));
  // کدهای پیگیری یکتا
  assert.equal(new Set(db.registrations.map((r) => r.code)).size, 40);
});

test('یکتایی: شماره دانشجویی، کد ملی، موبایل', () => {
  const db = fresh();
  assert.ok(E.register(db, person(1), T0).ok);
  assert.equal(E.register(db, person(2, { studentId: person(1).studentId }), T0).code, 'DUPLICATE');
  assert.equal(E.register(db, person(3, { nationalId: person(1).nationalId }), T0).code, 'DUPLICATE');
  assert.equal(E.register(db, person(4, { phone: person(1).phone }), T0).code, 'DUPLICATE');
  assert.equal(db.registrations.length, 1);
  // ارقام فارسی همان شماره‌ی قبلی حساب می‌شود
  assert.equal(E.register(db, person(5, { studentId: JR.enToFa(person(1).studentId) }), T0).code, 'DUPLICATE');
});

test('اعتبارسنجی سمت سرور و عدم ثبت داده‌ی خراب', () => {
  const db = fresh();
  const r = E.register(db, { firstName: '<b>', lastName: '', accepted: false }, T0);
  assert.equal(r.code, 'INVALID');
  assert.ok(r.errors.firstName && r.errors.nationalId && r.errors.accepted);
  assert.equal(db.registrations.length, 0);
  assert.equal(E.register(db, person(1, { degree: 'نامعتبر' }), T0).code, 'INVALID');
  assert.equal(E.register(db, person(1, { accepted: false }), T0).code, 'INVALID');
});

test('فهرست دانشجویان دانشکده (whitelist)', () => {
  const db = fresh({ whitelistEnabled: true });
  E.setWhitelist(db, 'a', person(1).studentId + '\n' + JR.enToFa(person(2).studentId) + ' ، xx, ' + person(2).studentId, T0);
  assert.equal(db.whitelist.length, 2);
  assert.ok(E.register(db, person(1), T0).ok);
  assert.ok(E.register(db, person(2), T0).ok);
  assert.equal(E.register(db, person(3), T0).code, 'NOT_ELIGIBLE');
});

test('لیست انتظار: ورود پس از پر شدن و ارتقای خودکار با لغو', () => {
  const db = fresh({ capacity: 2, waitlistEnabled: true });
  const a = E.register(db, person(1), T0), b = E.register(db, person(2), T0 + 1);
  const c = E.register(db, person(3), T0 + 2), d = E.register(db, person(4), T0 + 3);
  assert.equal(a.status, 'confirmed'); assert.equal(b.status, 'confirmed');
  assert.equal(c.status, 'waitlist'); assert.equal(c.registration.position, 1);
  assert.equal(d.status, 'waitlist'); assert.equal(d.registration.position, 2);
  const st = E.publicStatus(db, T0 + 5);
  assert.ok(st.waitlist.open); assert.equal(st.waitlist.count, 2);
  const res = E.regAction(db, 'admin', E.byId(db, db.registrations[0].id).id, 'cancel', { reason: 'انصراف' }, T0 + 6);
  assert.ok(res.ok);
  assert.equal(res.promoted.studentId, person(3).studentId);
  assert.equal(E.count(db, 'confirmed'), 2);
  assert.equal(E.count(db, 'waitlist'), 1);
});

test('لغو بدون لیست انتظار: ظرفیت قفل می‌ماند تا مدیر باز کند', () => {
  const db = fresh({ capacity: 2 });
  E.register(db, person(1), T0); E.register(db, person(2), T0 + 1);
  assert.equal(E.register(db, person(3), T0 + 2).code, 'FULL');
  E.regAction(db, 'admin', db.registrations[0].id, 'cancel', {}, T0 + 3);
  assert.equal(E.phase(db, T0 + 4).name, 'full');                 // هنوز بسته
  assert.equal(E.register(db, person(3), T0 + 4).code, 'FULL');
  assert.ok(E.control(db, 'admin', 'reopen', T0 + 5).ok);
  assert.equal(E.phase(db, T0 + 6).name, 'open');
  assert.ok(E.register(db, person(3), T0 + 6).ok);
  assert.equal(E.phase(db, T0 + 7).name, 'full');                 // دوباره قفل
  assert.equal(E.control(db, 'admin', 'reopen', T0 + 8).code, 'FULL');
});

test('افزایش ظرفیت قفل را باز می‌کند و کاهش، قفل می‌کند', () => {
  const db = fresh({ capacity: 2 });
  E.register(db, person(1), T0); E.register(db, person(2), T0 + 1);
  assert.equal(E.phase(db, T0 + 2).name, 'full');
  assert.ok(E.applySettings(db, 'a', { capacity: 3 }, T0 + 3).ok);
  assert.equal(E.phase(db, T0 + 4).name, 'open');
  assert.ok(E.applySettings(db, 'a', { capacity: 2 }, T0 + 5).ok);
  assert.equal(E.phase(db, T0 + 6).name, 'full');
});

test('عملیات مدیر: پرداخت، حضور، ویرایش، افزودن دستی، بازگردانی', () => {
  const db = fresh({ priceToman: 250000 });
  E.register(db, person(1), T0); E.register(db, person(2), T0 + 1);
  const [a, b] = db.registrations;
  assert.ok(E.regAction(db, 'x', a.id, 'setPayment', { payment: 'paid', ref: '123' }, T0 + 5).ok);
  assert.equal(a.paidAmount, 250000);
  assert.ok(E.regAction(db, 'x', a.id, 'checkIn', { value: true }, T0 + 6).ok);
  assert.equal(a.checkedIn, true);
  assert.equal(E.regAction(db, 'x', b.id, 'update', { fields: { studentId: a.studentId } }, T0 + 7).code, 'DUPLICATE');
  assert.ok(E.regAction(db, 'x', b.id, 'update', { fields: { firstName: 'مینا', note: 'یادداشت' } }, T0 + 8).ok);
  assert.equal(b.firstName, 'مینا');
  E.regAction(db, 'x', b.id, 'cancel', { reason: 'غیر دانشجوی برق' }, T0 + 9);
  assert.equal(b.status, 'cancelled');
  assert.equal(E.regAction(db, 'x', b.id, 'checkIn', {}, T0 + 10).code, 'INVALID');
  assert.ok(E.regAction(db, 'x', b.id, 'restore', {}, T0 + 11).ok);
  assert.equal(b.status, 'confirmed');
  const man = E.addManual(db, 'x', person(9, { paid: true }), T0 - 5000); // قبل از شروع هم مجاز
  assert.ok(man.ok); assert.equal(man.registration.payment, 'paid');
});

test('تنظیمات: اعتبارسنجی‌ها', () => {
  const db = fresh();
  assert.equal(E.applySettings(db, 'a', { capacity: 0 }, T0).code, 'INVALID');
  assert.equal(E.applySettings(db, 'a', { capacity: '۵۰' }, T0).ok, true);
  assert.equal(db.settings.capacity, 50);
  assert.equal(E.applySettings(db, 'a', { closeAtMs: T0 - 1 }, T0).code, 'INVALID');
  assert.equal(E.applySettings(db, 'a', { payment: { cardNumber: '123' } }, T0).code, 'INVALID');
  assert.ok(E.applySettings(db, 'a', { payment: { cardNumber: '۶۲۱۹ ۸۶۱۰ ۱۲۳۴ ۵۶۷۸', cardHolder: 'ستاد' }, priceToman: '۲۵۰٬۰۰۰' }, T0).ok);
  assert.equal(db.settings.payment.cardNumber, '6219861012345678');
  assert.equal(db.settings.priceToman, 250000);
  assert.equal(E.applySettings(db, 'a', { eventDate: { jy: 1405, jm: 12, jd: 30 } }, T0).code, 'INVALID'); // ۱۴۰۵ کبیسه نیست
  assert.equal(E.applySettings(db, 'a', { mode: 'hack' }, T0).code, 'INVALID');
});

test('آمار و مالی', () => {
  const db = fresh({ priceToman: 100000 });
  for (let i = 0; i < 4; i++) E.register(db, person(i, { degree: i < 3 ? 'کارشناسی' : 'دکتری' }), T0 + i);
  E.regAction(db, 'x', db.registrations[0].id, 'setPayment', { payment: 'paid' }, T0 + 9);
  E.regAction(db, 'x', db.registrations[1].id, 'setPayment', { payment: 'paid' }, T0 + 9);
  E.expenseAction(db, 'x', 'add', { title: 'اتوبوس', amountToman: '۱٬۰۰۰٬۰۰۰' }, T0 + 10);
  const s = E.adminStats(db, T0 + 20);
  assert.equal(s.confirmed, 4); assert.equal(s.paid, 2); assert.equal(s.unpaid, 2);
  assert.equal(s.finance.expected, 400000); assert.equal(s.finance.received, 200000);
  assert.equal(s.finance.expensesTotal, 1000000); assert.equal(s.finance.balance, -800000);
  assert.equal(s.byDegree[0].label, 'کارشناسی'); assert.equal(s.byDegree[0].n, 3);
  assert.equal(s.timeline.length, 4);
});

test('پیگیری ثبت‌نام: فقط با کد و شماره دانشجویی درست', () => {
  const db = fresh();
  const r = E.register(db, person(1), T0);
  const code = r.registration.code;
  assert.ok(E.lookup(db, JR.enToFa(code), JR.enToFa(person(1).studentId)).ok);
  assert.equal(E.lookup(db, code, person(2).studentId).code, 'NOT_FOUND');
  assert.equal(E.lookup(db, '000000', person(1).studentId).code, 'NOT_FOUND');
  const v = E.lookup(db, code, person(1).studentId).registration;
  assert.equal(v.nationalId, undefined); assert.equal(v.phone, undefined);
});

test('خروجی CSV: صفر ابتدایی حفظ و تزریق فرمول خنثی', () => {
  const db = fresh();
  E.register(db, person(1, { nationalId: '0012345679' }), T0).ok;
  const r = db.registrations[0];
  r.note = '=HYPERLINK("x")';
  const csv = E.exportCsv(db, 'all');
  assert.ok(csv.startsWith('﻿'));
  assert.ok(csv.includes('="' + r.studentId + '"'));
  assert.ok(csv.includes('\'=HYPERLINK'));
  const sec = E.exportCsv(db, 'security');
  assert.ok(sec.split('\r\n')[0].includes('کد ملی'));
});

test('migrate: دیتابیس قدیمی با پیش‌فرض‌ها کامل می‌شود', () => {
  const old = { registrations: [], settings: { capacity: 10 } };
  const m = E.migrate(old, T0);
  assert.equal(m.settings.capacity, 10);
  assert.ok(Array.isArray(m.settings.rules) && m.tasks.length > 0);
});

test('publicStatus هیچ داده‌ی شخصی ندارد', () => {
  const db = fresh();
  E.register(db, person(1), T0);
  const s = JSON.stringify(E.publicStatus(db, T0 + 1));
  assert.ok(!s.includes(person(1).nationalId) && !s.includes(person(1).phone) && !s.includes('payment"'));
});
