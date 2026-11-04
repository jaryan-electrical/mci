/* ═══════════════════════════════════════════════════════════════════════
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

/* ───────────── shared.js ───────────── */
var JR = (function () {
  var module = undefined, exports = undefined, self = undefined, __root = {};
  
  (function () {
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

  }).call(__root);
  return __root.JR;
})();

/* ───────────── engine.js ───────────── */
var JREngine = (function () {
  var module = undefined, exports = undefined, self = undefined, __root = {};
  __root.JR = JR;
  (function () {
    /*
     * engine.js — هسته‌ی منطق سامانه (بدون ورودی/خروجی)
     *
     * همه‌ی قوانین ثبت‌نام اینجاست: زمان شروع، ظرفیت، قفل خودکار با نفر آخر،
     * لیست انتظار، یکتایی اطلاعات، عملیات پنل مدیریت و آمار.
     * سرور (Node) و نسخه‌ی نمایشی (مرورگر) هر دو از همین فایل استفاده می‌کنند.
     * همه‌ی توابع روی شیء `db` کار می‌کنند و زمان (ms) را از بیرون می‌گیرند؛
     * ذخیره‌ی فایل کار سرور است.
     */
    (function (root, factory) {
      if (typeof module === 'object' && module.exports) module.exports = factory(require('../docs/js/shared.js'));
      else root.JREngine = factory(root.JR);
    })(typeof self !== 'undefined' ? self : this, function (JR) {
      'use strict';

      /* ───────────── ابزارهای کوچک ───────────── */
      function err(code, message, extra) { return Object.assign({ ok: false, code: code, message: message }, extra || {}); }
      /** بایت‌های تصادفی امن: مرورگر/Node (crypto) یا Google Apps Script (Utilities.getUuid) */
      function randomBytes(n) {
        var a = new Uint8Array(n), i;
        var c = (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.getRandomValues) ? globalThis.crypto : null;
        if (c) { c.getRandomValues(a); return a; }
        if (typeof Utilities !== 'undefined' && Utilities.getUuid) {
          var hex = '';
          while (hex.length < n * 2) hex += Utilities.getUuid().replace(/-/g, '');
          for (i = 0; i < n; i++) a[i] = parseInt(hex.substr(i * 2, 2), 16);
          return a;
        }
        require('node:crypto').webcrypto.getRandomValues(a);
        return a;
      }
      function uid() {
        var a = randomBytes(8);
        return Array.prototype.map.call(a, function (b) { return (b < 16 ? '0' : '') + b.toString(16); }).join('');
      }
      function randInt(min, max) { // عدد تصادفی امن در بازه‌ی [min, max]
        var a = randomBytes(4), n = ((a[0] * 16777216) + (a[1] << 16) + (a[2] << 8) + a[3]) >>> 0;
        return min + (n % (max - min + 1));
      }
      function str(v, max) { return JR.normText(v).slice(0, max); }
      function intOrNull(v, min, max) {
        if (v === null || v === '' || v === undefined) return null;
        var n = Number(JR.faToEn(String(v)).replace(/[,٬\s]/g, ''));
        if (!isFinite(n) || n < min || n > max) return undefined; // undefined = نامعتبر
        return Math.round(n);
      }

      /* ───────────── مقادیر پیش‌فرض ───────────── */
      var DEFAULT_RULES = [
        'این بازدید فقط برای دانشجویان دانشکده مهندسی برق دانشگاه شهید بهشتی است.',
        'ظرفیت محدود است؛ ثبت‌نام به‌محض تکمیل ظرفیت بسته می‌شود.',
        'نام، کد ملی و شماره دانشجویی را دقیق وارد کنید؛ برای هماهنگی ورود به ساختمان شرکت استفاده می‌شود.',
        'هر نفر فقط یک بار می‌تواند ثبت‌نام کند و اطلاعات تکراری پذیرفته نمی‌شود.',
        'روز بازدید کارت دانشجویی و کارت ملی همراه داشته باشید.',
        'ساعت و محل حرکت از راه پیامک و کانال اطلاع‌رسانی جریان اعلام می‌شود.'
      ];

      function defaultSettings() {
        return {
          eventTitle: 'اردوی بازدید از همراه اول',
          eventDate: { jy: 1405, jm: 8, jd: 12 },
          capacity: 40,
          priceToman: null,
          openAtMs: null,
          closeAtMs: null,
          mode: 'auto',
          waitlistEnabled: false,
          autoPromote: true,
          whitelistEnabled: false,
          degrees: JR.DEFAULT_DEGREES.slice(),
          majors: JR.DEFAULT_MAJORS.slice(),
          payment: { enabled: true, cardNumber: '', cardHolder: '', bankName: '', note: '' },
          meeting: { place: '', time: '', note: '' },
          announcement: '',
          contact: { eitaa: '', telegram: '', instagram: '', phone: '' },
          rules: DEFAULT_RULES.slice()
        };
      }

      function defaultTasks(now) {
        return [
          'هماهنگی رسمی و دریافت مجوز بازدید از همراه اول',
          'ارسال لیست اسامی (نام و کد ملی) به حراست',
          'رزرو اتوبوس یا سرویس رفت‌وآمد',
          'هماهنگی پذیرایی و آب',
          'اطلاع‌رسانی ساعت و محل حرکت به شرکت‌کنندگان',
          'چاپ لیست حضور و غیاب',
          'تهیه عکس و گزارش از اردو'
        ].map(function (t) { return { id: uid(), title: t, done: false, createdAt: now }; });
      }

      function newDb(now) {
        return {
          version: 1,
          createdAt: now,
          settings: defaultSettings(),
          whitelist: [],
          registrations: [],
          seq: 0,
          lockedFullAt: null,
          expenses: [],
          tasks: defaultTasks(now),
          users: [],
          sessions: [],
          audit: []
        };
      }

      /** دیتابیس قدیمی‌تر یا ناقص را با پیش‌فرض‌ها کامل می‌کند. */
      function migrate(db, now) {
        var d = newDb(now);
        Object.keys(d).forEach(function (k) { if (db[k] === undefined) db[k] = d[k]; });
        var s = defaultSettings();
        Object.keys(s).forEach(function (k) {
          if (db.settings[k] === undefined) db.settings[k] = s[k];
          else if (s[k] && typeof s[k] === 'object' && !Array.isArray(s[k])) db.settings[k] = Object.assign({}, s[k], db.settings[k]);
        });
        return db;
      }

      function audit(db, by, act, detail, now) {
        db.audit.push({ t: now, by: by || '—', act: act, detail: detail || '' });
        if (db.audit.length > 3000) db.audit.splice(0, db.audit.length - 3000);
      }

      /* ───────────── وضعیت ثبت‌نام ───────────── */
      function count(db, status) {
        var n = 0;
        for (var i = 0; i < db.registrations.length; i++) if (db.registrations[i].status === status) n++;
        return n;
      }

      /** فاز: before | open | full | closed */
      function phase(db, now) {
        var s = db.settings;
        if (s.mode === 'forceClosed') return { name: 'closed', reason: 'manual' };
        var timeOpen = s.mode === 'forceOpen' || (s.openAtMs != null && now >= s.openAtMs);
        if (!timeOpen) return { name: 'before' };
        if (s.mode !== 'forceOpen' && s.closeAtMs != null && now >= s.closeAtMs) return { name: 'closed', reason: 'time' };
        if (db.lockedFullAt != null || count(db, 'confirmed') >= s.capacity) return { name: 'full' };
        return { name: 'open' };
      }

      function dateMs(ev) { return JR.fromTehran(ev.jy, ev.jm, ev.jd, 0, 0); }

      function firstConfirmedAt(db) {
        var t = null;
        db.registrations.forEach(function (r) { if (r.status === 'confirmed' && (t === null || r.createdAt < t)) t = r.createdAt; });
        return t;
      }

      /** اطلاعاتی که صفحه‌ی عمومی می‌بیند (بدون هیچ داده‌ی شخصی). */
      function publicStatus(db, now) {
        var s = db.settings, ph = phase(db, now);
        var taken = count(db, 'confirmed');
        var fillMs = null;
        if (db.lockedFullAt != null) {
          var first = firstConfirmedAt(db);
          var start = (s.mode === 'forceOpen' || s.openAtMs == null || (first !== null && s.openAtMs > first)) ? first : s.openAtMs;
          if (start != null) fillMs = Math.max(0, db.lockedFullAt - start);
        }
        return {
          serverTime: now,
          phase: ph.name,
          closedReason: ph.reason || null,
          openAtMs: s.openAtMs,
          closeAtMs: s.closeAtMs,
          capacity: s.capacity,
          taken: Math.min(taken, s.capacity),
          remaining: Math.max(0, s.capacity - taken),
          fullAtMs: db.lockedFullAt,
          fillMs: fillMs,
          waitlist: { enabled: !!s.waitlistEnabled, open: ph.name === 'full' && !!s.waitlistEnabled, count: count(db, 'waitlist') },
          whitelistEnabled: !!s.whitelistEnabled,
          event: { title: s.eventTitle, dateMs: dateMs(s.eventDate), date: s.eventDate, priceToman: s.priceToman },
          announcement: s.announcement,
          meeting: s.meeting,
          contact: s.contact,
          rules: s.rules,
          degrees: s.degrees,
          majors: s.majors
        };
      }

      /* ───────────── ثبت‌نام عمومی ───────────── */
      function findDuplicate(db, c, exceptId) {
        for (var i = 0; i < db.registrations.length; i++) {
          var r = db.registrations[i];
          if (r.status === 'cancelled' || r.id === exceptId) continue;
          if (r.studentId === c.studentId) return { field: 'studentId', message: 'با این شماره دانشجویی قبلاً ثبت‌نام شده است.' };
          if (r.nationalId === c.nationalId) return { field: 'nationalId', message: 'با این کد ملی قبلاً ثبت‌نام شده است.' };
          if (r.phone === c.phone) return { field: 'phone', message: 'با این شماره موبایل قبلاً ثبت‌نام شده است.' };
        }
        return null;
      }

      function newCode(db) {
        for (var tries = 0; tries < 50; tries++) {
          var code = String(randInt(100000, 999999));
          var clash = db.registrations.some(function (r) { return r.code === code; });
          if (!clash) return code;
        }
        return String(Date.now()).slice(-8);
      }

      function waitlistPosition(db, reg) {
        var pos = 0;
        db.registrations.forEach(function (r) { if (r.status === 'waitlist' && r.seq <= reg.seq) pos++; });
        return pos;
      }

      function paymentInfo(db) {
        var s = db.settings;
        return {
          enabled: !!s.payment.enabled && s.priceToman != null && s.priceToman > 0,
          priceToman: s.priceToman,
          cardNumber: s.payment.cardNumber, cardHolder: s.payment.cardHolder,
          bankName: s.payment.bankName, note: s.payment.note
        };
      }

      /** نمایش امن ثبت‌نام برای خود شخص */
      function selfView(db, r) {
        return {
          code: r.code, seq: r.seq, status: r.status,
          firstName: r.firstName, lastName: r.lastName,
          studentId: r.studentId, degree: r.degree, major: r.major,
          payment: r.payment, checkedIn: !!r.checkedIn,
          position: r.status === 'waitlist' ? waitlistPosition(db, r) : null,
          createdAt: r.createdAt,
          payInfo: paymentInfo(db),
          meeting: db.settings.meeting,
          contact: db.settings.contact
        };
      }

      /**
       * ثبت‌نام. اتمیک است: بررسی ظرفیت و افزودن در یک گام همزمان انجام می‌شود
       * (Node تک‌نخی است و این تابع هیچ await ندارد).
       * opts.admin = true  → قوانین زمان/ظرفیت/فهرست اعمال نمی‌شود (افزودن دستی)
       */
      function register(db, input, now, opts) {
        opts = opts || {};
        var s = db.settings;
        var ph = phase(db, now);

        if (!opts.admin) {
          if (ph.name === 'before') return err('NOT_OPEN', 'ثبت‌نام هنوز شروع نشده است.', { opensInMs: s.openAtMs != null ? Math.max(0, s.openAtMs - now) : null });
          if (ph.name === 'closed') return err('CLOSED', ph.reason === 'time' ? 'مهلت ثبت‌نام به پایان رسیده است.' : 'ثبت‌نام بسته شده است.');
          if (ph.name === 'full' && !s.waitlistEnabled) return err('FULL', 'ظرفیت تکمیل شد و ثبت‌نام بسته شده است.');
        }

        var v = JR.validateRegistration(Object.assign({}, input, opts.admin ? { accepted: true } : {}), { degrees: s.degrees, majors: s.majors });
        if (!v.ok) return err('INVALID', 'اطلاعات فرم را بررسی کنید.', { errors: v.errors });
        var c = v.clean;

        if (!opts.admin && s.whitelistEnabled && db.whitelist.indexOf(c.studentId) < 0) {
          return err('NOT_ELIGIBLE', 'این شماره دانشجویی در فهرست دانشجویان دانشکده برق نیست. اگر دانشجوی دانشکده هستید با ستاد تماس بگیرید.', { errors: { studentId: 'در فهرست دانشجویان دانشکده نیست.' } });
        }

        var dup = findDuplicate(db, c);
        if (dup) return err('DUPLICATE', dup.message, { errors: (function () { var o = {}; o[dup.field] = dup.message; return o; })() });

        var taken = count(db, 'confirmed');
        var locked = db.lockedFullAt != null || taken >= s.capacity;
        var status;
        if (opts.admin) status = opts.status === 'waitlist' ? 'waitlist' : 'confirmed';
        else if (!locked) status = 'confirmed';
        else if (s.waitlistEnabled) status = 'waitlist';
        else return err('FULL', 'ظرفیت تکمیل شد و ثبت‌نام بسته شده است.');

        db.seq += 1;
        var reg = {
          id: uid(), seq: db.seq, code: newCode(db), status: status,
          firstName: c.firstName, lastName: c.lastName, studentId: c.studentId, nationalId: c.nationalId,
          phone: c.phone, degree: c.degree, major: c.major,
          payment: 'unpaid', paidAmount: null, payRef: '', paidAt: null,
          checkedIn: false, checkedInAt: null, note: '',
          createdAt: now, ipTag: (opts.meta && opts.meta.ipTag) || '', source: opts.admin ? 'admin' : 'web'
        };
        db.registrations.push(reg);

        if (status === 'confirmed' && taken + 1 >= s.capacity && db.lockedFullAt == null) db.lockedFullAt = now;

        return { ok: true, status: status, registration: selfView(db, reg), _reg: reg };
      }

      function lookup(db, code, studentId) {
        code = JR.faToEn(code || '').replace(/\D/g, '');
        var sid = JR.normStudentId(studentId);
        if (!code || !sid) return err('INVALID', 'کد پیگیری و شماره دانشجویی را وارد کنید.');
        for (var i = 0; i < db.registrations.length; i++) {
          var r = db.registrations[i];
          if (r.code === code && r.studentId === sid) return { ok: true, registration: selfView(db, r) };
        }
        return err('NOT_FOUND', 'ثبت‌نامی با این مشخصات پیدا نشد.');
      }

      /* ───────────── ابزارهای پنل مدیریت ───────────── */
      function byId(db, id) {
        for (var i = 0; i < db.registrations.length; i++) if (db.registrations[i].id === id) return db.registrations[i];
        return null;
      }

      function promoteNext(db, now, actor) {
        var next = null;
        db.registrations.forEach(function (r) { if (r.status === 'waitlist' && (!next || r.seq < next.seq)) next = r; });
        if (!next) return null;
        next.status = 'confirmed';
        audit(db, actor, 'promote', 'ارتقا از لیست انتظار: ' + next.firstName + ' ' + next.lastName, now);
        if (count(db, 'confirmed') >= db.settings.capacity && db.lockedFullAt == null) db.lockedFullAt = now;
        return next;
      }

      function fullName(r) { return r.firstName + ' ' + r.lastName; }

      /** اعمال یک تغییر روی یک ثبت‌نام. actor = نام کاربری */
      function regAction(db, actor, id, action, p, now) {
        p = p || {};
        var r = byId(db, id);
        if (!r) return err('NOT_FOUND', 'ثبت‌نام پیدا نشد.');
        var s = db.settings, promoted = null;

        switch (action) {
          case 'cancel': {
            if (r.status === 'cancelled') return err('NO_CHANGE', 'این ثبت‌نام قبلاً لغو شده است.');
            var was = r.status;
            r.status = 'cancelled'; r.cancelledAt = now; r.cancelReason = str(p.reason, 200); r.checkedIn = false; r.checkedInAt = null;
            audit(db, actor, 'cancel', fullName(r) + (r.cancelReason ? ' — ' + r.cancelReason : ''), now);
            if (was === 'confirmed' && s.waitlistEnabled && s.autoPromote) promoted = promoteNext(db, now, actor);
            break;
          }
          case 'restore': {
            if (r.status !== 'cancelled') return err('NO_CHANGE', 'این ثبت‌نام لغو نشده است.');
            var dup = findDuplicate(db, r, r.id);
            if (dup) return err('DUPLICATE', 'نمی‌شود بازگرداند: ' + dup.message);
            r.status = count(db, 'confirmed') < s.capacity ? 'confirmed' : 'waitlist';
            delete r.cancelledAt; delete r.cancelReason;
            audit(db, actor, 'restore', fullName(r) + ' → ' + r.status, now);
            if (r.status === 'confirmed' && count(db, 'confirmed') >= s.capacity && db.lockedFullAt == null) db.lockedFullAt = now;
            break;
          }
          case 'promote': {
            if (r.status !== 'waitlist') return err('NO_CHANGE', 'این فرد در لیست انتظار نیست.');
            if (count(db, 'confirmed') >= s.capacity && !p.force) return err('FULL', 'ظرفیت پر است. برای ارتقا، ظرفیت را بیشتر کنید یا ثبت‌نامی را لغو کنید.');
            r.status = 'confirmed';
            audit(db, actor, 'promote', fullName(r), now);
            if (count(db, 'confirmed') >= s.capacity && db.lockedFullAt == null) db.lockedFullAt = now;
            break;
          }
          case 'setPayment': {
            var st = p.payment;
            if (['paid', 'unpaid', 'refunded'].indexOf(st) < 0) return err('INVALID', 'وضعیت پرداخت نامعتبر است.');
            r.payment = st;
            r.payRef = str(p.ref != null ? p.ref : r.payRef, 60);
            if (st === 'paid') {
              var amt = intOrNull(p.amount, 0, 1e9);
              r.paidAmount = (amt === undefined || amt === null) ? (s.priceToman != null ? s.priceToman : 0) : amt;
              r.paidAt = now;
            } else if (st === 'unpaid') { r.paidAmount = null; r.paidAt = null; }
            audit(db, actor, 'payment', fullName(r) + ' → ' + st, now);
            break;
          }
          case 'checkIn': {
            if (r.status !== 'confirmed') return err('INVALID', 'فقط شرکت‌کنندگان قطعی را می‌شود حاضر زد.');
            var val = p.value !== false;
            r.checkedIn = val; r.checkedInAt = val ? now : null; r.checkedInBy = val ? actor : null;
            audit(db, actor, val ? 'checkin' : 'uncheckin', fullName(r), now);
            break;
          }
          case 'note': {
            r.note = str(p.note, 500);
            audit(db, actor, 'note', fullName(r), now);
            break;
          }
          case 'update': {
            var f = p.fields || {};
            var merged = {
              firstName: f.firstName != null ? f.firstName : r.firstName,
              lastName: f.lastName != null ? f.lastName : r.lastName,
              studentId: f.studentId != null ? f.studentId : r.studentId,
              nationalId: f.nationalId != null ? f.nationalId : r.nationalId,
              phone: f.phone != null ? f.phone : r.phone,
              degree: f.degree != null ? f.degree : r.degree,
              major: f.major != null ? f.major : r.major,
              accepted: true
            };
            var v = JR.validateRegistration(merged, { degrees: s.degrees, majors: s.majors });
            if (!v.ok) return err('INVALID', 'اطلاعات نامعتبر است.', { errors: v.errors });
            var d2 = findDuplicate(db, v.clean, r.id);
            if (d2) return err('DUPLICATE', d2.message);
            Object.assign(r, v.clean);
            if (f.note != null) r.note = str(f.note, 500);
            audit(db, actor, 'edit', fullName(r), now);
            break;
          }
          default:
            return err('INVALID', 'عملیات نامعتبر است.');
        }
        return { ok: true, registration: r, promoted: promoted };
      }

      function addManual(db, actor, input, now) {
        var res = register(db, input, now, { admin: true, status: input && input.status });
        if (!res.ok) return res;
        var r = res._reg;
        if (input && input.paid) { r.payment = 'paid'; r.paidAmount = db.settings.priceToman || 0; r.paidAt = now; }
        if (input && input.note) r.note = str(input.note, 500);
        audit(db, actor, 'add', fullName(r) + ' (افزودن دستی)', now);
        delete res._reg;
        return { ok: true, registration: r };
      }

      /* ───────────── تنظیمات ───────────── */
      function applySettings(db, actor, patch, now) {
        var s = db.settings, n = {}, bad = {};
        patch = patch || {};

        if ('eventTitle' in patch) { var t = str(patch.eventTitle, 120); if (t) n.eventTitle = t; else bad.eventTitle = 'عنوان خالی است.'; }
        if ('eventDate' in patch) {
          var e = patch.eventDate || {};
          var jy = +e.jy, jm = +e.jm, jd = +e.jd;
          if (jy >= 1400 && jy <= 1450 && jm >= 1 && jm <= 12 && jd >= 1 && jd <= JR.jalaliMonthLength(jy, jm)) n.eventDate = { jy: jy, jm: jm, jd: jd };
          else bad.eventDate = 'تاریخ نامعتبر است.';
        }
        if ('capacity' in patch) { var cp = intOrNull(patch.capacity, 1, 500); if (cp) n.capacity = cp; else bad.capacity = 'ظرفیت باید عددی بین ۱ تا ۵۰۰ باشد.'; }
        if ('priceToman' in patch) { var pr = intOrNull(patch.priceToman, 0, 1e9); if (pr === undefined) bad.priceToman = 'مبلغ نامعتبر است.'; else n.priceToman = pr; }
        ['openAtMs', 'closeAtMs'].forEach(function (k) {
          if (k in patch) {
            var v = patch[k];
            if (v === null || v === '') n[k] = null;
            else if (typeof v === 'number' && v > 1.5e12 && v < 4.1e12) n[k] = Math.round(v);
            else bad[k] = 'زمان نامعتبر است.';
          }
        });
        if ('mode' in patch) { if (['auto', 'forceOpen', 'forceClosed'].indexOf(patch.mode) >= 0) n.mode = patch.mode; else bad.mode = 'حالت نامعتبر است.'; }
        ['waitlistEnabled', 'autoPromote', 'whitelistEnabled'].forEach(function (k) { if (k in patch) n[k] = !!patch[k]; });
        ['degrees', 'majors'].forEach(function (k) {
          if (k in patch) {
            var arr = (Array.isArray(patch[k]) ? patch[k] : []).map(function (x) { return str(x, 40); }).filter(Boolean);
            arr = arr.filter(function (x, i) { return arr.indexOf(x) === i; });
            if (arr.length >= 1 && arr.length <= 12) n[k] = arr; else bad[k] = 'بین ۱ تا ۱۲ گزینه لازم است.';
          }
        });
        if ('rules' in patch) {
          var rl = (Array.isArray(patch.rules) ? patch.rules : []).map(function (x) { return str(x, 300); }).filter(Boolean).slice(0, 14);
          n.rules = rl;
        }
        if ('announcement' in patch) n.announcement = str(patch.announcement, 400);
        if ('payment' in patch && patch.payment) {
          var pp = patch.payment, card = JR.faToEn(pp.cardNumber || '').replace(/\D/g, '');
          if (card && card.length !== 16) bad.cardNumber = 'شماره کارت باید ۱۶ رقم باشد.';
          n.payment = Object.assign({}, s.payment, {
            enabled: pp.enabled !== false, cardNumber: card, cardHolder: str(pp.cardHolder, 60), bankName: str(pp.bankName, 40), note: str(pp.note, 200)
          });
        }
        if ('meeting' in patch && patch.meeting) n.meeting = { place: str(patch.meeting.place, 200), time: str(patch.meeting.time, 80), note: str(patch.meeting.note, 300) };
        if ('contact' in patch && patch.contact) {
          var ct = patch.contact;
          n.contact = { eitaa: str(ct.eitaa, 80), telegram: str(ct.telegram, 80), instagram: str(ct.instagram, 80), phone: str(ct.phone, 30) };
        }

        if (Object.keys(bad).length) return err('INVALID', 'برخی مقادیر نامعتبر است.', { errors: bad });

        var open = 'openAtMs' in n ? n.openAtMs : s.openAtMs, close = 'closeAtMs' in n ? n.closeAtMs : s.closeAtMs;
        if (open != null && close != null && close <= open) return err('INVALID', 'زمان پایان باید بعد از زمان شروع باشد.', { errors: { closeAtMs: 'زمان پایان باید بعد از شروع باشد.' } });

        var prevCap = s.capacity;
        Object.assign(s, n);
        if ('capacity' in n) {
          var taken = count(db, 'confirmed');
          if (n.capacity > prevCap && taken < n.capacity) db.lockedFullAt = null;            // ظرفیت بیشتر شد → باز شود
          if (taken >= n.capacity && db.lockedFullAt == null) db.lockedFullAt = now;         // ظرفیت کمتر شد → قفل
        }
        audit(db, actor, 'settings', Object.keys(n).join('، '), now);
        return { ok: true, settings: s };
      }

      function control(db, actor, action, now) {
        var s = db.settings;
        if (action === 'forceOpen' || action === 'forceClosed' || action === 'auto') {
          s.mode = action;
          audit(db, actor, 'control', 'حالت ثبت‌نام: ' + action, now);
          return { ok: true };
        }
        if (action === 'reopen') {
          if (count(db, 'confirmed') >= s.capacity) return err('FULL', 'همه‌ی صندلی‌ها پر است. ابتدا ظرفیت را بیشتر کنید یا یک ثبت‌نام را لغو کنید.');
          db.lockedFullAt = null;
          audit(db, actor, 'control', 'بازگشایی ظرفیت آزادشده', now);
          return { ok: true };
        }
        return err('INVALID', 'عملیات نامعتبر است.');
      }

      function setWhitelist(db, actor, text, now) {
        var seen = {}, ids = [];
        String(text || '').split(/[\s,;،؛\n\r]+/).forEach(function (tok) {
          var id = JR.normStudentId(tok);
          if (id && !seen[id]) { seen[id] = 1; ids.push(id); }
        });
        if (ids.length > 5000) return err('INVALID', 'حداکثر ۵۰۰۰ شماره دانشجویی.');
        db.whitelist = ids;
        audit(db, actor, 'whitelist', ids.length + ' شماره', now);
        return { ok: true, count: ids.length };
      }

      /* هزینه‌ها و چک‌لیست */
      function expenseAction(db, actor, action, p, now) {
        p = p || {};
        if (action === 'add' || action === 'update') {
          var title = str(p.title, 100), amt = intOrNull(p.amountToman, 0, 1e10);
          if (!title) return err('INVALID', 'عنوان هزینه را بنویسید.');
          if (amt === undefined || amt === null) return err('INVALID', 'مبلغ هزینه نامعتبر است.');
          if (action === 'add') {
            var ex = { id: uid(), title: title, amountToman: amt, note: str(p.note, 200), createdAt: now };
            db.expenses.push(ex);
            audit(db, actor, 'expense', 'افزودن: ' + title, now);
            return { ok: true, expense: ex };
          }
          var found = db.expenses.filter(function (x) { return x.id === p.id; })[0];
          if (!found) return err('NOT_FOUND', 'هزینه پیدا نشد.');
          found.title = title; found.amountToman = amt; found.note = str(p.note, 200);
          audit(db, actor, 'expense', 'ویرایش: ' + title, now);
          return { ok: true, expense: found };
        }
        if (action === 'delete') {
          var i = db.expenses.findIndex(function (x) { return x.id === p.id; });
          if (i < 0) return err('NOT_FOUND', 'هزینه پیدا نشد.');
          var gone = db.expenses.splice(i, 1)[0];
          audit(db, actor, 'expense', 'حذف: ' + gone.title, now);
          return { ok: true };
        }
        return err('INVALID', 'عملیات نامعتبر است.');
      }

      function taskAction(db, actor, action, p, now) {
        p = p || {};
        if (action === 'add') {
          var title = str(p.title, 140);
          if (!title) return err('INVALID', 'عنوان کار را بنویسید.');
          var t = { id: uid(), title: title, done: false, createdAt: now };
          db.tasks.push(t);
          return { ok: true, task: t };
        }
        var task = db.tasks.filter(function (x) { return x.id === p.id; })[0];
        if (!task) return err('NOT_FOUND', 'کار پیدا نشد.');
        if (action === 'toggle') { task.done = !task.done; task.doneAt = task.done ? now : null; return { ok: true, task: task }; }
        if (action === 'delete') { db.tasks.splice(db.tasks.indexOf(task), 1); return { ok: true }; }
        return err('INVALID', 'عملیات نامعتبر است.');
      }

      /** پاک‌سازی داده‌های آزمایشی: ثبت‌نام‌ها و قفل ظرفیت را صفر می‌کند. */
      function resetRegistrations(db, actor, now) {
        var n = db.registrations.length;
        db.registrations = []; db.seq = 0; db.lockedFullAt = null;
        audit(db, actor, 'reset', n + ' ثبت‌نام پاک شد', now);
        return { ok: true, removed: n };
      }

      /* ───────────── آمار ───────────── */
      function tally(list, key) {
        var o = {};
        list.forEach(function (r) { o[r[key]] = (o[r[key]] || 0) + 1; });
        return Object.keys(o).map(function (k) { return { label: k, n: o[k] }; }).sort(function (a, b) { return b.n - a.n; });
      }

      function adminStats(db, now) {
        var regs = db.registrations, s = db.settings;
        var confirmed = regs.filter(function (r) { return r.status === 'confirmed'; });
        var waitlist = regs.filter(function (r) { return r.status === 'waitlist'; });
        var cancelled = regs.filter(function (r) { return r.status === 'cancelled'; });
        var paid = confirmed.filter(function (r) { return r.payment === 'paid'; });
        var checked = confirmed.filter(function (r) { return r.checkedIn; });
        var received = paid.reduce(function (a, r) { return a + (r.paidAmount || 0); }, 0);
        var expensesTotal = db.expenses.reduce(function (a, x) { return a + x.amountToman; }, 0);
        var times = confirmed.map(function (r) { return r.createdAt; }).sort(function (a, b) { return a - b; });
        var ph = phase(db, now);
        return {
          now: now, phase: ph.name, closedReason: ph.reason || null,
          capacity: s.capacity, confirmed: confirmed.length, waitlist: waitlist.length, cancelled: cancelled.length,
          paid: paid.length, unpaid: confirmed.length - paid.length, checkedIn: checked.length,
          remaining: Math.max(0, s.capacity - confirmed.length),
          lockedFullAt: db.lockedFullAt, openAtMs: s.openAtMs,
          byDegree: tally(confirmed, 'degree'), byMajor: tally(confirmed, 'major'),
          timeline: times,
          finance: {
            priceToman: s.priceToman,
            expected: (s.priceToman || 0) * confirmed.length,
            received: received,
            outstanding: Math.max(0, (s.priceToman || 0) * confirmed.length - received),
            expensesTotal: expensesTotal,
            balance: received - expensesTotal,
            perHead: confirmed.length ? Math.round(expensesTotal / confirmed.length) : 0
          },
          tasks: { done: db.tasks.filter(function (t) { return t.done; }).length, total: db.tasks.length }
        };
      }

      /* ───────────── خروجی CSV ───────────── */
      function csvCell(v, asText) {
        var t = v == null ? '' : String(v);
        if (/^[=+\-@\t\r]/.test(t) && !asText) t = "'" + t;
        t = t.replace(/"/g, '""');
        if (asText) return '="' + t + '"';           // اکسل صفر ابتدای کد ملی و موبایل را حفظ کند
        return /[",\n\r]/.test(t) ? '"' + t + '"' : t;
      }
      var STATUS_FA = { confirmed: 'قطعی', waitlist: 'لیست انتظار', cancelled: 'لغو شده' };
      var PAY_FA = { paid: 'پرداخت شد', unpaid: 'پرداخت نشده', refunded: 'بازگشت وجه' };

      function exportCsv(db, kind) {
        var rows = db.registrations.slice().sort(function (a, b) { return a.seq - b.seq; });
        var head, map;
        if (kind === 'security') { // لیست برای حراست شرکت
          rows = rows.filter(function (r) { return r.status === 'confirmed'; });
          head = ['ردیف', 'نام', 'نام خانوادگی', 'کد ملی', 'شماره دانشجویی'];
          map = function (r, i) { return [i + 1, r.firstName, r.lastName, [r.nationalId, 1], [r.studentId, 1]]; };
        } else if (kind === 'phones') {
          rows = rows.filter(function (r) { return r.status === 'confirmed'; });
          head = ['نام', 'نام خانوادگی', 'موبایل'];
          map = function (r) { return [r.firstName, r.lastName, [r.phone, 1]]; };
        } else {
          head = ['شماره ثبت‌نام', 'کد پیگیری', 'وضعیت', 'نام', 'نام خانوادگی', 'شماره دانشجویی', 'کد ملی', 'موبایل', 'مقطع', 'گرایش',
            'پرداخت', 'مبلغ پرداختی (تومان)', 'شماره پیگیری پرداخت', 'حضور', 'زمان ثبت‌نام', 'یادداشت'];
          map = function (r) {
            return [r.seq, [r.code, 1], STATUS_FA[r.status] || r.status, r.firstName, r.lastName, [r.studentId, 1], [r.nationalId, 1], [r.phone, 1],
              r.degree, r.major, PAY_FA[r.payment] || '', r.paidAmount || '', r.payRef || '',
              r.checkedIn ? 'حاضر' : '', JR.fmtShort(r.createdAt) + ' ' + JR.fmtTime(r.createdAt, true), r.note || ''];
          };
        }
        var lines = [head.map(function (h) { return csvCell(h); }).join(',')];
        rows.forEach(function (r, i) {
          lines.push(map(r, i).map(function (c) { return Array.isArray(c) ? csvCell(JR.faToEn(c[0]), true) : csvCell(typeof c === 'number' ? c : c); }).join(','));
        });
        return '﻿' + lines.join('\r\n') + '\r\n';
      }

      return {
        uid: uid, newDb: newDb, migrate: migrate, defaultSettings: defaultSettings, audit: audit,
        phase: phase, publicStatus: publicStatus, count: count,
        register: register, lookup: lookup, selfView: selfView, paymentInfo: paymentInfo,
        regAction: regAction, addManual: addManual, applySettings: applySettings, control: control,
        setWhitelist: setWhitelist, expenseAction: expenseAction, taskAction: taskAction, resetRegistrations: resetRegistrations,
        adminStats: adminStats, exportCsv: exportCsv, STATUS_FA: STATUS_FA, PAY_FA: PAY_FA, byId: byId
      };
    });

  }).call(__root);
  return __root.JREngine;
})();

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
var JR_REG_COLS_ = ['seq', 'code', 'status', 'firstName', 'lastName', 'studentId', 'nationalId', 'phone', 'degree', 'major', 'payment', 'paidAmount', 'payRef', 'checkedIn', 'note', 'createdAtFa', 'createdAt', 'id', 'extra'];
var JR_REG_HEAD_ = ['ردیف', 'کد پیگیری', 'وضعیت', 'نام', 'نام خانوادگی', 'شماره دانشجویی', 'کد ملی', 'موبایل', 'مقطع', 'گرایش', 'پرداخت', 'مبلغ پرداختی', 'شماره پیگیری پرداخت', 'حضور', 'یادداشت', 'زمان ثبت‌نام', 'زمان (میلی‌ثانیه)', 'شناسه', 'اطلاعات فنی'];
var JR_REG_NUM_ = { seq: 1, paidAmount: 1, createdAt: 1 };
var JR_REG_MAIN_ = { seq: 1, code: 1, status: 1, firstName: 1, lastName: 1, studentId: 1, nationalId: 1, phone: 1, degree: 1, major: 1, payment: 1, paidAmount: 1, payRef: 1, checkedIn: 1, note: 1, createdAt: 1, id: 1 };
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
  return [r.seq, String(r.code), JR_STATUS_FA_[r.status] || r.status, r.firstName, r.lastName, String(r.studentId), String(r.nationalId), String(r.phone), r.degree, r.major,
    JR_PAY_FA_[r.payment] || r.payment, r.paidAmount == null ? '' : r.paidAmount, r.payRef || '', r.checkedIn ? 'حاضر' : '', r.note || '',
    JR.fmtShort(r.createdAt) + ' ' + JR.fmtTime(r.createdAt, true), r.createdAt, r.id, JSON.stringify(extra)];
}
function jrReverse(map) { var o = {}; Object.keys(map).forEach(function (k) { o[map[k]] = k; }); return o; }
function jrRowToReg(v, rowNo) {
  var statusRev = jrReverse(JR_STATUS_FA_), payRev = jrReverse(JR_PAY_FA_), extra = {};
  try { extra = JSON.parse(String(v[18] || '{}')); } catch (e) { extra = {}; }
  var r = {
    id: String(v[17]), seq: Number(v[0]), code: String(v[1]), status: statusRev[v[2]] || String(v[2]),
    firstName: String(v[3]), lastName: String(v[4]), studentId: String(v[5]), nationalId: String(v[6]), phone: String(v[7]), degree: String(v[8]), major: String(v[9]),
    payment: payRev[v[10]] || String(v[10]), paidAmount: v[11] === '' || v[11] == null ? null : Number(v[11]), payRef: String(v[12] || ''),
    checkedIn: v[13] === 'حاضر', note: String(v[14] || ''), createdAt: Number(v[16])
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
function jrNoNid(r) { return r && typeof r === 'object' ? Object.assign({}, r, { nationalId: '' }) : r; }
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
    if (!isAdmin) { regs = regs.map(function (r) { return Object.assign({}, r, { nationalId: '' }); }); stats.finance = null; }
    var wlSh = jrSheet('wl'), wlCount = Math.max(0, wlSh.getLastRow() - 1);
    return jrOk({ now: now, user: jrUserPublic(user), settings: db.settings, stats: stats, registrations: regs, whitelistCount: wlCount,
      expenses: isAdmin ? db.expenses : [], tasks: db.tasks, users: isAdmin ? db.users.map(jrUserPublic) : [], publicPhase: JREngine.phase(db, now) });
  }
  if (a === 'audit' && method === 'GET') {
    if (!isAdmin) return jrFail(403, 'FORBIDDEN', 'دسترسی ندارید.');
    var sh = jrSheet('audit'), last = sh.getLastRow(), rows = last < 2 ? [] : sh.getRange(Math.max(2, last - 399), 1, last - Math.max(2, last - 399) + 1, 5).getValues();
    return jrOk({ audit: rows.map(function (r) { return { t: Number(r[0]), by: String(r[2]), act: String(r[3]), detail: String(r[4]) }; }).reverse() });
  }

  if ((m = a.match(/^reg\/([a-f0-9]{16})$/)) && method === 'POST') {
    if (!isAdmin && !JR_STAFF_ACTIONS_[body.action]) return jrFail(403, 'FORBIDDEN', 'این عملیات فقط برای مدیر است.');
    return jrMutate({ settings: 1, regs: 1 }, function (db, t) {
      var r = JREngine.regAction(db, user.username, m[1], body.action, body, t);
      if (!r.ok) return jrFail(jrEngineStatus(r), r.code, r.message, { errors: r.errors });
      if (!isAdmin) {                                    // همکار ستاد کد ملی را در هیچ پاسخی نمی‌بیند
        r = Object.assign({}, r, { registration: jrNoNid(r.registration), promoted: jrNoNid(r.promoted) });
      }
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
    return jrMutate({ settings: 1, regs: 1 }, function (db, t) { return jrOk(JREngine.resetRegistrations(db, user.username, t)); });
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

/* ───────────── مسیریابی ───────────── */
function jrRoute(req) {
  try {
    var p = String(req.p || ''), method = String(req.m || 'GET').toUpperCase();
    if (p === 'status') return jrStatusBody(jrGetSnap(), Date.now());
    if (p === 'ping') return jrOk({ t: Date.now() });
    if (p === 'register' && method === 'POST') return jrRegister(req.b);
    if (p === 'lookup' && method === 'POST') return jrLookup(req.b);
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
  var req;
  try {
    var txt = e && e.postData ? String(e.postData.contents || '') : '';
    if (txt.length > 400000) return jrOut(jrFail(413, 'TOO_LARGE', 'درخواست بزرگ است.'));
    req = JSON.parse(txt);
  } catch (err) { return jrOut(jrFail(400, 'BAD_REQUEST', 'درخواست نامعتبر.')); }
  return jrOut(jrRoute(req || {}));
}

/* ───────────── راه‌اندازی (از داخل ویرایشگر اجرا شود) ───────────── */
function jrEnsureSheet(key, head) {
  var ss = jrSs(), name = JR_SHEETS_[key], sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  jrSheets_[key] = sh;
  var f = jrFmts(key), c;
  for (c = 1; c <= f.length; c++) sh.getRange(2, c, Math.max(sh.getMaxRows() - 1, 1), 1).setNumberFormat(f[c - 1]);   // قالب ستون‌ها (ردیف‌های داده)
  if (sh.getLastRow() < 1) { sh.getRange(1, 1, 1, head.length).setNumberFormat('@'); sh.getRange(1, 1, 1, head.length).setValues([head]); }
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
  var msg = 'اتصال سالم است. ظرفیت ' + db.settings.capacity + '، ثبت‌نام قطعی ' + JREngine.count(db, 'confirmed') + '، کاربران ' + db.users.length + '، وضعیت: ' + st.phase;
  console.log(msg); Logger.log(msg);
  return msg;
}
