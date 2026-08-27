(function () {
  'use strict';

  function csrfToken() {
    var meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.content : '';
  }

  async function apiRequest(method, url, body) {
    var res = await fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken() },
      body: body !== null && body !== undefined ? JSON.stringify(body) : undefined,
    });
    var data = {};
    try { data = await res.json(); } catch (e) { /* bos govde olabilir */ }
    if (!res.ok) {
      throw new Error(data.message || data.error || 'İşlem başarısız oldu.');
    }
    return data;
  }

  document.addEventListener('submit', function (e) {
    var form = e.target.closest('form[data-api]');
    if (!form) return;
    e.preventDefault();

    var method = form.dataset.method || 'POST';
    var url = form.getAttribute('action');
    var body = Object.fromEntries(new FormData(form).entries());
    delete body._csrf;

    var errorEl = form.parentElement.querySelector('[data-role="form-error"]') || form.querySelector('.form-error');

    apiRequest(method, url, body).then(function () {
      window.location.href = form.dataset.redirect || window.location.pathname;
    }).catch(function (err) {
      if (errorEl) errorEl.textContent = err.message;
      else window.alert(err.message);
    });
  });

  document.addEventListener('click', function (e) {
    var copyBtn = e.target.closest('button[data-copy]');
    if (copyBtn) {
      e.preventDefault();
      var text = copyBtn.dataset.copy;
      var original = copyBtn.textContent;
      navigator.clipboard.writeText(text).then(function () {
        copyBtn.textContent = '✓';
        setTimeout(function () { copyBtn.textContent = original; }, 1200);
      }).catch(function () { window.alert(text); });
      return;
    }
  });

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-api-action]');
    if (!btn) return;
    e.preventDefault();

    if (btn.dataset.confirm && !window.confirm(btn.dataset.confirm)) return;

    var body = null;
    if (btn.dataset.body) {
      try { body = JSON.parse(btn.dataset.body); } catch (err) { body = null; }
    }

    apiRequest(btn.dataset.method || 'POST', btn.dataset.url, body).then(function () {
      window.location.reload();
    }).catch(function (err) {
      window.alert(err.message);
    });
  });
})();
