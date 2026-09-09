'use strict';

(() => {
  const STYLE_ID = 'history-store-actions-style';
  let productObserver = null;

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .history-store-actions{display:flex;align-items:center;gap:8px}
      .history-store-action{min-height:32px;padding:6px 10px;border:1px solid var(--line);border-radius:8px;background:#fff;color:var(--green-dark);font-size:12px;font-weight:700;white-space:nowrap}
      .history-store-action:hover:not(:disabled){background:var(--green-soft);border-color:#b9d9c5}
      .history-store-action:focus-visible{outline:2px solid var(--green-dark);outline-offset:2px}
      @media(max-width:540px){
        .history-store-actions{flex:1 0 100%;width:100%;display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:2px}
        .history-store-action{width:100%;justify-content:center}
      }
    `;
    document.head.appendChild(style);
  }

  function getStoreControls() {
    const host = document.querySelector('#history-panel .chart-stores');
    if (!host) return null;
    return {
      host,
      inputs: [...host.querySelectorAll('input[data-chart-store]')],
      selectButton: host.querySelector('[data-history-store-select]'),
      clearButton: host.querySelector('[data-history-store-clear]')
    };
  }

  function syncActionButtons() {
    const controls = getStoreControls();
    if (!controls) return;

    const {inputs, selectButton, clearButton} = controls;
    const hasInputs = inputs.length > 0;
    const allSelected = hasInputs && inputs.every(input => input.checked);
    const noneSelected = !hasInputs || inputs.every(input => !input.checked);

    if (selectButton) selectButton.disabled = !hasInputs || allSelected;
    if (clearButton) clearButton.disabled = noneSelected;
  }

  function ensureActionButtons() {
    const host = document.querySelector('#history-panel .chart-stores');
    if (!host) return;

    let actions = host.querySelector('.history-store-actions');
    if (!actions) {
      actions = document.createElement('div');
      actions.className = 'history-store-actions';
      actions.setAttribute('role', 'group');
      actions.setAttribute('aria-label', 'Acciones de selección de tiendas del histórico de precios');
      host.appendChild(actions);
    }

    let selectButton = actions.querySelector('[data-history-store-select]');
    if (!selectButton) {
      selectButton = document.createElement('button');
      selectButton.type = 'button';
      selectButton.className = 'history-store-action';
      selectButton.dataset.historyStoreSelect = 'true';
      selectButton.textContent = 'Seleccionar todas';
      selectButton.setAttribute('aria-label', 'Seleccionar todas las tiendas del histórico de precios');
      actions.appendChild(selectButton);
    }

    let clearButton = host.querySelector('[data-history-store-clear]');
    if (!clearButton) {
      clearButton = document.createElement('button');
      clearButton.type = 'button';
      clearButton.className = 'history-store-action';
      clearButton.dataset.historyStoreClear = 'true';
      clearButton.textContent = 'Deseleccionar todas';
      clearButton.setAttribute('aria-label', 'Deseleccionar todas las tiendas del histórico de precios');
    }
    if (clearButton.parentElement !== actions) actions.appendChild(clearButton);

    syncActionButtons();
  }

  function selectStores() {
    const controls = getStoreControls();
    if (!controls || !state.product) return;

    const {inputs, selectButton} = controls;
    state.hiddenStores = new Set();
    inputs.forEach(input => { input.checked = true; });
    renderChart();
    syncActionButtons();
    selectButton?.focus({preventScroll: true});
  }

  function clearStores() {
    const controls = getStoreControls();
    if (!controls || !state.product) return;

    const {inputs, clearButton} = controls;
    state.hiddenStores = new Set(inputs.map(input => input.dataset.chartStore).filter(Boolean));
    inputs.forEach(input => { input.checked = false; });
    renderChart();
    syncActionButtons();
    clearButton?.focus({preventScroll: true});
  }

  document.addEventListener('click', event => {
    if (event.target.closest('[data-history-store-select]')) {
      selectStores();
      return;
    }
    if (event.target.closest('[data-history-store-clear]')) clearStores();
  });

  document.addEventListener('change', event => {
    if (!event.target.matches('input[data-chart-store]')) return;
    requestAnimationFrame(syncActionButtons);
  });

  function watchProductView() {
    productObserver?.disconnect();
    const root = document.getElementById('product-view');
    if (!root) return;
    productObserver = new MutationObserver(() => ensureActionButtons());
    productObserver.observe(root, {childList: true, subtree: true});
  }

  ensureStyles();
  ensureActionButtons();
  watchProductView();
})();
