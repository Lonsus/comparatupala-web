'use strict';

(() => {
  const STYLE_ID = 'comparison-bulk-actions-style';
  let comparisonObserver = null;
  let productObserver = null;
  let observedHost = null;

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

      .workspace.filters-below-catalog{display:block}
      .workspace.filters-below-catalog>.results-section{width:100%;min-width:0}
      .catalog-inline-filters{position:static!important;top:auto!important;width:100%;max-height:none!important;overflow:visible!important;margin:0 0 18px;padding:14px 18px;border-radius:14px}
      .catalog-inline-filters #filter-toggle{display:flex!important;align-items:center;justify-content:space-between;gap:14px;width:100%;min-height:44px;padding:8px 2px;border:0;background:transparent;color:var(--ink);font-size:15px;font-weight:750;text-align:left}
      .catalog-inline-filters #filter-toggle>span{margin-left:auto;color:var(--muted);font-size:12px;font-weight:500;text-align:right}
      .catalog-inline-filters .section-heading{margin:4px 0 14px;padding-top:14px;border-top:1px solid var(--line)}

      @media(min-width:801px){
        .catalog-inline-filters .filters{grid-template-columns:repeat(3,minmax(0,1fr));gap:14px 16px;align-items:start}
        .catalog-inline-filters .filter-pair{display:contents}
        .catalog-inline-filters .filter-separator{grid-column:1/-1;margin-top:2px;padding-top:12px}
        .catalog-inline-filters #filter-error{grid-column:1/-1}
      }
      @media(min-width:801px) and (max-width:1000px){
        .catalog-inline-filters .filters{grid-template-columns:repeat(2,minmax(0,1fr))}
      }
      @media(max-width:800px){
        .comparison-bulk-actions{width:100%}
        .comparison-bulk-action{flex:1 1 auto}
        .catalog-inline-filters{margin-bottom:14px;padding:12px 14px}
        .catalog-inline-filters #filter-toggle>span{display:none}
      }
      @media(prefers-reduced-motion:reduce){.comparison-bulk-action{transition:none}}
    `;
    document.head.appendChild(style);
  }

  function moveAdvancedFilters() {
    const workspace = document.querySelector('.workspace');
    const results = workspace?.querySelector('.results-section');
    const heading = results?.querySelector('.results-heading');
    const panel = document.querySelector('.filters-panel');
    if (!workspace || !results || !heading || !panel) return;

    workspace.classList.add('filters-below-catalog');
    panel.classList.add('catalog-inline-filters');
    if (panel.parentElement !== results || panel.previousElementSibling !== heading) {
      heading.insertAdjacentElement('afterend', panel);
    }
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
    if (host === observedHost) {
      ensureActions();
      return;
    }
    comparisonObserver?.disconnect();
    observedHost = host || null;
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
      observeComparisonHost();
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
    productObserver = new MutationObserver(() => observeComparisonHost());
    productObserver.observe(root, {childList: true, subtree: true});
  }

  ensureStyles();
  moveAdvancedFilters();
  observeComparisonHost();
  watchProductView();
})();