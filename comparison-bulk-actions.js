'use strict';

(() => {
  const STYLE_ID = 'comparison-bulk-actions-style';
  let comparisonObserver = null;
  let productObserver = null;

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .comparison-bulk-actions{display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap}
      .comparison-bulk-action{min-height:36px;padding:7px 10px;border:1px solid #d7e3da;border-radius:9px;background:#fff;color:var(--green-dark);font:inherit;font-size:12px;font-weight:750;cursor:pointer;transition:border-color .15s,background .15s,color .15s}
      .comparison-bulk-action:hover:not(:disabled){border-color:#9bdab7;background:var(--green-soft)}
      .comparison-bulk-action:focus-visible{outline:2px solid var(--green-dark);outline-offset:2px}
      .comparison-bulk-action:disabled{cursor:default;opacity:.45}
      @media(max-width:800px){.comparison-bulk-actions{width:100%}.comparison-bulk-action{flex:1 1 auto}}
      @media(prefers-reduced-motion:reduce){.comparison-bulk-action{transition:none}}
    `;
    document.head.appendChild(style);
  }

  function syncButtons(host) {
    const inputs = [...host.querySelectorAll('input[data-comparison-store]')];
    const selected = inputs.filter(input => input.checked).length;
    const allButton = host.querySelector('[data-comparison-bulk="all"]');
    const noneButton = host.querySelector('[data-comparison-bulk="none"]');
    if (allButton) allButton.disabled = inputs.length > 0 && selected === inputs.length;
    if (noneButton) noneButton.disabled = selected === 0;
  }

  function ensureActions() {
    const host = document.getElementById('comparison-content');
    if (!host) return;
    const toolbar = host.querySelector('.comparison-toolbar');
    const differences = toolbar?.querySelector('.comparison-difference-toggle');
    if (!toolbar || !differences) return;

    let actions = toolbar.querySelector('.comparison-bulk-actions');
    if (!actions) {
      actions = document.createElement('div');
      actions.className = 'comparison-bulk-actions';
      actions.setAttribute('role', 'group');
      actions.setAttribute('aria-label', 'Selección rápida de tiendas para comparar');
      actions.innerHTML = `
        <button type="button" class="comparison-bulk-action" data-comparison-bulk="all">Comparar todas</button>
        <button type="button" class="comparison-bulk-action" data-comparison-bulk="none">No comparar</button>`;
      differences.insertAdjacentElement('afterend', actions);
    }

    syncButtons(host);
  }

  function observeComparisonHost() {
    const host = document.getElementById('comparison-content');
    comparisonObserver?.disconnect();
    if (!host) return;
    ensureActions();
    comparisonObserver = new MutationObserver(() => ensureActions());
    comparisonObserver.observe(host, {childList: true, subtree: true});
  }

  function applyBulkSelection(mode) {
    const host = document.getElementById('comparison-content');
    if (!host || !state.product) return;
    const inputs = [...host.querySelectorAll('input[data-comparison-store]')];
    const stores = inputs.map(input => input.dataset.comparisonStore).filter(Boolean);
    state.comparisonStores = mode === 'all' ? new Set(stores) : new Set();

    const differences = host.querySelector('input[data-comparison-differences]');
    if (differences) {
      differences.dispatchEvent(new Event('change', {bubbles: true}));
    } else {
      inputs.forEach(input => { input.checked = mode === 'all'; });
      syncButtons(host);
    }

    requestAnimationFrame(() => {
      ensureActions();
      document.querySelector(`[data-comparison-bulk="${mode}"]`)?.focus({preventScroll: true});
    });
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('button[data-comparison-bulk]');
    if (!button) return;
    applyBulkSelection(button.dataset.comparisonBulk === 'none' ? 'none' : 'all');
  });

  function watchProductView() {
    productObserver?.disconnect();
    const root = document.getElementById('product-view');
    if (!root) return;
    productObserver = new MutationObserver(() => {
      const currentHost = document.getElementById('comparison-content');
      if (currentHost && currentHost !== comparisonObserver?.target) observeComparisonHost();
      else ensureActions();
    });
    productObserver.observe(root, {childList: true, subtree: true});
  }

  ensureStyles();
  observeComparisonHost();
  watchProductView();
})();
