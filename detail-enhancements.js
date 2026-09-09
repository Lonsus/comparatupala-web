'use strict';

(() => {
  const renderPanel = ({id, eyebrow, title, description, body, className = '', open = true}) => `
    <details class="panel collapsible-panel ${className}" id="${id}" ${open ? 'open' : ''}>
      <summary class="panel-summary">
        <span class="panel-summary-copy">
          <span class="eyebrow">${eyebrow}</span>
          <span class="panel-summary-title" role="heading" aria-level="2">${title}</span>
          <span class="panel-summary-description">${description}</span>
        </span>
        <span class="panel-toggle" aria-hidden="true"></span>
      </summary>
      <div class="panel-content">${body}</div>
    </details>`;

  const comparisonOfferScore = offer => {
    const featureCount = featureEntries(offer).length;
    const healthy = offer.active !== false && !isError(offer) ? 1 : 0;
    const checked = timestamp(offer.last_successful_check || offer.last_checked);
    return {featureCount, healthy, checked: Number.isFinite(checked) ? checked : 0};
  };

  const comparisonOffersByStore = product => {
    const orderedStores = [...new Set([
      ...(Array.isArray(product.stores) ? product.stores : []),
      ...(Array.isArray(product.offers) ? product.offers.map(offer => offer.store) : [])
    ].filter(Boolean))];
    const grouped = new Map(orderedStores.map(store => [store, []]));

    (product.offers || []).forEach(offer => {
      if (!offer?.store) return;
      if (!grouped.has(offer.store)) grouped.set(offer.store, []);
      grouped.get(offer.store).push(offer);
    });

    return [...grouped.entries()].map(([, offers]) => offers
      .slice()
      .sort((a, b) => {
        const left = comparisonOfferScore(a);
        const right = comparisonOfferScore(b);
        return right.featureCount - left.featureCount
          || right.healthy - left.healthy
          || right.checked - left.checked;
      })[0])
      .filter(Boolean);
  };

  const rowIsDifferent = row => new Set(row.values.filter(value => value !== null).map(norm)).size > 1;

  const comparisonContent = product => {
    const allOffers = comparisonOffersByStore(product);
    if (allOffers.length < 2) {
      return '<p class="spec-empty">La comparación entre tiendas aparecerá cuando esta pala tenga ofertas de al menos dos tiendas diferentes.</p>';
    }

    if (!(state.comparisonStores instanceof Set)) {
      state.comparisonStores = new Set(allOffers.map(offer => offer.store));
    }

    const validStores = new Set(allOffers.map(offer => offer.store));
    state.comparisonStores = new Set([...state.comparisonStores].filter(store => validStores.has(store)));
    const selectedOffers = allOffers.filter(offer => state.comparisonStores.has(offer.store));
    const selectedCount = selectedOffers.length;
    const totalCount = allOffers.length;
    const onlyDifferences = state.comparisonDifferencesOnly === true;
    const rows = selectedCount >= 2 ? comparisonRows(selectedOffers) : [];
    const visibleRows = onlyDifferences ? rows.filter(rowIsDifferent) : rows;

    const controls = `<div class="comparison-controls">
      <div class="comparison-toolbar">
        <div class="chart-stores comparison-stores" role="group" aria-label="Tiendas incluidas en la comparación">
          ${allOffers.map(offer => `<label><input type="checkbox" data-comparison-store="${esc(offer.store)}" ${state.comparisonStores.has(offer.store) ? 'checked' : ''}>${dot(offer.store)}${esc(storeName(offer.store))}</label>`).join('')}
        </div>
        <label class="comparison-difference-toggle"><input type="checkbox" data-comparison-differences ${onlyDifferences ? 'checked' : ''}><span>Solo diferencias</span></label>
      </div>
      <div class="comparison-selection-status"><span>Selecciona las tiendas que quieres comparar.</span><strong>${selectedCount} de ${totalCount} tiendas seleccionadas</strong></div>
    </div>`;

    if (selectedCount < 2) {
      return `${controls}<p class="spec-empty comparison-empty">Selecciona al menos dos tiendas para comparar sus características.</p>`;
    }

    if (!rows.length) {
      return `${controls}<p class="spec-empty comparison-empty">Las tiendas seleccionadas todavía no han publicado suficientes características comparables para esta pala.</p>`;
    }

    if (!visibleRows.length) {
      return `${controls}<p class="spec-empty comparison-empty">No hay diferencias publicadas entre las tiendas seleccionadas.</p>`;
    }

    return `${controls}<p class="scroll-hint">Desliza la tabla para consultar todas las tiendas. Con teclado, usa las flechas al enfocar la tabla.</p><div class="table-wrap" tabindex="0" role="region" aria-label="Características comparadas por tienda"><table class="comparison-table"><thead><tr><th scope="col">Característica</th>${selectedOffers.map(offer=>`<th scope="col">${esc(storeName(offer.store))}</th>`).join('')}</tr></thead><tbody>${visibleRows.map(row=>`<tr class="${rowIsDifferent(row)?'different':''}"><th scope="row">${esc(row.label)}</th>${row.values.map(value=>`<td>${esc(value??'No publicado')}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="source-caption">«No publicado» indica que esa tienda no aporta el dato en su ficha.</p>`;
  };

  const refreshComparison = focusTarget => {
    const host = document.getElementById('comparison-content');
    if (!host || !state.product) return;
    host.innerHTML = comparisonContent(state.product);

    if (!focusTarget) return;
    if (focusTarget.type === 'store') {
      [...host.querySelectorAll('[data-comparison-store]')]
        .find(input => input.dataset.comparisonStore === focusTarget.value)
        ?.focus({preventScroll: true});
    } else if (focusTarget.type === 'differences') {
      host.querySelector('[data-comparison-differences]')?.focus({preventScroll: true});
    }
  };

  renderComparison = function renderComparisonEnhanced(product) {
    return `<div id="comparison-content" aria-live="polite">${comparisonContent(product)}</div>`;
  };

  renderOffers = function renderOffersEnhanced(product) {
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
      const deltaMarkup = Number.isFinite(delta) && delta > 0
        ? `<span class="offer-delta">+${money(delta, offerCurrency)} frente al mejor precio</span>`
        : '';

      return `<article class="offer-row ${best?.id===offer.id?'best-offer':''}"><div class="offer-store-block"><div class="offer-store">${dot(offer.store)}${storeLabel(offer.store)}</div>${renderExternalRating(offer)}<p class="offer-info">${best?.id===offer.id?'Mejor precio disponible · ':''}${esc(availabilityLabel(offer))}</p></div><div class="offer-price">${money(offer.price,offer.currency)}${validPrice(offer.original_price)&&validPrice(offer.price)&&Number(offer.original_price)>Number(offer.price)?`<span class="offer-original">PVP <s>${money(offer.original_price,offer.currency)}</s> · −${discount(offer)}%</span>`:''}${deltaMarkup}</div><div class="offer-ean">EAN: ${esc(offer.ean||'No publicado')}<br>Última lectura correcta: ${esc(date(offer.last_successful_check||(!isError(offer)?offer.last_checked:null),true))}</div><span class="badge ${available(offer)?'positive':'warning'}">${available(offer)?'En stock':'Sin stock confirmado'}</span><div class="offer-actions"><button class="text-button" data-spec-offer="${esc(offer.id)}">Ver características</button>${externalLink(offer.url,'Ir a la tienda ↗')}</div></article>`;
    }).join('');
  };

  renderProduct = function renderProductEnhanced(p) {
    state.product = p;
    state.range = 0;
    state.hiddenStores = new Set();
    const comparisonOffers = comparisonOffersByStore(p);
    state.comparisonStores = new Set(comparisonOffers.map(offer => offer.store));
    state.comparisonDifferencesOnly = false;

    const query = new URLSearchParams(location.hash.split('?')[1] || '');
    state.selectedOffer = query.get('tienda') || bestOffer(p.offers)?.id || p.offers[0].id;

    const best = bestOffer(p.offers);
    const source = best || p.offers[0];
    const eans = [...new Set([p.ean, ...p.offers.map(o => o.ean)].filter(Boolean))];
    const root = document.querySelector('#product-view');

    const offersPanel = renderPanel({
      id: 'offers-panel',
      eyebrow: 'DÓNDE COMPRAR',
      title: 'Todas las ofertas',
      description: `${p.offers.length} ofertas · Precio y disponibilidad de cada web.`,
      body: `<div class="offer-list">${renderOffers(p)}</div>`
    });

    const specsPanel = renderPanel({
      id: 'specs-panel',
      eyebrow: 'CONOCE TU PALA',
      title: 'Su ficha, tienda a tienda',
      description: 'Elige la web para ver sus características.',
      open: !matchMedia('(max-width:800px)').matches || query.has('tienda'),
      body: '<div class="store-tabs" id="store-tabs" role="group" aria-label="Tienda de la ficha técnica"></div><div id="spec-content" aria-live="polite"></div>'
    });

    const comparisonPanel = renderPanel({
      id: 'comparison-panel',
      eyebrow: 'COMPARA ANTES DE ELEGIR',
      title: 'Comparar características entre tiendas',
      description: 'Selecciona las tiendas y detecta diferencias entre sus fichas publicadas.',
      body: renderComparison(p),
      className: 'comparison-panel featured-panel',
      open: comparisonOffers.length > 1
    });

    const historyPanel = renderPanel({
      id: 'history-panel',
      eyebrow: 'SIGUE SU EVOLUCIÓN',
      title: 'El precio, con perspectiva',
      description: 'Compara el histórico registrado en cada tienda.',
      body: `<div class="chart-toolbar"><div class="segmented" role="group" aria-label="Periodo del histórico">${[[7,'7 días'],[30,'30 días'],[90,'90 días'],[0,'Todo']].map(([n,l])=>`<button data-range="${n}" aria-pressed="${n===0}">${l}</button>`).join('')}</div><div class="chart-stores">${p.stores.map(s=>`<label><input type="checkbox" data-chart-store="${esc(s)}" checked>${dot(s)}${esc(storeName(s))}</label>`).join('')}</div></div><div id="chart-output"></div><p class="chart-note">Cada precio se mantiene en horizontal hasta el siguiente cambio registrado. La línea termina en la última lectura correcta de esa tienda; no se prolonga hasta hoy si no hay datos nuevos. Los saltos verticales señalan cuándo se detectó un cambio. Las fechas se muestran en horario de Madrid.</p><details class="history-list" id="history-records"></details>`,
      className: 'chart-panel',
      open: false
    });

    root.innerHTML = `<div class="breadcrumb"><a href="${state.savedOnly?'#guardadas':'#catalogo'}">← Volver ${state.savedOnly?'a guardadas':'al catálogo'}</a><div class="detail-actions"><button class="secondary-button" id="copy-link">Copiar enlace</button>${saveButton(p)}</div></div><section class="product-hero">${productImage(p,true)}<div><p class="brand">${esc(p.brand||'Marca sin indicar')}${p.year?' / '+esc(p.year):''}</p><h1 class="product-title" tabindex="-1">${esc(p.name)}</h1><div class="feature-tags">${['shape','play','face'].map(k=>feature(source,k)).filter(Boolean).map(v=>`<span>${esc(v)}</span>`).join('')}</div><p class="source-caption">Características de ${esc(storeName(source.store))}. Consulta cada ficha más abajo.</p><p class="product-meta">${p.stores.length} tiendas asociadas · ${p.offers.length} ofertas<br>EAN: ${eans.length?eans.map(esc).join(' · '):'No publicado'}</p></div><aside class="buy-box"><div><p class="eyebrow">${best?'MEJOR PRECIO DISPONIBLE':'DISPONIBILIDAD'}</p><div class="hero-price">${best?money(best.price,best.currency):'Sin stock'}</div><p>${best?esc(storeName(best.store)):'Consulta las ofertas registradas'}</p></div>${best?externalLink(best.url,'Ver oferta ↗','primary-button'):''}<small>Sin gastos de envío. Confirma el precio final en la tienda.</small></aside></section><nav class="detail-nav" aria-label="Secciones de la pala"><a href="#ofertas" data-scroll="offers-panel">Dónde comprar (${p.offers.length})</a><a href="#comparacion" data-scroll="comparison-panel">Comparar tiendas</a><a href="#caracteristicas" data-scroll="specs-panel">Conoce tu pala</a><a href="#historico" data-scroll="history-panel">Histórico de precios</a></nav><div class="detail-sections"><div class="detail-grid">${offersPanel}${specsPanel}</div>${comparisonPanel}${historyPanel}</div>`;

    renderSpecs();
    renderChart();
    bindImageFallback(root);

    root.querySelectorAll('[data-scroll]').forEach(a => a.addEventListener('click', e => {
      e.preventDefault();
      const target = document.getElementById(a.dataset.scroll);
      focusSection(target);
    }));

    root.querySelector('#copy-link').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(location.href);
        toast('Enlace de la pala copiado');
      } catch {
        toast('Puedes copiar el enlace desde la barra de direcciones');
      }
    });

    root.querySelector('.product-title').focus({preventScroll:true});
  };

  document.addEventListener('change', event => {
    const storeInput = event.target.closest('input[data-comparison-store]');
    if (storeInput && state.product) {
      const store = storeInput.dataset.comparisonStore;
      if (!(state.comparisonStores instanceof Set)) state.comparisonStores = new Set();
      if (storeInput.checked) state.comparisonStores.add(store);
      else state.comparisonStores.delete(store);
      refreshComparison({type: 'store', value: store});
      return;
    }

    const differenceInput = event.target.closest('input[data-comparison-differences]');
    if (differenceInput && state.product) {
      state.comparisonDifferencesOnly = differenceInput.checked;
      refreshComparison({type: 'differences'});
    }
  });

  document.addEventListener('click', e => {
    const button = e.target.closest('button[data-spec-offer]');
    if (!button || button.closest('#store-tabs')) return;
    const specsPanel = document.getElementById('specs-panel');
    if (specsPanel instanceof HTMLDetailsElement) specsPanel.open = true;
  }, true);
})();

(() => {
  if (document.querySelector('script[data-store-pages]')) return;
  const script = document.createElement('script');
  script.src = 'store-pages.js?v=landing-1';
  script.async = false;
  script.dataset.storePages = 'true';
  script.addEventListener('load', () => {
    if (state.loaded) route();
  });
  document.body.appendChild(script);
})();

document.addEventListener('click', event => {
  const button = event.target.closest('#store-view .store-empty [data-store-reset]');
  if (!button) return;
  const values = {
    'store-search': '',
    'store-brand': '',
    'store-availability': 'available',
    'store-min-price': '',
    'store-max-price': '',
    'store-sort': 'price-asc'
  };
  Object.entries(values).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) element.value = value;
  });
  const brand = document.getElementById('store-brand');
  if (brand) brand.dispatchEvent(new Event('change', {bubbles: true}));
  document.getElementById('store-search')?.focus({preventScroll: true});
}, true);
