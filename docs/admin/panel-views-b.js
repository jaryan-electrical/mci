/* پنل برگزارکنندگان — بخش دوم: مالی، چک‌لیست، ابزارها، تنظیمات، کاربران، گزارش فعالیت */
(function () {
  'use strict';
  var P = window.P, JR = window.JR, h = P.el, V = P.views;

  function regs() { return P.D.registrations; }
  function fullName(r) { return r.firstName + ' ' + r.lastName; }
  function confirmed() { return regs().filter(function (r) { return r.status === 'confirmed'; }); }
  function toInt(s) { var t = JR.faToEn(String(s == null ? '' : s)).replace(/[,٬\s]/g, ''); return t === '' ? null : (/^\d+$/.test(t) ? +t : NaN); }
  function fld(label, input, hint, err) { return h('div', { class: 'fld' }, [h('label', { text: label }), input, hint ? h('div', { class: 'hint', text: hint }) : null, err || null]); }
  function section(title, sub, body, foot) {
    return h('section', { class: 'card stack' }, [
      h('div', {}, [h('div', { class: 'card__t', style: 'margin-bottom:4px', text: title }), sub ? h('div', { class: 'hint', text: sub }) : null])
    ].concat(body, foot ? [foot] : []));
  }

  /* ═════════ مالی ═════════ */
  V.finance = {
    title: 'مالی', icon: 'wallet', roles: ['admin'],
    mount: function (root) {
      P.clear(root);
      root.appendChild(h('div', { id: 'finTop' }));
      var addTitle = h('input', { placeholder: 'مثلاً کرایه‌ی اتوبوس', maxlength: '100', 'aria-label': 'عنوان هزینه' });
      var addAmt = h('input', { dir: 'ltr', inputmode: 'numeric', placeholder: 'مبلغ به تومان', 'aria-label': 'مبلغ هزینه' });
      var addNote = h('input', { placeholder: 'توضیح (اختیاری)', maxlength: '200', 'aria-label': 'توضیح هزینه' });
      var err = h('p', { class: 'err' });
      function add() {
        err.textContent = '';
        var amt = toInt(addAmt.value);
        if (!addTitle.value.trim()) { err.textContent = 'عنوان هزینه را بنویسید.'; addTitle.focus(); return; }
        if (amt == null || isNaN(amt)) { err.textContent = 'مبلغ را به عدد و بر حسب تومان بنویسید.'; addAmt.focus(); return; }
        P.act(P.api('POST', '/api/admin/expense', { action: 'add', title: addTitle.value, amountToman: amt, note: addNote.value }), 'هزینه ثبت شد').then(function (r) {
          if (r.ok) { addTitle.value = ''; addAmt.value = ''; addNote.value = ''; addTitle.focus(); P.refresh(); }
        });
      }
      [addTitle, addAmt, addNote].forEach(function (i) { i.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); add(); } }); });
      root.appendChild(h('section', { class: 'card stack mt' }, [
        h('div', { class: 'card__t', style: 'margin-bottom:0', text: 'هزینه‌های اردو' }),
        h('div', { class: 'form-grid' }, [fld('عنوان', addTitle), fld('مبلغ (تومان)', addAmt), fld('توضیح', addNote)]),
        err,
        h('div', { class: 'row' }, [h('button', { class: 'b b--primary', type: 'button', onclick: add }, [P.ico('plus'), 'افزودن هزینه'])]),
        h('div', { id: 'finList' })
      ]));
      root.appendChild(h('div', { id: 'finUnpaid', class: 'mt' }));
      V.finance.update();
    },
    update: function () {
      var top = document.getElementById('finTop'); if (!top) return;
      var S = P.D.stats, F = S.finance, st = P.D.settings, ex = P.D.expenses;
      P.clear(top);
      if (!st.priceToman) top.appendChild(h('div', { class: 'alert', style: 'margin-bottom:14px' }, [h('span', { class: 'sp', text: 'هزینه‌ی اردو هنوز تعیین نشده است؛ مبلغ مورد انتظار و مانده‌ها بدون آن محاسبه نمی‌شود.' }), h('button', { class: 'b b--sm b--amber', type: 'button', text: 'تعیین هزینه', onclick: function () { P.go('settings'); } })]));
      function t(l, v, s) { return h('div', { class: 'tile' }, [h('div', { class: 'tile__l', text: l }), h('div', { class: 'tile__v', style: 'font-size:1.5rem' }, [v]), h('div', { class: 'tile__s', text: s || '' })]); }
      top.appendChild(h('div', { class: 'grid', style: 'grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr))' }, [
        t('درآمد مورد انتظار', P.num(F.expected), 'تومان — ' + P.fa(S.confirmed) + ' نفر × ' + (st.priceToman ? P.num(st.priceToman) : '؟')),
        t('دریافت‌شده', P.num(F.received), P.fa(S.paid) + ' نفر پرداخت کرده‌اند'),
        t('مانده‌ی دریافتی', P.num(F.outstanding), P.fa(S.unpaid) + ' نفر مانده'),
        t('مجموع هزینه‌ها', P.num(F.expensesTotal), P.fa(ex.length) + ' قلم'),
        t(F.balance < 0 ? 'کسری فعلی' : 'مازاد فعلی', P.num(Math.abs(F.balance)), F.balance < 0 ? 'تومان — هزینه‌ها از دریافتی بیشتر است' : 'تومان — دریافتی از هزینه‌ها بیشتر است'),
        t('سرانه‌ی هزینه', P.num(F.perHead), st.priceToman ? (F.perHead > st.priceToman ? 'از مبلغ ثبت‌نام بیشتر است' : 'کمتر از مبلغ ثبت‌نام') : 'تومان برای هر نفر')
      ]));
      if (S.confirmed) top.appendChild(h('section', { class: 'card stack mt' }, [h('div', { class: 'card__t', style: 'margin-bottom:0', text: 'وضعیت دریافت' }), P.splitBar(S.paid, S.unpaid, 'پرداخت شده', 'پرداخت نشده')]));

      var list = P.clear(document.getElementById('finList'));
      if (!ex.length) list.appendChild(h('div', { class: 'empty', text: 'هنوز هزینه‌ای ثبت نشده است. کرایه‌ی اتوبوس، پذیرایی، هدیه و … را اینجا ثبت کنید تا سرانه محاسبه شود.' }));
      else {
        var body = ex.slice().sort(function (a, b) { return b.createdAt - a.createdAt; }).map(function (x) {
          return h('tr', { style: 'cursor:default' }, [
            h('td', { 'data-l': 'عنوان' }, [h('div', { class: 'nm', text: x.title }), x.note ? h('div', { class: 'sub', text: x.note }) : null]),
            h('td', { class: 'num', 'data-l': 'مبلغ', text: P.toman(x.amountToman) }),
            h('td', { 'data-l': '' }, [h('div', { class: 'row' }, [
              h('button', { class: 'b b--sm', type: 'button', text: 'ویرایش', onclick: function () { editExpense(x); } }),
              h('button', { class: 'b b--sm b--danger', type: 'button', text: 'حذف', onclick: function () {
                P.confirm({ title: 'حذف هزینه', body: '«' + x.title + '» حذف شود؟', ok: 'حذف', danger: true }).then(function (v) { if (v) P.act(P.api('POST', '/api/admin/expense', { action: 'delete', id: x.id }), 'حذف شد').then(P.refresh); });
              } })
            ])])
          ]);
        });
        list.appendChild(h('div', { class: 'tbl-wrap' }, [h('table', { class: 'tbl' }, [h('thead', {}, [h('tr', {}, ['عنوان', 'مبلغ', ''].map(function (c) { return h('th', { text: c }); }))]), h('tbody', {}, body)])]));
      }

      var un = P.clear(document.getElementById('finUnpaid'));
      var unpaid = confirmed().filter(function (r) { return r.payment !== 'paid'; });
      if (unpaid.length) {
        un.appendChild(h('section', { class: 'card stack' }, [
          h('div', { class: 'card__t', style: 'margin-bottom:0' }, [h('span', { text: 'پرداخت‌نشده‌ها' }), h('span', { class: 'sp' }), h('span', { class: 'bd bd--warn', text: P.fa(unpaid.length) + ' نفر' })]),
          h('div', { class: 'list' }, unpaid.map(function (r) {
            return h('div', { class: 'list__i' }, [
              h('span', { class: 'n', text: fullName(r) }), h('span', { class: 's sp', dir: 'ltr', style: 'text-align:right', text: P.fa(r.phone) }),
              h('button', { class: 'b b--sm b--ok', type: 'button', onclick: function () { P.act(P.api('POST', '/api/admin/reg/' + r.id, { action: 'setPayment', payment: 'paid' }), 'پرداخت ثبت شد').then(P.refresh); } }, [P.ico('check'), 'ثبت پرداخت'])
            ]);
          })),
          h('div', { class: 'row' }, [h('button', { class: 'b b--sm', type: 'button', onclick: function () { P.copy(unpaid.map(function (r) { return r.phone; }).join('\n'), 'شماره‌ها کپی شد'); } }, [P.ico('copy'), 'کپی شماره‌ها برای یادآوری'])])
        ]));
      }
    }
  };
  function editExpense(x) {
    var t = h('input', { value: x.title, maxlength: '100' }), a = h('input', { value: String(x.amountToman), dir: 'ltr', inputmode: 'numeric' }), n = h('input', { value: x.note || '', maxlength: '200' }), er = h('p', { class: 'err' });
    var m = P.modal('ویرایش هزینه', [
      h('div', { class: 'stack' }, [fld('عنوان', t), fld('مبلغ (تومان)', a), fld('توضیح', n), er]),
      h('div', { class: 'row row--end mt' }, [
        h('button', { class: 'b', type: 'button', text: 'انصراف', onclick: function () { m.close(); } }),
        h('button', { class: 'b b--primary', type: 'button', text: 'ذخیره', onclick: function () {
          var amt = toInt(a.value); if (amt == null || isNaN(amt)) { er.textContent = 'مبلغ نامعتبر است.'; return; }
          P.api('POST', '/api/admin/expense', { action: 'update', id: x.id, title: t.value, amountToman: amt, note: n.value }).then(function (r) {
            if (r.ok) { m.close(); P.toast('ذخیره شد', 'ok'); P.refresh(); } else er.textContent = (r.json && r.json.message) || 'ذخیره نشد.';
          });
        } })
      ])
    ]);
  }

  /* ═════════ چک‌لیست ═════════ */
  V.tasks = {
    title: 'چک‌لیست اردو', icon: 'list', roles: ['admin', 'staff'], maxWidth: '820px',
    mount: function (root) {
      P.clear(root);
      var inp = h('input', { class: 'in', placeholder: 'کار جدید، مثلاً «هماهنگی با راننده»', maxlength: '140', 'aria-label': 'کار جدید' });
      function add() {
        if (!inp.value.trim()) { inp.focus(); return; }
        P.act(P.api('POST', '/api/admin/task', { action: 'add', title: inp.value }), '').then(function (r) { if (r.ok) { inp.value = ''; P.refresh().then(function () { inp.focus(); }); } });
      }
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); add(); } });
      root.appendChild(h('section', { class: 'card stack' }, [
        h('div', { class: 'row' }, [h('b', { id: 'tkSum', style: 'font-size:1.2rem' })]),
        h('div', { class: 'bar' }, [h('i', { class: 's1', id: 'tkBar', style: 'width:0' })]),
        h('div', { class: 'row' }, [h('div', { style: 'flex:1;min-width:200px' }, [inp]), h('button', { class: 'b b--primary', type: 'button', onclick: add }, [P.ico('plus'), 'افزودن'])]),
        h('div', { id: 'tkList' })
      ]));
      V.tasks.update();
    },
    update: function () {
      var box = document.getElementById('tkList'); if (!box) return;
      var tasks = P.D.tasks, done = tasks.filter(function (t) { return t.done; }).length;
      document.getElementById('tkSum').textContent = P.fa(done) + ' کار از ' + P.fa(tasks.length) + ' کار انجام شده';
      document.getElementById('tkBar').style.width = (tasks.length ? done / tasks.length * 100 : 0) + '%';
      P.clear(box);
      if (!tasks.length) { box.appendChild(h('div', { class: 'empty', text: 'کاری ثبت نشده است.' })); return; }
      tasks.forEach(function (t) {
        var cb = h('input', { type: 'checkbox', 'aria-label': t.title, onchange: function () { cb.disabled = true; P.act(P.api('POST', '/api/admin/task', { action: 'toggle', id: t.id })).then(P.refresh); } });
        cb.checked = !!t.done;
        box.appendChild(h('div', { class: 'task' + (t.done ? ' done' : '') }, [
          cb, h('span', { text: t.title }),
          t.done && t.doneAt ? h('span', { class: 'hint', style: 'flex:none', text: P.t(t.doneAt) }) : null,
          h('button', { class: 'xbtn', type: 'button', 'aria-label': 'حذف «' + t.title + '»', onclick: function () {
            P.confirm({ title: 'حذف کار', body: '«' + t.title + '» حذف شود؟', ok: 'حذف', danger: true }).then(function (v) { if (v) P.act(P.api('POST', '/api/admin/task', { action: 'delete', id: t.id })).then(P.refresh); });
          } }, [P.ico('x')])
        ]));
      });
    }
  };

  /* ═════════ ابزارها ═════════ */
  var TPL = {
    reminder: { label: 'یادآوری روز اردو', text: 'سلام {نام} عزیز 👋\nیادآوری اردوی «{اردو}» در {تاریخ}.\nساعت حرکت: {ساعت}\nمحل تجمع: {محل}\nلطفاً کارت دانشجویی و کارت ملی همراه داشته باشید.\n— مجموعه جریان' },
    pay: { label: 'یادآوری پرداخت', text: 'سلام {نام} عزیز\nثبت‌نام شما در اردوی «{اردو}» قطعی است، اما هنوز هزینه‌ی اردو ({هزینه}) پرداخت نشده است.\n{پرداخت}\nپس از پرداخت، رسید یا ۴ رقم آخر کارت را برای ستاد ارسال کنید.\n— مجموعه جریان' },
    promoted: { label: 'قطعی شدن از لیست انتظار', text: 'سلام {نام} عزیز\nخبر خوب: جای خالی شد و ثبت‌نام شما در اردوی «{اردو}» قطعی شد 🎉\nبرای پرداخت هزینه ({هزینه}) و دریافت جزئیات با ستاد هماهنگ کنید.\n— مجموعه جریان' },
    free: { label: 'پیام دلخواه', text: 'سلام {نام} عزیز\n' }
  };
  function fill(tpl, r, st) {
    var pay = st.payment && st.payment.enabled && st.payment.cardNumber ? 'کارت به کارت: ' + st.payment.cardNumber.replace(/(\d{4})(?=\d)/g, '$1 ').trim() + (st.payment.cardHolder ? ' — به نام ' + st.payment.cardHolder : '') : '';
    var map = {
      'نام': r.firstName, 'نام‌خانوادگی': r.lastName, 'اردو': st.eventTitle, 'تاریخ': JR.fmtDate(JR.fromTehran(st.eventDate.jy, st.eventDate.jm, st.eventDate.jd, 12, 0), { weekday: true }),
      'ساعت': st.meeting.time || '(اعلام می‌شود)', 'محل': st.meeting.place || '(اعلام می‌شود)', 'هزینه': st.priceToman != null ? JR.fmtNum(st.priceToman) + ' تومان' : '(اعلام می‌شود)', 'پرداخت': pay
    };
    return tpl.replace(/\{([^}]+)\}/g, function (m, k) { return map[k] != null ? map[k] : m; }).replace(/\n{3,}/g, '\n\n').trim();
  }
  P.UI.tools = { tpl: 'reminder', who: 'confirmed', text: null };
  V.tools = {
    title: 'ابزارها و خروجی', icon: 'tool', roles: ['admin'],
    mount: function (root) {
      var U = P.UI.tools, st = P.D.settings;
      P.clear(root);
      var nConf = confirmed().length;

      function card(icon, title, text, btns) {
        return h('div', { class: 'card stack' }, [h('div', { class: 'card__t', style: 'margin-bottom:0' }, [P.ico(icon), title]), h('p', { class: 'hint', text: text }), h('div', { class: 'row' }, btns)]);
      }
      var attendRows = function () { return confirmed().map(function (r, i) { return [P.fa(i + 1), fullName(r), P.fa(r.studentId), P.fa(r.phone), '']; }); };
      var secRows = function () { return confirmed().map(function (r, i) { return [P.fa(i + 1), r.firstName, r.lastName, P.fa(r.nationalId), P.fa(r.studentId)]; }); };
      var evDate = JR.fmtDate(JR.fromTehran(st.eventDate.jy, st.eventDate.jm, st.eventDate.jd, 12, 0), { weekday: true });
      root.appendChild(h('div', { class: 'grid grid--2' }, [
        card('print', 'برگه‌ی حضور و غیاب', 'برگه‌ی A4 برای امضا در محل تجمع؛ شامل ' + P.fa(nConf) + ' شرکت‌کننده‌ی قطعی.', [
          h('button', { class: 'b b--primary', type: 'button', onclick: function () { P.print('حضور و غیاب — ' + st.eventTitle, evDate + ' · ' + P.fa(confirmed().length) + ' نفر', ['ردیف', 'نام و نام خانوادگی', 'شماره دانشجویی', 'موبایل', 'امضا'], attendRows()); } }, [P.ico('print'), 'چاپ برگه'])
        ]),
        card('shield', 'لیست حراست شرکت', 'نام، نام خانوادگی، کد ملی و شماره دانشجویی شرکت‌کنندگان قطعی برای هماهنگی ورود. این لیست حاوی اطلاعات هویتی است؛ فقط برای همان مرجع بفرستید.', [
          h('button', { class: 'b b--primary', type: 'button', onclick: function () { P.download('/api/admin/export?kind=security', 'security-list.csv'); } }, [P.ico('download'), 'فایل اکسل']),
          h('button', { class: 'b', type: 'button', onclick: function () { P.print('لیست شرکت‌کنندگان — ' + st.eventTitle, evDate, ['ردیف', 'نام', 'نام خانوادگی', 'کد ملی', 'شماره دانشجویی'], secRows().map(function (r) { return r; })); } }, [P.ico('print'), 'چاپ'])
        ]),
        card('users', 'خروجی کامل ثبت‌نام‌ها', 'همه‌ی ثبت‌نام‌ها (قطعی، انتظار و لغوشده) با وضعیت پرداخت، حضور و یادداشت‌ها، قابل‌باز شدن در اکسل.', [
          h('button', { class: 'b b--primary', type: 'button', onclick: function () { P.download('/api/admin/export?kind=all', 'registrations.csv'); } }, [P.ico('download'), 'دانلود اکسل'])
        ]),
        card('phone', 'شماره‌ی موبایل‌ها', 'فهرست نام و موبایل شرکت‌کنندگان قطعی برای ساختن گروه پیام‌رسان.', [
          h('button', { class: 'b', type: 'button', onclick: function () { P.copy(confirmed().map(function (r) { return r.phone; }).join('\n'), 'شماره‌ها کپی شد'); } }, [P.ico('copy'), 'کپی شماره‌ها']),
          h('button', { class: 'b', type: 'button', onclick: function () { P.download('/api/admin/export?kind=phones', 'phones.csv'); } }, [P.ico('download'), 'فایل اکسل'])
        ])
      ]));

      /* پیام‌ساز */
      var tplSel = h('select', { 'aria-label': 'قالب پیام' }, Object.keys(TPL).map(function (k) { return h('option', { value: k, text: TPL[k].label }); }));
      var whoSel = h('select', { 'aria-label': 'گیرندگان' }, [['confirmed', 'شرکت‌کنندگان قطعی'], ['unpaid', 'قطعی‌های پرداخت‌نشده'], ['waitlist', 'لیست انتظار'], ['present', 'حاضرها'], ['absent', 'غایب‌ها (قطعی‌های حاضرنشده)']].map(function (o) { return h('option', { value: o[0], text: o[1] }); }));
      tplSel.value = U.tpl; whoSel.value = U.who;
      var ta = h('textarea', { 'aria-label': 'متن پیام', rows: '7' }); ta.value = U.text != null ? U.text : TPL[U.tpl].text;
      var listBox = h('div', { class: 'list' });
      function audience() {
        return regs().filter(function (r) {
          if (U.who === 'confirmed') return r.status === 'confirmed';
          if (U.who === 'unpaid') return r.status === 'confirmed' && r.payment !== 'paid';
          if (U.who === 'waitlist') return r.status === 'waitlist';
          if (U.who === 'present') return r.status === 'confirmed' && r.checkedIn;
          return r.status === 'confirmed' && !r.checkedIn;
        });
      }
      function renderList() {
        P.clear(listBox);
        var a = audience();
        cnt.textContent = P.fa(a.length) + ' گیرنده';
        if (!a.length) { listBox.appendChild(h('div', { class: 'empty', text: 'گیرنده‌ای در این گروه نیست.' })); return; }
        a.forEach(function (r) {
          var msg = fill(ta.value, r, P.D.settings);
          listBox.appendChild(h('div', { class: 'list__i' }, [
            h('span', { class: 'n', text: fullName(r) }), h('span', { class: 's sp', dir: 'ltr', style: 'text-align:right', text: P.fa(r.phone) }),
            h('button', { class: 'b b--sm', type: 'button', onclick: function () { P.copy(msg, 'پیام کپی شد'); } }, [P.ico('copy'), 'کپی']),
            h('a', { class: 'b b--sm', href: 'sms:' + r.phone + '?body=' + encodeURIComponent(msg) }, [P.ico('msg'), 'پیامک'])
          ]));
        });
      }
      var cnt = h('span', { class: 'hint' });
      tplSel.addEventListener('change', function () { U.tpl = tplSel.value; U.text = null; ta.value = TPL[U.tpl].text; renderList(); });
      whoSel.addEventListener('change', function () { U.who = whoSel.value; renderList(); });
      ta.addEventListener('input', function () { U.text = ta.value; renderList(); });
      root.appendChild(h('section', { class: 'card stack mt' }, [
        h('div', { class: 'card__t', style: 'margin-bottom:0' }, [P.ico('msg'), 'پیام‌ساز برای شرکت‌کنندگان']),
        h('p', { class: 'hint', text: 'متن را برای هر نفر شخصی‌سازی می‌کند. جای‌نگهدارها: {نام} {نام‌خانوادگی} {اردو} {تاریخ} {ساعت} {محل} {هزینه} {پرداخت}. پیام‌ها از سامانه ارسال نمی‌شوند؛ کپی کنید یا با دکمه‌ی «پیامک» در برنامه‌ی پیامک گوشی باز کنید.' }),
        h('div', { class: 'form-grid' }, [fld('قالب', tplSel), fld('گیرندگان', whoSel)]),
        h('div', { class: 'fld' }, [h('label', { text: 'متن پیام' }), ta]),
        h('div', { class: 'row' }, [cnt, h('span', { class: 'sp' }), h('button', { class: 'b b--sm', type: 'button', onclick: function () { P.copy(audience().map(function (r) { return r.phone; }).join('\n'), 'شماره‌ها کپی شد'); } }, [P.ico('copy'), 'کپی همه‌ی شماره‌ها'])]),
        listBox
      ]));
      renderList();
    },
    update: function () { /* پیام‌ساز را هنگام نوشتن بازسازی نمی‌کنیم */ }
  };

  /* ═════════ تنظیمات ═════════ */
  V.settings = {
    title: 'تنظیمات', icon: 'gear', roles: ['admin'], maxWidth: '880px',
    mount: function (root) {
      P.clear(root);
      var st = P.D.settings;

      /** ارسال بخشی از تنظیمات؛ خطای هر فیلد زیر خودش نشان داده می‌شود. */
      function save(patch, btn, errs) {
        Object.keys(errs || {}).forEach(function (k) { errs[k].textContent = ''; });
        if (btn) btn.disabled = true;
        return P.api('POST', '/api/admin/settings', patch).then(function (r) {
          if (btn) btn.disabled = false;
          if (r.ok) { P.toast('تنظیمات ذخیره شد', 'ok'); P.refresh(); return true; }
          var e = (r.json && r.json.errors) || {};
          Object.keys(e).forEach(function (k) { if (errs && errs[k]) errs[k].textContent = e[k]; });
          P.toast((r.json && r.json.message) || 'ذخیره نشد.', 'err');
          return false;
        });
      }
      function saveBtn(fn) { var b = h('button', { class: 'b b--primary', type: 'button', text: 'ذخیره', onclick: function () { fn(b); } }); return h('div', { class: 'row' }, [b]); }
      function chk(label, checked, hint) {
        var i = h('input', { type: 'checkbox' }); i.checked = !!checked;
        return { input: i, el: h('div', {}, [h('label', { class: 'chk' }, [i, h('span', { text: label })]), hint ? h('div', { class: 'hint', style: 'margin-inline-start:30px', text: hint }) : null]) };
      }

      /* ۱ — اطلاعات اردو */
      var title = h('input', { value: st.eventTitle, maxlength: '120' });
      var dp = P.dtPicker(JR.fromTehran(st.eventDate.jy, st.eventDate.jm, st.eventDate.jd, 0, 0), { time: false });
      var cap = h('input', { value: String(st.capacity), dir: 'ltr', inputmode: 'numeric' });
      var price = h('input', { value: st.priceToman != null ? String(st.priceToman) : '', dir: 'ltr', inputmode: 'numeric', placeholder: 'مثلاً ۲۵۰۰۰۰' });
      var e1 = { eventTitle: h('p', { class: 'err' }), eventDate: h('p', { class: 'err' }), capacity: h('p', { class: 'err' }), priceToman: h('p', { class: 'err' }) };
      root.appendChild(section('اطلاعات اردو', 'این موارد در صفحه‌ی ثبت‌نام نمایش داده می‌شود.', [
        h('div', { class: 'form-grid' }, [
          h('div', { class: 'span-all' }, [fld('عنوان اردو', title, null, e1.eventTitle)]),
          h('div', { class: 'span-all' }, [h('div', { class: 'fld' }, [h('label', { text: 'تاریخ برگزاری' }), dp.el, e1.eventDate])]),
          fld('ظرفیت (نفر)', cap, 'کم‌کردن ظرفیت زیر تعداد ثبت‌نام‌شده‌ها ثبت‌نام را می‌بندد؛ زیاد کردنش آن را دوباره باز می‌کند.', e1.capacity),
          fld('هزینه‌ی هر نفر (تومان)', price, 'خالی بگذارید تا «اعلام می‌شود» نمایش داده شود.', e1.priceToman)
        ])
      ], saveBtn(function (b) {
        var c = toInt(cap.value), p = toInt(price.value);
        if (c == null || isNaN(c)) { e1.capacity.textContent = 'ظرفیت را به عدد بنویسید.'; return; }
        if (isNaN(p)) { e1.priceToman.textContent = 'مبلغ نامعتبر است.'; return; }
        var d = JR.tehranParts(dp.get());
        var go = function () { return save({ eventTitle: title.value, eventDate: { jy: d.jy, jm: d.jm, jd: d.jd }, capacity: c, priceToman: p }, b, e1); };
        var confirmedNow = P.D.stats.confirmed;
        if (c < confirmedNow) P.confirm({ title: 'کم‌کردن ظرفیت', body: 'ظرفیت (' + P.fa(c) + ') از تعداد ثبت‌نام قطعی (' + P.fa(confirmedNow) + ') کمتر است. ثبت‌نام‌های موجود حذف نمی‌شوند، ولی ثبت‌نام جدید بسته می‌شود. ادامه می‌دهید؟', ok: 'ادامه' }).then(function (v) { if (v) go(); });
        else go();
      })));

      /* ۲ — زمان‌بندی */
      var openDp = P.dtPicker(st.openAtMs, { optional: true }), closeDp = P.dtPicker(st.closeAtMs, { optional: true });
      var e2 = { openAtMs: h('p', { class: 'err' }), closeAtMs: h('p', { class: 'err' }) };
      root.appendChild(h('div', { class: 'mt' }, [section('زمان‌بندی ثبت‌نام', 'ساعت‌ها به وقت تهران و ملاک آن ساعت سرور است. ثبت‌نام دقیقاً در لحظه‌ی شروع باز می‌شود و با ثبت‌نام آخرین نفر ظرفیت بسته می‌شود.', [
        h('div', { class: 'stack' }, [
          h('div', { class: 'fld' }, [h('label', { text: 'شروع ثبت‌نام' }), openDp.el, e2.openAtMs,
            h('div', { class: 'row' }, [
              h('button', { class: 'b b--sm', type: 'button', text: 'همین حالا + ۲ دقیقه (برای آزمایش)', onclick: function () { openDp.set(Math.ceil((P.now() + 120000) / 60000) * 60000); } }),
              h('button', { class: 'b b--sm', type: 'button', text: 'پاک کردن', onclick: function () { openDp.set(null); } })
            ])]),
          h('div', { class: 'fld' }, [h('label', { text: 'پایان ثبت‌نام (اختیاری)' }), closeDp.el, e2.closeAtMs, h('div', { class: 'hint', text: 'اگر ظرفیت زودتر پر شود، همان لحظه بسته می‌شود.' })])
        ])
      ], saveBtn(function (b) { save({ openAtMs: openDp.get(), closeAtMs: closeDp.get() }, b, e2); }))]));

      /* ۳ — پذیرش */
      var wl = chk('لیست انتظار فعال باشد', st.waitlistEnabled, 'بعد از پر شدن ظرفیت، افراد به‌ترتیب در لیست انتظار می‌نشینند.');
      var ap = chk('با لغو ثبت‌نام، نفر اول لیست انتظار خودکار قطعی شود', st.autoPromote);
      var wlOn = chk('فقط دانشجویانِ فهرست زیر بتوانند ثبت‌نام کنند', st.whitelistEnabled, 'برای اینکه فقط دانشجویان دانشکده‌ی برق ثبت‌نام کنند، شماره‌ی دانشجویی آن‌ها را اینجا بارگذاری کنید.');
      var wlTa = h('textarea', { rows: '6', dir: 'ltr', placeholder: 'هر شماره‌ی دانشجویی در یک خط (یا با فاصله و ویرگول جدا شود)', 'aria-label': 'فهرست شماره‌ی دانشجویی' });
      var wlInfo = h('div', { class: 'hint', text: P.fa(P.D.whitelistCount) + ' شماره بارگذاری شده است.' });
      P.api('GET', '/api/admin/whitelist').then(function (r) { if (r.ok) { wlTa.value = r.json.text; wlInfo.textContent = P.fa(r.json.count) + ' شماره بارگذاری شده است.'; } });
      var fileIn = h('input', { type: 'file', accept: '.txt,.csv,text/plain,text/csv', style: 'display:none', onchange: function () {
        var f = fileIn.files[0]; if (!f) return;
        if (f.size > 512 * 1024) { P.toast('فایل بزرگ است.', 'err'); return; }
        var rd = new FileReader(); rd.onload = function () { wlTa.value = String(rd.result || ''); P.toast('فایل خوانده شد؛ برای اعمال، «ذخیره» را بزنید.'); }; rd.readAsText(f);
      } });
      root.appendChild(h('div', { class: 'mt' }, [section('پذیرش ثبت‌نام‌ها', '', [
        h('div', { class: 'stack' }, [wl.el, ap.el, wlOn.el,
          h('div', { class: 'fld' }, [h('label', { text: 'فهرست شماره‌های دانشجویی مجاز' }), wlTa, wlInfo]),
          h('div', { class: 'row' }, [h('button', { class: 'b b--sm', type: 'button', text: 'بارگذاری از فایل متنی یا CSV', onclick: function () { fileIn.click(); } }), fileIn])])
      ], saveBtn(function (b) {
        b.disabled = true;
        P.api('POST', '/api/admin/whitelist', { text: wlTa.value }).then(function (r) {
          if (!r.ok) { b.disabled = false; P.toast((r.json && r.json.message) || 'ذخیره نشد.', 'err'); return; }
          wlInfo.textContent = P.fa(r.json.count) + ' شماره بارگذاری شده است.';
          if (wlOn.input.checked && !r.json.count) { b.disabled = false; P.toast('فهرست خالی است؛ با فعال بودن محدودیت هیچ‌کس نمی‌تواند ثبت‌نام کند.', 'err'); }
          save({ waitlistEnabled: wl.input.checked, autoPromote: ap.input.checked, whitelistEnabled: wlOn.input.checked }, b, {});
        });
      }))]));

      /* ۴ — پرداخت */
      var pe = chk('دستور پرداخت به شرکت‌کننده نشان داده شود', st.payment.enabled);
      var card = h('input', { value: st.payment.cardNumber, dir: 'ltr', inputmode: 'numeric', maxlength: '24', placeholder: '۱۶ رقم' });
      var holder = h('input', { value: st.payment.cardHolder, maxlength: '60' }), bank = h('input', { value: st.payment.bankName, maxlength: '40' }), pnote = h('input', { value: st.payment.note, maxlength: '200', placeholder: 'مثلاً: تا ۲۴ ساعت بعد از ثبت‌نام پرداخت شود' });
      var e4 = { cardNumber: h('p', { class: 'err' }) };
      root.appendChild(h('div', { class: 'mt' }, [section('پرداخت هزینه', 'پرداخت کارت‌به‌کارت است و خود سامانه پولی دریافت نمی‌کند؛ پس از واریز، «پرداخت شد» را در فهرست شرکت‌کنندگان بزنید.', [
        h('div', { class: 'stack' }, [pe.el, h('div', { class: 'form-grid' }, [fld('شماره کارت', card, null, e4.cardNumber), fld('به نام', holder), fld('بانک', bank), fld('توضیح برای شرکت‌کننده', pnote)])])
      ], saveBtn(function (b) { save({ payment: { enabled: pe.input.checked, cardNumber: card.value, cardHolder: holder.value, bankName: bank.value, note: pnote.value } }, b, { cardNumber: e4.cardNumber }); }))]));

      /* ۵ — حرکت */
      var mp = h('input', { value: st.meeting.place, maxlength: '200', placeholder: 'مثلاً مقابل ورودی دانشکده‌ی برق' }), mt = h('input', { value: st.meeting.time, maxlength: '80', placeholder: 'مثلاً ساعت ۷:۳۰ صبح' }), mn = h('input', { value: st.meeting.note, maxlength: '300', placeholder: 'مثلاً با سرویس دانشگاه حرکت می‌کنیم' });
      root.appendChild(h('div', { class: 'mt' }, [section('ساعت و محل حرکت', 'بعد از ثبت‌نام قطعی، همین اطلاعات به شرکت‌کننده نمایش داده می‌شود.', [
        h('div', { class: 'form-grid' }, [fld('محل تجمع', mp), fld('ساعت حرکت', mt), h('div', { class: 'span-all' }, [fld('توضیح', mn)])])
      ], saveBtn(function (b) { save({ meeting: { place: mp.value, time: mt.value, note: mn.value } }, b, {}); }))]));

      /* ۶ — اطلاعیه و تماس */
      var an = h('textarea', { rows: '3', maxlength: '400', placeholder: 'اگر خالی باشد، نواری نمایش داده نمی‌شود.' }); an.value = st.announcement || '';
      var c1 = h('input', { value: st.contact.eitaa, maxlength: '80', dir: 'ltr', placeholder: '@jaryan_ee' }), c2 = h('input', { value: st.contact.telegram, maxlength: '80', dir: 'ltr' }), c3 = h('input', { value: st.contact.instagram, maxlength: '80', dir: 'ltr' }), c4 = h('input', { value: st.contact.phone, maxlength: '30', dir: 'ltr', placeholder: '۰۹…' });
      root.appendChild(h('div', { class: 'mt' }, [section('اطلاعیه و راه‌های تماس', 'اطلاعیه به‌صورت نوار بالای صفحه‌ی ثبت‌نام دیده می‌شود.', [
        h('div', { class: 'stack' }, [fld('متن اطلاعیه', an), h('div', { class: 'form-grid' }, [fld('ایتا', c1), fld('تلگرام', c2), fld('اینستاگرام', c3), fld('تلفن پشتیبانی', c4)])])
      ], saveBtn(function (b) { save({ announcement: an.value, contact: { eitaa: c1.value, telegram: c2.value, instagram: c3.value, phone: c4.value } }, b, {}); }))]));

      /* ۷ — گزینه‌های فرم و قوانین */
      var lines = function (a) { return a.join('\n'); };
      var dg = h('textarea', { rows: '4' }), mj = h('textarea', { rows: '6' }), rl = h('textarea', { rows: '8' });
      dg.value = lines(st.degrees); mj.value = lines(st.majors); rl.value = lines(st.rules);
      var e7 = { degrees: h('p', { class: 'err' }), majors: h('p', { class: 'err' }) };
      var split = function (t) { return t.split(/\n/).map(function (x) { return x.trim(); }).filter(Boolean); };
      root.appendChild(h('div', { class: 'mt' }, [section('گزینه‌های فرم و قوانین', 'هر مورد در یک خط.', [
        h('div', { class: 'form-grid' }, [fld('مقطع‌ها', dg, null, e7.degrees), fld('گرایش‌ها', mj, null, e7.majors)]),
        fld('قوانین و نکات (در صفحه‌ی ثبت‌نام نمایش داده می‌شود)', rl)
      ], saveBtn(function (b) { save({ degrees: split(dg.value), majors: split(mj.value), rules: split(rl.value) }, b, e7); }))]));

      /* ۸ — منطقه‌ی خطر */
      root.appendChild(h('div', { class: 'mt' }, [section('پشتیبان و پاک‌سازی', 'داده‌ها در Google Sheet شما ذخیره می‌شود و Google خودش تاریخچه‌ی نسخه‌ها را نگه می‌دارد (در Sheet: File ← Version history). قبل از رویدادهای مهم یک نسخه را هم روی دستگاه خودتان نگه دارید.', [
        h('div', { class: 'row' }, [
          h('button', { class: 'b', type: 'button', onclick: function () { P.download('/api/admin/backup', 'backup.json'); } }, [P.ico('download'), 'دانلود نسخه‌ی پشتیبان']),
          h('button', { class: 'b b--danger', type: 'button', onclick: resetFlow }, 'پاک‌سازی همه‌ی ثبت‌نام‌ها (آزمایشی)')
        ])
      ])]));
    },
    update: function () { /* فرم‌ها هنگام ویرایش بازسازی نمی‌شوند */ }
  };

  function resetFlow() {
    var n = P.D.registrations.length;
    var pw = h('input', { type: 'password', autocomplete: 'current-password', 'aria-label': 'رمز عبور شما' }), ph = h('input', { placeholder: 'پاک شود', 'aria-label': 'عبارت تأیید' }), er = h('p', { class: 'err' });
    var m = P.modal('پاک‌سازی همه‌ی ثبت‌نام‌ها', [
      h('p', { text: P.fa(n) + ' ثبت‌نام برای همیشه حذف می‌شود و شماره‌گذاری از اول شروع می‌شود. تنظیمات و هزینه‌ها دست‌نخورده می‌ماند. این کار برگشت‌پذیر نیست؛ قبلش پشتیبان بگیرید.' }),
      h('div', { class: 'stack' }, [fld('رمز عبور شما', pw), fld('برای تأیید عبارت «پاک شود» را بنویسید', ph), er]),
      h('div', { class: 'row row--end mt' }, [
        h('button', { class: 'b', type: 'button', text: 'انصراف', onclick: function () { m.close(); } }),
        h('button', { class: 'b b--danger', type: 'button', text: 'پاک کن', onclick: function () {
          P.api('POST', '/api/admin/reset', { password: pw.value, phrase: ph.value.trim() }).then(function (r) {
            if (r.ok) { m.close(); P.toast('ثبت‌نام‌ها پاک شد', 'ok'); P.refresh(); } else er.textContent = (r.json && r.json.message) || 'انجام نشد.';
          });
        } })
      ])
    ]);
  }

  /* ═════════ کاربران ═════════ */
  V.users = {
    title: 'کاربران پنل', icon: 'shield', roles: ['admin'],
    mount: function (root) {
      P.clear(root);
      root.appendChild(h('div', { class: 'alert', style: 'margin-bottom:14px;background:var(--surface-2);color:var(--ink-2)' }, [
        h('span', { class: 'sp', text: 'مدیر به همه‌ی بخش‌ها دسترسی دارد. «همکار ستاد» فقط شرکت‌کنندگان (بدون کد ملی)، حضور و غیاب، لیست انتظار و چک‌لیست را می‌بیند و فقط می‌تواند حضور، پرداخت و یادداشت را ثبت کند.' }),
        h('button', { class: 'b b--sm b--primary', type: 'button', text: 'افزودن کاربر', onclick: addUser }),
        h('button', { class: 'b b--sm', type: 'button', text: 'تغییر رمز من', onclick: function () { P.changePassword(false); } })
      ]));
      root.appendChild(h('div', { id: 'usrList' }));
      V.users.update();
    },
    update: function () {
      var box = document.getElementById('usrList'); if (!box) return;
      P.clear(box);
      var rows = P.D.users.map(function (u) {
        var me = u.id === P.me.id;
        var acts = [h('button', { class: 'b b--sm', type: 'button', text: 'بازنشانی رمز', onclick: function (e) { e.stopPropagation(); resetPw(u); } })];
        if (!me) {
          acts.push(h('button', { class: 'b b--sm', type: 'button', text: u.role === 'admin' ? 'تبدیل به همکار' : 'تبدیل به مدیر', onclick: function (e) {
            e.stopPropagation();
            P.confirm({ title: 'تغییر نقش ' + u.username, body: u.role === 'admin' ? 'این کاربر دیگر به تنظیمات، مالی و خروجی‌ها دسترسی ندارد.' : 'این کاربر به همه‌ی بخش‌ها از جمله اطلاعات هویتی دسترسی کامل پیدا می‌کند.', ok: 'تغییر بده' }).then(function (v) { if (v) P.act(P.api('POST', '/api/admin/users', { action: 'setRole', id: u.id, role: u.role === 'admin' ? 'staff' : 'admin' }), 'نقش تغییر کرد').then(P.refresh); });
          } }));
          acts.push(h('button', { class: 'b b--sm b--danger', type: 'button', text: 'حذف', onclick: function (e) {
            e.stopPropagation();
            P.confirm({ title: 'حذف کاربر', body: u.username + ' حذف می‌شود و از همه‌ی دستگاه‌ها خارج می‌شود.', ok: 'حذف', danger: true }).then(function (v) { if (v) P.act(P.api('POST', '/api/admin/users', { action: 'delete', id: u.id }), 'حذف شد').then(P.refresh); });
          } }));
        }
        return h('tr', { style: 'cursor:default' }, [
          h('td', { 'data-l': 'کاربر' }, [h('div', { class: 'nm', text: u.name + (me ? ' (شما)' : '') }), h('div', { class: 'sub', dir: 'ltr', style: 'text-align:right', text: u.username })]),
          h('td', { 'data-l': 'نقش' }, [h('span', { class: 'bd ' + (u.role === 'admin' ? 'bd--info' : ''), text: u.role === 'admin' ? 'مدیر' : 'همکار ستاد' }), u.mustChange ? h('span', { class: 'bd bd--warn', style: 'margin-inline-start:6px', text: 'رمز موقت' }) : null]),
          h('td', { class: 'num', 'data-l': 'آخرین ورود', text: u.lastLoginAt ? P.dt(u.lastLoginAt) : 'هنوز وارد نشده' }),
          h('td', { 'data-l': '' }, [h('div', { class: 'row' }, acts)])
        ]);
      });
      box.appendChild(h('div', { class: 'tbl-wrap' }, [h('table', { class: 'tbl' }, [h('thead', {}, [h('tr', {}, ['کاربر', 'نقش', 'آخرین ورود', ''].map(function (c) { return h('th', { text: c }); }))]), h('tbody', {}, rows)])]));
    }
  };
  function addUser() {
    var un = h('input', { dir: 'ltr', maxlength: '24', autocomplete: 'off', placeholder: 'مثلاً sara' }), nm = h('input', { maxlength: '40', placeholder: 'مثلاً سارا احمدی' }), pw = h('input', { type: 'text', dir: 'ltr', autocomplete: 'off', value: genPw() }), er = h('p', { class: 'err' });
    var role = h('select', {}, [h('option', { value: 'staff', text: 'همکار ستاد' }), h('option', { value: 'admin', text: 'مدیر' })]);
    var m = P.modal('افزودن کاربر', [
      h('div', { class: 'stack' }, [fld('نام‌کاربری (انگلیسی)', un), fld('نام نمایشی', nm), fld('نقش', role), fld('رمز موقت', pw, 'کاربر در اولین ورود ملزم به تغییر آن است. آن را از راه امن به او بدهید.'), er]),
      h('div', { class: 'row row--end mt' }, [
        h('button', { class: 'b', type: 'button', text: 'انصراف', onclick: function () { m.close(); } }),
        h('button', { class: 'b b--primary', type: 'button', text: 'افزودن', onclick: function () {
          P.api('POST', '/api/admin/users', { action: 'add', username: un.value, name: nm.value, role: role.value, password: pw.value }).then(function (r) {
            if (r.ok) { m.close(); P.toast('کاربر اضافه شد', 'ok'); P.refresh(); } else er.textContent = (r.json && r.json.message) || 'انجام نشد.';
          });
        } })
      ])
    ]);
  }
  function resetPw(u) {
    var pw = h('input', { type: 'text', dir: 'ltr', autocomplete: 'off', value: genPw() }), er = h('p', { class: 'err' });
    var m = P.modal('بازنشانی رمز ' + u.username, [
      h('div', { class: 'stack' }, [fld('رمز موقت جدید', pw, 'کاربر از همه‌ی دستگاه‌ها خارج می‌شود و باید در ورود بعدی رمز را عوض کند.'), er]),
      h('div', { class: 'row row--end mt' }, [
        h('button', { class: 'b', type: 'button', text: 'انصراف', onclick: function () { m.close(); } }),
        h('button', { class: 'b b--primary', type: 'button', text: 'بازنشانی', onclick: function () {
          P.api('POST', '/api/admin/users', { action: 'resetPassword', id: u.id, password: pw.value }).then(function (r) {
            if (r.ok) { m.close(); P.toast('رمز بازنشانی شد', 'ok'); P.refresh(); } else er.textContent = (r.json && r.json.message) || 'انجام نشد.';
          });
        } })
      ])
    ]);
  }
  function genPw() {
    var a = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789', b = new Uint8Array(12), s = '';
    (window.crypto || window.msCrypto).getRandomValues(b);
    for (var i = 0; i < b.length; i++) s += a[b[i] % a.length];
    return s;
  }

  /* ═════════ گزارش فعالیت ═════════ */
  P.UI.audit = { q: '', act: 'all', rows: null };
  V.audit = {
    title: 'گزارش فعالیت', icon: 'history', roles: ['admin'],
    mount: function (root) {
      var U = P.UI.audit;
      P.clear(root);
      var q = h('input', { class: 'in', type: 'search', placeholder: 'جستجو در کاربر و توضیحات', 'aria-label': 'جستجو', value: U.q });
      var sel = h('select', { class: 'in', style: 'width:auto', 'aria-label': 'نوع رویداد' }, [h('option', { value: 'all', text: 'همه‌ی رویدادها' })].concat(Object.keys(P.ACT).map(function (k) { return h('option', { value: k, text: P.ACT[k] }); })));
      sel.value = U.act;
      q.addEventListener('input', function () { U.q = q.value; draw(); });
      sel.addEventListener('change', function () { U.act = sel.value; draw(); });
      var wrap = h('div', { class: 'tbl-wrap' });
      function load() {
        P.api('GET', '/api/admin/audit').then(function (r) { if (r.ok) { U.rows = r.json.audit; draw(); } else P.toast('بارگذاری نشد.', 'err'); });
      }
      function draw() {
        P.clear(wrap);
        if (!U.rows) { wrap.appendChild(h('div', { class: 'empty', text: 'در حال بارگذاری…' })); return; }
        var s = JR.normText(JR.faToEn(U.q)).toLowerCase();
        var list = U.rows.filter(function (a) { return (U.act === 'all' || a.act === U.act) && (!s || (a.by + ' ' + a.detail).toLowerCase().indexOf(s) >= 0); });
        cnt.textContent = P.fa(list.length) + ' رویداد' + (U.rows.length >= 400 ? ' (۴۰۰ مورد آخر)' : '');
        if (!list.length) { wrap.appendChild(h('div', { class: 'empty', text: 'موردی پیدا نشد.' })); return; }
        wrap.appendChild(h('table', { class: 'tbl' }, [h('thead', {}, [h('tr', {}, ['زمان', 'کاربر', 'رویداد', 'توضیح'].map(function (c) { return h('th', { text: c }); }))]),
          h('tbody', {}, list.slice(0, 250).map(function (a) {
            return h('tr', { style: 'cursor:default' }, [
              h('td', { class: 'num', 'data-l': 'زمان', text: P.dt(a.t) }), h('td', { 'data-l': 'کاربر', dir: 'ltr', style: 'text-align:right', text: a.by }),
              h('td', { 'data-l': 'رویداد' }, [h('span', { class: 'bd ' + (a.act === 'login-fail' ? 'bd--err' : ''), text: P.ACT[a.act] || a.act })]), h('td', { 'data-l': 'توضیح', text: a.detail })
            ]);
          }))]));
      }
      var cnt = h('span', { class: 'hint' });
      root.appendChild(h('div', { class: 'tools' }, [h('div', { class: 'search' }, [P.ico('search'), q]), sel, h('button', { class: 'b', type: 'button', text: 'تازه‌سازی', onclick: load }), cnt]));
      root.appendChild(wrap);
      draw(); load();
    },
    update: function () { /* با دکمه‌ی تازه‌سازی */ }
  };
})();
