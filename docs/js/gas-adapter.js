/*
 * gas-adapter.js — پل بین صفحه‌ها و Google Apps Script
 *
 * صفحه‌های سایت و پنل مثل همیشه به /api/... درخواست می‌دهند؛ این فایل همان درخواست‌ها را
 * برای وب‌اپ Apps Script بسته‌بندی می‌کند و پاسخ را به شکل Response معمولی برمی‌گرداند.
 *
 *  - بدنه به‌صورت text/plain فرستاده می‌شود تا مرورگر درخواست «preflight» نفرستد (Apps Script آن را نمی‌پذیرد).
 *  - ورود: توکن در sessionStorage همین تب نگه داشته و در بدنه‌ی هر درخواست مدیریت فرستاده می‌شود؛
 *    کوکی در کار نیست، پس CSRF هم معنا ندارد.
 *  - ثبت‌نام: هر ارسال یک «rid» یکتا دارد. اگر اینترنت قطع شود یا سامانه شلوغ باشد، همان درخواست با همان rid
 *    دوباره فرستاده می‌شود و سرور اجازه نمی‌دهد دو بار ثبت شود.
 */
(function () {
  'use strict';
  var C = window.JR_CONFIG || {};
  var origFetch = window.fetch.bind(window);
  var KEY = 'jaryan_admin_token', memToken = '';

  function getToken() { try { return sessionStorage.getItem(KEY) || memToken; } catch (e) { return memToken; } }
  function setToken(t) { memToken = t || ''; try { if (t) sessionStorage.setItem(KEY, t); else sessionStorage.removeItem(KEY); } catch (e) { /* ignore */ } }
  window.JR_clearToken = function () { setToken(''); };

  function configured() { return /^https:\/\/script\.google(usercontent)?\.com\//.test(C.apiUrl || ''); }
  function reply(obj, status, ct, rawText) {
    var body = rawText != null ? rawText : JSON.stringify(obj);
    return new Response(body, { status: status, headers: { 'Content-Type': ct || 'application/json; charset=utf-8' } });
  }
  function failReply(status, code, msg) { return reply({ ok: false, code: code, message: msg }, status); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function rid() {
    var a = new Uint8Array(12), s = '';
    (window.crypto || window.msCrypto).getRandomValues(a);
    for (var i = 0; i < a.length; i++) s += (a[i] < 16 ? '0' : '') + a[i].toString(16);
    return 'r' + s;
  }

  /** یک درخواست به Apps Script؛ JSON پاسخ را برمی‌گرداند یا خطا پرتاب می‌کند */
  function callGas(payload, timeoutMs, viaGet) {
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, timeoutMs || 30000) : null;
    var opts = { cache: 'no-store', redirect: 'follow', credentials: 'omit', referrerPolicy: 'no-referrer' };
    if (ctl) opts.signal = ctl.signal;
    var url = C.apiUrl;
    if (viaGet) url += (url.indexOf('?') < 0 ? '?' : '&') + 'p=' + encodeURIComponent(payload.p);
    else { opts.method = 'POST'; opts.headers = { 'Content-Type': 'text/plain;charset=utf-8' }; opts.body = JSON.stringify(payload); }
    return origFetch(url, opts).then(function (r) {
      return r.text().then(function (t) {
        var j; try { j = JSON.parse(t); } catch (e) { var err = new Error('non-json'); err.transient = true; throw err; }
        return j;
      });
    }).then(function (j) { if (timer) clearTimeout(timer); return j; }, function (e) { if (timer) clearTimeout(timer); throw e; });
  }

  function toResponse(j) {
    if (j && j._raw != null) return reply(null, 200, j._ct || 'text/plain; charset=utf-8', j._raw);
    var s = (j && j._s) || 200;
    if (j) delete j._s;
    if (j && j.ok && j.assets === undefined && j.phase !== undefined && C.mciLogo) j.assets = { mciLogo: C.mciLogo };
    return reply(j, s);
  }

  /** ارسال با تلاش مجدد (قطع اینترنت، «شلوغ است» یا خطای ۵xx)؛ بدنه‌ی تلاش‌های بعدی با علامت retry */
  function postWithRetry(path, body, timeoutMs, max, flagRetry) {
    var attempts = 0;
    function go() {
      attempts += 1;
      var b = attempts > 1 && flagRetry ? Object.assign({}, body, { retry: 1 }) : body;
      return callGas({ p: path, m: 'POST', b: b }, timeoutMs).then(function (j) {
        if (j && (j.code === 'BUSY' || j._s >= 500) && attempts < max) return sleep(500 * attempts + Math.random() * 700).then(go);
        return j;
      }, function (e) {
        if (attempts < max) return sleep(600 * attempts + Math.random() * 800).then(go);
        throw e;
      });
    }
    return go();
  }
  /** ثبت‌نام: هر ارسال یک rid یکتا دارد تا تلاش مجدد، دو بار ثبت نشود */
  function registerWithRetry(body) { return postWithRetry('register', Object.assign({}, body, { rid: rid() }), 35000, 6, true); }

  function apiFetch(input, init) {
    init = init || {};
    var url = typeof input === 'string' ? input : input.url;
    var m = String(url).match(/^\/?api\/([^?#]*)(?:\?([^#]*))?/);
    var path = m[1].replace(/\/+$/, ''), method = String(init.method || 'GET').toUpperCase();
    if (!configured()) return Promise.resolve(failReply(503, 'NOT_CONFIGURED', 'اتصال سایت به Google Sheet هنوز تنظیم نشده است (docs/js/config.js).'));
    var q = {};
    if (m[2]) m[2].split('&').forEach(function (kv) { var p = kv.split('='); if (p[0]) q[decodeURIComponent(p[0])] = decodeURIComponent((p[1] || '').replace(/\+/g, ' ')); });
    var body = null;
    if (init.body) { try { body = JSON.parse(init.body); } catch (e) { body = null; } }

    var isAdmin = path.indexOf('admin/') === 0;
    if (isAdmin && path !== 'admin/login' && !getToken()) return Promise.resolve(failReply(401, 'AUTH', 'ابتدا وارد شوید.'));

    if (path === 'register' && method === 'POST') return registerWithRetry(body || {}).then(toResponse);
    if (path === 'receipt' && method === 'POST') return postWithRetry('receipt', body || {}, 60000, 3, false).then(toResponse);   // تصویر یکسان دوباره ذخیره نمی‌شود (سرور از هش تشخیص می‌دهد)
    if ((path === 'status' || path === 'ping') && method === 'GET') return callGas({ p: path }, 25000, true).then(toResponse);

    return callGas({ p: path, m: method, b: body || {}, q: q, t: isAdmin ? getToken() : '' }, 40000).then(function (j) {
      if (path === 'admin/login' && j && j.ok && j.token) { setToken(j.token); delete j.token; }
      if (path === 'admin/logout' || (isAdmin && path !== 'admin/login' && j && j._s === 401)) setToken('');
      return toResponse(j);
    });
  }

  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    if (/^\/?api\//.test(url)) return apiFetch(input, init);
    return origFetch(input, init);
  };

  /* هشدار تنظیم‌نشدن اتصال (فقط برای برگزارکنندگان که هنوز config.js را پر نکرده‌اند) */
  document.addEventListener('DOMContentLoaded', function () {
    if (configured()) return;
    var d = document.createElement('div');
    d.setAttribute('role', 'alert'); d.id = 'jr-setup-banner';
    d.style.cssText = 'position:fixed;inset:auto 12px 12px 12px;z-index:99999;background:#7a1f1f;color:#fff;padding:12px 16px;border-radius:12px;font:14px/1.7 Vazirmatn,system-ui,sans-serif;text-align:center;box-shadow:0 8px 30px rgba(0,0,0,.4)';
    d.textContent = 'اتصال به Google Sheet هنوز تنظیم نشده است. نشانی وب‌اپ Apps Script را در فایل docs/js/config.js بنویسید (راهنما: README).';
    document.body.appendChild(d);
  });
})();
