'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const JR = require('../docs/js/shared.js');

test('تبدیل شمسی ⇄ میلادی با Intl یکسان است (۱۳۹۵ تا ۱۴۱۵)', () => {
  const f = new Intl.DateTimeFormat('en-u-ca-persian-nu-latn', { timeZone: 'UTC', year: 'numeric', month: 'numeric', day: 'numeric' });
  let n = 0;
  for (let t = Date.UTC(2016, 2, 1); t < Date.UTC(2037, 2, 1); t += 86400000) {
    const d = new Date(t);
    const parts = Object.fromEntries(f.formatToParts(d).map((p) => [p.type, p.value]));
    const j = JR.toJalali(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    assert.equal(j.jy, +parts.relatedYear || +parts.year, 'year ' + d.toISOString());
    assert.equal(j.jm, +parts.month, 'month ' + d.toISOString());
    assert.equal(j.jd, +parts.day, 'day ' + d.toISOString());
    const g = JR.toGregorian(j.jy, j.jm, j.jd);
    assert.deepEqual([g.gy, g.gm, g.gd], [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()]);
    n++;
  }
  assert.ok(n > 7000);
});

test('۱۲ آبان ۱۴۰۵ سه‌شنبه ۱۳ آبان است و قالب‌بندی درست است', () => {
  const ms = JR.fromTehran(1405, 8, 12, 9, 30);
  assert.equal(new Date(ms).toISOString(), '2026-11-03T06:00:00.000Z');
  assert.equal(JR.fmtDate(ms), 'سه‌شنبه ۱۲ آبان ۱۴۰۵');
  assert.equal(JR.fmtDate(ms, { time: true }), 'سه‌شنبه ۱۲ آبان ۱۴۰۵، ساعت ۰۹:۳۰');
  assert.equal(JR.fmtShort(ms), '۱۴۰۵/۰۸/۱۲');
  const p = JR.tehranParts(ms);
  assert.deepEqual([p.jy, p.jm, p.jd, p.h, p.mi], [1405, 8, 12, 9, 30]);
});

test('رفت‌وبرگشت فرومرز نیمه‌شب تهران', () => {
  const ms = JR.fromTehran(1405, 12, 29, 23, 59, 59);
  const p = JR.tehranParts(ms);
  assert.deepEqual([p.jy, p.jm, p.jd, p.h, p.mi, p.s], [1405, 12, 29, 23, 59, 59]);
  assert.equal(JR.jalaliMonthLength(1403, 12), 30); // سال کبیسه
  assert.equal(JR.jalaliMonthLength(1405, 12), 29);
});

function makeNid(base9) {
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += +base9[i] * (10 - i);
  const r = sum % 11;
  return base9 + (r < 2 ? r : 11 - r);
}

test('کد ملی: چک‌سام، ارقام فارسی، صفرهای حذف‌شده', () => {
  const ok = makeNid('123456789');
  assert.equal(JR.normNationalId(ok), ok);
  assert.equal(JR.normNationalId(JR.enToFa(ok)), ok);
  const bad = ok.slice(0, 9) + ((+ok[9] + 1) % 10);
  assert.equal(JR.normNationalId(bad), '');
  assert.equal(JR.normNationalId('1111111111'), '');
  const withZero = makeNid('001234567');
  assert.equal(JR.normNationalId(withZero.replace(/^0+/, '')), withZero);
});

test('موبایل و شماره دانشجویی و نام', () => {
  for (const s of ['09123456789', '۰۹۱۲۳۴۵۶۷۸۹', '+989123456789', '00989123456789', '9123456789', '0912 345 6789'])
    assert.equal(JR.normPhone(s), '09123456789', s);
  assert.equal(JR.normPhone('0812345678'), '');
  assert.equal(JR.normPhone('091234'), '');
  assert.equal(JR.normStudentId('۴۰۱۲۴۳۰۱۲'), '401243012');
  assert.equal(JR.normStudentId('12ab'), '');
  assert.equal(JR.cleanName('عليرضا'), 'علیرضا');
  assert.equal(JR.cleanName('محمد‌حسین'), 'محمد‌حسین');
  assert.equal(JR.cleanName('A1'), '');
  assert.equal(JR.cleanName('<script>'), '');
  assert.equal(JR.cleanName('ا'), '');
});

test('اعتبارسنجی کامل فرم', () => {
  const nid = makeNid('987654321');
  const r = JR.validateRegistration({
    firstName: 'سارا', lastName: 'احمدی', studentId: '۴۰۱۲۴۳۰۱۲', nationalId: nid, phone: '0912-345-6789',
    degree: 'کارشناسی', major: 'قدرت', accepted: true
  });
  assert.ok(r.ok, JSON.stringify(r.errors));
  assert.equal(r.clean.phone, '09123456789');
  const bad = JR.validateRegistration({});
  assert.ok(!bad.ok);
  assert.ok(bad.errors.firstName && bad.errors.nationalId && bad.errors.accepted);
});

test('قالب مدت‌زمان', () => {
  assert.equal(JR.fmtDuration(47000), '۴۷ ثانیه');
  assert.equal(JR.fmtDuration(125000), '۲ دقیقه و ۵ ثانیه');
  assert.equal(JR.fmtNum(1250000), '۱٬۲۵۰٬۰۰۰');
});
