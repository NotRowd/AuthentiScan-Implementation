/* Runs synchronously before application styles and React. No account data stored. */
(function () {
  var key = 'authentiscan.appearance.v1';
  var root = document.documentElement;
  var media = window.matchMedia('(prefers-color-scheme: dark)');
  var choices = ['light', 'dark', 'system'];
  var preference = 'system';
  try { var saved = localStorage.getItem(key); if (choices.indexOf(saved) !== -1) preference = saved; } catch (_) {}
  function resolve() {
    var resolved = preference === 'system' ? (media.matches ? 'dark' : 'light') : preference;
    root.dataset.theme = resolved;
    root.style.colorScheme = resolved;
    root.style.backgroundColor = resolved === 'dark' ? '#091321' : '#f6f9fc';
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = resolved === 'dark' ? '#091321' : '#f6f9fc';
    window.dispatchEvent(new Event('authentiscan-theme-change'));
  }
  window.AuthentiScanTheme = Object.freeze({
    getPreference: function () { return preference; },
    setPreference: function (next) {
      if (choices.indexOf(next) === -1) return;
      preference = next;
      try { localStorage.setItem(key, next); } catch (_) {}
      resolve();
    }
  });
  function onSystemChange() { if (preference === 'system') resolve(); }
  if (media.addEventListener) media.addEventListener('change', onSystemChange);
  else media.addListener(onSystemChange);
  window.addEventListener('storage', function (event) {
    if (event.key !== key && event.key !== null) return;
    preference = choices.indexOf(event.newValue) !== -1 ? event.newValue : 'system';
    resolve();
  });
  resolve();
})();
