/* پنل برگزارکنندگان — هسته: ابزارهای DOM، فراخوانی API، پنجره‌ها، نمودارهای کوچک */
(function () {
  'use strict';
  var JR = window.JR;
  var P = window.P = { D: null, me: null, csrf: null, cur: null, views: {}, order: [], UI: {}, listeners: [], clock: { offset: 0, rtt: Infinity } };

  /* ───────────── DOM ───────────── */
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k === 'value') n.value = v;
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    });
    if (kids != null && !Array.isArray(kids)) kids = [kids];
    (kids || []).forEach(function (c) { if (c != null && c !== false) n.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c); });
    return n;
  }
  P.el = el;
  P.clear = function (n) { while (n.firstChild) n.removeChild(n.firstChild); return n; };
  P.$ = function (s, r) { return (r || document).querySelector(s); };

  var ICONS = {
    dash: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.4c2.2.7 3.5 2.6 3.5 5.6"/>',
    check: '<circle cx="12" cy="12" r="9"/><path d="m8 12.5 3 3 5-6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    wallet: '<rect x="3" y="6" width="18" height="14" rx="3"/><path d="M3 10h18M16.5 15h.01"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="m3.5 6 1 1 2-2M3.5 12l1 1 2-2M3.5 18l1 1 2-2"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.6M12 18.6v2.6M4.9 7l2.2 1.3M16.9 15.7 19.1 17M2.8 12h2.6M18.6 12h2.6M4.9 17l2.2-1.3M16.9 8.3 19.1 7"/>',
    shield: '<path d="M12 3 4.5 6v5.5c0 4.5 3 8 7.5 9.5 4.5-1.5 7.5-5 7.5-9.5V6L12 3Z"/><path d="m9 12 2 2 4-4"/>',
    history: '<path d="M3.5 12a8.5 8.5 0 1 0 3-6.5L3.5 8"/><path d="M3.5 3.5V8H8M12 8v4.5l3 1.5"/>',
    tool: '<path d="M14.5 6.5a4 4 0 0 0-5 5L3.5 17.5l3 3 6-6a4 4 0 0 0 5-5l-2.5 2.5-2-2 2.5-2.5Z"/>',
    logout: '<path d="M9 4H5.5A1.5 1.5 0 0 0 4 5.5v13A1.5 1.5 0 0 0 5.5 20H9"/><path d="m16 8 4 4-4 4M20 12H9"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4-4"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    download: '<path d="M12 4v11M7.5 11 12 15.5 16.5 11M5 20h14"/>',
    print: '<path d="M7 9V4h10v5M7 17H5.5A1.5 1.5 0 0 1 4 15.5v-5A1.5 1.5 0 0 1 5.5 9h13a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1-1.5 1.5H17"/><rect x="7" y="14" width="10" height="6" rx="1"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    home: '<path d="M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4v-5h-6v5H5a1 1 0 0 1-1-1v-7.5Z"/>',
    phone: '<path d="M6.5 4h3l1.5 4-2 1.3a10 10 0 0 0 5.7 5.7L16 13l4 1.5v3a2 2 0 0 1-2 2A14 14 0 0 1 4.5 6a2 2 0 0 1 2-2Z"/>',
    msg: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H10l-4.5 4V16h0A1.5 1.5 0 0 1 4 14.5v-9Z"/>'
  };
  P.ico = function (name) {
    var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'ico'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('focusable', 'false');
    s.innerHTML = ICONS[name] || '';
    return s;
  };
  P.svg = function (tag, attrs) {
    var n = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    return n;
  };

  /* ───────────── قالب‌بندی ───────────── */
  P.fa = JR.enToFa; P.num = JR.fmtNum;
  P.t = function (ms, sec) { return JR.fmtTime(ms, sec); };
  P.d = function (ms, o) { return JR.fmtDate(ms, o); };
  P.dt = function (ms) { return ms ? JR.fmtShort(ms) + ' ' + JR.fmtTime(ms) : '—'; };
  P.toman = function (n) { return n == null ? '—' : P.num(n) + ' تومان'; };
  P.now = function () { return performance.now() - P.clock.perf + P.clock.server; };
  P.statusBadge = function (r) {
    var m = { confirmed: ['قطعی', 'ok'], waitlist: ['لیست انتظار', 'warn'], cancelled: ['لغو شده', 'err'] }[r.status] || [r.status, ''];
    return el('span', { class: 'bd bd--' + m[1], text: m[0] });
  };
  P.payBadge = function (r) {
    var m = { paid: ['پرداخت شد', 'ok'], unpaid: ['پرداخت نشده', 'warn'], refunded: ['بازگشت وجه', 'info'] }[r.payment] || ['—', ''];
    return el('span', { class: 'bd bd--' + m[1], text: m[0] });
  };
  P.isAdmin = function () { return P.me && P.me.role === 'admin'; };

  /* ───────────── API ───────────── */
  P.api = function (method, url, body) {
    var o = { method: method, headers: {}, cache: 'no-store', credentials: 'same-origin' };
    if (method !== 'GET') o.headers['X-CSRF-Token'] = P.csrf || '';
    if (body !== undefined) { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(body); }
    return fetch(url, o).then(function (r) {
      return r.json().catch(function () { return { ok: false, message: 'پاسخ نامعتبر از سرور.' }; }).then(function (j) {
        if (r.status === 401 && url.indexOf('/login') < 0) { if (window.JR_clearToken) window.JR_clearToken(); location.replace('index.html'); }
        if (r.status === 403 && j && j.code === 'MUST_CHANGE' && P.forceChange) P.forceChange();
        return { status: r.status, json: j, ok: r.ok && j.ok !== false };
      });
    });
  };
  /** اجرای یک عملیات و نمایش نتیجه‌اش در پیام کوتاه */
  P.act = function (promise, okMsg) {
    return promise.then(function (r) {
      if (r.ok) { if (okMsg) P.toast(okMsg, 'ok'); }
      else P.toast((r.json && r.json.message) || 'انجام نشد.', 'err');
      return r;
    }).catch(function () { P.toast('اتصال به سرور برقرار نشد.', 'err'); return { ok: false, json: {} }; });
  };
  P.download = function (url, filename) {
    return fetch(url, { credentials: 'same-origin', cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('x');
      return r.blob();
    }).then(function (b) {
      var a = el('a', { href: URL.createObjectURL(b), download: filename });
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
    }).catch(function () { P.toast('دانلود انجام نشد.', 'err'); });
  };
  P.copy = function (text, msg) {
    function done() { P.toast(msg || 'کپی شد', 'ok'); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { P.toast('کپی نشد.', 'err'); });
    else { var t = el('textarea', { style: 'position:fixed;opacity:0' }); t.value = text; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); done(); } catch (e) { P.toast('کپی نشد.', 'err'); } t.remove(); }
  };

  /* ───────────── پیام کوتاه ───────────── */
  P.toast = function (msg, kind) {
    var box = P.$('#toasts');
    var t = el('div', { class: 'toast' + (kind ? ' toast--' + kind : ''), role: 'status', text: msg });
    box.appendChild(t);
    setTimeout(function () { t.remove(); }, kind === 'err' ? 5200 : 2600);
  };

  /* ───────────── پنجره و کشو ───────────── */
  var layers = function () { return P.$('#layers'); };
  P.modal = function (title, content, opts) {
    opts = opts || {};
    var scrim = el('div', { class: 'scrim' });
    var box = el('div', { class: 'modal__c', role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, [el('h2', { text: title })].concat(content));
    var wrap = el('div', { class: 'modal' }, [box]);
    var prevFocus = document.activeElement;
    function close(v) { scrim.remove(); wrap.remove(); document.removeEventListener('keydown', onKey, true); if (prevFocus && prevFocus.focus) try { prevFocus.focus(); } catch (e) { /* ignore */ } if (opts.onClose) opts.onClose(v); }
    function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); close(null); } }
    scrim.addEventListener('click', function () { close(null); });
    document.addEventListener('keydown', onKey, true);
    layers().appendChild(scrim); layers().appendChild(wrap);
    var first = box.querySelector('input,select,textarea,button.b--primary,button.b--danger');
    if (first) setTimeout(function () { first.focus(); }, 30);
    return { close: close, box: box };
  };
  /** تأیید با امکان گرفتن یک متن. نتیجه: true / متن / null */
  P.confirm = function (o) {
    return new Promise(function (resolve) {
      var input = null, err = el('p', { class: 'err' });
      var kids = [];
      if (o.body) kids.push(el('p', { text: o.body }));
      if (o.input) {
        input = el('input', { class: 'in', type: o.input.type || 'text', placeholder: o.input.placeholder || '', 'aria-label': o.input.label || '' });
        if (o.input.dir) input.setAttribute('dir', o.input.dir);
        kids.push(el('div', { class: 'fld' }, [o.input.label ? el('label', { text: o.input.label }) : null, input, err]));
      }
      var m;
      var ok = el('button', { class: 'b ' + (o.danger ? 'b--danger' : 'b--primary'), type: 'button', text: o.ok || 'تأیید', onclick: function () {
        if (input) {
          var v = input.value.trim();
          if (o.input.required && !v) { err.textContent = 'این مورد را پر کنید.'; input.focus(); return; }
          m.close(v || true); return;
        }
        m.close(true);
      } });
      var cancel = el('button', { class: 'b', type: 'button', text: 'انصراف', onclick: function () { m.close(null); } });
      kids.push(el('div', { class: 'row row--end mt' }, [cancel, ok]));
      m = P.modal(o.title, kids, { onClose: function (v) { resolve(v == null ? null : v); } });
      if (input) input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); ok.click(); } });
    });
  };
  var curDrawer = null;
  P.drawer = function (title, opts) {
    if (curDrawer) curDrawer.close();
    opts = opts || {};
    var scrim = el('div', { class: 'scrim' });
    var h2 = el('h2', { text: title });
    var body = el('div', { class: 'drawer__b' });
    var closeBtn = el('button', { class: 'xbtn', type: 'button', 'aria-label': 'بستن', onclick: function () { d.close(); } }, [P.ico('x')]);
    var box = el('aside', { class: 'drawer', role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, [el('div', { class: 'drawer__h' }, [h2, closeBtn]), body]);
    function onKey(e) { if (e.key === 'Escape' && !P.$('.modal')) d.close(); }
    var d = {
      body: body, setTitle: function (t) { h2.textContent = t; },
      close: function () { scrim.remove(); box.remove(); document.removeEventListener('keydown', onKey); if (curDrawer === d) curDrawer = null; if (opts.onClose) opts.onClose(); }
    };
    scrim.addEventListener('click', function () { d.close(); });
    document.addEventListener('keydown', onKey);
    layers().appendChild(scrim); layers().appendChild(box);
    curDrawer = d;
    return d;
  };
  P.drawerOpen = function () { return !!curDrawer; };

  /* ───────────── راهنمای نمودار (tooltip) ───────────── */
  var tipEl = null;
  P.tip = {
    show: function (text, x, y) {
      if (!tipEl) { tipEl = el('div', { class: 'tip', role: 'tooltip' }); document.body.appendChild(tipEl); }
      tipEl.textContent = text; tipEl.style.display = 'block';
      var w = tipEl.offsetWidth, h = tipEl.offsetHeight;
      var left = Math.min(Math.max(8, x - w / 2), window.innerWidth - w - 8);
      var top = y - h - 12; if (top < 8) top = y + 18;
      tipEl.style.left = left + 'px'; tipEl.style.top = top + 'px';
    },
    hide: function () { if (tipEl) tipEl.style.display = 'none'; }
  };

  /* ───────────── انتخابگر تاریخ و ساعت شمسی ───────────── */
  P.dtPicker = function (ms, opt) {
    opt = opt || {};
    var withTime = opt.time !== false, optional = !!opt.optional;
    var np = JR.tehranParts(Date.now());
    var sy = el('select', { 'aria-label': 'سال' }), sm = el('select', { 'aria-label': 'ماه' }), sd = el('select', { 'aria-label': 'روز' });
    var sh = el('select', { 'aria-label': 'ساعت' }), smi = el('select', { 'aria-label': 'دقیقه' });
    var prev = el('div', { class: 'hint' });
    if (optional) sy.appendChild(el('option', { value: '', text: '— تنظیم نشده —' }));
    for (var y = np.jy - 1; y <= np.jy + 3; y++) sy.appendChild(el('option', { value: y, text: JR.enToFa(y) }));
    JR.MONTHS.forEach(function (n, i) { sm.appendChild(el('option', { value: i + 1, text: n })); });
    for (var h = 0; h < 24; h++) sh.appendChild(el('option', { value: h, text: JR.enToFa(JR.pad2(h)) }));
    for (var mi = 0; mi < 60; mi++) smi.appendChild(el('option', { value: mi, text: JR.enToFa(JR.pad2(mi)) }));
    function days() {
      var keep = +sd.value || 1, n = JR.jalaliMonthLength(+sy.value || np.jy, +sm.value || 1);
      P.clear(sd);
      for (var d = 1; d <= n; d++) sd.appendChild(el('option', { value: d, text: JR.enToFa(d) }));
      sd.value = Math.min(keep, n);
    }
    function get() {
      if (optional && sy.value === '') return null;
      return JR.fromTehran(+sy.value, +sm.value, +sd.value, withTime ? +sh.value : 0, withTime ? +smi.value : 0);
    }
    function refresh() {
      var off = optional && sy.value === '';
      [sm, sd, sh, smi].forEach(function (s) { s.disabled = off; });
      var v = get();
      prev.textContent = v == null ? '' : JR.fmtDate(v, { time: withTime }) + (withTime ? ' (به وقت تهران)' : '');
    }
    function set(v) {
      if (v == null) { sy.value = ''; refresh(); return; }
      var p = JR.tehranParts(v);
      if (![].some.call(sy.options, function (o) { return +o.value === p.jy; })) sy.appendChild(el('option', { value: p.jy, text: JR.enToFa(p.jy) }));
      sy.value = p.jy; sm.value = p.jm; days(); sd.value = p.jd; sh.value = p.h; smi.value = p.mi; refresh();
    }
    sy.addEventListener('change', function () { days(); refresh(); });
    sm.addEventListener('change', function () { days(); refresh(); });
    [sd, sh, smi].forEach(function (s) { s.addEventListener('change', refresh); });
    var row = el('div', { class: 'dt' }, [sy, sm, sd].concat(withTime ? [el('span', { text: 'ساعت' }), sh, el('span', { text: ':' }), smi] : []));
    days();
    if (ms == null && !optional) ms = Date.now();
    set(ms);
    return { el: el('div', { class: 'stack', style: 'gap:6px' }, [row, prev]), get: get, set: set };
  };

  /* ───────────── چاپ ───────────── */
  P.print = function (title, sub, head, rows) {
    var area = P.clear(P.$('#printArea'));
    area.appendChild(el('h1', { text: title }));
    area.appendChild(el('p', { text: sub }));
    var thead = el('tr', {}, head.map(function (h) { return el('th', { text: h }); }));
    var tbody = rows.map(function (r) { return el('tr', {}, r.map(function (c) { return el('td', { class: c === '' ? 'sig' : '', text: String(c) }); })); });
    area.appendChild(el('table', {}, [el('thead', {}, [thead]), el('tbody', {}, tbody)]));
    document.body.classList.add('printing');
    var cleanup = function () { document.body.classList.remove('printing'); window.removeEventListener('afterprint', cleanup); };
    window.addEventListener('afterprint', cleanup);
    setTimeout(function () { window.print(); }, 60);
  };

  /* ───────────── نمودار: ظرفیت پر شده در طول زمان ───────────── */
  P.fillChart = function (times, capacity, openAt) {
    if (!times.length) return el('div', { class: 'empty', text: 'هنوز ثبت‌نامی انجام نشده است.' });
    var holder = el('div', {}), curW = 0;
    function mountAt() {
      var w = Math.round(holder.clientWidth || 600);
      if (curW && Math.abs(w - curW) < 6) return;
      curW = w; P.clear(holder);
      holder.appendChild(drawFill(times, capacity, openAt, Math.max(260, Math.min(w, 900))));
    }
    requestAnimationFrame(function () { mountAt(); if (window.ResizeObserver) new ResizeObserver(mountAt).observe(holder); });
    return holder;
  };
  function drawFill(times, capacity, openAt, W) {
    var H = W < 420 ? 200 : 240, ml = 34, mr = 12, mt = 14, mb = 30;
    var svg = P.svg('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'chart', role: 'img', 'aria-label': 'تعداد ثبت‌نام‌های قطعی در طول زمان' });
    if (!times.length) return el('div', { class: 'empty', text: 'هنوز ثبت‌نامی انجام نشده است.' });
    var t0 = Math.min(times[0], openAt && openAt < times[0] && times[0] - openAt < 6 * 3600e3 ? openAt : times[0]);
    var t1 = Math.max(times[times.length - 1], t0 + 60000);
    var yMax = Math.max(capacity, times.length);
    function x(t) { return W - mr - (1 - (t - t0) / (t1 - t0)) * (W - ml - mr) - 0; }
    // RTL: زمان از راست به چپ
    function X(t) { return W - mr - ((t - t0) / (t1 - t0)) * (W - ml - mr); }
    function Y(n) { return mt + (1 - n / yMax) * (H - mt - mb); }
    var step = yMax <= 20 ? 5 : yMax <= 60 ? 10 : yMax <= 120 ? 20 : 50;
    for (var g = 0; g <= yMax; g += step) {
      svg.appendChild(P.svg('line', { x1: ml, x2: W - mr, y1: Y(g), y2: Y(g), class: g === 0 ? 'axis' : 'grid-l' }));
      var lb = P.svg('text', { x: ml - 8, y: Y(g) + 4, 'text-anchor': 'end' }); lb.textContent = JR.enToFa(g); svg.appendChild(lb);
    }
    var pts = [[X(t0), Y(0)]];
    times.forEach(function (t, i) { pts.push([X(t), Y(i)]); pts.push([X(t), Y(i + 1)]); });
    pts.push([X(Math.max(t1, times[times.length - 1])), Y(times.length)]);
    var line = 'M' + pts.map(function (p) { return p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' L');
    svg.appendChild(P.svg('path', { d: line + ' L' + pts[pts.length - 1][0].toFixed(1) + ' ' + Y(0) + ' L' + pts[0][0].toFixed(1) + ' ' + Y(0) + ' Z', class: 'ar' }));
    svg.appendChild(P.svg('path', { d: line, class: 'ln' }));
    var ax = [[t0, 'start'], [t1, 'end']];
    ax.forEach(function (a) { var tx = P.svg('text', { x: X(a[0]), y: H - 10, 'text-anchor': a[1] === 'start' ? 'start' : 'end' }); tx.textContent = P.t(a[0], true); svg.appendChild(tx); });
    var capLine = Y(capacity);
    if (capacity <= yMax) { var cl = P.svg('text', { x: W - mr, y: capLine - 5, 'text-anchor': 'start' }); cl.textContent = ''; svg.appendChild(cl); }
    var hov = P.svg('line', { class: 'hov', y1: mt, y2: H - mb, style: 'display:none' });
    var dot = P.svg('circle', { r: 4.5, class: 'pt', style: 'display:none' });
    svg.appendChild(hov); svg.appendChild(dot);
    var wrap = el('div', {}, [svg]);
    function move(e) {
      var r = svg.getBoundingClientRect(); var cx = ((e.touches ? e.touches[0].clientX : e.clientX) - r.left) / r.width * W;
      var best = 0, bd = 1e9;
      times.forEach(function (t, i) { var dd = Math.abs(X(t) - cx); if (dd < bd) { bd = dd; best = i; } });
      var t = times[best], px = X(t);
      hov.setAttribute('x1', px); hov.setAttribute('x2', px); hov.style.display = '';
      dot.setAttribute('cx', px); dot.setAttribute('cy', Y(best + 1)); dot.style.display = '';
      P.tip.show('نفر ' + JR.enToFa(best + 1) + ' — ساعت ' + P.t(t, true), r.left + px / W * r.width, r.top + Y(best + 1) / H * r.height);
    }
    function leave() { hov.style.display = 'none'; dot.style.display = 'none'; P.tip.hide(); }
    svg.addEventListener('mousemove', move); svg.addEventListener('mouseleave', leave);
    svg.addEventListener('touchstart', move, { passive: true }); svg.addEventListener('touchmove', move, { passive: true }); svg.addEventListener('touchend', leave);
    return wrap;
  }

  /** نمودار میله‌ای افقی ساده (یک سری، یک رنگ) */
  P.hbars = function (rows, total) {
    if (!rows.length) return el('div', { class: 'empty', text: 'داده‌ای نیست.' });
    var max = Math.max.apply(null, rows.map(function (r) { return r.n; }));
    return el('div', { class: 'hb' }, rows.slice(0, 8).map(function (r) {
      var bar = el('div', { class: 'hb__t' }, [el('i', { style: 'width:' + Math.max(2, r.n / max * 100) + '%' })]);
      var row = el('div', { class: 'hb__r' }, [el('span', { text: r.label }), bar, el('b', { class: 'hb__v', text: P.num(r.n) })]);
      row.addEventListener('mousemove', function (e) { P.tip.show(r.label + ': ' + P.num(r.n) + ' نفر' + (total ? ' (' + P.fa(Math.round(r.n / total * 100)) + '٪)' : ''), e.clientX, e.clientY); });
      row.addEventListener('mouseleave', P.tip.hide);
      return row;
    }));
  };

  /** میله‌ی دو بخشی (مثلاً پرداخت‌شده / پرداخت‌نشده) با برچسب مستقیم */
  P.splitBar = function (a, b, la, lb) {
    var tot = a + b || 1;
    var bar = el('div', { class: 'bar', role: 'img', 'aria-label': la + ' ' + a + '، ' + lb + ' ' + b }, [
      a > 0 ? el('i', { class: 's1', style: 'width:' + a / tot * 100 + '%' }) : null, b > 0 ? el('i', { class: 's2', style: 'width:' + b / tot * 100 + '%' }) : null
    ]);
    var legend = el('div', { class: 'legend' }, [
      el('span', {}, [el('i', { style: 'background:var(--chart-1)' }), la + ': ' + P.num(a)]),
      el('span', {}, [el('i', { style: 'background:var(--chart-2)' }), lb + ': ' + P.num(b)])
    ]);
    return el('div', {}, [bar, legend]);
  };

  /* برچسب‌های گزارش فعالیت */
  P.ACT = {
    login: 'ورود', 'login-fail': 'ورود ناموفق', logout: 'خروج', password: 'تغییر رمز', cancel: 'لغو ثبت‌نام', restore: 'بازگردانی ثبت‌نام',
    promote: 'ارتقا از لیست انتظار', payment: 'وضعیت پرداخت', checkin: 'ثبت حضور', uncheckin: 'لغو حضور', note: 'یادداشت', edit: 'ویرایش اطلاعات',
    add: 'افزودن دستی', settings: 'تغییر تنظیمات', control: 'کنترل ثبت‌نام', whitelist: 'فهرست دانشجویان', expense: 'هزینه',
    reset: 'پاک‌سازی ثبت‌نام‌ها', export: 'خروجی گرفتن', backup: 'پشتیبان‌گیری', 'user-add': 'افزودن کاربر', 'user-delete': 'حذف کاربر',
    'user-reset': 'بازنشانی رمز کاربر', 'user-role': 'تغییر نقش', 'reset-admin': 'بازنشانی رمز مدیر'
  };
})();
