'use strict';

(() => {
  let preferredSection = null;
  let scheduled = false;

  function currentDetailNav() {
    return document.querySelector('#product-view .detail-nav-sticky');
  }

  function setActiveLink(nav, link) {
    nav.querySelectorAll('[data-scroll]').forEach(item => {
      const active = item === link;
      item.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  }

  function updateActiveSection() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      scheduled = false;
      const nav = currentDetailNav();
      if (!nav) return;
      const marker = nav.getBoundingClientRect().bottom + 18;
      const items = [...nav.querySelectorAll('[data-scroll]')]
        .map((link, index) => {
          const target = document.getElementById(link.dataset.scroll);
          return target ? {link, target, index, rect: target.getBoundingClientRect()} : null;
        })
        .filter(Boolean);
      if (!items.length) return;

      const preferred = items.find(item => item.target.id === preferredSection);
      if (preferred && preferred.rect.top <= marker && preferred.rect.bottom >= marker) {
        setActiveLink(nav, preferred.link);
        return;
      }
      if (preferred && (preferred.rect.bottom < marker || preferred.rect.top > window.innerHeight)) preferredSection = null;

      const intersecting = items.filter(item => item.rect.top <= marker && item.rect.bottom >= marker);
      const active = intersecting
        .sort((a, b) => Math.abs(a.rect.top - marker) - Math.abs(b.rect.top - marker) || a.index - b.index)[0]
        || items.filter(item => item.rect.top <= marker).sort((a, b) => b.rect.top - a.rect.top || a.index - b.index)[0]
        || items[0];
      setActiveLink(nav, active.link);
    }));
  }

  document.addEventListener('click', event => {
    const link = event.target.closest('#product-view .detail-nav-sticky [data-scroll]');
    if (!link) return;
    preferredSection = link.dataset.scroll;
    setActiveLink(link.closest('.detail-nav-sticky'), link);
    updateActiveSection();
  });

  window.addEventListener('scroll', updateActiveSection, {passive: true});
  window.addEventListener('resize', updateActiveSection, {passive: true});
  document.addEventListener('toggle', event => {
    if (event.target.closest?.('#product-view')) updateActiveSection();
  }, true);

  const originalCard = card;
  card = function cardCurrencySafe(row) {
    let html = originalCard(row);
    const best = row.best;
    if (!best) return html;
    const byStore = new Map();
    (row.offers || []).forEach(offer => {
      if (!offer?.store || !available(offer) || !validPrice(offer.price)) return;
      const previous = byStore.get(offer.store);
      if (!previous || Number(offer.price) < Number(previous.price)) byStore.set(offer.store, offer);
    });
    const next = [...byStore.values()]
      .filter(offer => offer.store !== best.store)
      .sort((a, b) => Number(a.price) - Number(b.price))[0];
    if (next && (next.currency || 'EUR') !== (best.currency || 'EUR')) {
      html = html.replace(/<p class="card-saving">[\s\S]*?<\/p>/, '');
    }
    return html;
  };

  queueMicrotask(() => {
    const products = document.getElementById('products');
    if (state.loaded && !state.product && products && products.querySelector('.card:not(.decision-card):not(.skeleton-card)')) {
      renderCatalog();
    }
    updateActiveSection();
  });
})();

(() => {
  const PAGE_SIZE_KEY = 'comparatupala:page-size';
  const PAGE_SIZES = [12, 24, 48];

  function preferredPageSize() {
    try {
      const saved = Number(localStorage.getItem(PAGE_SIZE_KEY));
      return PAGE_SIZES.includes(saved) ? saved : PAGE_SIZES[0];
    } catch {
      return PAGE_SIZES[0];
    }
  }

  state.pageSize = preferredPageSize();

  function setupPageSizePreference() {
    const controls = document.querySelector('.catalog-controls');
    if (!controls) return;

    let select = document.getElementById('page-size');
    if (!select) {
      const label = document.createElement('label');
      label.className = 'page-size-control field';
      label.innerHTML = `<span>Palas por página</span><select id="page-size" aria-label="Palas por página">${PAGE_SIZES.map(size => `<option value="${size}">${size}</option>`).join('')}</select>`;
      const viewToggle = controls.querySelector('.catalog-view-toggle');
      if (viewToggle) controls.insertBefore(label, viewToggle);
      else controls.appendChild(label);
      select = label.querySelector('#page-size');

      select.addEventListener('change', () => {
        const next = Number(select.value);
        if (!PAGE_SIZES.includes(next)) return;
        state.pageSize = next;
        state.page = 1;
        try { localStorage.setItem(PAGE_SIZE_KEY, String(next)); } catch {}
        renderCatalog();
        document.getElementById('page-size')?.focus({preventScroll: true});
      });
    }

    select.value = String(state.pageSize);
  }

  function loadComparisonBulkActions() {
    if (document.querySelector('script[data-comparison-bulk-actions]')) return;
    const bulkScript = document.createElement('script');
    bulkScript.src = 'comparison-bulk-actions.js?v=5';
    bulkScript.async = false;
    bulkScript.dataset.comparisonBulkActions = 'true';
    document.body.appendChild(bulkScript);
  }

  function loadHistoryStoreActions() {
    if (document.querySelector('script[data-history-store-actions]')) return;
    const historyScript = document.createElement('script');
    historyScript.src = 'history-store-actions.js?v=1';
    historyScript.async = false;
    historyScript.dataset.historyStoreActions = 'true';
    document.body.appendChild(historyScript);
  }

  function loadStoreCollapsibleSections() {
    if (document.querySelector('script[data-store-collapsible-sections]')) return;
    const storeScript = document.createElement('script');
    storeScript.src = 'store-collapsible-sections.js?v=1';
    storeScript.async = false;
    storeScript.dataset.storeCollapsibleSections = 'true';
    document.body.appendChild(storeScript);
  }

  function loadOfferPriceDetails(onReady) {
    if (document.querySelector('script[data-offer-price-details]')) {
      onReady?.();
      return;
    }
    const offerScript = document.createElement('script');
    offerScript.src = 'offer-price-details.js?v=5';
    offerScript.async = false;
    offerScript.dataset.offerPriceDetails = 'true';
    offerScript.addEventListener('load', () => onReady?.());
    document.body.appendChild(offerScript);
  }

  function renderAfterEnhancements() {
    if (state.loaded) {
      if (state.product) renderProduct(state.product);
      else renderCatalog();
    }
    loadComparisonBulkActions();
    loadHistoryStoreActions();
    loadStoreCollapsibleSections();
  }

  function loadProgressiveDisclosure() {
    if (!document.querySelector('link[data-progressive-disclosure]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'progressive-disclosure.css?v=7';
      link.dataset.progressiveDisclosure = 'true';
      document.head.appendChild(link);
    }

    if (document.querySelector('script[data-progressive-disclosure]')) {
      setupPageSizePreference();
      loadOfferPriceDetails(renderAfterEnhancements);
      return;
    }
    const script = document.createElement('script');
    script.src = 'progressive-disclosure.js?v=3';
    script.async = false;
    script.dataset.progressiveDisclosure = 'true';
    script.addEventListener('load', () => {
      setupPageSizePreference();
      loadOfferPriceDetails(renderAfterEnhancements);
    });
    document.body.appendChild(script);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadProgressiveDisclosure, {once: true});
  else loadProgressiveDisclosure();
})();
