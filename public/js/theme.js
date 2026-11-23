// Applied before the page paints, so dark mode never flashes.
(function () {
  var t = null;
  try { t = localStorage.getItem('theme'); } catch (e) {}
  if (!t) t = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', t);
})();
