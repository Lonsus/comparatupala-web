'use strict';

(() => {
  const STYLE_ID = 'store-collapsible-sections-style';
  let scheduled = false;

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .store-collapsible-section{margin:0 0 18px;border:1px solid var(--line);border-radius:16px;background:var(--surface);overflow:hidden}
      .store-collapsible-summary{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:18px 20px;cursor:pointer;list-style:none;user-select:none}
      .store-collapsible-summary::-webkit-details-marker{display:none}
      .store-collapsible-summary-copy{min-width:0}
      .store-collapsible-summary .eyebrow{margin:0 0 5px}
      .store-collapsible-summary h2{margin:0 0 5px;font-size:22px}
      .store-collapsible-summary p{margin:0;color:var(--muted);font-size:13px}
      .store-collapsible-indicator{display:grid;place-items:center;flex:0 0 auto;width:34px;height:34px;border:1px solid var(--line);border-radius:50%;background:#f7faf8;color:var(--green-dark);font-size:20px;line-height:1}
      .store-collapsible-indicator::before{content:'+'}
      .store-collapsible-section[open]>.store-collapsible-summary .store-collapsible-indicator::before{content:'−'}
      .store-collapsible-section[open]>.store-collapsible-summary{border-bottom:1px solid var(--line)}
      .store-collapsible-section>.store-stats{margin:0;padding:18px}
      .store-collapsible-section>.store-catalog{border-top:0;padding:20px}
      .store-collapsible-section>.store-catalog>.store-catalog-heading{display:none}
      @media(max-width:560px){
        .store-collapsible-summary{padding:15px 14px}
        .store-collapsible-summary h2{font-size:20px}
        .store-collapsible-section>.store-stats,.store-collapsible-section>.store-catalog{padding:14px}
      }
      @media(prefers-reduced-motion:reduce){.store-collapsible-section{scroll-behavior:auto}}
    `;
    document.head.appendChild(style);
  }

  function wrapStats(detail) {
    const stats = detail.querySelector(':scope > .store-stats');
    if (!stats || stats.dataset.collapsibleEnhanced === 'true') return;

    const wrapper = document.createElement('details');
    wrapper.className = 'store-collapsible-section store-stats-section';
    wrapper.open = true;
    wrapper.innerHTML = `
      <summary class="store-collapsible-summary">
        <div class="store-collapsible-summary-copy">
          <p class="eyebrow">RESUMEN DE LA TIENDA</p>
          <h2 id="store-stats-title">Datos y estadísticas</h2>
          <p>Catálogo monitorizado, disponibilidad, precios y descuentos.</p>
        </div>
        <span class="store-collapsible-indicator" aria-hidden="true"></span>
      </summary>`;

    stats.dataset.collapsibleEnhanced = 'true';
    stats.setAttribute('aria-labelledby', 'store-stats-title');
    stats.before(wrapper);
    wrapper.appendChild(stats);
  }

  function wrapCatalog(detail) {
    const catalog = detail.querySelector(':scope > .store-catalog');
    if (!catalog || catalog.dataset.collapsibleEnhanced === 'true') return;

    const heading = catalog.querySelector(':scope > .store-catalog-heading');
    const originalTitle = heading?.querySelector('h2');
    const title = originalTitle?.textContent?.trim() || 'Catálogo de la tienda';
    const eyebrow = heading?.querySelector('.eyebrow')?.textContent?.trim() || 'CATÁLOGO DE LA TIENDA';
    const status = heading?.querySelector('#store-result-count');

    const wrapper = document.createElement('details');
    wrapper.className = 'store-collapsible-section store-catalog-section';
    wrapper.open = true;
    wrapper.innerHTML = `
      <summary class="store-collapsible-summary">
        <div class="store-collapsible-summary-copy">
          <p class="eyebrow"></p>
          <h2 id="store-catalog-collapsible-title"></h2>
          <p class="store-collapsible-catalog-status muted"></p>
        </div>
        <span class="store-collapsible-indicator" aria-hidden="true"></span>
      </summary>`;

    wrapper.querySelector('.eyebrow').textContent = eyebrow;
    wrapper.querySelector('#store-catalog-collapsible-title').textContent = title;
    originalTitle?.removeAttribute('id');
    catalog.setAttribute('aria-labelledby', 'store-catalog-collapsible-title');
    catalog.dataset.collapsibleEnhanced = 'true';
    catalog.before(wrapper);
    wrapper.appendChild(catalog);

    const summaryStatus = wrapper.querySelector('.store-collapsible-catalog-status');
    if (summaryStatus && status) {
      const syncStatus = () => { summaryStatus.textContent = status.textContent || ''; };
      syncStatus();
      new MutationObserver(syncStatus).observe(status, {childList: true, characterData: true, subtree: true});
    }
  }

  function enhanceStoreSections() {
    scheduled = false;
    ensureStyles();
    document.querySelectorAll('#store-view .store-detail').forEach(detail => {
      wrapStats(detail);
      wrapCatalog(detail);
    });
  }

  function scheduleEnhancement() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(enhanceStoreSections);
  }

  function loadStoreCatalogEnhancements() {
    if (document.querySelector('script[data-store-catalog-enhancements]')) return;
    const script = document.createElement('script');
    script.src = 'store-catalog-enhancements.js?v=1';
    script.async = false;
    script.dataset.storeCatalogEnhancements = 'true';
    document.body.appendChild(script);
  }

  ensureStyles();
  scheduleEnhancement();
  new MutationObserver(scheduleEnhancement).observe(document.body, {childList: true, subtree: true});
  loadStoreCatalogEnhancements();
})();
