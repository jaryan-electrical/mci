/*
 * shared.js — منطق مشترک بین مرورگر و سرور
 * (ارقام فارسی، اعتبارسنجی فرم، تقویم شمسی، قالب‌بندی تاریخ)
 * بدون وابستگی؛ هم در Node و هم در مرورگر اجرا می‌شود.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.JR = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ───────────── ارقام ───────────── */
  var FA = '۰۱۲۳۴۵۶۷۸۹';
  function faToEn(s) {
    return String(s == null ? '' : s)
      .replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 0x06f0); })
      .replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); });
  }
  function enToFa(s) {
    return String(s == null ? '' : s).replace(/\d/g, function (d) { return FA[+d]; });
  }
  function fmtNum(n) {
    if (n == null || n === '' || isNaN(n)) return '—';
    var s = String(Math.round(Number(n)));
    var neg = s[0] === '-';
    if (neg) s = s.slice(1);
    s = s.replace(/\B(?=(\d{3})+(?!\d))/g, '٬');
    return enToFa((neg ? '-' : '') + s);
  }

  /* ───────────── متن ───────────── */
  function normText(s) {
    return String(s == null ? '' : s)
      .replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/ە/g, 'ه').replace(/ـ/g, '')
      .replace(/[\u0000-\u001f\u007f​‍‎‏‪-‮⁦-⁩﻿]/g, '')
      .replace(/[ \t ]+/g, ' ')
      .trim();
  }

  var NAME_RE = /^[؀-ۿ‌ A-Za-z'’.\-]+$/;
  var DIGIT_ANY = /[0-9٠-٩۰-۹]/;

  function cleanName(s) {
    s = normText(s);
    if (s.length < 2 || s.length > 40) return '';
    if (DIGIT_ANY.test(s) || !NAME_RE.test(s)) return '';
    return s;
  }

  function normStudentId(s) {
    s = faToEn(s).replace(/[\s\-_.]/g, '');
    return /^\d{6,12}$/.test(s) ? s : '';
  }

  function normNationalId(s) {
    s = faToEn(s).replace(/[\s\-_.]/g, '');
    if (!/^\d{8,10}$/.test(s)) return '';
    while (s.length < 10) s = '0' + s;
    if (/^(\d)\1{9}$/.test(s)) return '';
    var sum = 0;
    for (var i = 0; i < 9; i++) sum += Number(s[i]) * (10 - i);
    var r = sum % 11, c = Number(s[9]);
    return (r < 2 ? c === r : c === 11 - r) ? s : '';
  }

  function normPhone(s) {
    s = faToEn(s).replace(/[\s\-()]/g, '');
    if (s.indexOf('+98') === 0) s = '0' + s.slice(3);
    else if (s.indexOf('0098') === 0) s = '0' + s.slice(4);
    else if (/^98\d{10}$/.test(s)) s = '0' + s.slice(2);
    else if (/^9\d{9}$/.test(s)) s = '0' + s;
    return /^09\d{9}$/.test(s) ? s : '';
  }

  var DEFAULT_DEGREES = ['کارشناسی', 'کارشناسی ارشد', 'دکتری'];
  var DEFAULT_MAJORS = ['قدرت', 'الکترونیک', 'مخابرات', 'کنترل', 'مهندسی پزشکی', 'هنوز گرایش انتخاب نکرده‌ام'];

  /**
   * اعتبارسنجی فرم ثبت‌نام. همان تابع در مرورگر و سرور اجرا می‌شود.
   * خروجی: { clean, errors }  — errors: { field: 'پیام' }
   */
  function validateRegistration(v, opts) {
    opts = opts || {};
    var degrees = opts.degrees || DEFAULT_DEGREES;
    var majors = opts.majors || DEFAULT_MAJORS;
    var e = {}, c = {};
    v = v || {};
    c.firstName = cleanName(v.firstName);
    if (!c.firstName) e.firstName = 'نام را فقط با حروف فارسی یا انگلیسی بنویسید (۲ تا ۴۰ حرف).';
    c.lastName = cleanName(v.lastName);
    if (!c.lastName) e.lastName = 'نام خانوادگی را فقط با حروف بنویسید (۲ تا ۴۰ حرف).';
    c.studentId = normStudentId(v.studentId);
    if (!c.studentId) e.studentId = 'شماره دانشجویی باید فقط رقم و بین ۶ تا ۱۲ رقم باشد.';
    c.nationalId = normNationalId(v.nationalId);
    if (!c.nationalId) e.nationalId = 'کد ملی معتبر نیست؛ ۱۰ رقم را بدون فاصله وارد کنید.';
    c.phone = normPhone(v.phone);
    if (!c.phone) e.phone = 'شماره موبایل را به شکل ۰۹۱۲۳۴۵۶۷۸۹ وارد کنید.';
    c.degree = normText(v.degree);
    if (degrees.indexOf(c.degree) < 0) e.degree = 'مقطع تحصیلی را انتخاب کنید.';
    c.major = normText(v.major);
    if (majors.indexOf(c.major) < 0) e.major = 'گرایش را انتخاب کنید.';
    if (v.accepted !== true && v.accepted !== 'true' && v.accepted !== 'on') {
      e.accepted = 'برای ادامه باید شرایط شرکت را بپذیرید.';
    }
    return { clean: c, errors: e, ok: Object.keys(e).length === 0 };
  }

  /* ───────────── تقویم شمسی (الگوریتم jalaali) ───────────── */
  function div(a, b) { return ~~(a / b); }
  function mod(a, b) { return a - ~~(a / b) * b; }
  var BREAKS = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];

  function jalCal(jy, withoutLeap) {
    var bl = BREAKS.length, gy = jy + 621, leapJ = -14, jp = BREAKS[0], jm, jump = 0, leap, leapG, march, n, i;
    if (jy < jp || jy >= BREAKS[bl - 1]) throw new Error('Invalid Jalaali year ' + jy);
    for (i = 1; i < bl; i += 1) {
      jm = BREAKS[i];
      jump = jm - jp;
      if (jy < jm) break;
      leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
      jp = jm;
    }
    n = jy - jp;
    leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
    if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
    leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
    march = 20 + leapJ - leapG;
    if (withoutLeap) return { gy: gy, march: march };
    if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
    leap = mod(mod(n + 1, 33) - 1, 4);
    if (leap === -1) leap = 4;
    return { leap: leap, gy: gy, march: march };
  }
  function g2d(gy, gm, gd) {
    var d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) + div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408;
    d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
    return d;
  }
  function d2g(jdn) {
    var j = 4 * jdn + 139361631;
    j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
    var i = div(mod(j, 1461), 4) * 5 + 308;
    var gd = div(mod(i, 153), 5) + 1;
    var gm = mod(div(i, 153), 12) + 1;
    var gy = div(j, 1461) - 100100 + div(8 - gm, 6);
    return { gy: gy, gm: gm, gd: gd };
  }
  function j2d(jy, jm, jd) {
    var r = jalCal(jy, true);
    return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
  }
  function d2j(jdn) {
    var gy = d2g(jdn).gy, jy = gy - 621, r = jalCal(jy, false), jdn1f = g2d(gy, 3, r.march), jd, jm, k;
    k = jdn - jdn1f;
    if (k >= 0) {
      if (k <= 185) { jm = 1 + div(k, 31); jd = mod(k, 31) + 1; return { jy: jy, jm: jm, jd: jd }; }
      k -= 186;
    } else {
      jy -= 1; k += 179;
      if (r.leap === 1) k += 1;
    }
    jm = 7 + div(k, 30); jd = mod(k, 30) + 1;
    return { jy: jy, jm: jm, jd: jd };
  }
  function toJalali(gy, gm, gd) { return d2j(g2d(gy, gm, gd)); }
  function toGregorian(jy, jm, jd) { return d2g(j2d(jy, jm, jd)); }
  function isJalaliLeap(jy) { return jalCal(jy, false).leap === 0; }
  function jalaliMonthLength(jy, jm) {
    if (jm <= 6) return 31;
    if (jm <= 11) return 30;
    return isJalaliLeap(jy) ? 30 : 29;
  }

  var MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
  var WEEKDAYS = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه']; // برابر getUTCDay()
  var TEHRAN_OFFSET_MIN = 210; // ایران از ۱۴۰۱ ساعت تابستانی ندارد؛ همیشه UTC+03:30

  function tehranParts(ms) {
    var d = new Date(ms + TEHRAN_OFFSET_MIN * 60000);
    var j = toJalali(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    return {
      jy: j.jy, jm: j.jm, jd: j.jd,
      h: d.getUTCHours(), mi: d.getUTCMinutes(), s: d.getUTCSeconds(),
      weekday: d.getUTCDay()
    };
  }
  function fromTehran(jy, jm, jd, h, mi, s) {
    var g = toGregorian(jy, jm, jd);
    return Date.UTC(g.gy, g.gm - 1, g.gd, h || 0, mi || 0, s || 0) - TEHRAN_OFFSET_MIN * 60000;
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /** مثال: «سه‌شنبه ۱۲ آبان ۱۴۰۵» */
  function fmtDate(ms, o) {
    if (ms == null || isNaN(ms)) return '—';
    o = o || {};
    var p = tehranParts(ms);
    var out = (o.weekday === false ? '' : WEEKDAYS[p.weekday] + ' ') + p.jd + ' ' + MONTHS[p.jm - 1] + (o.year === false ? '' : ' ' + p.jy);
    if (o.time) out += '، ساعت ' + pad2(p.h) + ':' + pad2(p.mi) + (o.seconds ? ':' + pad2(p.s) : '');
    return enToFa(out);
  }
  function fmtTime(ms, withSeconds) {
    if (ms == null || isNaN(ms)) return '—';
    var p = tehranParts(ms);
    return enToFa(pad2(p.h) + ':' + pad2(p.mi) + (withSeconds ? ':' + pad2(p.s) : ''));
  }
  /** تاریخ کوتاه عددی: ۱۴۰۵/۰۸/۱۲ */
  function fmtShort(ms) {
    if (ms == null || isNaN(ms)) return '—';
    var p = tehranParts(ms);
    return enToFa(p.jy + '/' + pad2(p.jm) + '/' + pad2(p.jd));
  }
  /** مدت‌زمان فارسی: «۴۷ ثانیه»، «۳ دقیقه و ۵ ثانیه» */
  function fmtDuration(ms) {
    var s = Math.max(0, Math.round(ms / 1000));
    if (s < 60) return enToFa(s + ' ثانیه');
    var m = Math.floor(s / 60); s = s % 60;
    if (m < 60) return enToFa(m + ' دقیقه' + (s ? ' و ' + s + ' ثانیه' : ''));
    var h = Math.floor(m / 60); m = m % 60;
    if (h < 48) return enToFa(h + ' ساعت' + (m ? ' و ' + m + ' دقیقه' : ''));
    var d = Math.floor(h / 24); h = h % 24;
    return enToFa(d + ' روز' + (h ? ' و ' + h + ' ساعت' : ''));
  }

  return {
    faToEn: faToEn, enToFa: enToFa, fmtNum: fmtNum, normText: normText,
    cleanName: cleanName, normStudentId: normStudentId, normNationalId: normNationalId, normPhone: normPhone,
    validateRegistration: validateRegistration,
    DEFAULT_DEGREES: DEFAULT_DEGREES, DEFAULT_MAJORS: DEFAULT_MAJORS,
    toJalali: toJalali, toGregorian: toGregorian, isJalaliLeap: isJalaliLeap, jalaliMonthLength: jalaliMonthLength,
    MONTHS: MONTHS, WEEKDAYS: WEEKDAYS, TEHRAN_OFFSET_MIN: TEHRAN_OFFSET_MIN,
    tehranParts: tehranParts, fromTehran: fromTehran,
    fmtDate: fmtDate, fmtTime: fmtTime, fmtShort: fmtShort, fmtDuration: fmtDuration, pad2: pad2
  };
});
