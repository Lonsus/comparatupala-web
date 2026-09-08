'use strict';

// Progressive disclosure + catalog grid/list view
(() => {
  const VIEW_KEY = 'comparatupala:catalog-view';
  const GRID = 'grid';
  const LIST = 'list';
  const primarySpecKeys = ['shape', 'level', 'play', 'balance', 'weight', 'face'];

  function loadCatalogView() {
    try {
      const saved = localStorage.getItem(VIEW_KEY);
      return saved === LIST ? LIST : GRID;
    } catch {
      return GRID;
    }
  }

  state.catalogView = loadCatalogView();

  function ensureCatalogViewToggle() {
    const heading = document.querySelector('.results-heading');
    if (!heading || heading.querySelector('.catalog-controls')) return;
    const sort = heading.querySelector('.sort');
    if (!sort) return;

    const controls = document.createElement('div');
    controls.className = 'catalog-controls';
    sort.before(controls);
    controls.append(sort);

    const toggle = document.createElement('div');
    toggle.className = 'catalog-view-toggle';
    toggle.setAttribute('role', 'group');
    toggle.setAttribute('aria-label', 'Vista del catálogo');
    toggle.innerHTML = `
      <button type="button" data-catalog-view="grid" aria-pressed="false" title="Ver como fichas"><span aria-hidden="true">▦</span> Fichas</button>
      <button type="button" data-catalog-view="list" aria-pressed="false" title="Ver como lista"><span aria-hidden="true">☰</span> Lista</button>`;
    controls.append(toggle);
  }

  function syncCatalogView() {
    ensureCatalogViewToggle();
    const root = document.getElementById('products');
    if (root) root.classList.toggle('is-list-view', state.catalogView === LIST);
    document.querySelectorAll('[data-catalog-view]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.catalogView === state.catalogView));
    });
  }

  function storeOffersForSaving(offers, best) {
    if (!best) return [];
    const bestCurrency = best.currency || 'EUR';
    const byStore = new Map();
    (offers || []).forEach(offer => {
      if (!offer?.store || !available(offer) || !validPrice(offer.price)) return;
      if ((offer.currency || 'EUR') !== bestCurrency) return;
      const previous = byStore.get(offer.store);
      if (!previous || Number(offer.price) < Number(previous.price)) byStore.set(offer.store, offer);
    });
    return [...byStore.values()];
  }

  function maximumStoreSaving(row) {
    const {best, offers} = row;
    if (!best || !validPrice(best.price)) return null;
    const alternatives = storeOffersForSaving(offers, best).filter(offer => offer.store !== best.store);
    if (!alternatives.length) return null;
    const mostExpensive = alternatives.reduce((highest, offer) => Number(offer.price) > Number(highest.price) ? offer : highest);
    const saving = Number(mostExpensive.price) - Number(best.price);
    return Number.isFinite(saving) && saving > 0 ? {saving, mostExpensive} : null;
  }

  function savingMarkup(row, extraClass = '') {
    const comparison = maximumStoreSaving(row);
    if (!comparison) return '';
    return `<p class="card-saving${extraClass ? ` ${extraClass}` : ''}">Ahorra <strong>${money(comparison.saving, row.best.currency || 'EUR')}</strong> frente a la tienda más cara</p>`;
  }

  function listCard(row) {
    const {product: p, best, offers} = row;
    const source = best || offers[0];
    const specs = ['shape', 'play', 'level'].map(key => feature(source, key)).filter(Boolean).slice(0, 3);
    const distinctStores = [...new Set((p.offers || offers).map(offer => offer.store).filter(Boolean))];
    const pvpSource = [best, ...offers].find(offer => offer && validPrice(offer.original_price));
    const pvp = pvpSource?.original_price;
    const href = '#pala/' + encodeURIComponent(p.id);

    return `<article class="card catalog-list-row">
      <div class="catalog-list-visual">
        ${saveButton(p)}
        <a href="${href}" tabindex="-1" aria-hidden="true">${productImage({...p, image_url: source.image_url || p.image_url})}</a>
      </div>
      <div class="catalog-list-main">
        <p class="brand">${esc(p.brand || 'Marca sin indicar')}</p>
        <h3><a href="${href}">${esc(p.name)}</a></h3>
        ${specs.length ? `<div class="feature-tags">${specs.map(value => `<span>${esc(value)}</span>`).join('')}</div>` : ''}
        <p class="catalog-list-meta">${distinctStores.length} tienda${distinctStores.length === 1 ? '' : 's'} disponible${distinctStores.length === 1 ? '' : 's'} para comparar</p>
      </div>
      <div class="catalog-list-decision">
        <small>${best ? 'Mejor precio disponible' : 'Sin oferta disponible'}</small>
        <strong>${money(best?.price, best?.currency)}</strong>
        <span>${best ? dot(best.store) + esc(storeName(best.store)) : 'Consulta las tiendas'}</span>
        ${validPrice(pvp) ? `<em>PVP ${money(pvp, pvpSource?.currency || best?.currency)}</em>` : ''}
        ${savingMarkup(row, 'catalog-list-saving')}
      </div>
      <div class="catalog-list-action"><a href="${href}">Comparar →</a></div>
    </article>`;
  }

  const gridCard = card;
  card = function cardWithView(row) {
    if (state.catalogView === LIST) return listCard(row);
    let html = gridCard(row).replace(/<p class="card-saving">[\s\S]*?<\/p>/, '');
    const saving = savingMarkup(row);
    if (saving) html = html.replace('<p class="card-compare-meta">', `${saving}<p class="card-compare-meta">`);
    return html;
  };

  const baseRenderCatalog = renderCatalog;
  renderCatalog = function renderCatalogWithView() {
    syncCatalogView();
    baseRenderCatalog();
    syncCatalogView();
  };

  document.addEventListener('click', event => {
    const button = event.target.closest('[data-catalog-view]');
    if (!button) return;
    const next = button.dataset.catalogView === LIST ? LIST : GRID;
    if (next === state.catalogView) return;
    state.catalogView = next;
    try { localStorage.setItem(VIEW_KEY, next); } catch {}
    renderCatalog();
    document.querySelector(`[data-catalog-view="${next}"]`)?.focus({preventScroll: true});
  });

  function renderCompactOffers(product) {
    const best = bestOffer(product.offers);
    const bestCurrency = best?.currency || 'EUR';

    return product.offers.map(offer => {
      const offerCurrency = offer.currency || 'EUR';
      const delta = best
        && offer.id !== best.id
        && offerCurrency === bestCurrency
        && validPrice(offer.price)
        && validPrice(best.price)
        ? Number(offer.price) - Number(best.price)
        : null;
      const detailRows = [];
      if (validPrice(offer.original_price)) detailRows.push(['PVP', money(offer.original_price, offerCurrency)]);
      if (discount(offer)) detailRows.push(['Descuento', `−${discount(offer)}%`]);
      if (Number.isFinite(delta) && delta > 0) detailRows.push(['Frente al mejor precio', `+${money(delta, offerCurrency)}`]);
      detailRows.push(['EAN', esc(offer.ean || 'No publicado')]);
      detailRows.push(['Última lectura correcta', esc(date(offer.last_successful_check || (!isError(offer) ? offer.last_checked : null), true))]);

      return `<article class="offer-row compact-offer ${best?.id === offer.id ? 'best-offer' : ''}">
        <div class="offer-store-block">
          <div class="offer-store">${dot(offer.store)}${storeLabel(offer.store)}</div>
          ${renderExternalRating(offer)}
          <p class="offer-info">${best?.id === offer.id ? 'Mejor precio disponible · ' : ''}${esc(availabilityLabel(offer))}</p>
        </div>
        <div class="offer-price">${money(offer.price, offer.currency)}</div>
        <div class="offer-actions">
          <button class="text-button" data-spec-offer="${esc(offer.id)}">Ver características</button>
          ${externalLink(offer.url, 'Ir a la tienda ↗')}
        </div>
        <details class="offer-more">
          <summary>Más detalles</summary>
          <dl>${detailRows.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl>
        </details>
      </article>`;
    }).join('');
  }

  renderOffers = renderCompactOffers;

  function canonicalFeatureKey(rawKey) {
    const normalized = norm(rawKey);
    return Object.keys(aliases).find(key => aliases[key].includes(normalized)) || normalized;
  }

  renderSpecs = function renderSpecsProgressive() {
    const p = state.product;
    const o = p.offers.find(offer => String(offer.id) === String(state.selectedOffer)) || p.offers[0];
    state.selectedOffer = o.id;

    document.querySelector('#store-tabs').innerHTML = p.offers.map(storeOffer => `<button class="store-tab" data-spec-offer="${esc(storeOffer.id)}" aria-pressed="${storeOffer.id === o.id}">${dot(storeOffer.store)}${esc(storeName(storeOffer.store))}</button>`).join('');

    const entries = featureEntries(o);
    let primary = primarySpecKeys
      .map(key => [featureLabels[key] || key, feature(o, key), key])
      .filter(([, value]) => value);

    if (!primary.length) primary = entries.slice(0, 6).map(([key, value]) => [key, value, canonicalFeatureKey(key)]);
    const primaryCanonical = new Set(primary.map(([, , key]) => key));
    const extraEntries = entries.filter(([key]) => !primaryCanonical.has(canonicalFeatureKey(key)));
    const identifiers = [
      ['EAN', o.ean],
      ['Referencia', o.reference],
      ['SKU', o.sku],
      ['Referencia del fabricante', o.manufacturer_reference]
    ].filter(([, value]) => value);

    document.querySelector('#spec-content').innerHTML = `
      <div class="spec-source"><h3>${esc(o.name || p.name)}</h3><p>Según ${esc(storeName(o.store))} · ${externalLink(o.url, 'Ver ficha original ↗')}</p></div>
      ${primary.length ? `<div class="spec-primary"><p class="spec-section-label">Características principales</p><dl class="spec-grid">${primary.map(([key, value]) => `<div><dt>${esc(key)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl></div>` : '<p class="spec-empty">Esta tienda todavía no tiene características registradas.</p>'}
      ${extraEntries.length ? `<details class="description spec-more"><summary>Ver todas las características (${entries.length})</summary><dl class="spec-grid">${extraEntries.map(([key, value]) => `<div><dt>${esc(key)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl></details>` : ''}
      ${identifiers.length ? `<details class="description"><summary>Identificadores de esta tienda</summary><dl class="spec-grid">${identifiers.map(([key, value]) => `<div><dt>${esc(key)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl></details>` : ''}
      ${o.description ? `<details class="description"><summary>Descripción de ${esc(storeName(o.store))}</summary><p>${esc(o.description)}</p></details>` : ''}`;
  };

  const renderedHistoryForProduct = new Set();
  const baseRenderChart = renderChart;
  renderChart = function renderChartLazy() {
    const panel = document.getElementById('history-panel');
    const key = state.product?.id;
    if (panel instanceof HTMLDetailsElement && !panel.open && !renderedHistoryForProduct.has(key)) return;
    baseRenderChart();
    if (key) renderedHistoryForProduct.add(key);
  };

  function setPanelDescription(id, text) {
    const panel = document.getElementById(id);
    const description = panel?.querySelector(':scope > .panel-summary .panel-summary-description');
    if (description) description.textContent = text;
  }

  const baseRenderProduct = renderProduct;
  renderProduct = function renderProductProgressive(product) {
    renderedHistoryForProduct.delete(product.id);
    baseRenderProduct(product);

    const root = document.getElementById('product-view');
    root?.classList.add('progressive-detail');

    const hero = root?.querySelector('.product-hero');
    hero?.querySelector('.source-caption')?.remove();
    const meta = hero?.querySelector('.product-meta');
    if (meta) meta.textContent = `${product.stores.length} tienda${product.stores.length === 1 ? '' : 's'} · ${product.offers.length} oferta${product.offers.length === 1 ? '' : 's'}`;

    const query = new URLSearchParams(location.hash.split('?')[1] || '');
    root?.querySelectorAll('details.collapsible-panel').forEach(panel => { panel.open = false; });
    if (query.has('tienda')) {
      const specs = document.getElementById('specs-panel');
      if (specs instanceof HTMLDetailsElement) specs.open = true;
    }

    const best = bestOffer(product.offers);
    setPanelDescription('offers-panel', `${product.offers.length} oferta${product.offers.length === 1 ? '' : 's'}${best ? ` · desde ${money(best.price, best.currency)}` : ''}`);
    setPanelDescription('comparison-panel', `${new Set(product.offers.map(offer => offer.store).filter(Boolean)).size} tiendas disponibles para comparar`);
    setPanelDescription('specs-panel', 'Características técnicas, materiales e identificadores.');
    setPanelDescription('history-panel', 'Evolución del precio registrada por tienda.');

    state.range = 30;
    root?.querySelectorAll('[data-range]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.range) === 30)));

    const historyPanel = document.getElementById('history-panel');
    historyPanel?.addEventListener('toggle', () => {
      if (historyPanel.open && !renderedHistoryForProduct.has(product.id)) renderChart();
    });
  };

  ensureCatalogViewToggle();
  syncCatalogView();
})();
