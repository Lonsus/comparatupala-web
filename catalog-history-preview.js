'use strict';

(() => {
  productImage = function productImageWithPublishedPaths(product, detail = false) {
    const offers = product.offers || [];
    const urls = [...new Set([
      product.image_url,
      ...offers.filter(offer => offer.active !== false).map(offer => offer.image_url),
      ...offers.filter(offer => offer.active === false).map(offer => offer.image_url)
    ].map(publishedImageUrl).filter(Boolean))];

    return `<div class="product-media ${detail ? 'detail-media' : ''} ${urls.length ? '' : 'is-missing'}">${urls.length ? `<img src="${esc(urls[0])}" data-image-fallbacks="${esc(JSON.stringify(urls.slice(1)))}" alt="${esc(product.name)}" loading="lazy">` : ''}<span>Imagen no disponible</span></div>`;
  };
})();

(() => {
  const STYLE_ID = 'catalog-history-preview-style';
  const CARD_SELECTOR = '#products > .card:not(.skeleton-card)';
  const statsCache = new Map();
  let scheduled = false;
  let historyHashHandled = '';

  const historyIcon = () => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>`;

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .catalog-history-card{position:relative}
      .catalog-history-overlay{position:absolute;z-index:4;inset:0;display:flex;align-items:center;justify-content:center;padding:18px;border-radius:inherit;background:rgba(12,25,18,.9);color:#fff;opacity:0;visibility:hidden;pointer-events:none;transition:opacity .18s ease,visibility .18s ease;backdrop-filter:blur(3px)}
      .catalog-history-overlay-inner{width:100%;display:grid;gap:14px;text-align:center}
      .catalog-history-kicker{margin:0;color:#8ff0bd;font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}
      .catalog-history-title{margin:0;color:#d4e3da;font-size:12px;font-weight:650}
      .catalog-history-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
      .catalog-history-stat{min-width:0;padding:10px 7px;border:1px solid rgba(190,229,207,.18);border-radius:10px;background:rgba(255,255,255,.06)}
      .catalog-history-stat span{display:block;margin-bottom:4px;color:#a9bdb1;font-size:10px;line-height:1.2}
      .catalog-history-stat strong{display:block;color:#fff;font-size:clamp(15px,1.6vw,20px);line-height:1.15;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
      .catalog-history-link{display:inline-flex;justify-content:center;align-items:center;gap:6px;justify-self:center;color:#7cebae;font-size:12px;font-weight:750}
      .catalog-history-link:hover{color:#a5f4c7}
      .catalog-history-trigger{position:absolute;z-index:6;right:12px;top:56px;display:inline-grid;place-items:center;width:36px;height:36px;min-height:36px;padding:0;border:1px solid #c7d9ce;border-radius:50%;background:#fff;color:var(--green-dark);box-shadow:0 3px 12px rgba(17,28,24,.1);opacity:1;transform:none;pointer-events:auto;transition:background .15s ease,border-color .15s ease,color .15s ease,box-shadow .15s ease}
      .catalog-history-trigger svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
      .catalog-history-trigger:hover,.catalog-history-trigger:focus-visible,.catalog-history-card.history-preview-open>.catalog-history-trigger{background:var(--green-soft);border-color:#a9dfc0;color:#08683f;box-shadow:0 5px 16px rgba(17,79,48,.14)}
      .catalog-history-card.history-preview-open>.catalog-history-overlay{opacity:1;visibility:visible;pointer-events:auto}
      .catalog-history-card .save-button{z-index:7}
      .catalog-list-row>.catalog-history-trigger{position:static;grid-column:5;grid-row:1;align-self:end;justify-self:end;width:31px;height:31px;min-height:31px}
      .catalog-list-row>.catalog-history-trigger svg{width:16px;height:16px}
      .catalog-list-row .catalog-history-overlay{padding:12px 18px}
      .catalog-list-row .catalog-history-overlay-inner{grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:18px;text-align:left}
      .catalog-list-row .catalog-history-heading{min-width:150px}
      .catalog-list-row .catalog-history-stats{gap:7px}
      .catalog-list-row .catalog-history-link{white-space:nowrap}
      .history-stats.history-stats-with-average{grid-template-columns:repeat(4,minmax(0,1fr))}
      .detail-actions{flex-wrap:wrap;justify-content:flex-end}
      .detail-history-trigger{display:inline-grid;place-items:center;flex:0 0 44px;width:44px;height:44px;min-width:44px;min-height:44px;padding:0;border:1px solid var(--line);border-radius:50%;background:#fff;color:#667b6c;box-shadow:none;transition:background .15s ease,border-color .15s ease,color .15s ease,box-shadow .15s ease}
      .detail-history-trigger svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
      .detail-history-trigger:hover,.detail-history-trigger:focus-visible,.detail-history-trigger[aria-expanded="true"]{background:var(--green-soft);border-color:#abe3c3;color:var(--green-dark);box-shadow:0 4px 14px rgba(17,79,48,.1)}
      @media(max-width:1000px){
        .catalog-list-row>.catalog-history-trigger{grid-column:4}
      }
      @media(max-width:800px){
        .catalog-list-row .catalog-history-overlay-inner{grid-template-columns:1fr;gap:10px;text-align:center}
        .catalog-list-row .catalog-history-heading{min-width:0}
        .catalog-history-overlay{padding:14px}
        .catalog-history-stat{padding:8px 5px}
        .catalog-history-stat strong{font-size:16px}
        .catalog-history-trigger{right:12px;top:50px;width:31px;height:31px;min-height:31px}
        .catalog-history-trigger svg{width:16px;height:16px}
        .catalog-list-row>.catalog-history-trigger{position:static;grid-column:3;grid-row:1;align-self:end;justify-self:end}
        .history-stats.history-stats-with-average{grid-template-columns:repeat(2,minmax(0,1fr))}
        .history-stats.history-stats-with-average>div:last-child{grid-column:auto}
      }
      @media(max-width:540px){
        .catalog-history-overlay{padding:10px}
        .catalog-history-overlay-inner{gap:9px}
        .catalog-history-kicker{font-size:9px}
        .catalog-history-title{font-size:10px}
        .catalog-history-stats{gap:5px}
        .catalog-history-stat{padding:7px 3px;border-radius:8px}
        .catalog-history-stat span{font-size:9px}
        .catalog-history-stat strong{font-size:13px}
        .catalog-history-link{font-size:11px}
        .catalog-history-trigger{right:12px;top:49px;width:30px;height:30px;min-height:30px}
        .catalog-history-trigger svg{width:15px;height:15px}
        .catalog-list-row>.catalog-history-trigger{position:static;grid-column:3;grid-row:1;align-self:end;justify-self:end;width:30px;height:30px;min-height:30px}
        .breadcrumb{align-items:flex-start}
        .detail-actions{margin-left:auto;flex-wrap:nowrap;gap:8px}
        .detail-actions .secondary-button{min-height:44px;white-space:nowrap}
      }
      @media(max-width:430px){
        .breadcrumb{display:grid;grid-template-columns:minmax(0,1fr);gap:10px}
        .detail-actions{display:grid;grid-template-columns:minmax(0,1fr) 44px 44px;width:100%;margin-left:0;gap:8px}
        .detail-actions .secondary-button{width:100%;min-width:0}
      }
      @media(prefers-reduced-motion:reduce){.catalog-history-overlay,.catalog-history-trigger,.detail-history-trigger{transition:none}}
    `;
    document.head.appendChild(style);
  }

  function productIdFromCard(card) {
    const link = card.querySelector('a[href^="#pala/"]');
    if (!link) return '';
    const raw = link.getAttribute('href').slice(6).split('?')[0];
    try { return decodeURIComponent(raw); } catch { return raw; }
  }

  function currencyForProduct(product) {
    const offer = (product?.offers || []).find(item => validPrice(item?.price));
    return offer?.currency || 'EUR';
  }

  function seriesForCurrency(model, currency) {
    return (model?.series || []).filter(series => (series.offer?.currency || 'EUR') === currency);
  }

  function timeWeightedAverage(series) {
    let weighted = 0;
    let duration = 0;
    const fallback = [];

    series.forEach(item => {
      const points = (item.points || []).filter(point => validPrice(point.price) && Number.isFinite(point.time));
      points.forEach(point => fallback.push(Number(point.price)));
      for (let index = 0; index < points.length - 1; index += 1) {
        const current = points[index];
        const next = points[index + 1];
        const span = Number(next.time) - Number(current.time);
        if (!Number.isFinite(span) || span <= 0) continue;
        weighted += Number(current.price) * span;
        duration += span;
      }
    });

    if (duration > 0) return weighted / duration;
    if (!fallback.length) return null;
    return fallback.reduce((sum, price) => sum + price, 0) / fallback.length;
  }

  function statsFromModel(model, currency) {
    const series = seriesForCurrency(model, currency);
    const prices = series.flatMap(item => (item.points || []).map(point => Number(point.price)).filter(Number.isFinite));
    if (!prices.length) return null;
    const average = timeWeightedAverage(series);
    return {
      min: Math.min(...prices),
      max: Math.max(...prices),
      average: Number.isFinite(average) ? average : null,
      currency
    };
  }

  function fullHistoryStats(product) {
    if (!product?.id || typeof chartSeries !== 'function') return null;
    if (statsCache.has(product.id)) return statsCache.get(product.id);
    const currency = currencyForProduct(product);
    const stats = statsFromModel(chartSeries(product, state.history, 0, new Set()), currency);
    statsCache.set(product.id, stats);
    return stats;
  }

  function overlayMarkup(product, stats) {
    const href = `#pala/${encodeURIComponent(product.id)}?historial=1`;
    return `<div class="catalog-history-overlay" data-catalog-history-overlay aria-hidden="true">
      <div class="catalog-history-overlay-inner">
        <div class="catalog-history-heading">
          <p class="catalog-history-kicker">Histórico completo</p>
          <p class="catalog-history-title">Precios registrados en todas las tiendas</p>
        </div>
        <div class="catalog-history-stats" aria-label="Resumen histórico de precios">
          <div class="catalog-history-stat"><span>Mínimo histórico</span><strong>${money(stats.min, stats.currency)}</strong></div>
          <div class="catalog-history-stat"><span>Precio medio</span><strong>${money(stats.average, stats.currency)}</strong></div>
          <div class="catalog-history-stat"><span>Máximo histórico</span><strong>${money(stats.max, stats.currency)}</strong></div>
        </div>
        <a class="catalog-history-link" href="${href}" tabindex="-1">Ver histórico →</a>
      </div>
    </div><button type="button" class="catalog-history-trigger" data-history-preview-toggle aria-expanded="false" aria-label="Mostrar histórico de precios de ${esc(product.name)}" title="Mostrar histórico de precios">${historyIcon()}</button>`;
  }

  function enhanceCards() {
    if (!state?.loaded || !Array.isArray(state.products)) return;
    document.querySelectorAll(CARD_SELECTOR).forEach(card => {
      if (card.dataset.historyPreviewEnhanced === 'true') return;
      const id = productIdFromCard(card);
      const product = state.products.find(item => String(item.id) === String(id));
      if (!product) return;
      const stats = fullHistoryStats(product);
      card.dataset.historyPreviewEnhanced = 'true';
      if (!stats || !Number.isFinite(stats.average)) return;
      card.classList.add('catalog-history-card');
      card.insertAdjacentHTML('beforeend', overlayMarkup(product, stats));
    });
  }

  function syncOverlayAria(card, open) {
    card.classList.toggle('history-preview-open', open);
    const trigger = card.querySelector('[data-history-preview-toggle]');
    trigger?.setAttribute('aria-expanded', String(open));
    const productName = card.querySelector('h3 a')?.textContent?.trim() || 'esta pala';
    trigger?.setAttribute('aria-label', `${open ? 'Ocultar' : 'Mostrar'} histórico de precios de ${productName}`);
    trigger?.setAttribute('title', open ? 'Ocultar histórico de precios' : 'Mostrar histórico de precios');
    card.querySelector('[data-catalog-history-overlay]')?.setAttribute('aria-hidden', String(!open));
    const overlayLink = card.querySelector('.catalog-history-link');
    if (overlayLink) overlayLink.tabIndex = open ? 0 : -1;
  }

  function closePreviews(except = null) {
    document.querySelectorAll('.catalog-history-card.history-preview-open').forEach(card => {
      if (card !== except) syncOverlayAria(card, false);
    });
  }

  function syncDetailHistoryButton(button, panel, product) {
    if (!button || !(panel instanceof HTMLDetailsElement)) return;
    const open = panel.open;
    const productName = product?.name || 'esta pala';
    button.setAttribute('aria-expanded', String(open));
    button.setAttribute('aria-label', `${open ? 'Ocultar' : 'Mostrar'} histórico de precios de ${productName}`);
    button.setAttribute('title', open ? 'Ocultar histórico de precios' : 'Mostrar histórico de precios');
  }

  function enhanceProductDetail() {
    const root = document.getElementById('product-view');
    const product = state?.product;
    if (!root || root.hidden || !product) return;
    const actions = root.querySelector('.detail-actions');
    const panel = document.getElementById('history-panel');
    if (!actions || !(panel instanceof HTMLDetailsElement)) return;

    let button = actions.querySelector('[data-detail-history-toggle]');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'detail-history-trigger';
      button.dataset.detailHistoryToggle = 'true';
      button.setAttribute('aria-controls', 'history-panel');
      button.innerHTML = historyIcon();

      const save = actions.querySelector('.save-button');
      if (save) save.insertAdjacentElement('afterend', button);
      else actions.appendChild(button);

      panel.addEventListener('toggle', () => syncDetailHistoryButton(button, panel, state?.product));
    }

    syncDetailHistoryButton(button, panel, product);
  }

  function decorateHistoryAverage() {
    const product = state?.product;
    const statsHost = document.querySelector('#chart-output .history-stats');
    if (!product || !statsHost || statsHost.querySelector('[data-history-average]') || typeof chartSeries !== 'function') return;
    const currency = currencyForProduct(product);
    const stats = statsFromModel(chartSeries(product, state.history, state.range, state.hiddenStores), currency);
    if (!stats || !Number.isFinite(stats.average)) return;

    const average = document.createElement('div');
    average.dataset.historyAverage = 'true';
    average.innerHTML = `<span>Precio medio del periodo</span><strong>${money(stats.average, stats.currency)}</strong>`;
    const children = [...statsHost.children];
    const maxBlock = children.find(block => block.querySelector('span')?.textContent?.includes('Máximo'));
    (maxBlock || statsHost.firstElementChild)?.insertAdjacentElement('afterend', average);
    statsHost.classList.add('history-stats-with-average');
  }

  function openHistoryFromHash() {
    if (!location.hash.startsWith('#pala/') || !location.hash.includes('historial=1')) return;
    if (historyHashHandled === location.hash) return;
    const panel = document.getElementById('history-panel');
    if (!(panel instanceof HTMLDetailsElement)) return;
    historyHashHandled = location.hash;
    panel.open = true;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      panel.scrollIntoView({behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start'});
    }));
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      ensureStyles();
      enhanceCards();
      enhanceProductDetail();
      decorateHistoryAverage();
      openHistoryFromHash();
    });
  }

  document.addEventListener('click', event => {
    const detailToggle = event.target.closest('[data-detail-history-toggle]');
    if (detailToggle) {
      event.preventDefault();
      event.stopPropagation();
      const panel = document.getElementById('history-panel');
      if (!(panel instanceof HTMLDetailsElement)) return;
      const opening = !panel.open;
      panel.open = opening;
      syncDetailHistoryButton(detailToggle, panel, state?.product);
      if (opening) {
        requestAnimationFrame(() => requestAnimationFrame(() => {
          panel.scrollIntoView({behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start'});
        }));
      }
      return;
    }

    const toggle = event.target.closest('[data-history-preview-toggle]');
    if (toggle) {
      event.preventDefault();
      event.stopPropagation();
      const card = toggle.closest('.catalog-history-card');
      if (!card) return;
      const open = !card.classList.contains('history-preview-open');
      closePreviews(card);
      syncOverlayAria(card, open);
      return;
    }
    if (!event.target.closest('.catalog-history-card.history-preview-open')) closePreviews();
  });

  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    const open = document.querySelector('.catalog-history-card.history-preview-open');
    if (!open) return;
    const trigger = open.querySelector('[data-history-preview-toggle]');
    syncOverlayAria(open, false);
    trigger?.focus({preventScroll: true});
  });

  window.addEventListener('hashchange', () => {
    closePreviews();
    historyHashHandled = '';
    schedule();
  });

  const observer = new MutationObserver(schedule);
  const start = () => {
    ensureStyles();
    observer.observe(document.body, {childList: true, subtree: true});
    schedule();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once: true});
  else start();
})();
