(function () {
  'use strict';
  var f = document.getElementById('f'), m = document.getElementById('m'), b = document.getElementById('b');
  function msg(t) { m.hidden = !t; m.textContent = t || ''; }
  f.addEventListener('submit', function (e) {
    e.preventDefault();
    var u = document.getElementById('u').value.trim(), p = document.getElementById('p').value;
    if (!u || !p) { msg('نام‌کاربری و رمز عبور را بنویسید.'); return; }
    msg(''); b.disabled = true; b.textContent = 'در حال ورود…';
    fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }), cache: 'no-store' })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { s: r.status, j: j }; }); })
      .then(function (r) {
        if (r.j && r.j.ok) { location.replace('panel.html'); return; }
        msg((r.j && r.j.message) || 'ورود انجام نشد.');
        b.disabled = false; b.textContent = 'ورود به پنل';
        document.getElementById('p').select();
      })
      .catch(function () { msg('اتصال به سرور برقرار نشد.'); b.disabled = false; b.textContent = 'ورود به پنل'; });
  });
})();
