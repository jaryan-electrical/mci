/* پنل برگزارکنندگان — بخش اول: داشبورد، شرکت‌کنندگان، حضور و غیاب، لیست انتظار */
(function () {
  'use strict';
  var P = window.P, JR = window.JR, h = P.el, V = P.views;

  function regs() { return P.D.registrations; }
  function byId(id) { return regs().filter(function (r) { return r.id === id; })[0]; }
  function fullName(r) { return r.firstName + ' ' + r.lastName; }
  function confirmed() { return regs().filter(function (r) { return r.status === 'confirmed'; }); }

  /* ═════════ کشوی جزئیات یک ثبت‌نام ═════════ */
  P.openReg = function (id) {
    var d = P.drawer(fullName(byId(id)));
    P.drawerId = id;
    d.onClose = null;
    function render() {
      var r = byId(id);
      if (!r) { d.close(); return; }
      d.setTitle(fullName(r));
      var b = P.clear(d.body), st = P.D.settings, admin = P.isAdmin();
      function after(res, msg) { if (res.ok) return P.refresh().then(render); }

      b.appendChild(h('div', { class: 'row' }, [P.statusBadge(r), r.status === 'confirmed' ? P.payBadge(r) : null, r.checkedIn ? h('span', { class: 'bd bd--ok', text: 'حاضر' }) : null]));

      var kv = h('dl', { class: 'kv card' }, [
        h('dt', { text: 'شماره ثبت‌نام' }), h('dd', { text: P.fa(r.seq) }),
        h('dt', { text: 'کد پیگیری' }), h('dd', { text: P.fa(r.code) }),
        h('dt', { text: 'زمان ثبت‌نام' }), h('dd', { text: P.d(r.createdAt, { time: true, seconds: true }) }),
        h('dt', { text: 'روش ثبت' }), h('dd', { text: r.source === 'admin' ? 'افزودن دستی توسط ستاد' : 'ثبت‌نام آنلاین' }),
        r.status === 'cancelled' ? h('dt', { text: 'علت لغو' }) : null, r.status === 'cancelled' ? h('dd', { text: r.cancelReason || '—' }) : null
      ]);
      b.appendChild(kv);

      /* تماس سریع */
      b.appendChild(h('div', { class: 'row' }, [
        h('a', { class: 'b b--sm', href: 'tel:' + r.phone }, [P.ico('phone'), P.fa(r.phone)]),
        h('button', { class: 'b b--sm', type: 'button', onclick: function () { P.copy(r.phone, 'شماره کپی شد'); } }, [P.ico('copy'), 'کپی شماره'])
      ]));

      /* پرداخت */
      if (r.status === 'confirmed') {
        var amount = h('input', { class: 'in', dir: 'ltr', inputmode: 'numeric', value: r.paidAmount != null ? String(r.paidAmount) : (st.priceToman != null ? String(st.priceToman) : ''), 'aria-label': 'مبلغ پرداختی' });
        var ref = h('input', { class: 'in', value: r.payRef || '', placeholder: 'مثلاً ۴ رقم آخر کارت یا شماره پیگیری', 'aria-label': 'شماره پیگیری پرداخت' });
        function setPay(v) {
          P.act(P.api('POST', '/api/admin/reg/' + r.id, { action: 'setPayment', payment: v, amount: JR.faToEn(amount.value), ref: ref.value }), 'وضعیت پرداخت ثبت شد').then(after);
        }
        b.appendChild(h('section', { class: 'card stack' }, [
          h('div', { class: 'card__t', text: 'پرداخت' }),
          (r.receipts || []).length ? h('div', { class: 'row' }, [h('span', { class: 'bd bd--info', text: P.fa(r.receipts.length) + ' رسید ارسال شده' }), h('button', { class: 'b b--sm b--primary', type: 'button', onclick: function () { P.viewReceipts(r, function () { P.refresh().then(render); }); } }, 'مشاهده رسید')]) : null,
          h('div', { class: 'form-grid' }, [
            h('div', { class: 'fld' }, [h('label', { text: 'مبلغ پرداختی (تومان)' }), amount]),
            h('div', { class: 'fld' }, [h('label', { text: 'شماره پیگیری' }), ref])
          ]),
          h('div', { class: 'row' }, [
            h('button', { class: 'b b--ok', type: 'button', onclick: function () { setPay('paid'); } }, [P.ico('check'), 'پرداخت شد']),
            h('button', { class: 'b', type: 'button', onclick: function () { setPay('unpaid'); } }, 'پرداخت نشده'),
            admin ? h('button', { class: 'b', type: 'button', onclick: function () { setPay('refunded'); } }, 'بازگشت وجه') : null
          ])
        ]));
        b.appendChild(h('button', { class: 'b ' + (r.checkedIn ? '' : 'b--primary') + ' b--block', type: 'button', onclick: function () {
          P.act(P.api('POST', '/api/admin/reg/' + r.id, { action: 'checkIn', value: !r.checkedIn }), r.checkedIn ? 'حضور لغو شد' : 'حضور ثبت شد').then(after);
        } }, [P.ico('check'), r.checkedIn ? 'لغو ثبت حضور' : 'ثبت حضور در اردو']));
      }

      /* ویرایش اطلاعات (مدیر) */
      if (admin) {
        var fields = {}, errs = {};
        function fld(key, label, opts) {
          opts = opts || {};
          var optList = opts.options && r[key] && opts.options.indexOf(r[key]) < 0 ? opts.options : (opts.options && !r[key] ? [''].concat(opts.options) : opts.options);
          var inp = opts.options ? h('select', {}, optList.map(function (o) { return h('option', { value: o, text: o || 'انتخاب کنید' }); })) : h('input', { value: r[key], dir: opts.ltr ? 'ltr' : null, inputmode: opts.ltr ? 'numeric' : null });
          if (opts.options) inp.value = r[key];
          fields[key] = inp; errs[key] = h('p', { class: 'err' });
          return h('div', { class: 'fld' }, [h('label', { text: label }), inp, errs[key]]);
        }
        var form = h('section', { class: 'card stack' }, [
          h('div', { class: 'card__t', text: 'ویرایش اطلاعات' }),
          h('div', { class: 'form-grid' }, [
            fld('firstName', 'نام'), fld('lastName', 'نام خانوادگی'), fld('studentId', 'شماره دانشجویی', { ltr: true }),
            fld('nationalId', 'کد ملی', { ltr: true }), fld('phone', 'موبایل', { ltr: true }),
            fld('degree', 'مقطع', { options: st.degrees }), fld('entryYear', 'سال ورود', { options: st.entryYears }), fld('gender', 'جنسیت', { options: JR.GENDERS })
          ]),
          h('div', { class: 'row' }, [h('button', { class: 'b b--primary', type: 'button', onclick: function () {
            var f = {}; Object.keys(fields).forEach(function (k) { f[k] = fields[k].value; });
            Object.keys(errs).forEach(function (k) { errs[k].textContent = ''; });
            P.api('POST', '/api/admin/reg/' + r.id, { action: 'update', fields: f }).then(function (res) {
              if (res.ok) { P.toast('اطلاعات ذخیره شد', 'ok'); P.refresh().then(render); return; }
              var e = res.json.errors || {};
              Object.keys(e).forEach(function (k) { if (errs[k]) errs[k].textContent = e[k]; });
              P.toast(res.json.message || 'ذخیره نشد.', 'err');
            });
          } }, 'ذخیره‌ی اطلاعات')])
        ]);
        b.appendChild(form);
      } else {
        b.appendChild(h('dl', { class: 'kv card' }, [
          h('dt', { text: 'شماره دانشجویی' }), h('dd', { text: P.fa(r.studentId) }),
          h('dt', { text: 'مقطع و ورودی' }), h('dd', { text: [r.degree, r.entryYear, r.gender].filter(Boolean).join(' — ') })
        ]));
      }

      /* یادداشت */
      var note = h('textarea', { 'aria-label': 'یادداشت', maxlength: '500', text: r.note || '' }); note.value = r.note || '';
      b.appendChild(h('section', { class: 'card stack' }, [
        h('div', { class: 'card__t', text: 'یادداشت ستاد' }),
        h('div', { class: 'fld' }, [note]),
        h('div', { class: 'row' }, [h('button', { class: 'b', type: 'button', onclick: function () { P.act(P.api('POST', '/api/admin/reg/' + r.id, { action: 'note', note: note.value }), 'یادداشت ذخیره شد').then(after); } }, 'ذخیره‌ی یادداشت')])
      ]));

      /* وضعیت‌ها */
      if (admin) {
        var acts = [];
        if (r.status === 'waitlist') acts.push(h('button', { class: 'b b--primary', type: 'button', onclick: function () { promote(r).then(function (ok) { if (ok) P.refresh().then(render); }); } }, 'ارتقا به ثبت‌نام قطعی'));
        if (r.status !== 'cancelled') acts.push(h('button', { class: 'b b--danger', type: 'button', onclick: function () { cancelReg(r).then(function (ok) { if (ok) P.refresh().then(render); }); } }, 'لغو ثبت‌نام'));
        else acts.push(h('button', { class: 'b', type: 'button', onclick: function () { P.act(P.api('POST', '/api/admin/reg/' + r.id, { action: 'restore' }), 'ثبت‌نام بازگردانده شد').then(after); } }, 'بازگرداندن ثبت‌نام'));
        b.appendChild(h('div', { class: 'row' }, acts));
      }
    }
    P.drawerRender = render;
    render();
  };

  function cancelReg(r) {
    return P.confirm({ title: 'لغو ثبت‌نام ' + fullName(r), body: r.status === 'confirmed' ? 'صندلی این فرد آزاد می‌شود' + (P.D.settings.waitlistEnabled && P.D.settings.autoPromote ? ' و نفر اول لیست انتظار جایگزین می‌شود.' : '؛ ثبت‌نام عمومی خودکار باز نمی‌شود، مگر خودتان آن را باز کنید.') : 'این فرد از لیست انتظار خارج می‌شود.', ok: 'لغو ثبت‌نام', danger: true, input: { label: 'علت لغو (اختیاری)', placeholder: 'مثلاً دانشجوی دانشکده برق نیست' } })
      .then(function (v) {
        if (v == null) return false;
        return P.act(P.api('POST', '/api/admin/reg/' + r.id, { action: 'cancel', reason: v === true ? '' : v }), 'ثبت‌نام لغو شد').then(function (res) {
          if (res.ok && res.json.promoted) P.toast(fullName(res.json.promoted) + ' از لیست انتظار قطعی شد', 'ok');
          return res.ok;
        });
      });
  }
  function promote(r) {
    var full = P.D.stats.confirmed >= P.D.settings.capacity;
    var go = full ? P.confirm({ title: 'ارتقا با عبور از ظرفیت', body: 'ظرفیت پر است. با ارتقای ' + fullName(r) + ' تعداد قطعی‌ها از ظرفیت بیشتر می‌شود. ادامه می‌دهید؟', ok: 'ارتقا بده' }) : Promise.resolve(true);
    return go.then(function (v) {
      if (!v) return false;
      return P.act(P.api('POST', '/api/admin/reg/' + r.id, { action: 'promote', force: full }), 'ارتقا یافت').then(function (res) { return res.ok; });
    });
  }
  P.cancelReg = cancelReg; P.promoteReg = promote;

  /* ═════════ افزودن دستی ═════════ */
  P.addManual = function () {
    var st = P.D.settings, f = {}, er = h('p', { class: 'err' });
    function fld(key, label, o) {
      o = o || {};
      var i = o.options ? h('select', {}, o.options.map(function (x) { return h('option', { value: x, text: x }); })) : h('input', { dir: o.ltr ? 'ltr' : null, inputmode: o.ltr ? 'numeric' : null });
      f[key] = i; return h('div', { class: 'fld' }, [h('label', { text: label }), i]);
    }
    var statusSel = h('select', {}, [h('option', { value: 'confirmed', text: 'ثبت‌نام قطعی' }), h('option', { value: 'waitlist', text: 'لیست انتظار' })]);
    var paid = h('input', { type: 'checkbox' });
    var m = P.modal('افزودن ثبت‌نام دستی', [
      h('p', { text: 'قوانین زمان، ظرفیت و فهرست دانشجویان برای افزودن دستی اعمال نمی‌شود.' }),
      h('div', { class: 'form-grid' }, [
        fld('firstName', 'نام'), fld('lastName', 'نام خانوادگی'), fld('studentId', 'شماره دانشجویی', { ltr: true }), fld('nationalId', 'کد ملی', { ltr: true }),
        fld('phone', 'موبایل', { ltr: true }), fld('degree', 'مقطع', { options: st.degrees }), fld('entryYear', 'سال ورود', { options: st.entryYears }), fld('gender', 'جنسیت', { options: JR.GENDERS }),
        h('div', { class: 'fld' }, [h('label', { text: 'وضعیت' }), statusSel])
      ]),
      h('label', { class: 'chk mt' }, [paid, h('span', { text: 'مبلغ را پرداخت کرده است' })]),
      er,
      h('div', { class: 'row row--end mt' }, [
        h('button', { class: 'b', type: 'button', text: 'انصراف', onclick: function () { m.close(); } }),
        h('button', { class: 'b b--primary', type: 'button', text: 'افزودن', onclick: function () {
          var body = { status: statusSel.value, paid: paid.checked };
          Object.keys(f).forEach(function (k) { body[k] = f[k].value; });
          P.api('POST', '/api/admin/reg', body).then(function (res) {
            if (res.ok) { m.close(); P.toast('ثبت‌نام اضافه شد', 'ok'); P.refresh(); return; }
            var e = res.json.errors; er.textContent = (e ? Object.keys(e).map(function (k) { return e[k]; }).join(' ') : '') || res.json.message || 'انجام نشد.';
          });
        } })
      ])
    ]);
  };

  /* ═════════ داشبورد ═════════ */
  V.dashboard = {
    title: 'داشبورد', icon: 'dash', roles: ['admin', 'staff'],
    mount: function (root) {
      P.clear(root);
      var D = P.D, S = D.stats, st = D.settings, ph = S.phase, admin = P.isAdmin();
      var NAMES = { before: 'قبل از شروع ثبت‌نام', open: 'ثبت‌نام باز است', full: 'ظرفیت تکمیل شد', closed: 'ثبت‌نام بسته است' };

      var alerts = [];
      if (Math.abs(P.clock.skew) > 3000) alerts.push(h('div', { class: 'alert' }, [h('span', { class: 'sp', text: 'ساعت دستگاه شما حدود ' + P.fa(Math.round(Math.abs(P.clock.skew) / 1000)) + ' ثانیه با ساعت سرور فرق دارد. مبنای ثبت‌نام ساعت سرور است؛ زمان‌ها را با «ساعت سرور» بالای صفحه تطبیق دهید.' })]));
      if (admin && st.openAtMs == null && st.mode === 'auto') alerts.push(h('div', { class: 'alert' }, [h('span', { class: 'sp', text: 'زمان شروع ثبت‌نام هنوز تنظیم نشده است؛ تا آن موقع ثبت‌نام باز نمی‌شود.' }), h('button', { class: 'b b--sm b--amber', type: 'button', text: 'تنظیم زمان شروع', onclick: function () { P.go('settings'); } })]));
      if (S.lockedFullAt && S.remaining > 0 && ph === 'full') alerts.push(h('div', { class: 'alert' }, [h('span', { class: 'sp', text: P.fa(S.remaining) + ' صندلی آزاد شده، اما ثبت‌نام عمومی هنوز بسته است.' }), admin ? h('button', { class: 'b b--sm b--amber', type: 'button', text: 'بازگشایی ظرفیت', onclick: function () { P.act(P.api('POST', '/api/admin/control', { action: 'reopen' }), 'ثبت‌نام برای صندلی‌های آزاد باز شد').then(P.refresh); } }) : null]));
      if (S.receiptsPending) alerts.push(h('div', { class: 'alert' }, [h('span', { class: 'sp', text: P.fa(S.receiptsPending) + ' رسید واریز منتظر بررسی شماست.' }), h('button', { class: 'b b--sm b--amber', type: 'button', text: 'بررسی رسیدها', onclick: function () { P.go('people', { status: 'confirmed', pay: 'unpaid' }); } })]));
      alerts.forEach(function (a) { root.appendChild(a); a.style.marginBottom = '14px'; });

      /* نوار وضعیت */
      var sub = [];
      if (ph === 'before') sub.push(st.openAtMs ? 'شروع: ' + P.d(st.openAtMs, { time: true, seconds: true }) : 'زمان شروع تنظیم نشده');
      else if (ph === 'open') sub.push(st.openAtMs && st.mode !== 'forceOpen' ? 'از ' + P.d(st.openAtMs, { time: true }) + ' باز است' : 'باز شده به‌صورت دستی');
      else if (ph === 'full') sub.push(S.lockedFullAt ? 'نفر ' + P.fa(S.capacity) + 'م ساعت ' + P.t(S.lockedFullAt, true) + ' ثبت‌نام کرد' : 'ظرفیت پر است');
      else sub.push(S.closedReason === 'time' ? 'مهلت ثبت‌نام تمام شده' : 'به‌صورت دستی بسته شده');
      var cd = h('span', { class: 'hint', id: 'dashCd' });
      var modeBtns = admin ? h('div', { class: 'seg', role: 'group', 'aria-label': 'حالت ثبت‌نام' }, [['auto', 'خودکار'], ['forceOpen', 'باز کردن اکنون'], ['forceClosed', 'بستن ثبت‌نام']].map(function (m) {
        return h('button', { type: 'button', 'aria-pressed': String(st.mode === m[0]), text: m[1], title: m[0] === 'auto' ? 'طبق زمان‌بندی تنظیم‌شده' : m[0] === 'forceOpen' ? 'بدون توجه به زمان شروع، همین حالا باز می‌شود' : 'همین حالا برای همه بسته می‌شود', onclick: function () {
          if (st.mode === m[0]) return;
          var ask = m[0] === 'auto' ? Promise.resolve(true) : P.confirm({ title: m[1], body: m[0] === 'forceOpen' ? 'ثبت‌نام همین حالا برای همه باز می‌شود (ظرفیت همچنان محدود است).' : 'ثبت‌نام همین حالا برای همه بسته می‌شود.', ok: m[1], danger: m[0] === 'forceClosed' });
          ask.then(function (v) { if (v) P.act(P.api('POST', '/api/admin/control', { action: m[0] }), 'حالت ثبت‌نام تغییر کرد').then(P.refresh); });
        } });
      })) : null;
      var pct = Math.min(100, S.confirmed / S.capacity * 100);
      root.appendChild(h('section', { class: 'card phase phase--' + ph }, [
        h('div', { class: 'phase__head' }, [
          h('span', { class: 'phase__name' }, [h('span', { class: 'dot' + (ph === 'open' ? ' pulse' : '') }), NAMES[ph]]),
          h('span', { class: 'sp' }), modeBtns
        ]),
        h('div', { class: 'row' }, [h('b', { style: 'font-size:1.5rem', text: P.fa(S.confirmed) + ' از ' + P.fa(S.capacity) }), h('span', { class: 'hint', text: sub.join(' · ') }), cd]),
        h('div', { class: 'bar', role: 'img', 'aria-label': 'ظرفیت پرشده' }, [h('i', { class: 's2', style: 'width:' + pct + '%' })])
      ]));

      /* کاشی‌ها */
      var fin = S.finance;
      var tiles = [
        tile('ثبت‌نام قطعی', P.fa(S.confirmed), '/ ' + P.fa(S.capacity), P.fa(S.remaining) + ' جای خالی', function () { P.go('people', { status: 'confirmed' }); }),
        tile('لیست انتظار', P.fa(S.waitlist), '', st.waitlistEnabled ? 'لیست انتظار فعال است' : 'لیست انتظار غیرفعال است', function () { P.go('waitlist'); }),
        tile('پرداخت‌شده', P.fa(S.paid), 'از ' + P.fa(S.confirmed), admin && st.priceToman ? 'مانده: ' + P.toman(fin.outstanding) : P.fa(S.unpaid) + ' نفر مانده', function () { P.go('people', { status: 'confirmed', pay: 'unpaid' }); }),
        tile('حاضر در اردو', P.fa(S.checkedIn), 'از ' + P.fa(S.confirmed), 'برای ثبت حضور به «حضور و غیاب» بروید', function () { P.go('checkin'); })
      ];
      root.appendChild(h('div', { class: 'grid grid--tiles mt' }, tiles));

      /* نمودارها */
      var times = S.timeline;
      var chartCard = h('section', { class: 'card' }, [
        h('div', { class: 'card__t' }, [h('span', { text: 'روند تکمیل ظرفیت' }), h('span', { class: 'sp' }), times.length > 1 ? h('span', { class: 'card__sub', text: 'بازه: ' + P.fmtSpan(times[times.length - 1] - times[0]) }) : null]),
        P.fillChart(times, S.capacity, st.openAtMs)
      ]);
      var brk = h('section', { class: 'card stack' }, [
        h('div', { class: 'card__t', text: 'شرکت‌کنندگان بر اساس سال ورود' }), P.hbars(S.byEntryYear, S.confirmed),
        h('div', { class: 'card__t', style: 'margin-top:6px', text: 'بر اساس جنسیت' }), P.hbars(S.byGender, S.confirmed),
        h('div', { class: 'card__t', style: 'margin-top:6px', text: 'بر اساس مقطع' }), P.hbars(S.byDegree, S.confirmed)
      ]);
      root.appendChild(h('div', { class: 'grid grid--2 mt' }, [chartCard, brk]));

      /* پرداخت و آخرین‌ها */
      var recent = confirmed().slice().sort(function (a, b) { return b.seq - a.seq; }).slice(0, 8);
      var pay = h('section', { class: 'card stack' }, [
        h('div', { class: 'card__t', text: 'وضعیت پرداخت' }),
        S.confirmed ? P.splitBar(S.paid, S.unpaid, 'پرداخت شده', 'پرداخت نشده') : h('div', { class: 'empty', text: 'هنوز شرکت‌کننده‌ی قطعی نداریم.' }),
        S.unpaid ? h('div', { class: 'row' }, [h('button', { class: 'b b--sm', type: 'button', text: 'دیدن پرداخت‌نشده‌ها', onclick: function () { P.go('people', { status: 'confirmed', pay: 'unpaid' }); } })]) : null
      ]);
      var rec = h('section', { class: 'card' }, [
        h('div', { class: 'card__t', text: 'آخرین ثبت‌نام‌ها' }),
        recent.length ? h('div', { class: 'list' }, recent.map(function (r) {
          return h('button', { class: 'list__i', type: 'button', style: 'background:none;border:0;border-bottom:1px solid var(--line);text-align:start;width:100%;cursor:pointer;font:inherit;color:inherit', onclick: function () { P.openReg(r.id); } }, [
            h('span', { class: 't', text: P.t(r.createdAt, true) }), h('span', { class: 'n', text: fullName(r) }), h('span', { class: 's sp', text: r.entryYear || '' }), h('span', { class: 's', text: P.fa(r.seq) + '#' })
          ]);
        })) : h('div', { class: 'empty', text: 'هنوز ثبت‌نامی انجام نشده است.' })
      ]);
      root.appendChild(h('div', { class: 'grid grid--2 mt' }, [pay, rec]));

      /* آمادگی برای انتشار (مدیر) */
      if (admin) {
        var checks = [
          [st.openAtMs != null, 'زمان شروع ثبت‌نام تنظیم شده'],
          [st.priceToman != null, 'هزینه‌ی اردو تعیین شده'],
          [!st.priceToman || !!st.payment.cardNumber, 'شماره کارت برای پرداخت وارد شده'],
          [!!(st.meeting.time || st.meeting.place), 'ساعت یا محل حرکت اعلام شده'],
          [!st.whitelistEnabled || D.whitelistCount > 0, 'فهرست دانشجویان دانشکده بارگذاری شده (اگر فعال است)'],
          [ph !== 'before' || regs().length === 0, 'ثبت‌نام‌های آزمایشی پاک شده (قبل از شروع)']
        ];
        var bad = checks.filter(function (c) { return !c[0]; }).length;
        root.appendChild(h('section', { class: 'card mt' }, [
          h('div', { class: 'card__t' }, [h('span', { text: 'آماده‌ی انتشار؟' }), h('span', { class: 'sp' }), h('span', { class: 'bd bd--' + (bad ? 'warn' : 'ok'), text: bad ? P.fa(bad) + ' مورد مانده' : 'همه چیز آماده است' })]),
          h('div', { class: 'list' }, checks.map(function (c) {
            return h('div', { class: 'list__i' }, [h('span', { class: 'bd bd--' + (c[0] ? 'ok' : 'warn'), text: c[0] ? '✓' : '!' }), h('span', { class: 'n', style: 'font-weight:500', text: c[1] })]);
          })),
          bad ? h('div', { class: 'row mt' }, [h('button', { class: 'b b--sm b--primary', type: 'button', text: 'رفتن به تنظیمات', onclick: function () { P.go('settings'); } })]) : null
        ]));
      }
      V.dashboard.tick();
    },
    tick: function () {
      var c = document.getElementById('dashCd'); if (!c || !P.D) return;
      var st = P.D.settings, S = P.D.stats;
      if (S.phase === 'before' && st.openAtMs) {
        var left = Math.max(0, st.openAtMs - P.now());
        var s = Math.floor(left / 1000), hh = Math.floor(s / 3600), mm = Math.floor(s % 3600 / 60), ss = s % 60;
        c.textContent = '— ' + P.fa(JR.pad2(hh) + ':' + JR.pad2(mm) + ':' + JR.pad2(ss)) + ' مانده';
      } else c.textContent = '';
    }
  };
  function tile(label, value, small, sub, onclick) {
    var t = h('button', { class: 'tile', type: 'button', style: 'text-align:start;cursor:pointer;font:inherit;color:inherit', onclick: onclick }, [
      h('div', { class: 'tile__l', text: label }), h('div', { class: 'tile__v' }, [value, small ? h('small', { text: small }) : null]), h('div', { class: 'tile__s', text: sub })
    ]);
    return t;
  }
  P.fmtSpan = function (ms) { return JR.fmtDuration(ms); };

  /* ═════════ شرکت‌کنندگان ═════════ */
  P.UI.people = { q: '', status: 'confirmed', pay: 'all' };
  function matchQ(r, q) {
    if (!q) return true;
    var s = JR.normText(JR.faToEn(q)).toLowerCase();
    var hay = [fullName(r), r.studentId, r.nationalId, r.phone, r.code, r.entryYear, r.gender].join(' ').toLowerCase();
    return s.split(' ').every(function (tok) { return hay.indexOf(tok) >= 0; });
  }
  V.people = {
    title: 'شرکت‌کنندگان', icon: 'users', roles: ['admin', 'staff'],
    mount: function (root, args) {
      var U = P.UI.people;
      if (args) Object.keys(args).forEach(function (k) { U[k] = args[k]; });
      P.clear(root);
      var q = h('input', { class: 'in', type: 'search', placeholder: 'جستجوی نام، شماره دانشجویی، کد ملی، موبایل یا کد پیگیری', 'aria-label': 'جستجو', value: U.q });
      q.addEventListener('input', function () { U.q = q.value; V.people.update(); });
      var chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'فیلتر وضعیت' });
      var CH = [['confirmed', 'قطعی'], ['waitlist', 'لیست انتظار'], ['cancelled', 'لغوشده'], ['all', 'همه']];
      CH.forEach(function (c) { chips.appendChild(h('button', { type: 'button', 'data-k': c[0], text: c[1], onclick: function () { U.status = c[0]; V.people.update(); } })); });
      var pay = h('select', { class: 'in', style: 'width:auto', 'aria-label': 'فیلتر پرداخت', onchange: function () { U.pay = pay.value; V.people.update(); } }, [['all', 'همه‌ی پرداخت‌ها'], ['unpaid', 'پرداخت‌نشده'], ['paid', 'پرداخت‌شده']].map(function (o) { return h('option', { value: o[0], text: o[1] }); }));
      pay.value = U.pay;
      var tools = h('div', { class: 'tools' }, [
        h('div', { class: 'search' }, [P.ico('search'), q]), pay,
        P.isAdmin() ? h('button', { class: 'b b--primary', type: 'button', onclick: P.addManual }, [P.ico('plus'), 'افزودن دستی']) : null,
        P.isAdmin() ? h('button', { class: 'b', type: 'button', onclick: function () { P.download('/api/admin/export?kind=all', 'registrations.csv'); } }, [P.ico('download'), 'خروجی اکسل']) : null
      ]);
      root.appendChild(tools);
      root.appendChild(h('div', { class: 'tools' }, [chips, h('span', { class: 'sp' }), h('span', { class: 'hint', id: 'pplCount' })]));
      root.appendChild(h('div', { class: 'tbl-wrap', id: 'pplWrap' }));
      V.people.chips = chips; V.people.root = root;
      V.people.update();
    },
    update: function () {
      var U = P.UI.people, wrap = document.getElementById('pplWrap');
      if (!wrap) return;
      [].forEach.call(V.people.chips.children, function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-k') === U.status)); });
      var list = regs().filter(function (r) {
        if (U.status !== 'all' && r.status !== U.status) return false;
        if (U.pay !== 'all' && (r.status !== 'confirmed' || r.payment !== U.pay)) return false;
        return matchQ(r, U.q);
      });
      document.getElementById('pplCount').textContent = P.fa(list.length) + ' نفر';
      P.clear(wrap);
      if (!list.length) { wrap.appendChild(h('div', { class: 'empty', text: U.q ? 'موردی با این جستجو پیدا نشد.' : 'در این فیلتر موردی نیست.' })); return; }
      var head = h('tr', {}, ['شماره', 'نام', 'ورود و مقطع', 'موبایل', 'پرداخت', 'وضعیت', 'حضور', 'زمان ثبت‌نام'].map(function (t) { return h('th', { text: t }); }));
      var body = list.map(function (r) {
        var payCell = h('td', { 'data-l': 'پرداخت' });
        if (r.status === 'confirmed' && r.payment !== 'paid' && (r.receipts || []).length) {
          payCell.appendChild(h('button', { class: 'b b--sm b--primary', type: 'button', title: 'مشاهده رسید و تأیید پرداخت', onclick: function (e) { e.stopPropagation(); P.viewReceipts(r, P.refresh); } }, [P.ico('check'), 'بررسی رسید']));
        } else if (r.status === 'confirmed' && r.payment !== 'paid') {
          payCell.appendChild(h('button', { class: 'b b--sm', type: 'button', title: 'ثبت پرداخت', onclick: function (e) {
            e.stopPropagation();
            P.act(P.api('POST', '/api/admin/reg/' + r.id, { action: 'setPayment', payment: 'paid' }), 'پرداخت ' + fullName(r) + ' ثبت شد').then(P.refresh);
          } }, [P.ico('check'), 'ثبت پرداخت']));
        } else payCell.appendChild(r.status === 'confirmed' ? P.payBadge(r) : h('span', { class: 'hint', text: '—' }));
        var tr = h('tr', { tabindex: '0', onclick: function () { P.openReg(r.id); }, onkeydown: function (e) { if (e.key === 'Enter') P.openReg(r.id); } }, [
          h('td', { class: 'num', 'data-l': 'شماره', text: P.fa(r.seq) }),
          h('td', { 'data-l': 'نام' }, [h('div', { class: 'nm', text: fullName(r) }), h('div', { class: 'sub', text: P.fa(r.studentId) })]),
          h('td', { 'data-l': 'ورود و مقطع' }, [h('div', { text: r.entryYear || '—' }), h('div', { class: 'sub', text: [r.gender, r.degree].filter(Boolean).join(' · ') })]),
          h('td', { class: 'num', 'data-l': 'موبایل', dir: 'ltr', style: 'text-align:right', text: P.fa(r.phone) }),
          payCell,
          h('td', { 'data-l': 'وضعیت' }, [P.statusBadge(r)]),
          h('td', { 'data-l': 'حضور' }, [r.checkedIn ? h('span', { class: 'bd bd--ok', text: 'حاضر' }) : h('span', { class: 'hint', text: '—' })]),
          h('td', { class: 'num', 'data-l': 'زمان ثبت‌نام', text: P.t(r.createdAt, true) })
        ]);
        return tr;
      });
      wrap.appendChild(h('table', { class: 'tbl' }, [h('thead', {}, [head]), h('tbody', {}, body)]));
    }
  };

  /* ═════════ حضور و غیاب ═════════ */
  P.UI.checkin = { q: '', f: 'all' };
  V.checkin = {
    title: 'حضور و غیاب', icon: 'check', roles: ['admin', 'staff'],
    mount: function (root) {
      var U = P.UI.checkin;
      P.clear(root);
      var q = h('input', { class: 'in ci-search', type: 'search', placeholder: 'نام یا شماره دانشجویی', 'aria-label': 'جستجو', value: U.q, autocomplete: 'off' });
      q.addEventListener('input', function () { U.q = q.value; V.checkin.update(); });
      var chips = h('div', { class: 'chips' });
      [['all', 'همه'], ['absent', 'هنوز نیامده'], ['present', 'حاضر']].forEach(function (c) { chips.appendChild(h('button', { type: 'button', 'data-k': c[0], text: c[1], onclick: function () { U.f = c[0]; V.checkin.update(); } })); });
      root.appendChild(h('section', { class: 'card stack' }, [
        h('div', { class: 'row' }, [h('b', { id: 'ciSum', style: 'font-size:1.2rem' }), h('span', { class: 'sp' }), chips]),
        h('div', { class: 'bar' }, [h('i', { class: 's1', id: 'ciBar', style: 'width:0' })]),
        h('div', { class: 'search', style: 'position:relative' }, [q])
      ]));
      root.appendChild(h('div', { class: 'ci-list', id: 'ciList' }));
      V.checkin.chips = chips;
      V.checkin.update();
    },
    update: function () {
      var U = P.UI.checkin, box = document.getElementById('ciList'); if (!box) return;
      var all = confirmed(), present = all.filter(function (r) { return r.checkedIn; }).length;
      document.getElementById('ciSum').textContent = P.fa(present) + ' نفر از ' + P.fa(all.length) + ' نفر حاضرند';
      document.getElementById('ciBar').style.width = (all.length ? present / all.length * 100 : 0) + '%';
      [].forEach.call(V.checkin.chips.children, function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-k') === U.f)); });
      var list = all.filter(function (r) { return (U.f === 'all' || (U.f === 'present') === !!r.checkedIn) && matchQ(r, U.q); });
      P.clear(box);
      if (!list.length) { box.appendChild(h('div', { class: 'empty', text: all.length ? 'موردی پیدا نشد.' : 'هنوز شرکت‌کننده‌ی قطعی نداریم.' })); return; }
      list.forEach(function (r) {
        var btn = h('button', { class: 'b ' + (r.checkedIn ? '' : 'b--primary'), type: 'button', onclick: function () {
          btn.disabled = true;
          P.act(P.api('POST', '/api/admin/reg/' + r.id, { action: 'checkIn', value: !r.checkedIn })).then(P.refresh);
        } }, [P.ico('check'), r.checkedIn ? 'لغو حضور' : 'ثبت حضور']);
        box.appendChild(h('div', { class: 'ci-row' + (r.checkedIn ? ' on' : '') }, [
          h('div', { class: 'info' }, [h('b', { text: fullName(r) }), h('span', { text: P.fa(r.studentId) + ' · ' + (r.entryYear || '') })]),
          r.payment !== 'paid' ? h('span', { class: 'bd bd--warn', text: 'پرداخت نشده' }) : null,
          btn
        ]));
      });
    }
  };

  /* ═════════ لیست انتظار ═════════ */
  V.waitlist = {
    title: 'لیست انتظار', icon: 'clock', roles: ['admin', 'staff'],
    mount: function (root) {
      P.clear(root);
      var st = P.D.settings, list = regs().filter(function (r) { return r.status === 'waitlist'; }).sort(function (a, b) { return a.seq - b.seq; });
      root.appendChild(h('div', { class: 'alert', style: 'margin-bottom:14px;background:var(--surface-2);color:var(--ink-2)' }, [
        h('span', { class: 'sp', text: st.waitlistEnabled ? 'لیست انتظار فعال است: بعد از پر شدن ظرفیت، ثبت‌نام‌ها به‌ترتیب در این لیست می‌نشینند' + (st.autoPromote ? ' و با لغو یک ثبت‌نام، نفر اول خودکار قطعی می‌شود.' : '؛ ارتقا دستی است.') : 'لیست انتظار غیرفعال است؛ بعد از پر شدن ظرفیت، ثبت‌نام بسته می‌شود.' }),
        P.isAdmin() ? h('button', { class: 'b b--sm', type: 'button', text: 'تنظیمات', onclick: function () { P.go('settings'); } }) : null
      ]));
      if (!list.length) { root.appendChild(h('div', { class: 'card empty', text: 'لیست انتظار خالی است.' })); return; }
      var body = list.map(function (r, i) {
        return h('tr', { onclick: function () { P.openReg(r.id); } }, [
          h('td', { class: 'num', 'data-l': 'نوبت', text: P.fa(i + 1) }),
          h('td', { 'data-l': 'نام' }, [h('div', { class: 'nm', text: fullName(r) }), h('div', { class: 'sub', text: P.fa(r.studentId) })]),
          h('td', { class: 'num', 'data-l': 'موبایل', dir: 'ltr', style: 'text-align:right', text: P.fa(r.phone) }),
          h('td', { class: 'num', 'data-l': 'زمان', text: P.t(r.createdAt, true) }),
          h('td', { 'data-l': '' }, P.isAdmin() ? [h('div', { class: 'row' }, [
            h('button', { class: 'b b--sm b--primary', type: 'button', text: 'ارتقا به قطعی', onclick: function (e) { e.stopPropagation(); P.promoteReg(r).then(function (ok) { if (ok) P.refresh(); }); } }),
            h('button', { class: 'b b--sm b--danger', type: 'button', text: 'حذف', onclick: function (e) { e.stopPropagation(); P.cancelReg(r).then(function (ok) { if (ok) P.refresh(); }); } })
          ])] : [])
        ]);
      });
      root.appendChild(h('div', { class: 'tbl-wrap' }, [h('table', { class: 'tbl' }, [h('thead', {}, [h('tr', {}, ['نوبت', 'نام', 'موبایل', 'زمان ثبت', ''].map(function (t) { return h('th', { text: t }); }))]), h('tbody', {}, body)])]));
    },
    update: function () { var r = document.getElementById('viewRoot'); if (r && P.cur === 'waitlist') V.waitlist.mount(r); }
  };
})();
