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
