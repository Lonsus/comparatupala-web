'use strict';

(() => {
  const STYLE_ID = 'history-store-actions-style';
  let productObserver = null;

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .history-store-clear{min-height:32px;padding:6px 10px;border:1px solid var(--line);border-radius:8px;background:#fff;color:var(--green-dark);font-size:12px;font-weight:700;white-space:nowrap}
      .history-store-clear:hover:not(:disabled){background:var(--green-soft);border-color:#b9d9c5}
      .history-store-clear:focus-visible{outline:2px solid var(--green-dark);outline-offset:2px}
      @media(max-width:540px){.history-store-clear{width:100%;justify-content:center}}
    `;
    document.head.appendChild(style);
  }

  function syncClearButton() {
    const host = document.querySelector('#history-panel .chart-stores');
    if (!host) return;
    const inputs = [...host.querySelectorAll('input[data-chart-store]')];
    const button = host.querySelector('[data-history-store-clear]');
    if (button) button.disabled = !inputs.length || inputs.every(input => !input.checked);
  }

  function ensureClearButton() {
    const host = document.querySelector('#history-panel .chart-stores');
    if (!host) return;

    let button = host.querySelector('[data-history-store-clear]');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'history-store-clear';
      button.dataset.historyStoreClear = 'true';
      button.textContent = 'Deseleccionar todas';
      button.setAttribute('aria-label', 'Deseleccionar todas las tiendas del histórico de precios');
      host.appendChild(button);
    }

    syncClearButton();
  }

  function clearStores() {
    const host = document.querySelector('#history-panel .chart-stores');
    if (!host || !state.product) return;

    const inputs = [...host.querySelectorAll('input[data-chart-store]')];
    state.hiddenStores = new Set(inputs.map(input => input.dataset.chartStore).filter(Boolean));
    inputs.forEach(input => { input.checked = false; });
    renderChart();
    syncClearButton();
    host.querySelector('[data-history-store-clear]')?.focus({preventScroll: true});
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('[data-history-store-clear]');
    if (!button) return;
    clearStores();
  });

  document.addEventListener('change', event => {
    if (!event.target.matches('input[data-chart-store]')) return;
    requestAnimationFrame(syncClearButton);
  });

  function watchProductView() {
    productObserver?.disconnect();
    const root = document.getElementById('product-view');
    if (!root) return;
    productObserver = new MutationObserver(() => ensureClearButton());
    productObserver.observe(root, {childList: true, subtree: true});
  }

  ensureStyles();
  ensureClearButton();
  watchProductView();
})();
