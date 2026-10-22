// Apply appearance before styles, without touching archive data.
(() => {
  let choice = 'system';
  try {
    choice = localStorage.getItem('storm_archive_theme') || 'system';
  } catch {
    /* session appearance */
  }
  const dark =
    choice === 'dark' ||
    (choice !== 'light' &&
      window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  document.documentElement.style.backgroundColor = dark ? '#101112' : '#f2f3f1';
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', dark ? '#101112' : '#f2f3f1');
})();
