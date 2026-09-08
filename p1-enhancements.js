'use strict';

(() => {
  const P1_STYLE_ID = 'p1-interface-fluidity-style';
  const mobileQuery = matchMedia('(max-width:800px)');
  let detailAbort = null;
  let detailTicking = false;
  let comparisonObserver = null;

  function ensureStyles() {
    if (document.getElementById(P1_STYLE_ID)) return;
    const link = document.createElement('link');
    link.id = P1_STYLE_ID;
    link.rel = 'stylesheet';
    link.href = 'p1-enhancements.css?v=p1-1';
    document.head.appendChild(link);
  }

  function skeletonMarkup(count = 6) {
    return Array.from({length: count}, () => `
      <article class="card skeleton-card" aria-hidden="true">
        <div class="skeleton-media skeleton-block"></div>
        <div class="skeleton-body">
          <span class="skeleton-line skeleton-line-short skeleton-block"></span>
          <span class="skeleton-line skeleton-line-title skeleton-block"></span>
          <div class="skeleton-tags"><span class="skeleton-pill skeleton-block"></span><span class="skeleton-pill skeleton-block"></span></div>
          <span class="skeleton-line skeleton-line-price skeleton-block"></span>
          <span class="skeleton-line skeleton-line-meta skeleton-block"></span>
        </div>
      </article>`).join('');
  }

  function showInitialSkeletons() {
    const root = document.getElementById('products');
    if (!root || root.getAttribute('aria-busy') !== 'true') return;
    root.innerHTML = skeletonMarkup(mobileQuery.matches ? 4 : 6);
  }

  function distinctAvailableOffers(offers) {
    const byStore = new Map();
    (offers || []).forEach(offer => {
      if (!offer?.store || !available(offer) || !validPrice(offer.price)) return;
      const previous = byStore.get(offer.store);
      if (!previous || Number(offer.price) < Number(previous.price)) byStore.set(offer.store, offer);
    });
    return [...byStore.values()].sort((a, b) => Number(a.price) - Number(b.price));
  }

  card = function cardP1(row) {
    const {product: p, best, offers} = row;
    const source = best || offers[0];
    const specs = ['shape', 'play', 'level'].map(key => feature(source, key)).filter(Boolean).slice(0, 3);
    const d = discount(best);
    const pvpSource = [best, ...offers].find(offer => offer && validPrice(offer.original_price));
    const pvp = pvpSource?.original_price;
    const href = '#pala/' + encodeURIComponent(p.id);
    const distinctStores = [...new Set((p.offers || offers).map(offer => offer.store).filter(Boolean))];
    const ranked = distinctAvailableOffers(offers);
    const nextStoreOffer = best ? ranked.find(offer => offer.store !== best.store) : null;
    const saving = best && nextStoreOffer && validPrice(best.price)
      ? Number(nextStoreOffer.price) - Number(best.price)
      : null;
    const savingMarkup = Number.isFinite(saving) && saving > 0
      ? `<p class="card-saving">Ahorra <strong>${money(saving, best.currency || nextStoreOffer.currency)}</strong> frente a la siguiente tienda</p>`
      : '';

    return `<article class="card decision-card">
      <div class="card-visual">
        ${d ? `<span class="discount-badge">−${d}% sobre PVP</span>` : ''}
        ${saveButton(p)}
        <a href="${href}" tabindex="-1" aria-hidden="true">${productImage({...p, image_url: source.image_url || p.image_url})}</a>
      </div>
      <div class="card-body">
        <p class="brand">${esc(p.brand || 'Marca sin indicar')}</p>
        <h3><a href="${href}">${esc(p.name)}</a></h3>
        ${specs.length ? `<div class="feature-tags">${specs.map(value => `<span>${esc(value)}</span>`).join('')}</div>` : ''}
        <div class="card-decision">
          <small>${best ? 'Mejor precio disponible' : 'Sin oferta disponible'}</small>
          <div class="card-decision-price">${money(best?.price, best?.currency)}</div>
          <div class="card-decision-store">${best ? dot(best.store) + esc(storeName(best.store)) : 'Consulta las tiendas'}</div>
          ${validPrice(pvp) ? `<span class="card-pvp">PVP ${money(pvp, pvpSource?.currency || best?.currency)}</span>` : ''}
        </div>
        ${savingMarkup}
        <p class="card-compare-meta">${distinctStores.length} tienda${distinctStores.length === 1 ? '' : 's'} para comparar</p>
      </div>
      <div class="card-footer decision-card-footer">
        <a href="${href}">Comparar precios y características →</a>
      </div>
    </article>`;
  };

  function markStoreSelectors(root = document) {
    root.querySelectorAll('.comparison-stores, #history-panel .chart-stores').forEach(group => {
      group.classList.add('store-selector');
      group.querySelectorAll('label').forEach(label => label.classList.add('store-selector-option'));
    });
  }

  function observeComparisonSelectors() {
    comparisonObserver?.disconnect();
    const host = document.getElementById('comparison-content');
    if (!host) return;
    comparisonObserver = new MutationObserver(() => markStoreSelectors(host));
    comparisonObserver.observe(host, {childList: true, subtree: true});
  }

  function ensureChartTooltip() {
    let tooltip = document.getElementById('price-chart-tooltip');
    if (tooltip) return tooltip;
    tooltip = document.createElement('div');
    tooltip.id = 'price-chart-tooltip';
    tooltip.className = 'chart-tooltip';
    tooltip.hidden = true;
    tooltip.setAttribute('role', 'tooltip');
    document.body.appendChild(tooltip);
    return tooltip;
  }

  function tooltipParts(text) {
    const parts = String(text || '').split(' · ').filter(Boolean);
    return {
      store: parts[0] || 'Tienda',
      at: parts[1] || '',
      price: parts[2] || '',
      note: parts.slice(3).join(' · ')
    };
  }

  function positionTooltip(tooltip, clientX, clientY) {
    const margin = 12;
    tooltip.style.left = '0px';
    tooltip.style.top = '0px';
    const rect = tooltip.getBoundingClientRect();
    const left = Math.min(window.innerWidth - rect.width - margin, Math.max(margin, clientX + 14));
    const topCandidate = clientY - rect.height - 14;
    const top = topCandidate >= margin ? topCandidate : Math.min(window.innerHeight - rect.height - margin, clientY + 14);
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${Math.max(margin, top)}px`;
  }

  function bindChartTooltip() {
    const chart = document.querySelector('#history-panel .price-chart');
    if (!chart) return;
    const tooltip = ensureChartTooltip();

    chart.querySelectorAll('circle').forEach(circle => {
      if (circle.dataset.p1TooltipBound === 'true') return;
      const title = circle.querySelector('title');
      const text = title?.textContent?.trim();
      if (!text) return;
      circle.dataset.p1TooltipBound = 'true';
      circle.dataset.tooltipText = text;
      circle.setAttribute('tabindex', '0');
      circle.setAttribute('role', 'img');
      circle.setAttribute('aria-label', text);
      title.remove();

      const show = event => {
        const parts = tooltipParts(circle.dataset.tooltipText);
        tooltip.innerHTML = `<strong>${esc(parts.store)}</strong><span>${esc(parts.at)}</span><b>${esc(parts.price)}</b>${parts.note ? `<small>${esc(parts.note)}</small>` : ''}`;
        tooltip.hidden = false;
        const rect = circle.getBoundingClientRect();
        const x = event?.clientX || rect.left + rect.width / 2;
        const y = event?.clientY || rect.top + rect.height / 2;
        positionTooltip(tooltip, x, y);
      };
      const hide = () => { tooltip.hidden = true; };

      circle.addEventListener('pointerenter', show);
      circle.addEventListener('pointermove', event => positionTooltip(tooltip, event.clientX, event.clientY));
      circle.addEventListener('pointerleave', hide);
      circle.addEventListener('focus', show);
      circle.addEventListener('blur', hide);
    });
  }

  function updateDetailNavActive() {
    if (detailTicking) return;
    detailTicking = true;
    requestAnimationFrame(() => {
      detailTicking = false;
      const nav = document.querySelector('#product-view .detail-nav');
      if (!nav) return;
      const links = [...nav.querySelectorAll('[data-scroll]')];
      const targets = links.map(link => ({
        link,
        target: document.getElementById(link.dataset.scroll)
      })).filter(item => item.target);
      if (!targets.length) return;

      const marker = nav.getBoundingClientRect().bottom + 18;
      let active = targets[0];
      for (const item of targets) {
        if (item.target.getBoundingClientRect().top <= marker) active = item;
      }
      targets.forEach(item => {
        const selected = item === active;
        item.link.classList.toggle('active', selected);
        if (selected) item.link.setAttribute('aria-current', 'location');
        else item.link.removeAttribute('aria-current');
      });
    });
  }

  function enhanceDetailNavigation() {
    detailAbort?.abort();
    detailAbort = new AbortController();
    const nav = document.querySelector('#product-view .detail-nav');
    if (!nav) return;
    nav.classList.add('detail-nav-sticky');
    updateDetailNavActive();
    window.addEventListener('scroll', updateDetailNavActive, {passive: true, signal: detailAbort.signal});
    window.addEventListener('resize', updateDetailNavActive, {passive: true, signal: detailAbort.signal});
    document.getElementById('product-view')?.addEventListener('toggle', updateDetailNavActive, {capture: true, signal: detailAbort.signal});
  }

  const originalRenderChart = renderChart;
  renderChart = function renderChartP1() {
    originalRenderChart();
    markStoreSelectors(document.getElementById('history-panel') || document);
    bindChartTooltip();
  };

  const originalRenderProduct = renderProduct;
  renderProduct = function renderProductP1(product) {
    originalRenderProduct(product);
    markStoreSelectors(document.getElementById('product-view') || document);
    observeComparisonSelectors();
    bindChartTooltip();
    enhanceDetailNavigation();
  };

  function setupMobileFilterDrawer() {
    const panel = document.querySelector('.filters-panel');
    const toggle = document.getElementById('filter-toggle');
    const resultCount = document.getElementById('result-count');
    if (!panel || !toggle) return;

    const backdrop = document.createElement('button');
    backdrop.type = 'button';
    backdrop.className = 'filter-drawer-backdrop';
    backdrop.hidden = true;
    backdrop.setAttribute('aria-label', 'Cerrar filtros');
    document.body.appendChild(backdrop);

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'filter-drawer-close';
    close.setAttribute('aria-label', 'Cerrar filtros');
    close.textContent = '×';
    panel.prepend(close);

    const actions = document.createElement('div');
    actions.className = 'filter-drawer-actions';
    actions.innerHTML = '<button type="button" class="primary-button filter-drawer-results">Ver resultados</button>';
    panel.appendChild(actions);
    const resultsButton = actions.querySelector('.filter-drawer-results');

    const syncResultsLabel = () => {
      const raw = resultCount?.textContent?.trim() || '';
      const first = raw.split(' · ')[0];
      resultsButton.textContent = first ? `Ver ${first}` : 'Ver resultados';
    };

    const closeDrawer = ({restoreFocus = true, scrollToResults = false} = {}) => {
      if (!panel.classList.contains('is-mobile-drawer-open')) return;
      panel.classList.remove('is-mobile-drawer-open');
      document.body.classList.remove('filter-drawer-open');
      backdrop.hidden = true;
      setFiltersExpanded(false);
      if (scrollToResults) {
        document.getElementById('results-title')?.scrollIntoView({
          behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
          block: 'start'
        });
      }
      if (restoreFocus) toggle.focus({preventScroll: true});
    };

    const openDrawer = () => {
      if (!mobileQuery.matches) return;
      setFiltersExpanded(true);
      panel.classList.add('is-mobile-drawer-open');
      document.body.classList.add('filter-drawer-open');
      backdrop.hidden = false;
      syncResultsLabel();
      close.focus({preventScroll: true});
    };

    document.addEventListener('click', event => {
      if (!mobileQuery.matches || !event.target.closest('#filter-toggle')) return;
      event.preventDefault();
      event.stopPropagation();
      if (panel.classList.contains('is-mobile-drawer-open')) closeDrawer();
      else openDrawer();
    }, true);

    close.addEventListener('click', () => closeDrawer());
    backdrop.addEventListener('click', () => closeDrawer());
    resultsButton.addEventListener('click', () => closeDrawer({restoreFocus: false, scrollToResults: true}));
    window.addEventListener('hashchange', () => closeDrawer({restoreFocus: false}));

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && panel.classList.contains('is-mobile-drawer-open')) {
        event.preventDefault();
        closeDrawer();
      }
    });

    mobileQuery.addEventListener('change', event => {
      if (event.matches) {
        closeDrawer({restoreFocus: false});
        setFiltersExpanded(false);
      } else {
        panel.classList.remove('is-mobile-drawer-open');
        document.body.classList.remove('filter-drawer-open');
        backdrop.hidden = true;
        setFiltersExpanded(true);
      }
    });

    if (resultCount) new MutationObserver(syncResultsLabel).observe(resultCount, {childList: true, subtree: true, characterData: true});
    syncResultsLabel();
  }

  ensureStyles();
  showInitialSkeletons();
  setupMobileFilterDrawer();

  const productRoot = document.getElementById('product-view');
  if (productRoot) {
    new MutationObserver(() => markStoreSelectors(productRoot)).observe(productRoot, {childList: true, subtree: true});
  }
})();
