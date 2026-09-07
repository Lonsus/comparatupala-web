'use strict';

(() => {
  const renderPanel = ({id, eyebrow, title, description, body, className = '', open = true}) => `
    <details class="panel collapsible-panel ${className}" id="${id}" ${open ? 'open' : ''}>
      <summary class="panel-summary">
        <span class="panel-summary-copy">
          <span class="eyebrow">${eyebrow}</span>
          <span class="panel-summary-title">${title}</span>
          <span class="panel-summary-description">${description}</span>
        </span>
        <span class="panel-toggle" aria-hidden="true"></span>
      </summary>
      <div class="panel-content">${body}</div>
    </details>`;

  renderComparison = function renderComparisonEnhanced(p) {
    if (p.offers.length < 2) {
      return '<p class="spec-empty">La comparación entre tiendas aparecerá cuando esta pala tenga ofertas de al menos dos tiendas.</p>';
    }

    const rows = comparisonRows(p.offers);
    if (!rows.length) {
      return '<p class="spec-empty">Las tiendas todavía no han publicado suficientes características comparables para esta pala.</p>';
    }

    return `<div class="comparison-intro"><p>Compara de un vistazo cómo describe cada tienda la misma pala. Se resaltan los valores publicados que difieren.</p><span class="comparison-badge">${p.offers.length} tiendas comparadas</span></div><div class="table-wrap"><table class="comparison-table"><thead><tr><th scope="col">Característica</th>${p.offers.map(o=>`<th scope="col">${esc(storeName(o.store))}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr class="${new Set(r.values.filter(v=>v!==null).map(norm)).size>1?'different':''}"><th scope="row">${esc(r.label)}</th>${r.values.map(v=>`<td>${esc(v??'No publicado')}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="source-caption">«No publicado» indica que esa tienda no aporta el dato en su ficha.</p>`;
  };

  renderProduct = function renderProductEnhanced(p) {
    state.product = p;
    state.range = 0;
    state.hiddenStores = new Set();

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
      description: 'Precio y disponibilidad de cada web.',
      body: `<div class="offer-list">${renderOffers(p)}</div>`
    });

    const specsPanel = renderPanel({
      id: 'specs-panel',
      eyebrow: 'CONOCE TU PALA',
      title: 'Su ficha, tienda a tienda',
      description: 'Elige la web para ver sus características.',
      body: '<div class="store-tabs" id="store-tabs" role="group" aria-label="Tienda de la ficha técnica"></div><div id="spec-content" aria-live="polite"></div>'
    });

    const comparisonPanel = renderPanel({
      id: 'comparison-panel',
      eyebrow: 'COMPARA ANTES DE ELEGIR',
      title: 'Comparar características entre tiendas',
      description: 'Detecta diferencias entre las fichas publicadas por cada tienda.',
      body: renderComparison(p),
      className: 'comparison-panel featured-panel'
    });

    const historyPanel = renderPanel({
      id: 'history-panel',
      eyebrow: 'SIGUE SU EVOLUCIÓN',
      title: 'El precio, con perspectiva',
      description: 'Compara el histórico registrado en cada tienda.',
      body: `<div class="chart-toolbar"><div class="segmented" role="group" aria-label="Periodo del histórico">${[[7,'7 días'],[30,'30 días'],[90,'90 días'],[0,'Todo']].map(([n,l])=>`<button data-range="${n}" aria-pressed="${n===0}">${l}</button>`).join('')}</div><div class="chart-stores">${p.stores.map(s=>`<label><input type="checkbox" data-chart-store="${esc(s)}" checked>${dot(s)}${esc(storeName(s))}</label>`).join('')}</div></div><div id="chart-output"></div><p class="chart-note">Cada precio se mantiene en horizontal hasta el siguiente cambio registrado. La línea termina en la última lectura correcta de esa tienda; no se prolonga hasta hoy si no hay datos nuevos. Los saltos verticales señalan cuándo se detectó un cambio. Las fechas se muestran en horario de Madrid.</p><details class="history-list" id="history-records"></details>`,
      className: 'chart-panel'
    });

    root.innerHTML = `<div class="breadcrumb"><a href="${state.savedOnly?'#guardadas':'#catalogo'}">← Volver ${state.savedOnly?'a guardadas':'al catálogo'}</a><div class="detail-actions"><button class="secondary-button" id="copy-link">Copiar enlace</button>${saveButton(p)}</div></div><section class="product-hero">${productImage(p,true)}<div><p class="brand">${esc(p.brand||'Marca sin indicar')}${p.year?' / '+esc(p.year):''}</p><h1 class="product-title" tabindex="-1">${esc(p.name)}</h1><div class="feature-tags">${['shape','play','face'].map(k=>feature(source,k)).filter(Boolean).map(v=>`<span>${esc(v)}</span>`).join('')}</div><p class="source-caption">Características de ${esc(storeName(source.store))}. Consulta cada ficha más abajo.</p><p class="product-meta">${p.stores.length} tiendas asociadas · ${p.offers.length} ofertas<br>EAN: ${eans.length?eans.map(esc).join(' · '):'No publicado'}</p></div><aside class="buy-box"><div><p class="eyebrow">${best?'MEJOR PRECIO DISPONIBLE':'DISPONIBILIDAD'}</p><div class="hero-price">${best?money(best.price,best.currency):'Sin stock'}</div><p>${best?esc(storeName(best.store)):'Consulta las ofertas registradas'}</p></div>${best?externalLink(best.url,'Ver oferta ↗','primary-button'):''}<small>Sin gastos de envío. Confirma el precio final en la tienda.</small></aside></section><nav class="detail-nav" aria-label="Secciones de la pala"><a href="#ofertas" data-scroll="offers-panel">Dónde comprar (${p.offers.length})</a><a href="#comparacion" data-scroll="comparison-panel">Comparar tiendas</a><a href="#caracteristicas" data-scroll="specs-panel">Conoce tu pala</a><a href="#historico" data-scroll="history-panel">Histórico de precios</a></nav><div class="detail-sections"><div class="detail-grid">${offersPanel}${specsPanel}</div>${comparisonPanel}${historyPanel}</div>`;

    renderSpecs();
    renderChart();
    bindImageFallback(root);

    root.querySelectorAll('[data-scroll]').forEach(a => a.addEventListener('click', e => {
      e.preventDefault();
      const target = document.getElementById(a.dataset.scroll);
      if (target instanceof HTMLDetailsElement) target.open = true;
      target?.scrollIntoView({behavior:'smooth', block:'start'});
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

  document.addEventListener('click', e => {
    const button = e.target.closest('button[data-spec-offer]');
    if (!button || button.closest('#store-tabs')) return;
    const specsPanel = document.getElementById('specs-panel');
    if (specsPanel instanceof HTMLDetailsElement) specsPanel.open = true;
  }, true);
})();
