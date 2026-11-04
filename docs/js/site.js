/* منطق صفحه‌ی عمومی ثبت‌نام
 * - ساعت سرور مبنای شمارش معکوس است (نه ساعت گوشی)
 * - فرم از قبل پر می‌شود و دکمه در لحظه‌ی شروع فعال می‌شود
 * - همه‌ی متن‌های پویا با textContent درج می‌شوند (امن در برابر XSS)
 */
(function () {
  'use strict';

  var fa = JR.enToFa, num = JR.fmtNum;
  var $ = function (s, r) { return (r || document).querySelector(s); };

  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'text') n.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), attrs[k]);
      else n.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c != null) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }
  function svgEl(tag, attrs) {
    var n = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    return n;
  }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } }

  var S = {
    st: null,            // آخرین وضعیت دریافتی از سرور
    anchor: null,        // { perf, server } برای برآورد ساعت سرور
    bestRtt: Infinity,
    stateKey: '',
    busy: false,
    mine: null,          // ثبت‌نام همین دستگاه
    showForm: true,
    pollTimer: null,
    prevPhase: null,
    circuit: null,
    offline: false
  };

  /* ───────────── ساعت سرور ───────────── */
  function serverNow() { return S.anchor ? S.anchor.server + (performance.now() - S.anchor.perf) : Date.now(); }

  function api(method, url, body) {
    var opts = { method: method, cache: 'no-store', headers: {} };
    if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    return fetch(url, opts).then(function (r) {
      return r.json().catch(function () { return { ok: false, code: 'BAD_RESPONSE', message: 'پاسخ نامعتبر از سرور.' }; })
        .then(function (j) { return { status: r.status, json: j }; });
    });
  }

  function poll() {
    clearTimeout(S.pollTimer);
    var t0 = performance.now();
    return api('GET', 'api/status').then(function (r) {
      var rtt = performance.now() - t0;
      if (!r.json || !r.json.ok) throw new Error('bad');
      var j = r.json;
      if (!S.anchor || rtt <= S.bestRtt * 1.3 || performance.now() - S.anchor.perf > 20000) {
        S.anchor = { perf: performance.now(), server: j.serverTime + rtt / 2 };
        S.bestRtt = Math.min(rtt, S.bestRtt === Infinity ? rtt : S.bestRtt * 1.5);
      }
      S.offline = false;
      onStatus(j);
    }).catch(function () {
      S.offline = true;
      renderState(true);
    }).then(schedule);
  }

  function schedule() {
    var st = S.st, d = 3000;
    if (!st) d = 2000;
    else if (st.phase === 'before' && st.openAtMs) {
      var left = st.openAtMs - serverNow();
      d = left > 120000 ? 8000 : left > 20000 ? 3000 : 1000;
    } else if (st.phase === 'open') d = 2500;
    else d = 8000;
    if (S.offline) d = 3000;
    var CFG = window.JR_CONFIG || {};
    d = Math.max(d, CFG.minPollMs || 0);                        // پشتیبان Apps Script همزمانیِ محدودی دارد
    clearTimeout(S.pollTimer);
    S.pollTimer = setTimeout(poll, d + Math.random() * Math.max(400, d * 0.4));
  }

  /* ───────────── مدار ۴۰ گره ───────────── */
  function buildCircuit(cap) {
    var svg = $('#circuit');
    Array.prototype.slice.call(svg.querySelectorAll(':scope > :not(title)')).forEach(function (n) { svg.removeChild(n); });
    var cols = cap <= 48 ? 8 : cap <= 90 ? 10 : 12;
    var rows = Math.ceil(cap / cols), pad = 25, sx = (400 - pad * 2) / (cols - 1), sy = 50;
    var H = pad * 2 + (rows - 1) * sy;
    svg.setAttribute('viewBox', '0 0 400 ' + H);
    var pts = [], len = [0];
    for (var k = 0; k < cap; k++) {
      var r = Math.floor(k / cols), c = k % cols;
      var x = r % 2 === 0 ? 400 - pad - c * sx : pad + c * sx;
      pts.push([x, pad + r * sy]);
      if (k) len.push(len[k - 1] + Math.abs(pts[k][0] - pts[k - 1][0]) + Math.abs(pts[k][1] - pts[k - 1][1]));
    }
    var total = len[cap - 1] || 1;
    var d = 'M' + pts.map(function (p) { return p[0].toFixed(1) + ' ' + p[1]; }).join(' L');
    var nodeR = Math.min(10, sx * 0.24);

    var uid = 'mk' + Math.floor(Math.random() * 1e6);
    var defs = svgEl('defs');
    var mask = svgEl('mask', { id: uid, maskUnits: 'userSpaceOnUse', x: -20, y: -20, width: 440, height: H + 40 });
    var maskPath = svgEl('path', { d: d, fill: 'none', stroke: '#fff', 'stroke-width': 12, 'stroke-dasharray': total + ' ' + (total + 20), 'stroke-dashoffset': total + 20, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    maskPath.style.transition = 'stroke-dashoffset 1s cubic-bezier(.3,.7,.2,1)';
    mask.appendChild(maskPath); defs.appendChild(mask); svg.appendChild(defs);

    svg.appendChild(svgEl('path', { d: d, class: 'wire' }));
    var on = svgEl('path', { d: d, class: 'wire wire--on', 'stroke-dasharray': total + ' ' + (total + 20), 'stroke-dashoffset': total + 20 });
    svg.appendChild(on);
    svg.appendChild(svgEl('path', { d: d, class: 'flow', mask: 'url(#' + uid + ')' }));

    var nodes = [];
    pts.forEach(function (p, i) {
      var n = svgEl('circle', { cx: p[0], cy: p[1], r: nodeR, class: 'node' });
      n.style.setProperty('--i', i);
      svg.appendChild(n);
      svg.appendChild(svgEl('circle', { cx: p[0], cy: p[1], r: (nodeR * 0.36).toFixed(2), class: 'pad' }));
      nodes.push(n);
    });
    S.circuit = { cap: cap, total: total, len: len, nodes: nodes, on: on, mask: maskPath, taken: 0 };
  }

  function setTaken(n, animate) {
    var C = S.circuit; if (!C) return;
    n = Math.max(0, Math.min(C.cap, n));
    var off = n <= 1 ? C.total + 20 : C.total - C.len[n - 1];
    var prev = C.taken;
    C.nodes.forEach(function (node, i) {
      node.style.transitionDelay = animate && i >= prev && i < n ? (i - prev) * 70 + 'ms' : '0ms';
      node.classList.toggle('on', i < n);
    });
    C.on.style.transition = animate ? '' : 'none';
    C.mask.style.transition = animate ? 'stroke-dashoffset 1s cubic-bezier(.3,.7,.2,1)' : 'none';
    C.on.setAttribute('stroke-dashoffset', off);
    C.mask.setAttribute('stroke-dashoffset', off);
    C.taken = n;
  }

  function circuitMode(phase, taken) {
    var box = $('#circuit');
    box.classList.toggle('is-live', phase === 'open' && taken > 0);
    box.classList.toggle('is-done', phase === 'full');
  }
  function playWave() {
    var box = $('#circuit');
    box.classList.remove('is-wave'); void box.getBoundingClientRect(); box.classList.add('is-wave');
    setTimeout(function () { box.classList.remove('is-wave'); }, 2200);
  }

  /* ───────────── کارت وضعیت ───────────── */
  var UNITS = [['روز', 86400000], ['ساعت', 3600000], ['دقیقه', 60000], ['ثانیه', 1000]];

  function digitsSpans(str) {
    var f = document.createDocumentFragment();
    String(str).split('').forEach(function (ch) { f.appendChild(el('i', { text: ch })); });
    return f;
  }

  function stateKeyOf(st) {
    return [S.offline && !st ? 'off' : '', st && st.phase, st && st.closedReason, st && st.waitlist && st.waitlist.open, st && !!st.openAtMs].join('|');
  }

  function renderState(force) {
    var st = S.st, box = $('#state');
    if (!st) {
      if (S.offline) {
        box.textContent = '';
        box.appendChild(el('div', { class: 'state__head' }, [el('span', { class: 'dot dot--err' }), 'اتصال برقرار نیست']));
        box.appendChild(el('p', { class: 'state__sub', text: 'اینترنتت را بررسی کن. صفحه خودش دوباره تلاش می‌کند.' }));
        S.stateKey = 'off';
      }
      return;
    }
    var key = stateKeyOf(st);
    if (key !== S.stateKey || force === 'rebuild') { S.stateKey = key; buildState(st, box); }
    updateStateValues(st);
  }

  function buildState(st, box) {
    box.textContent = '';
    var cap = st.capacity;
    if (st.phase === 'before') {
      box.appendChild(el('div', { class: 'state__head' }, [el('span', { class: 'dot' }), 'ثبت‌نام هنوز شروع نشده']));
      if (st.openAtMs) {
        box.appendChild(el('p', { class: 'state__sub', text: 'ثبت‌نام باز می‌شود تا' }));
        var cd = el('div', { class: 'cd', role: 'timer' });
        UNITS.forEach(function (u, i) {
          cd.appendChild(el('div', { class: 'cd__u' }, [el('b', { class: 'cd__v', id: 'cd' + i }), el('span', { class: 'cd__l', text: u[0] })]));
        });
        box.appendChild(cd);
        box.appendChild(el('p', { class: 'state__when' }, ['شروع: ', el('b', { text: JR.fmtDate(st.openAtMs, { time: true }) })]));
      } else {
        box.appendChild(el('p', { class: 'state__sub', text: 'زمان شروع ثبت‌نام به‌زودی اعلام می‌شود. فرم را می‌توانی از همین حالا پر کنی.' }));
      }
    } else if (st.phase === 'open') {
      box.appendChild(el('div', { class: 'state__head' }, [el('span', { class: 'dot dot--live' }), 'ثبت‌نام باز است']));
      box.appendChild(el('div', { class: 'meter' }, [el('b', { id: 'mTaken' }), el('span', { id: 'mOf' })]));
      box.appendChild(el('p', { class: 'state__left', id: 'mLeft' }));
      box.appendChild(el('a', { class: 'btn btn--amber', href: '#register', text: 'همین حالا ثبت‌نام کن' }));
    } else if (st.phase === 'full') {
      box.appendChild(el('div', { class: 'state__head' }, [el('span', { class: 'dot dot--off' }), 'ثبت‌نام بسته شد']));
      box.appendChild(el('p', { class: 'state__big', id: 'fullBig' }));
      box.appendChild(el('p', { class: 'state__sub', id: 'fullSub' }));
      if (st.waitlist && st.waitlist.open) {
        box.appendChild(el('a', { class: 'btn btn--amber', href: '#register', text: 'ورود به لیست انتظار' }));
      }
    } else { // closed
      box.appendChild(el('div', { class: 'state__head' }, [el('span', { class: 'dot dot--off' }), 'ثبت‌نام بسته است']));
      box.appendChild(el('p', { class: 'state__sub', text: st.closedReason === 'time' ? 'مهلت ثبت‌نام به پایان رسیده است.' : 'ثبت‌نام فعلاً بسته است. خبر شروع دوباره را از کانال جریان دنبال کن.' }));
    }
  }

  function updateStateValues(st) {
    var now = serverNow(), t;
    if (st.phase === 'before' && st.openAtMs && $('#cd0')) {
      var left = Math.max(0, st.openAtMs - now);
      UNITS.forEach(function (u, i) {
        var v = Math.floor(left / u[1]); left -= v * u[1];
        var s = JR.pad2(v);
        var node = $('#cd' + i);
        if (node && node.dataset.v !== s) { node.dataset.v = s; node.textContent = ''; node.appendChild(digitsSpans(fa(s))); }
      });
    } else if (st.phase === 'open') {
      t = $('#mTaken'); if (t) t.textContent = num(st.taken);
      t = $('#mOf'); if (t) t.textContent = 'از ' + num(st.capacity) + ' نفر ثبت‌نام کرده‌اند';
      t = $('#mLeft'); if (t) t.textContent = st.remaining === 1 ? 'فقط ۱ جای خالی مانده' : num(st.remaining) + ' جای خالی';
    } else if (st.phase === 'full') {
      t = $('#fullBig'); if (t) t.textContent = 'ظرفیت ' + num(st.capacity) + ' نفره تکمیل شد';
      t = $('#fullSub');
      if (t) {
        var parts = [];
        if (st.fullAtMs) parts.push('نفر ' + num(st.capacity) + 'م ساعت ' + JR.fmtTime(st.fullAtMs, true) + ' ثبت‌نام کرد' + (st.fillMs != null ? ' و ظرفیت در ' + JR.fmtDuration(st.fillMs) + ' پر شد.' : '.'));
        if (st.waitlist && st.waitlist.open) parts.push('اگر کسی انصراف دهد، به ترتیب از لیست انتظار جا می‌گیرد' + (st.waitlist.count ? ' (' + num(st.waitlist.count) + ' نفر در انتظارند).' : '.'));
        t.textContent = parts.join(' ');
      }
    }
  }

  /* ───────────── اطلاعات ثابت صفحه ───────────── */
  function renderStatic(st, first) {
    document.title = 'ثبت‌نام ' + st.event.title + ' — جریان';
    $('.hero__title').textContent = st.event.title;
    $('#chipDateText').textContent = JR.fmtDate(st.event.dateMs);

    var n = $('#notice');
    n.hidden = !st.announcement; n.textContent = st.announcement || '';

    var logo = $('#mciLogo'), chip = $('#chipDest');
    var src = st.assets && st.assets.mciLogo;
    if (src && logo.getAttribute('src') !== src) {
      logo.onload = function () { logo.hidden = false; chip.classList.add('chip--logo'); };
      logo.src = src;
    }

    var price = st.event.priceToman;
    var rows = [
      ['مقصد', 'ساختمان مرکزی همراه اول'],
      ['تاریخ', JR.fmtDate(st.event.dateMs)],
      ['ظرفیت', num(st.capacity) + ' نفر'],
      ['هزینه', price == null ? 'به‌زودی اعلام می‌شود' : price === 0 ? 'رایگان' : num(price) + ' تومان'],
      ['شرکت‌کنندگان', 'دانشجویان دانشکده برق'],
      ['برگزارکننده', 'مجموعه جریان']
    ];
    var dl = $('#specList'); dl.textContent = '';
    rows.forEach(function (r) { dl.appendChild(el('div', { class: 'spec__row' }, [el('dt', { text: r[0] }), el('dd', { text: r[1] })])); });

    var m = st.meeting || {}, meet = $('#specMeet');
    var lines = [];
    if (m.time) lines.push('ساعت حرکت: ' + m.time);
    if (m.place) lines.push('محل حرکت: ' + m.place);
    if (m.note) lines.push(m.note);
    meet.hidden = !lines.length; meet.textContent = '';
    lines.forEach(function (l, i) { if (i) meet.appendChild(document.createElement('br')); meet.appendChild(document.createTextNode(l)); });

    var rl = $('#rulesList'); rl.textContent = '';
    (st.rules || []).forEach(function (t) { rl.appendChild(el('li', { text: t })); });

    var fc = $('#footContact'); fc.textContent = '';
    var c = st.contact || {};
    function handle(v) { return String(v || '').replace(/^https?:\/\/[^/]+\//, '').replace(/^@/, '').replace(/[^A-Za-z0-9_.]/g, ''); }
    [['ایتا', c.eitaa, 'https://eitaa.com/'], ['تلگرام', c.telegram, 'https://t.me/'], ['اینستاگرام', c.instagram, 'https://instagram.com/']].forEach(function (x) {
      if (!x[1]) return;
      var h = handle(x[1]);
      fc.appendChild(el('li', {}, [h ? el('a', { href: x[2] + h, rel: 'noopener noreferrer', target: '_blank', text: x[0] + ': @' + h }) : el('span', { text: x[0] + ': ' + x[1] })]));
    });
    if (c.phone) fc.appendChild(el('li', {}, [el('a', { href: 'tel:' + c.phone.replace(/[^\d+]/g, ''), text: 'تماس: ' + fa(c.phone) })]));

    if (first || S.formFor !== (st.degrees.join('|') + '#' + st.majors.join('|'))) {
      S.formFor = st.degrees.join('|') + '#' + st.majors.join('|');
      fillSelect($('#f-degree'), st.degrees); fillSelect($('#f-major'), st.majors);
      restoreDraft();
    }
  }

  function fillSelect(sel, list) {
    var keep = sel.value;
    sel.textContent = '';
    sel.appendChild(el('option', { value: '', text: 'انتخاب کنید' }));
    list.forEach(function (x) { sel.appendChild(el('option', { value: x, text: x })); });
    if (keep && list.indexOf(keep) >= 0) sel.value = keep;
  }

  /* ───────────── فرم ───────────── */
  var FIELDS = ['firstName', 'lastName', 'studentId', 'nationalId', 'phone', 'degree', 'major'];
  var NUMERIC = ['studentId', 'nationalId', 'phone'];

  function readForm() {
    var v = {};
    FIELDS.forEach(function (f) { v[f] = $('#f-' + f).value; });
    v.accepted = $('#f-accepted').checked;
    v.website = $('#regForm [name=website]').value;
    return v;
  }
  function showErrors(errors) {
    FIELDS.concat(['accepted']).forEach(function (f) {
      var p = $('#e-' + f), input = $('#f-' + f);
      p.textContent = errors && errors[f] ? errors[f] : '';
      var wrap = input.closest('.field');
      if (wrap) wrap.classList.toggle('has-error', !!(errors && errors[f]));
      input.setAttribute('aria-invalid', errors && errors[f] ? 'true' : 'false');
    });
  }
  function formMsg(text, ok) {
    var m = $('#formMsg');
    m.hidden = !text; m.textContent = text || '';
    m.classList.toggle('form-msg--ok', !!ok);
  }
  function saveDraft() {
    var v = readForm(); delete v.accepted; delete v.website;
    store('jr_draft', JSON.stringify(v));
  }
  function restoreDraft() {
    try {
      var d = JSON.parse(store('jr_draft') || 'null');
      if (d) FIELDS.forEach(function (f) { var i = $('#f-' + f); if (d[f] && !i.value) i.value = d[f]; });
    } catch (e) { /* ignore */ }
  }

  function updateFormGate() {
    var st = S.st, btn = $('#submitBtn'), label = $('#submitLabel'), hint = $('#regHint');
    if (!st) return;
    var enabled = false, text = '', h = '';
    if (st.phase === 'before') {
      text = 'ثبت‌نام در لحظه‌ی شروع فعال می‌شود';
      h = st.openAtMs
        ? 'فرم را از همین حالا پر کن. ساعت ' + JR.fmtTime(st.openAtMs) + ' (' + JR.fmtDate(st.openAtMs, { weekday: true }) + ') دکمه‌ی ثبت فعال می‌شود.'
        : 'فرم را می‌توانی از همین حالا پر کنی؛ زمان شروع ثبت‌نام به‌زودی اعلام می‌شود.';
    } else if (st.phase === 'open') {
      enabled = true; text = 'ثبت نهایی';
      h = 'ثبت‌نام باز است. هر نفر یک جا دارد و با پر شدن نفر ' + num(st.capacity) + 'م، ثبت‌نام همان لحظه بسته می‌شود.';
    } else if (st.phase === 'full') {
      if (st.waitlist && st.waitlist.open) { enabled = true; text = 'ثبت در لیست انتظار'; h = 'ظرفیت پر شده است؛ اما می‌توانی در لیست انتظار بمانی تا اگر جایی خالی شد، خبرت کنیم.'; }
      else { text = 'ظرفیت تکمیل شد'; h = 'ظرفیت ' + num(st.capacity) + ' نفره تکمیل شد و ثبت‌نام بسته شده است.'; }
    } else { text = 'ثبت‌نام بسته است'; h = 'ثبت‌نام در حال حاضر بسته است.'; }
    if (!S.busy) { btn.disabled = !enabled; label.textContent = text; }
    hint.textContent = h;
  }

  function mapServerError(r) {
    var j = r.json || {};
    if (j.errors) showErrors(j.errors);
    var first = j.errors && FIELDS.concat(['accepted']).filter(function (f) { return j.errors[f]; })[0];
    if (first) { var i = $('#f-' + first); if (i) i.focus(); }
    formMsg(j.message || 'ثبت‌نام انجام نشد.');
  }

  function submit(retried) {
    var st = S.st;
    var v = readForm();
    var res = JR.validateRegistration(v, { degrees: st ? st.degrees : undefined, majors: st ? st.majors : undefined });
    showErrors(res.errors);
    if (!res.ok) {
      formMsg('چند مورد را باید اصلاح کنی؛ موارد قرمز را ببین.');
      var f = FIELDS.concat(['accepted']).filter(function (x) { return res.errors[x]; })[0];
      if (f) $('#f-' + f).focus();
      return;
    }
    formMsg('');
    S.busy = true;
    var btn = $('#submitBtn');
    btn.disabled = true; btn.classList.add('is-busy'); $('#submitLabel').textContent = 'در حال ثبت';
    api('POST', 'api/register', v).then(function (r) {
      var j = r.json;
      if (r.status === 200 && j.ok) {
        store('jr_mine', JSON.stringify({ code: j.registration.code, studentId: j.registration.studentId }));
        store('jr_draft', null);
        S.mine = j.registration; S.showForm = false;
        renderMine(j.registration, j.status === 'waitlist' ? 'wait' : 'new');
        poll();
        return;
      }
      if (j.code === 'NOT_OPEN' && !retried && j.opensInMs != null && j.opensInMs < 4000) {
        formMsg('چند لحظه‌ی دیگر شروع می‌شود؛ خودکار دوباره می‌فرستیم…', true);
        return new Promise(function (res2) { setTimeout(res2, j.opensInMs + 120); }).then(function () { S.busy = false; btn.classList.remove('is-busy'); return submit(true); });
      }
      if (j.code === 'FULL') { poll(); }
      if (j.code === 'NOT_OPEN') poll();
      mapServerError(r);
    }).catch(function () {
      formMsg('اتصال برقرار نشد. اینترنت را بررسی کن و دوباره بزن؛ اطلاعات فرم حفظ شده است.');
    }).then(function () {
      S.busy = false; btn.classList.remove('is-busy'); updateFormGate();
    });
  }

  /* ───────────── بلیت ───────────── */
  function copyText(text, btn) {
    function done() { var old = btn.textContent; btn.textContent = 'کپی شد'; setTimeout(function () { btn.textContent = old; }, 1400); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { /* ignore */ });
    else { var t = el('textarea', { style: 'position:fixed;opacity:0' }); t.value = text; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); done(); } catch (e) { /* ignore */ } document.body.removeChild(t); }
  }
  function cardFmt(c) { return String(c).replace(/(\d{4})(?=\d)/g, '$1 '); }

  function renderTicket(r) {
    var wait = r.status === 'waitlist', cancelled = r.status === 'cancelled';
    var main = el('div', { class: 'ticket__main' });
    main.appendChild(el('h3', { class: 'ticket__title' + (wait || cancelled ? ' ticket__title--wait' : ''), text: cancelled ? 'این ثبت‌نام لغو شده است' : wait ? 'در لیست انتظار ثبت شدی' : 'ثبت‌نامت انجام شد' }));
    main.appendChild(el('p', { class: 'ticket__name', text: r.firstName + ' ' + r.lastName }));
    main.appendChild(el('p', { class: 'ticket__meta', text: r.degree + '، گرایش ' + r.major + '، شماره دانشجویی ' + fa(r.studentId) }));

    var code = el('div', { class: 'ticket__code' }, [el('span', { text: 'کد پیگیری' }), el('b', { text: fa(r.code) })]);
    code.appendChild(el('button', { class: 'copy', type: 'button', text: 'کپی', onclick: function (e) { copyText(r.code, e.currentTarget); } }));
    main.appendChild(code);

    var badges = el('div', { class: 'badges' });
    if (!cancelled) badges.appendChild(el('span', { class: 'badge ' + (wait ? 'badge--warn' : 'badge--ok'), text: wait ? 'لیست انتظار' : 'ثبت‌نام قطعی' }));
    if (!wait && !cancelled) badges.appendChild(el('span', { class: 'badge ' + (r.payment === 'paid' ? 'badge--ok' : 'badge--warn'), text: r.payment === 'paid' ? 'پرداخت شد' : r.payment === 'refunded' ? 'وجه برگشت داده شد' : 'در انتظار پرداخت' }));
    if (r.checkedIn) badges.appendChild(el('span', { class: 'badge badge--ok', text: 'حاضر در اردو' }));
    main.appendChild(badges);

    var pi = r.payInfo || {};
    if (!wait && !cancelled && r.payment === 'unpaid') {
      var pay = el('div', { class: 'pay' });
      if (pi.enabled && pi.priceToman) {
        pay.appendChild(el('span', {}, ['برای قطعی شدن جایت، مبلغ ', el('b', { text: num(pi.priceToman) + ' تومان' }), ' را کارت‌به‌کارت واریز کن و تصویر فیش را برای ستاد بفرست.']));
        if (pi.cardNumber) {
          var row = el('div', { class: 'pay__card' }, [el('code', { text: fa(cardFmt(pi.cardNumber)) })]);
          row.appendChild(el('button', { class: 'copy', type: 'button', text: 'کپی شماره کارت', onclick: function (e) { copyText(pi.cardNumber, e.currentTarget); } }));
          pay.appendChild(row);
          var who = [pi.cardHolder && 'به نام ' + pi.cardHolder, pi.bankName && pi.bankName].filter(Boolean).join('، ');
          if (who) pay.appendChild(el('div', { text: who }));
        }
        if (pi.note) pay.appendChild(el('div', { text: pi.note }));
      } else {
        pay.appendChild(el('span', { text: 'مبلغ و روش پرداخت به‌زودی از طرف ستاد اعلام می‌شود.' }));
      }
      main.appendChild(pay);
    }
    var m = r.meeting || {};
    if (!wait && !cancelled && (m.time || m.place)) {
      main.appendChild(el('p', { class: 'ticket-note', text: [m.time && 'ساعت حرکت: ' + m.time, m.place && 'محل: ' + m.place].filter(Boolean).join(' — ') }));
    }

    var stub = el('div', { class: 'ticket__stub' }, [el('small', { text: wait ? 'نوبت انتظار' : 'شماره ثبت‌نام' }), el('b', { text: fa(wait ? r.position : r.seq) })]);
    return el('div', { class: 'ticket' }, [main, stub]);
  }

  function renderMine(reg, kind) {
    var box = $('#myTicket');
    box.textContent = '';
    box.appendChild(renderTicket(reg));
    var note = el('p', { class: 'ticket-note' });
    note.appendChild(document.createTextNode(kind === 'again' ? 'قبلاً با همین دستگاه ثبت‌نام کرده‌ای. ' : 'کد پیگیری را جایی یادداشت کن یا از این صفحه عکس بگیر. '));
    note.appendChild(el('button', { class: 'linklike', type: 'button', text: 'ثبت‌نام برای فرد دیگر', onclick: function () { S.showForm = true; $('#regForm').hidden = false; box.hidden = true; $('#f-firstName').focus(); } }));
    box.appendChild(note);
    box.hidden = false;
    $('#regForm').hidden = true;
    box.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
  }

  function restoreMine() {
    var m; try { m = JSON.parse(store('jr_mine') || 'null'); } catch (e) { m = null; }
    if (!m) return;
    api('POST', 'api/lookup', m).then(function (r) {
      if (r.json && r.json.ok) { S.mine = r.json.registration; S.showForm = false; renderMine(r.json.registration, 'again'); $('#myTicket').scrollIntoView = function () {}; }
      else if (r.json && r.json.code === 'NOT_FOUND') store('jr_mine', null);
    }).catch(function () { /* ignore */ });
  }

  /* ───────────── پیگیری ───────────── */
  function trackSubmit(e) {
    e.preventDefault();
    var msg = $('#trackMsg'), out = $('#trackResult');
    msg.hidden = true; out.textContent = '';
    var code = JR.faToEn($('#t-code').value).replace(/\D/g, ''), sid = $('#t-sid').value;
    if (!code || !JR.normStudentId(sid)) { msg.hidden = false; msg.textContent = 'کد پیگیری و شماره دانشجویی را درست وارد کن.'; return; }
    api('POST', 'api/lookup', { code: code, studentId: sid }).then(function (r) {
      if (r.json && r.json.ok) out.appendChild(renderTicket(r.json.registration));
      else { msg.hidden = false; msg.textContent = (r.json && r.json.message) || 'پیدا نشد.'; }
    }).catch(function () { msg.hidden = false; msg.textContent = 'اتصال برقرار نشد؛ دوباره تلاش کن.'; });
  }

  /* ───────────── رویدادها و چرخه‌ی اصلی ───────────── */
  function onStatus(j) {
    var first = !S.st;
    var prev = S.st;
    S.st = j;
    renderStatic(j, first);
    if (!S.circuit || S.circuit.cap !== j.capacity) { buildCircuit(j.capacity); setTaken(j.taken, false); }
    else if (prev && prev.taken !== j.taken) setTaken(j.taken, true);
    else if (first) setTaken(j.taken, false);
    circuitMode(j.phase, j.taken);
    if (S.prevPhase === 'before' && j.phase === 'open') playWave();
    if (S.prevPhase && S.prevPhase !== 'full' && j.phase === 'full') { setTaken(j.taken, true); }
    S.prevPhase = j.phase;
    renderState();
    updateFormGate();
  }

  function tick() {
    var st = S.st;
    if (!st) return;
    if (st.phase === 'before' && st.openAtMs && serverNow() >= st.openAtMs) { // لحظه‌ی شروع: بدون انتظار برای پیام بعدی سرور فعال شو
      st.phase = 'open'; st.localOpen = true;
      S.prevPhase = 'before'; circuitMode('open', st.taken); playWave(); S.prevPhase = 'open';
      renderState(); updateFormGate();
      clearTimeout(S.pollTimer);                                  // همه‌ی کاربران در یک لحظه وضعیت نخواهند: با تأخیر تصادفی
      S.pollTimer = setTimeout(poll, 800 + Math.random() * ((window.JR_CONFIG || {}).openPollJitterMs || 0));
      return;
    }
    if (st.phase === 'before') updateStateValues(st);
  }

  function init() {
    NUMERIC.forEach(function (f) {
      var i = $('#f-' + f);
      i.addEventListener('input', function () { var n = JR.faToEn(i.value); if (n !== i.value) i.value = n; });
    });
    FIELDS.forEach(function (f) {
      var i = $('#f-' + f);
      i.addEventListener('blur', function () {
        if (!i.value) return;
        var r = JR.validateRegistration(readForm(), { degrees: S.st && S.st.degrees, majors: S.st && S.st.majors });
        var p = $('#e-' + f), w = i.closest('.field');
        p.textContent = r.errors[f] || ''; w.classList.toggle('has-error', !!r.errors[f]);
      });
      i.addEventListener('input', function () { var w = i.closest('.field'); if (w.classList.contains('has-error')) { w.classList.remove('has-error'); $('#e-' + f).textContent = ''; } saveDraft(); });
      i.addEventListener('change', saveDraft);
    });
    $('#regForm').addEventListener('submit', function (e) { e.preventDefault(); if (!S.busy && !$('#submitBtn').disabled) submit(false); });
    $('#trackForm').addEventListener('submit', trackSubmit);
    ['#t-code', '#t-sid'].forEach(function (s) { var i = $(s); i.addEventListener('input', function () { var n = JR.faToEn(i.value); if (n !== i.value) i.value = n; }); });
    document.addEventListener('visibilitychange', function () { if (!document.hidden) poll(); });
    setInterval(tick, 200);
    poll().then(restoreMine);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
