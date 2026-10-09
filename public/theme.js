// Executado antes do CSS para evitar flash e respeitar a CSP sem script inline.
(() => {
  const key = 'bp_theme';
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  let preference = null;
  try { const saved = localStorage.getItem(key); if (saved === 'light' || saved === 'dark') preference = saved; } catch { /* Armazenamento indisponível: preferência vale nesta aba. */ }
  function apply(theme) {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#090f1e' : '#f5f7fc');
    document.querySelectorAll('[data-theme-toggle]').forEach(button => {
      const label = theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro';
      button.setAttribute('aria-label', label);
      button.setAttribute('aria-pressed', String(theme === 'dark'));
      button.setAttribute('title', label);
      const tooltip = button.querySelector('.theme-tooltip');
      if (tooltip) tooltip.textContent = label;
    });
  }
  apply(preference || (system.matches ? 'dark' : 'light'));
  system.addEventListener('change', event => { if (!preference) apply(event.matches ? 'dark' : 'light'); });
  document.addEventListener('click', event => {
    if (!(event.target instanceof Element) || !event.target.closest('[data-theme-toggle]')) return;
    preference = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(key, preference); } catch { /* Não impedir a alternância. */ }
    apply(preference);
  });
  window.addEventListener('storage', event => {
    if (event.key !== key && event.key !== null) return;
    preference = event.newValue === 'dark' || event.newValue === 'light' ? event.newValue : null;
    apply(preference || (system.matches ? 'dark' : 'light'));
  });
})();
