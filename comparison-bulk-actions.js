'use strict';

(() => {
  const STYLE_ID = 'comparison-bulk-actions-style';
  const mobileFiltersQuery = matchMedia('(max-width:800px)');
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

      @media(max-width:800px){
        .comparison-bulk-actions{width:100%}
        .comparison-bulk-action{flex:1 1 auto}
        .workspace.filters-below-catalog{display:block}
        .workspace.filters-below-catalog>.results-section{width:100%;min-width:0}
        .catalog-mobile-search{width:100%;margin:0 0 14px}
        .catalog-inline-filters{position:static!important;top:auto!important;width:100%;max-height:none!important;overflow:visible!important;margin:0 0 14px;padding:12px 14px;border-radius:14px}
        .catalog-inline-filters #filter-toggle{display:flex!important;align-items:center;justify-content:space-between;gap:14px;width:100%;min-height:44px;padding:8px 2px;border:0;background:transparent;color:var(--ink);font-size:15px;font-weight:750;text-align:left}
        .catalog-inline-filters #filter-toggle>span{display:none}
        .catalog-inline-filters .section-heading{margin:4px 0 14px;padding-top:14px;border-top:1px solid var(--line)}
        .catalog-mobile-controls{width:100%;margin:0 0 16px;padding:12px;border:1px solid var(--line);border-radius:14px;background:#fff}
      }
      @media(prefers-reduced-motion:reduce){.comparison-bulk-action{transition:none}}
    `;
    document.head.appendChild(style);
  }

  function placeMobileCatalogControls() {
    const catalogView = document.getElementById('catalog-view');
    const workspace = catalogView?.querySelector('.workspace');
    const results = workspace?.querySelector('.results-section');
    const heading = results?.querySelector('.results-heading');
    const panel = document.querySelector('.filters-panel');
    const search = document.querySelector('.home-search');
    const controls = document.querySelector('.catalog-controls');
    if (!catalogView || !workspace || !results || !heading || !panel || !search || !controls) return;

    if (mobileFiltersQuery.matches) {
      workspace.classList.add('filters-below-catalog');
      search.classList.add('catalog-mobile-search');
      panel.classList.add('catalog-inline-filters');
      controls.classList.add('catalog-mobile-controls');

      if (search.parentElement !== results || search.previousElementSibling !== heading) {
        heading.insertAdjacentElement('afterend', search);
      }
      if (panel.parentElement !== results || panel.previousElementSibling !== search) {
        search.insertAdjacentElement('afterend', panel);
      }
      if (controls.parentElement !== results || controls.previousElementSibling !== panel) {
        panel.insertAdjacentElement('afterend', controls);
      }
      return;
    }

    workspace.classList.remove('filters-below-catalog');
    search.classList.remove('catalog-mobile-search');
    panel.classList.remove('catalog-inline-filters');
    controls.classList.remove('catalog-mobile-controls');

    if (search.parentElement !== catalogView || search.nextElementSibling !== workspace) {
      catalogView.insertBefore(search, workspace);
    }
    if (panel.parentElement !== workspace || panel.nextElementSibling !== results) {
      workspace.insertBefore(panel, results);
    }
    if (controls.parentElement !== heading) {
      heading.appendChild(controls);
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

  mobileFiltersQuery.addEventListener?.('change', placeMobileCatalogControls);
  ensureStyles();
  placeMobileCatalogControls();
  observeComparisonHost();
  watchProductView();
})();
