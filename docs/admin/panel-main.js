/* پنل برگزارکنندگان — راه‌انداز: ورود به نشست، ناوبری، همگام‌سازی ساعت و بروزرسانی زنده */
(function () {
  'use strict';
  var P = window.P, JR = window.JR, h = P.el, V = P.views;
  P.order = ['dashboard', 'people', 'checkin', 'waitlist', 'finance', 'tasks', 'tools', 'settings', 'users', 'audit'];
  var SEP_BEFORE = { finance: true, settings: true };
  var CFG = window.JR_CONFIG || {}, POLL_MS = CFG.adminPollMs || 15000, POLL_HIDDEN_MS = CFG.adminPollHiddenMs || 90000;
  var app = document.getElementById('app'), viewRoot = null, sideEl = null, scrimEl = null, pollTimer = null, online = true, shell = null;

  /* ───────────── ساعت سرور ───────────── */
  function syncClock(serverNow, t0, t1) {
    var rtt = t1 - t0, c = P.clock;
    if (!isFinite(c.rtt) || rtt <= c.rtt + 40 || t1 - (c.perf || 0) > 60000) {
      c.perf = (t0 + t1) / 2; c.server = serverNow; c.rtt = rtt;
    }
    c.skew = Date.now() - P.now();
  }

  /* ───────────── تم ───────────── */
  var THEME_KEY = 'jr_admin_theme';
  function themeGet() { try { return localStorage.getItem(THEME_KEY) || 'auto'; } catch (e) { return 'auto'; } }
  function themeApply(t) {
    var r = document.documentElement;
    if (t === 'auto') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', t);
    var m = document.querySelector('meta[name=theme-color]'); if (m) m.setAttribute('content', '#06142b');
  }
  themeApply(themeGet());
  function themeCycle() {
    var n = { auto: 'dark', dark: 'light', light: 'auto' }[themeGet()] || 'auto';
    try { localStorage.setItem(THEME_KEY, n); } catch (e) { /* ignore */ }
    themeApply(n); var b = document.getElementById('themeBtn'); if (b) b.lastChild.textContent = themeLabel();
  }
  function themeLabel() { return { auto: 'تم: خودکار', dark: 'تم: تیره', light: 'تم: روشن' }[themeGet()]; }

  /* ───────────── تغییر رمز ───────────── */
  P.changePassword = function (forced) {
    var cur = h('input', { type: 'password', autocomplete: 'current-password' }), n1 = h('input', { type: 'password', autocomplete: 'new-password' }), n2 = h('input', { type: 'password', autocomplete: 'new-password' }), er = h('p', { class: 'err' });
    function field(l, i, hint) { return h('div', { class: 'fld' }, [h('label', { text: l }), i, hint ? h('div', { class: 'hint', text: hint }) : null]); }
    function submit(done) {
      er.textContent = '';
      if (n1.value.length < 8) { er.textContent = 'رمز جدید باید دست‌کم ۸ نویسه باشد.'; n1.focus(); return; }
      if (n1.value !== n2.value) { er.textContent = 'تکرار رمز با رمز جدید یکی نیست.'; n2.focus(); return; }
      P.api('POST', '/api/admin/password', { current: cur.value, next: n1.value }).then(function (r) {
        if (r.ok) { P.toast('رمز عبور تغییر کرد', 'ok'); done(); } else er.textContent = (r.json && r.json.message) || 'انجام نشد.';
      });
    }
    var fields = h('div', { class: 'stack' }, [field('رمز فعلی', cur), field('رمز جدید', n1, 'دست‌کم ۸ نویسه؛ ترکیب حرف، رقم و نماد بهتر است.'), field('تکرار رمز جدید', n2), er]);
    if (forced) {
      P.clear(app); app.className = '';
      var btn = h('button', { class: 'b b--primary b--block', type: 'button', text: 'ذخیره و ادامه', onclick: function () { submit(function () { P.me.mustChange = false; boot(); }); } });
      app.appendChild(h('div', { class: 'card center-card stack' }, [
        h('h1', { style: 'font-size:1.25rem;font-weight:800', text: 'رمز عبور خود را عوض کنید' }),
        h('p', { class: 'hint', text: 'این رمز موقت است. برای امنیت پنل، پیش از ادامه یک رمز تازه انتخاب کنید.' }), fields, btn,
        h('button', { class: 'b b--sm', type: 'button', text: 'خروج', onclick: logout })
      ]));
      [cur, n1, n2].forEach(function (i) { i.addEventListener('keydown', function (e) { if (e.key === 'Enter') btn.click(); }); });
      cur.focus();
      return;
    }
    var m = P.modal('تغییر رمز عبور', [fields, h('div', { class: 'row row--end mt' }, [
      h('button', { class: 'b', type: 'button', text: 'انصراف', onclick: function () { m.close(); } }),
      h('button', { class: 'b b--primary', type: 'button', text: 'ذخیره', onclick: function () { submit(function () { m.close(); }); } })
    ])]);
  };
  P.forceChange = function () { if (!app.querySelector('.center-card')) P.changePassword(true); };

  function logout() {
    P.api('POST', '/api/admin/logout').then(function () { location.replace('index.html'); }, function () { location.replace('index.html'); });
  }

  /* ───────────── ساختار صفحه ───────────── */
  function allowed(name) { var v = V[name]; return !!v && v.roles.indexOf(P.me.role) >= 0; }

  function buildShell() {
    P.clear(app); app.className = 'app';
    var nav = h('nav', { class: 'nav', 'aria-label': 'بخش‌های پنل' });
    P.order.filter(allowed).forEach(function (k) {
      if (SEP_BEFORE[k] && P.me.role === 'admin') nav.appendChild(h('div', { class: 'nav-sep' }));
      nav.appendChild(h('button', { type: 'button', 'data-k': k, onclick: function () { P.go(k); closeSide(); } }, [P.ico(V[k].icon), h('span', { text: V[k].title }), h('span', { class: 'cnt', 'data-c': k, hidden: '' })]));
    });
    sideEl = h('aside', { class: 'side', id: 'side' }, [
      h('div', { class: 'side__brand' }, [h('img', { src: '../assets/logo-jaryan.svg', alt: 'جریان' }), h('small', { text: 'پنل برگزارکنندگان' })]),
      h('div', { class: 'side__user' }, [h('b', { text: P.me.name }), h('span', { text: P.me.role === 'admin' ? 'مدیر' : 'همکار ستاد' })]),
      nav,
      h('div', { class: 'side__foot' }, [
        h('a', { href: '../', target: '_blank', rel: 'noopener' }, [P.ico('home'), 'صفحه‌ی ثبت‌نام']),
        h('button', { type: 'button', id: 'themeBtn', onclick: themeCycle }, [P.ico('gear'), themeLabel()]),
        h('button', { type: 'button', onclick: function () { P.changePassword(false); } }, [P.ico('shield'), 'تغییر رمز']),
        h('button', { type: 'button', onclick: logout }, [P.ico('logout'), 'خروج'])
      ])
    ]);
    var titleEl = h('h1', { id: 'viewTitle' });
    var net = h('span', { class: 'bd bd--err', id: 'netBadge', hidden: '', text: 'ارتباط با سرور قطع است' });
    var main = h('main', { class: 'main', id: 'main' }, [
      h('header', { class: 'top' }, [
        h('button', { class: 'b menu-btn', type: 'button', 'aria-label': 'منو', 'aria-controls': 'side', onclick: openSide }, [P.ico('menu')]),
        titleEl, net, h('span', { class: 'top__sp' }),
        h('span', { class: 'clock', title: 'ساعت سرور (وقت تهران)' }, ['ساعت سرور ', h('b', { id: 'clockV', text: '—' })])
      ]),
      h('div', { id: 'viewRoot' })
    ]);
    app.appendChild(sideEl); app.appendChild(main);
    viewRoot = document.getElementById('viewRoot');
  }
  function openSide() {
    sideEl.classList.add('open');
    if (!scrimEl) { scrimEl = h('div', { class: 'scrim', style: 'z-index:29', onclick: closeSide }); document.getElementById('layers').appendChild(scrimEl); }
  }
  function closeSide() { if (sideEl) sideEl.classList.remove('open'); if (scrimEl) { scrimEl.remove(); scrimEl = null; } }

  function updateChrome() {
    if (!shell) return;
    var D = P.D, S = D.stats;
    var counts = { people: S.confirmed + S.waitlist, waitlist: S.waitlist, tasks: S.tasks.total - S.tasks.done, checkin: null };
    [].forEach.call(document.querySelectorAll('.nav [data-c]'), function (e) {
      var v = counts[e.getAttribute('data-c')];
      if (v) { e.textContent = JR.enToFa(v); e.hidden = false; } else e.hidden = true;
    });
  }

  /* ───────────── ناوبری ───────────── */
  P.navArgs = null;
  /* مسیریابی با نشانی صفحه (#/نام). نسخه‌ی نمایشی این بخش را عوض می‌کند. */
  P.route = P.route || {
    get: function () { return (location.hash.match(/^#\/(\w+)/) || [])[1]; },
    set: function (n) { location.hash = '#/' + n; },
    listen: function (fn) { window.addEventListener('hashchange', fn); }
  };
  P.go = function (name, args) {
    P.navArgs = args || null;
    if (P.route.get() === name) route(); else P.route.set(name);
  };
  function route() {
    if (!shell || !P.D) return;
    var name = P.route.get();
    if (!allowed(name)) name = 'dashboard';
    var args = P.navArgs; P.navArgs = null;
    P.cur = name;
    [].forEach.call(document.querySelectorAll('.nav button[data-k]'), function (b) { if (b.getAttribute('data-k') === name) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    document.getElementById('viewTitle').textContent = V[name].title;
    document.title = V[name].title + ' — پنل جریان';
    P.clear(viewRoot);
    viewRoot.style.maxWidth = V[name].maxWidth || '';
    V[name].mount(viewRoot, args);
    window.scrollTo(0, 0);
  }
  P.route.listen(route);

  /* ───────────── بروزرسانی زنده ───────────── */
  function signature(j) {
    var s = Object.assign({}, j.stats); delete s.now;
    return JSON.stringify([j.settings, s, j.registrations, j.expenses, j.tasks, j.users, j.publicPhase, j.whitelistCount]);
  }
  function setOnline(v) {
    if (online === v) return; online = v;
    var b = document.getElementById('netBadge'); if (b) b.hidden = v;
  }
  P.refresh = function () {
    var t0 = performance.now();
    return P.api('GET', '/api/admin/data').then(function (r) {
      var t1 = performance.now();
      if (!r.ok) { if (r.status >= 500 || !r.status) setOnline(false); return r; }
      setOnline(true);
      var j = r.json; syncClock(j.now, t0, t1);
      var sig = signature(j), changed = sig !== P.sig; P.sig = sig;
      P.D = j; P.me = j.user;
      if (shell && changed) {
        updateChrome();
        var v = V[P.cur];
        if (v) { if (v.update) v.update(); else v.mount(viewRoot, null); }
      }
      return r;
    }, function () { setOnline(false); return { ok: false, json: {} }; });
  };
  function schedulePoll() {
    clearTimeout(pollTimer);
    pollTimer = setTimeout(function () { P.refresh().then(schedulePoll, schedulePoll); }, document.hidden ? POLL_HIDDEN_MS : POLL_MS);
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden && shell) { P.refresh(); schedulePoll(); } });

  setInterval(function () {
    var c = document.getElementById('clockV');
    if (c && P.clock.perf != null) c.textContent = JR.enToFa(JR.fmtTime(P.now(), true));
    if (shell && V[P.cur] && V[P.cur].tick && P.D) V[P.cur].tick();
  }, 250);

  /* ───────────── راه‌اندازی ───────────── */
  function boot() {
    P.clear(app);
    var t0 = performance.now();
    P.api('GET', '/api/admin/me').then(function (r) {
      var t1 = performance.now();
      if (!r.ok) {
        if (r.status === 401) { location.replace('index.html'); return; }
        app.appendChild(h('div', { class: 'card center-card stack' }, [h('p', { text: (r.json && r.json.message) || 'پنل بارگذاری نشد.' }), h('button', { class: 'b b--primary', type: 'button', text: 'تلاش دوباره', onclick: boot })]));
        return;
      }
      P.me = r.json.user; P.csrf = r.json.csrf; syncClock(r.json.now, t0, t1);
      if (P.me.mustChange) { P.changePassword(true); return; }
      P.refresh().then(function (d) {
        if (!d.ok || !P.D) { app.appendChild(h('div', { class: 'card center-card stack' }, [h('p', { text: 'داده‌های پنل بارگذاری نشد.' }), h('button', { class: 'b b--primary', type: 'button', text: 'تلاش دوباره', onclick: boot })])); return; }
        shell = true; buildShell(); updateChrome(); route(); schedulePoll();
      });
    }, function () {
      app.appendChild(h('div', { class: 'card center-card stack' }, [h('p', { text: 'اتصال به سرور برقرار نشد.' }), h('button', { class: 'b b--primary', type: 'button', text: 'تلاش دوباره', onclick: boot })]));
    });
  }
  boot();
})();
