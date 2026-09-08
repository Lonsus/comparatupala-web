'use strict';

(() => {
  const legacyStores = {...stores};
  const fallbackColors = ['#758779', '#4f6f8f', '#8a6d3b', '#6f5b8f', '#7b6660', '#4d7775'];
  let storeMasterLoaded = false;

  const dataStoreSlugs = () => [...new Set([
    ...(Array.isArray(state.stats?.stores) ? state.stats.stores : []),
    ...state.products.flatMap(product => Array.isArray(product.offers) ? product.offers.map(offer => offer.store) : [])
  ].filter(Boolean))];

  const fallbackStoreName = slug => String(slug || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase());

  function normalizeStore(record, index) {
    if (!record || typeof record !== 'object') return null;
    const slug = String(record.slug || record.id || '').trim();
    if (!slug) return null;
    return {
      id: slug,
      slug,
      name: String(record.name || fallbackStoreName(slug)),
      color: String(record.color || fallbackColors[index % fallbackColors.length]),
      website: String(record.website || ''),
      description: String(record.description || 'Tienda monitorizada por ComparaTuPala a partir de información pública.'),
      active: record.active !== false,
      order: Number.isFinite(Number(record.order)) ? Number(record.order) : index + 1,
      external_store_rating: record.external_store_rating ?? null,
      external_store_review_count: record.external_store_review_count ?? null,
      external_store_rating_source: record.external_store_rating_source ?? null,
      href: `#tienda/${encodeURIComponent(slug)}`
    };
  }

  function refreshStoreFilterLabels() {
    const select = document.getElementById('store');
    if (!select) return;
    [...select.options].forEach(option => {
      if (option.value) option.textContent = storeName(option.value);
    });
  }

  function updateStoreCountNote() {
    const note = document.querySelector('.topbar-note');
    if (!note) return;
    const active = Object.values(stores).filter(store => store?.slug && store.active !== false);
    const count = active.length || dataStoreSlugs().length;
    note.innerHTML = `<i class="status-dot"></i> ${count.toLocaleString('es-ES')} tiendas. Una decisión.`;
  }

  function applyStoreMaster(records) {
    const normalized = records
      .map(normalizeStore)
      .filter(Boolean)
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'es'));
    if (!normalized.length) throw new Error('El master de tiendas está vacío');

    Object.keys(stores).forEach(slug => delete stores[slug]);
    normalized.forEach(store => {
      stores[store.slug] = store;
    });
    storeMasterLoaded = true;
    refreshStoreFilterLabels();
    updateStoreCountNote();
  }

  function ensureLegacyStores() {
    if (storeMasterLoaded) return;
    Object.entries(legacyStores).forEach(([slug, meta]) => {
      stores[slug] = {
        id: slug,
        slug,
        name: meta.name || fallbackStoreName(slug),
        color: meta.color || '#758779',
        website: meta.website || '',
        description: meta.description || 'Tienda monitorizada por ComparaTuPala a partir de la información pública incluida en el catálogo exportado.',
        active: meta.active !== false,
        external_store_rating: null,
        external_store_review_count: null,
        external_store_rating_source: null,
        href: `#tienda/${encodeURIComponent(slug)}`
      };
    });
    dataStoreSlugs().forEach((slug, index) => {
      if (stores[slug]) return;
      stores[slug] = {
        id: slug,
        slug,
        name: fallbackStoreName(slug),
        color: fallbackColors[index % fallbackColors.length],
        website: '',
        description: 'Tienda monitorizada por ComparaTuPala a partir de la información pública incluida en el catálogo exportado.',
        active: true,
        external_store_rating: null,
        external_store_review_count: null,
        external_store_rating_source: null,
        href: `#tienda/${encodeURIComponent(slug)}`
      };
    });
    refreshStoreFilterLabels();
    updateStoreCountNote();
  }

  async function loadStoreMaster() {
    try {
      const response = await fetch('data/stores.json', {cache: 'no-cache'});
      if (!response.ok) throw new Error(`No se pudo leer data/stores.json (${response.status})`);
      const records = await response.json();
      if (!Array.isArray(records)) throw new Error('Formato de stores.json no válido');
      applyStoreMaster(records);
    } catch (error) {
      console.warn('No se pudo cargar el master de tiendas; se usa compatibilidad temporal.', error);
      ensureLegacyStores();
    }
    if (state.loaded) route();
  }

  function ensureDataStores() {
    if (!storeMasterLoaded) ensureLegacyStores();
    updateStoreCountNote();
  }

  ensureLegacyStores();
  loadStoreMaster();

  const style = document.createElement('link');
  style.rel = 'stylesheet';
  style.href = 'store-pages.css?v=store-pages-1';
  document.head.appendChild(style);

  const nav = document.querySelector('.topbar nav');
  if (nav && !document.getElementById('nav-stores')) {
    const link = document.createElement('a');
    link.href = '#tiendas';
    link.id = 'nav-stores';
    link.textContent = 'Tiendas';
    const saved = document.getElementById('nav-saved');
    nav.insertBefore(link, saved || null);
    link.addEventListener('click', event => {
      if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && link.hash === location.hash && state.loaded) {
        event.preventDefault();
        route();
      }
    });
  }

  const originalRoute = route;
  const storeFilterState = new Map();

  function ensureStoreView() {
    let root = document.getElementById('store-view');
    if (!root) {
      root = document.createElement('div');
      root.id = 'store-view';
      root.hidden = true;
      const main = document.getElementById('main');
      const footer = main?.querySelector('footer');
      main?.insertBefore(root, footer || null);
    }
    return root;
  }

  function storeBySlug(slug) {
    const store = stores[slug];
    return store && store.active !== false ? store : null;
  }

  function storeProducts(slug) {
    return state.products.filter(product => product.offers.some(offer => offer.store === slug));
  }

  function storeOffers(slug) {
    return state.products.flatMap(product => product.offers
      .filter(offer => offer.store === slug)
      .map(offer => ({product, offer})));
  }

  function displayStoreOffer(offers) {
    return bestOffer(offers)
      || offers.find(offer => !isError(offer) && validPrice(offer.price))
      || offers[0]
      || null;
  }

  function storeRows(slug) {
    return storeProducts(slug).map(product => {
      const offers = product.offers.filter(offer => offer.store === slug);
      return {product, offers, offer: displayStoreOffer(offers)};
    });
  }

  function mean(values) {
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  }

  function storeStats(slug) {
    const pairs = storeOffers(slug);
    const differentProducts = new Set(pairs.map(({product}) => product.id)).size;
    const availablePairs = pairs.filter(({offer}) => available(offer));
    const soldOutPairs = pairs.filter(({offer}) => !isError(offer) && ['outofstock', 'soldout'].includes(availabilityCode(offer)));
    const validAvailablePrices = availablePairs.filter(({offer}) => validPrice(offer.price)).map(({offer}) => Number(offer.price));
    const discounted = availablePairs
      .map(({offer}) => offer)
      .filter(offer => validPrice(offer.original_price) && validPrice(offer.price) && Number(offer.original_price) > Number(offer.price));
    const discountValues = discounted.map(offer => (1 - Number(offer.price) / Number(offer.original_price)) * 100);
    const successfulChecks = pairs
      .map(({offer}) => timestamp(offer.last_successful_check))
      .filter(Number.isFinite);

    return {
      differentProducts,
      monitoredOffers: pairs.length,
      availableOffers: availablePairs.length,
      soldOutOffers: soldOutPairs.length,
      averagePrice: mean(validAvailablePrices),
      averageDiscount: mean(discountValues),
      maxDiscount: discountValues.length ? Math.max(...discountValues) : null,
      latestSuccessfulCheck: successfulChecks.length ? new Date(Math.max(...successfulChecks)).toISOString() : null
    };
  }

  function formatPercent(value) {
    return Number.isFinite(value) ? `${new Intl.NumberFormat('es-ES', {maximumFractionDigits: 1}).format(value)}%` : '—';
  }

  function countLabel(value, singular, plural = `${singular}s`) {
    return `${Number(value).toLocaleString('es-ES')} ${value === 1 ? singular : plural}`;
  }

  function setStoreNavigationActive() {
    document.querySelectorAll('.topbar nav a').forEach(link => {
      const active = link.id === 'nav-stores';
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  }

  function showStoreView() {
    state.product = null;
    state.savedOnly = false;
    document.getElementById('catalog-view').hidden = true;
    document.getElementById('product-view').hidden = true;
    const root = ensureStoreView();
    root.hidden = false;
    document.getElementById('catalog-view').classList.remove('saved-view');
    setStoreNavigationActive();
    return root;
  }

  function hideStoreView() {
    const root = ensureStoreView();
    root.hidden = true;
  }

  function renderStoresPage() {
    ensureDataStores();
    const root = showStoreView();
    const entries = Object.values(stores).filter(store => store?.slug && store.active !== false);
    document.title = 'Tiendas de pádel — ComparaTuPala.es';

    root.innerHTML = `
      <section class="stores-page" aria-labelledby="stores-title">
        <div class="stores-heading">
          <div>
            <p class="eyebrow">TIENDAS MONITORIZADAS</p>
            <h1 id="stores-title" class="store-page-title" tabindex="-1">Tiendas</h1>
            <p class="muted">Explora el catálogo, los precios y la disponibilidad que ComparaTuPala registra para cada tienda de forma independiente.</p>
          </div>
          <div class="store-independence-note"><strong>Comparador independiente</strong><span>Los datos se calculan desde las ofertas publicadas y no implican relación comercial con las tiendas.</span></div>
        </div>
        <div class="stores-grid">
          ${entries.map(store => {
            const stats = storeStats(store.slug);
            return `<article class="store-card">
              <div class="store-card-head"><span class="store-card-dot" style="--store-color:${esc(store.color)}" aria-hidden="true"></span><div><p class="eyebrow">TIENDA MONITORIZADA</p><h2>${esc(store.name)}</h2></div></div>
              <p class="store-card-description">${esc(store.description)}</p>
              <dl class="store-card-metrics">
                <div><dt>Palas diferentes</dt><dd>${stats.differentProducts.toLocaleString('es-ES')}</dd></div>
                <div><dt>Ofertas disponibles</dt><dd>${stats.availableOffers.toLocaleString('es-ES')}</dd></div>
                <div><dt>Ofertas monitorizadas</dt><dd>${stats.monitoredOffers.toLocaleString('es-ES')}</dd></div>
              </dl>
              <a class="store-card-link" href="#tienda/${encodeURIComponent(store.slug)}" aria-label="Ver ficha de ${esc(store.name)}">Ver tienda →</a>
            </article>`;
          }).join('')}
        </div>
      </section>`;

    root.querySelector('.store-page-title')?.focus({preventScroll: true});
    window.scrollTo({top: 0, behavior: 'instant'});
  }

  function defaultStoreFilters() {
    return {q: '', brand: '', availability: 'available', min: '', max: '', sort: 'price-asc'};
  }

  function filtersFor(slug) {
    if (!storeFilterState.has(slug)) storeFilterState.set(slug, defaultStoreFilters());
    return storeFilterState.get(slug);
  }

  function validPriceRange(filters) {
    const min = filters.min === '' ? null : Number(filters.min);
    const max = filters.max === '' ? null : Number(filters.max);
    const valid = (min === null || (Number.isFinite(min) && min >= 0))
      && (max === null || (Number.isFinite(max) && max >= 0))
      && (min === null || max === null || min <= max);
    return {valid, min, max};
  }

  function filteredStoreRows(slug) {
    const filters = filtersFor(slug);
    const range = validPriceRange(filters);
    if (!range.valid) return [];

    const rows = storeRows(slug).filter(row => {
      const {product, offers, offer} = row;
      if (!offer) return false;
      if (filters.brand && norm(product.brand) !== filters.brand) return false;
      if (filters.availability === 'available' && !offers.some(available)) return false;
      if (filters.availability === 'unavailable' && offers.some(available)) return false;

      if (filters.q) {
        const haystack = norm([
          product.name,
          product.brand,
          product.ean,
          ...offers.flatMap(item => [item.name, item.ean, item.reference, item.sku, ...featureEntries(item).flat()])
        ].join(' '));
        if (!haystack.includes(norm(filters.q))) return false;
      }

      if (range.min !== null || range.max !== null) {
        const pricedOffer = bestOffer(offers);
        if (!pricedOffer || !validPrice(pricedOffer.price)) return false;
        const price = Number(pricedOffer.price);
        if (range.min !== null && price < range.min) return false;
        if (range.max !== null && price > range.max) return false;
      }
      return true;
    });

    rows.sort((a, b) => {
      const aPriceOffer = bestOffer(a.offers);
      const bPriceOffer = bestOffer(b.offers);
      const ap = aPriceOffer && validPrice(aPriceOffer.price) ? Number(aPriceOffer.price) : null;
      const bp = bPriceOffer && validPrice(bPriceOffer.price) ? Number(bPriceOffer.price) : null;
      let result = 0;
      if (filters.sort === 'name') result = a.product.name.localeCompare(b.product.name, 'es');
      else if (filters.sort === 'discount') result = discount(b.offer) - discount(a.offer);
      else result = ap === null ? (bp === null ? 0 : 1) : (bp === null ? -1 : (filters.sort === 'price-desc' ? bp - ap : ap - bp));
      return result || a.product.name.localeCompare(b.product.name, 'es');
    });

    return rows;
  }

  function renderStoreProductCard(row, store) {
    const {product, offers} = row;
    const offer = displayStoreOffer(offers);
    const href = `#pala/${encodeURIComponent(product.id)}`;
    const d = discount(offer);
    const pvp = offer && validPrice(offer.original_price) && validPrice(offer.price) && Number(offer.original_price) > Number(offer.price)
      ? offer.original_price
      : null;
    const sourceImage = offer?.image_url || product.image_url;

    return `<article class="store-product-card">
      <div class="store-product-media">
        ${d ? `<span class="discount-badge">−${d}% sobre PVP</span>` : ''}
        <a href="${href}" tabindex="-1" aria-hidden="true">${productImage({...product, image_url: sourceImage})}</a>
      </div>
      <div class="store-product-body">
        <p class="brand">${esc(product.brand || 'Marca sin indicar')}</p>
        <h3><a href="${href}">${esc(product.name)}</a></h3>
        <div class="store-product-status"><span class="badge ${available(offer) ? 'positive' : 'warning'}">${esc(availabilityLabel(offer))}</span>${offers.length > 1 ? `<small>${countLabel(offers.length, 'oferta', 'ofertas')} de esta tienda</small>` : ''}</div>
        ${renderExternalRating(offer)}
        <div class="store-product-price">
          <small>Precio en ${esc(store.name)}</small>
          <strong>${money(offer?.price, offer?.currency)}</strong>
          ${pvp !== null ? `<span>PVP <s>${money(pvp, offer?.currency)}</s></span>` : ''}
        </div>
      </div>
      <div class="store-product-footer"><a href="${href}">Ver comparativa →</a></div>
    </article>`;
  }

  function renderStoreResults(slug) {
    const store = storeBySlug(slug);
    const root = document.getElementById('store-products');
    if (!store || !root) return;

    const filters = filtersFor(slug);
    const range = validPriceRange(filters);
    const rows = filteredStoreRows(slug);
    const count = document.getElementById('store-result-count');
    const error = document.getElementById('store-filter-error');
    if (error) error.textContent = range.valid ? '' : 'Revisa el rango de precio: usa valores positivos y asegúrate de que el mínimo no supera al máximo.';
    if (count) count.textContent = `${rows.length.toLocaleString('es-ES')} ${rows.length === 1 ? 'pala encontrada' : 'palas encontradas'}`;

    root.innerHTML = rows.map(row => renderStoreProductCard(row, store)).join('') || `
      <div class="store-empty">
        <h3>${range.valid ? 'No hay palas que coincidan con estos filtros' : 'Revisa los filtros'}</h3>
        <p>${range.valid ? 'Prueba otra marca, amplía el precio o cambia el filtro de disponibilidad.' : 'Corrige el rango de precio para continuar.'}</p>
        ${range.valid ? '<button type="button" class="secondary-button" data-store-reset>Limpiar filtros</button>' : ''}
      </div>`;
    bindImageFallback(root);
  }

  function renderStorePage(slug) {
    ensureDataStores();
    const root = showStoreView();
    const store = storeBySlug(slug);

    if (!store) {
      document.title = 'Tienda no encontrada — ComparaTuPala.es';
      root.innerHTML = `<section class="store-not-found"><p class="eyebrow">TIENDAS</p><h1 class="store-page-title" tabindex="-1">Tienda no encontrada</h1><p>No existe una tienda monitorizada con esa dirección.</p><a class="primary-button" href="#tiendas">← Todas las tiendas</a></section>`;
      root.querySelector('.store-page-title')?.focus({preventScroll: true});
      window.scrollTo({top: 0, behavior: 'instant'});
      return;
    }

    const stats = storeStats(slug);
    const rows = storeRows(slug);
    const filters = filtersFor(slug);
    const brands = [...new Map(rows.map(({product}) => [norm(product.brand), product.brand]).filter(([value, label]) => value && label)).entries()]
      .sort((a, b) => a[1].localeCompare(b[1], 'es'));
    document.title = `${store.name} — Precios y palas | ComparaTuPala`;

    root.innerHTML = `
      <section class="store-detail" aria-labelledby="store-title">
        <nav class="store-breadcrumb" aria-label="Migas de pan"><a href="#catalogo">Inicio</a><span aria-hidden="true">›</span><a href="#tiendas">Tiendas</a><span aria-hidden="true">›</span><span aria-current="page">${esc(store.name)}</span></nav>
        <a class="store-back-link" href="#tiendas">← Todas las tiendas</a>
        <header class="store-hero">
          <div class="store-hero-copy">
            <div class="store-identity"><span class="store-identity-dot" style="--store-color:${esc(store.color)}" aria-hidden="true"></span><div><p class="eyebrow">TIENDA MONITORIZADA</p><h1 id="store-title" class="store-page-title" tabindex="-1">${esc(store.name)}</h1></div></div>
            <p>${esc(store.description)}</p>
            <p class="store-independent-copy">ComparaTuPala monitoriza automáticamente precios, disponibilidad y catálogo publicados por esta tienda. ComparaTuPala es un comparador independiente.</p>
          </div>
          <div class="store-hero-action">${externalLink(store.website, 'Visitar web oficial ↗', 'primary-button')}<small>La compra, el precio final y las condiciones se confirman en la web oficial de la tienda.</small></div>
        </header>

        ${stats.monitoredOffers > 0 && !stats.latestSuccessfulCheck ? '<div class="store-data-warning" role="status">No hay datos recientes disponibles para esta tienda.</div>' : ''}

        <section class="store-stats" aria-label="Estadísticas de la tienda">
          <div><strong>${stats.differentProducts.toLocaleString('es-ES')}</strong><span>Palas diferentes</span></div>
          <div><strong>${stats.monitoredOffers.toLocaleString('es-ES')}</strong><span>Ofertas monitorizadas</span></div>
          <div><strong>${stats.availableOffers.toLocaleString('es-ES')}</strong><span>Ofertas disponibles</span></div>
          <div><strong>${stats.soldOutOffers.toLocaleString('es-ES')}</strong><span>Ofertas agotadas</span></div>
          <div><strong>${stats.averagePrice === null ? '—' : money(stats.averagePrice)}</strong><span>Precio medio disponible</span></div>
          <div><strong>${formatPercent(stats.averageDiscount)}</strong><span>Descuento medio</span></div>
          <div><strong>${formatPercent(stats.maxDiscount)}</strong><span>Mayor descuento</span></div>
          <div><strong class="store-stat-date">${stats.latestSuccessfulCheck ? esc(date(stats.latestSuccessfulCheck, true)) : 'Sin lectura correcta'}</strong><span>Última lectura correcta</span></div>
        </section>

        <section class="store-catalog" aria-labelledby="store-catalog-title">
          <div class="store-catalog-heading"><div><p class="eyebrow">CATÁLOGO DE ${esc(store.name).toUpperCase()}</p><h2 id="store-catalog-title">Palas disponibles en ${esc(store.name)}</h2><p id="store-result-count" class="muted" role="status"></p></div></div>
          ${stats.monitoredOffers === 0 ? '<div class="store-empty"><h3>Esta tienda no tiene ofertas disponibles actualmente.</h3><p>La ficha seguirá operativa y se actualizará automáticamente cuando el catálogo exportado vuelva a incluir ofertas de esta tienda.</p></div>' : `
          <div class="store-workspace">
            <aside class="store-filters" aria-label="Filtros de la tienda">
              <div class="store-filter-title"><h3>Filtrar catálogo</h3><button type="button" class="text-button" data-store-reset>Limpiar</button></div>
              <label class="field"><span>Buscar pala</span><input id="store-search" type="search" autocomplete="off" placeholder="Nombre, marca, EAN…" value="${esc(filters.q)}"></label>
              <label class="field"><span>Marca</span><select id="store-brand"><option value="">Todas las marcas</option>${brands.map(([value, label]) => `<option value="${esc(value)}" ${filters.brand === value ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select></label>
              <label class="field"><span>Disponibilidad</span><select id="store-availability"><option value="" ${filters.availability === '' ? 'selected' : ''}>Todas</option><option value="available" ${filters.availability === 'available' ? 'selected' : ''}>Disponibles</option><option value="unavailable" ${filters.availability === 'unavailable' ? 'selected' : ''}>Sin disponibilidad confirmada</option></select></label>
              <div class="store-price-fields"><label class="field"><span>Precio mínimo</span><input id="store-min-price" type="number" min="0" step="0.01" placeholder="0" value="${esc(filters.min)}"></label><label class="field"><span>Precio máximo</span><input id="store-max-price" type="number" min="0" step="0.01" placeholder="500" value="${esc(filters.max)}"></label></div>
              <p id="store-filter-error" class="error" role="status"></p>
            </aside>
            <div class="store-results">
              <div class="store-results-toolbar"><label class="field"><span>Ordenar por</span><select id="store-sort"><option value="price-asc" ${filters.sort === 'price-asc' ? 'selected' : ''}>Precio menor</option><option value="price-desc" ${filters.sort === 'price-desc' ? 'selected' : ''}>Precio mayor</option><option value="discount" ${filters.sort === 'discount' ? 'selected' : ''}>Mayor descuento</option><option value="name" ${filters.sort === 'name' ? 'selected' : ''}>Nombre</option></select></label></div>
              <div id="store-products" class="store-products"></div>
            </div>
          </div>`}
        </section>
      </section>`;

    if (stats.monitoredOffers > 0) {
      const updateFilters = () => {
        const current = filtersFor(slug);
        current.q = document.getElementById('store-search')?.value || '';
        current.brand = document.getElementById('store-brand')?.value || '';
        current.availability = document.getElementById('store-availability')?.value || '';
        current.min = document.getElementById('store-min-price')?.value || '';
        current.max = document.getElementById('store-max-price')?.value || '';
        current.sort = document.getElementById('store-sort')?.value || 'price-asc';
        renderStoreResults(slug);
      };

      let timer;
      root.querySelectorAll('#store-search, #store-min-price, #store-max-price').forEach(input => input.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(updateFilters, 120);
      }));
      root.querySelectorAll('#store-brand, #store-availability, #store-sort').forEach(input => input.addEventListener('change', updateFilters));
      root.querySelectorAll('[data-store-reset]').forEach(button => button.addEventListener('click', () => {
        storeFilterState.set(slug, defaultStoreFilters());
        renderStorePage(slug);
        document.getElementById('store-search')?.focus({preventScroll: true});
      }));
      renderStoreResults(slug);
    }

    root.querySelector('.store-page-title')?.focus({preventScroll: true});
    window.scrollTo({top: 0, behavior: 'instant'});
  }

  route = function routeWithStores() {
    ensureDataStores();
    const hash = location.hash;
    const storeMatch = hash.match(/^#tienda\/([^?]+)/);
    if (hash === '#tiendas') {
      renderStoresPage();
      return;
    }
    if (storeMatch) {
      let slug = '';
      try { slug = decodeURIComponent(storeMatch[1]); } catch {}
      renderStorePage(slug);
      return;
    }
    hideStoreView();
    originalRoute();
  };

  document.querySelector('.skip-link')?.addEventListener('click', event => {
    if (!location.hash.startsWith('#tienda')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const target = document.querySelector('#store-view .store-page-title');
    target?.focus({preventScroll: false});
  }, true);

  window.storeBySlug = storeBySlug;
  window.storeProducts = storeProducts;
  window.storeOffers = storeOffers;
  window.storeStats = storeStats;
  window.renderStoresPage = renderStoresPage;
  window.renderStorePage = renderStorePage;
  window.renderStoreProductCard = renderStoreProductCard;
})();