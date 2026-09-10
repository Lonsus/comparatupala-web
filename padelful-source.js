'use strict';

(() => {
  const isInformationSource = offer => offer?.source_type === 'information' || offer?.source_kind === 'information';
  const commercialOffers = product => (product?.offers || []).filter(offer => !isInformationSource(offer));
  const informationOffers = product => (product?.offers || []).filter(isInformationSource);
  const commercialStores = product => [...new Set(commercialOffers(product).map(offer => offer.store).filter(Boolean))];

  const style = document.createElement('style');
  style.textContent = `
    .offer-row.information-source{border-color:#c7d2fe;background:linear-gradient(135deg,#f8faff,#eef2ff)}
    .offer-row.information-source .offer-store{font-weight:800}.source-badge{display:inline-flex;align-items:center;gap:.35rem;border-radius:999px;padding:.28rem .58rem;background:#e0e7ff;color:#3730a3;font-size:.75rem;font-weight:800}
    .information-source .offer-price strong,.information-source .source-price-label{color:#3730a3}.information-source-note{margin:.25rem 0 0;color:#596579;font-size:.82rem}
    #store-view.padelful-source-view .store-price-fields{display:none}#store-view.padelful-source-view .store-independent-copy{max-width:70ch}
    #store-view.padelful-source-view .store-card-dot,#store-view.padelful-source-view .store-identity-dot{filter:saturate(.75)}
  `;
  document.head.appendChild(style);

  productMatch = function productMatchWithSources(p, f) {
    if (f.brand && norm(p.brand) !== f.brand) return null;
    const count = Number.isFinite(Number(p.offer_count)) ? Number(p.offer_count) : commercialOffers(p).length;
    if (!matchesOfferCount(count, f.count)) return null;
    const scoped = (p.offers || []).filter(o => !f.store || o.store === f.store);
    if (!scoped.length) return null;
    if (f.availability === 'unavailable' && scoped.some(available)) return null;
    const eligible = scoped.filter(o => {
      if (f.availability === 'available' && !available(o)) return false;
      if (f.q && !norm([p.name,p.brand,p.ean,o.ean,o.reference,o.sku,o.name,...featureEntries(o).flat()].join(' ')).includes(f.q)) return false;
      if (['shape','level','play'].some(k => f[k] && norm(feature(o,k)) !== f[k])) return false;
      if ((f.min !== null || f.max !== null) && (!available(o) || !validPrice(o.price))) return false;
      if (f.min !== null && Number(o.price) < f.min) return false;
      if (f.max !== null && Number(o.price) > f.max) return false;
      return true;
    });
    return eligible.length ? {product:p, offers:eligible, best:bestOffer(eligible)} : null;
  };

  const originalCard = card;
  card = function cardWithInformationSources(row) {
    let html = originalCard(row);
    const storeCount = [...new Set((row.offers || []).filter(o => !isInformationSource(o)).map(o => o.store).filter(Boolean))].length;
    const sourceCount = (row.offers || []).filter(isInformationSource).length;
    const label = `${storeCount} tienda${storeCount === 1 ? '' : 's'} para comparar${sourceCount ? ` · ${sourceCount} fuente informativa` : ''}`;
    html = html.replace(/<p class="card-compare-meta">[\s\S]*?<\/p>/, `<p class="card-compare-meta">${esc(label)}</p>`);
    return html;
  };

  renderOffers = function renderOffersWithInformation(product) {
    const best = bestOffer(product.offers);
    const bestCurrency = best?.currency || 'EUR';
    return product.offers.map(o => {
      if (isInformationSource(o)) {
        const checked = o.last_successful_check || o.last_checked;
        const rating = o.source_rating !== null && o.source_rating !== undefined && o.source_rating !== ''
          ? `<p class="information-source-note">Valoración Padelful: <strong>${esc(o.source_rating)}</strong></p>` : '';
        return `<article class="offer-row information-source">
          <div class="offer-store-block"><div class="offer-store">${dot(o.store)}${storeLabel(o.store)}</div><span class="source-badge">Fuente informativa</span>${rating}<p class="offer-info">Ficha técnica y datos descriptivos. No es una oferta de compra.</p></div>
          <div class="offer-price"><span class="source-price-label">Sin precio de compra</span>${validPrice(o.original_price) ? `<span class="offer-original">PVP informativo ${money(o.original_price,o.currency)}</span>` : ''}</div>
          <div class="offer-ean">EAN: ${esc(o.ean || 'No publicado')}<br>Datos actualizados: ${esc(date(checked,true))}</div>
          <span class="badge positive">Datos disponibles</span>
          <div class="offer-actions"><button class="text-button" data-spec-offer="${esc(o.id)}">Ver características</button>${externalLink(o.url,'Ver ficha en Padelful ↗')}</div>
        </article>`;
      }
      const offerCurrency = o.currency || 'EUR';
      const delta = best && o.id !== best.id && offerCurrency === bestCurrency && validPrice(o.price) && validPrice(best.price)
        ? Number(o.price) - Number(best.price) : null;
      const deltaMarkup = Number.isFinite(delta) && delta > 0
        ? `<span class="offer-delta">+${money(delta,offerCurrency)} frente al mejor precio</span>` : '';
      return `<article class="offer-row ${best?.id===o.id?'best-offer':''}"><div class="offer-store-block"><div class="offer-store">${dot(o.store)}${storeLabel(o.store)}</div>${renderExternalRating(o)}<p class="offer-info">${best?.id===o.id?'Mejor precio disponible · ':''}${esc(availabilityLabel(o))}</p></div><div class="offer-price">${money(o.price,o.currency)}${validPrice(o.original_price)&&validPrice(o.price)&&Number(o.original_price)>Number(o.price)?`<span class="offer-original">PVP <s>${money(o.original_price,o.currency)}</s> · −${discount(o)}%</span>`:''}${deltaMarkup}</div><div class="offer-ean">EAN: ${esc(o.ean||'No publicado')}<br>Última lectura correcta: ${esc(date(o.last_successful_check||(!isError(o)?o.last_checked:null),true))}</div><span class="badge ${available(o)?'positive':'warning'}">${available(o)?'En stock':'Sin stock confirmado'}</span><div class="offer-actions"><button class="text-button" data-spec-offer="${esc(o.id)}">Ver características</button>${externalLink(o.url,'Ir a la tienda ↗')}</div></article>`;
    }).join('');
  };

  const originalRenderProduct = renderProduct;
  renderProduct = function renderProductWithSources(p) {
    originalRenderProduct(p);
    const root = document.getElementById('product-view');
    if (!root) return;
    const storesCount = commercialStores(p).length;
    const offersCount = Number.isFinite(Number(p.offer_count)) ? Number(p.offer_count) : commercialOffers(p).length;
    const infoCount = informationOffers(p).length;
    const eans = [...new Set([p.ean,...(p.offers||[]).map(o=>o.ean)].filter(Boolean))];
    const meta = root.querySelector('.product-meta');
    if (meta) meta.innerHTML = `${storesCount} tienda${storesCount===1?'':'s'} asociada${storesCount===1?'':'s'} · ${offersCount} oferta${offersCount===1?'':'s'}${infoCount?` · ${infoCount} fuente informativa`:''}<br>EAN: ${eans.length?eans.map(esc).join(' · '):'No publicado'}`;

    const offersNav = root.querySelector('.detail-nav [data-scroll="offers-panel"]');
    if (offersNav) offersNav.textContent = `Ofertas y fuentes (${offersCount + infoCount})`;
    const comparisonNav = root.querySelector('.detail-nav [data-scroll="comparison-panel"]');
    if (comparisonNav) comparisonNav.textContent = 'Comparar fuentes';

    const offersSummary = root.querySelector('#offers-panel .panel-summary-copy');
    if (offersSummary) {
      const eyebrow = offersSummary.querySelector('.eyebrow'); if (eyebrow) eyebrow.textContent = 'DÓNDE COMPRAR · OTRAS FUENTES';
      const heading = offersSummary.querySelector('.panel-summary-title'); if (heading) heading.textContent = 'Ofertas y fuentes de información';
      const copy = offersSummary.querySelector('.panel-summary-description'); if (copy) copy.textContent = `${offersCount} ofertas comerciales · ${infoCount} fuentes informativas.`;
    }
    const specsSummary = root.querySelector('#specs-panel .panel-summary-copy');
    if (specsSummary) {
      const heading = specsSummary.querySelector('.panel-summary-title'); if (heading) heading.textContent = 'Su ficha, fuente a fuente';
      const copy = specsSummary.querySelector('.panel-summary-description'); if (copy) copy.textContent = 'Elige una tienda o fuente informativa para ver sus características.';
    }
    const comparisonSummary = root.querySelector('#comparison-panel .panel-summary-copy');
    if (comparisonSummary) {
      const heading = comparisonSummary.querySelector('.panel-summary-title'); if (heading) heading.textContent = 'Comparar características entre fuentes';
      const copy = comparisonSummary.querySelector('.panel-summary-description'); if (copy) copy.textContent = 'Selecciona tiendas y fuentes informativas para detectar diferencias entre sus fichas.';
    }
    root.querySelectorAll('.comparison-selection-status span').forEach(node => {
      if (node.textContent.includes('tiendas')) node.textContent = 'Selecciona las fuentes que quieres comparar.';
    });
    root.querySelectorAll('.source-caption').forEach(node => {
      if (node.textContent.includes('tienda no aporta')) node.textContent = '«No publicado» indica que esa fuente no aporta el dato en su ficha.';
    });

    if (!bestOffer(p.offers) && infoCount) {
      const box = root.querySelector('.buy-box');
      if (box) box.innerHTML = `<div><p class="eyebrow">SIN OFERTAS COMERCIALES</p><div class="hero-price">Ficha disponible</div><p>Consulta las características publicadas por Padelful.</p></div><small>Esta pala todavía no tiene una oferta de compra monitorizada por ComparaTuPala.</small>`;
    }
  };

  function polishTopbarCount() {
    const note = document.querySelector('.topbar-note');
    if (!note || !stores.padelful) return;
    const commercial = Object.values(stores).filter(store => store?.slug && store.active !== false && store.slug !== 'padelful').length;
    const wanted = `${commercial.toLocaleString('es-ES')} tiendas + Padelful como fuente informativa.`;
    if (note.textContent.trim() !== wanted) note.textContent = wanted;
  }

  function polishStoresIndex() {
    if (location.hash !== '#tiendas') return;
    const root = document.getElementById('store-view');
    if (!root || root.hidden) return;
    const heading = root.querySelector('.stores-heading');
    if (heading) {
      const eyebrow = heading.querySelector('.eyebrow'); if (eyebrow) eyebrow.textContent = 'TIENDAS Y FUENTES MONITORIZADAS';
      const title = heading.querySelector('h1'); if (title) title.textContent = 'Tiendas y fuentes';
      const copy = heading.querySelector('.muted'); if (copy) copy.textContent = 'Explora tiendas con precios y disponibilidad, además de fuentes informativas como Padelful.';
    }
    root.querySelectorAll('.store-card').forEach(card => {
      if (card.querySelector('h2')?.textContent.trim() !== 'Padelful') return;
      const eyebrow = card.querySelector('.eyebrow'); if (eyebrow) eyebrow.textContent = 'FUENTE INFORMATIVA';
      const metrics = card.querySelectorAll('.store-card-metrics > div');
      if (metrics[0]) metrics[0].querySelector('dt').textContent = 'Palas documentadas';
      if (metrics[1]) { metrics[1].querySelector('dt').textContent = 'Fichas disponibles'; metrics[1].querySelector('dd').textContent = metrics[0]?.querySelector('dd')?.textContent || '0'; }
      if (metrics[2]) metrics[2].querySelector('dt').textContent = 'Registros informativos';
      const link = card.querySelector('.store-card-link'); if (link) link.textContent = 'Ver fuente →';
    });
  }

  function polishPadelfulStorePage() {
    const root = document.getElementById('store-view');
    if (!root) return;
    const active = decodeURIComponent((location.hash.match(/^#tienda\/([^?]+)/) || [])[1] || '') === 'padelful';
    root.classList.toggle('padelful-source-view', active);
    if (!active) return;
    if (stores.padelful) stores.padelful.kind = 'information';

    root.querySelectorAll('.eyebrow').forEach(node => {
      if (node.textContent.includes('TIENDA MONITORIZADA')) node.textContent = 'FUENTE INFORMATIVA';
      if (node.textContent.includes('CATÁLOGO DE PADELFUL')) node.textContent = 'PALAS DOCUMENTADAS POR PADELFUL';
    });
    const title = root.querySelector('#store-catalog-title');
    if (title) title.textContent = 'Palas con información de Padelful';
    const independent = root.querySelector('.store-independent-copy');
    if (independent) independent.textContent = 'Padelful se muestra como fuente informativa para aportar características y contexto. No se contabiliza como tienda comercial ni como oferta de compra.';
    const actionSmall = root.querySelector('.store-hero-action small');
    if (actionSmall) actionSmall.textContent = 'La ficha enlazada pertenece a Padelful. ComparaTuPala no atribuye a Padelful una oferta de compra propia.';
    const availabilitySelect = root.querySelector('#store-availability');
    if (availabilitySelect && availabilitySelect.value === 'available' && availabilitySelect.dataset.padelfulAdjusted !== 'true') {
      availabilitySelect.dataset.padelfulAdjusted = 'true';
      availabilitySelect.value = '';
      availabilitySelect.dispatchEvent(new Event('change', {bubbles:true}));
    }
    root.querySelectorAll('.store-product-status .badge').forEach(node => { if (node.textContent !== 'Ficha disponible') node.textContent = 'Ficha disponible'; });
    root.querySelectorAll('.store-product-price').forEach(block => {
      const small = block.querySelector('small'); if (small) small.textContent = 'Fuente informativa';
      const strong = block.querySelector('strong'); if (strong) strong.textContent = 'Sin precio de compra';
    });
    const statLabels = root.querySelectorAll('.store-stats span');
    statLabels.forEach(label => {
      if (label.textContent === 'Ofertas monitorizadas') label.textContent = 'Fichas informativas';
      if (label.textContent === 'Ofertas disponibles') label.textContent = 'Ofertas comerciales';
      if (label.textContent === 'Ofertas agotadas') label.textContent = 'Stock comercial';
      if (label.textContent === 'Precio medio disponible') label.textContent = 'Precio propio';
      if (label.textContent === 'Descuento medio') label.textContent = 'Descuento propio';
      if (label.textContent === 'Mayor descuento') label.textContent = 'Mayor descuento propio';
      if (label.textContent === 'Última lectura correcta') label.textContent = 'Última actualización';
    });
  }

  function polishSources() {
    polishTopbarCount();
    polishStoresIndex();
    polishPadelfulStorePage();
  }

  const main = document.getElementById('main');
  if (main) new MutationObserver(() => requestAnimationFrame(polishSources)).observe(main,{childList:true,subtree:true});
  const topbarNote = document.querySelector('.topbar-note');
  if (topbarNote) new MutationObserver(polishTopbarCount).observe(topbarNote,{childList:true,characterData:true,subtree:true});
  window.addEventListener('hashchange', () => requestAnimationFrame(polishSources));
  queueMicrotask(() => {
    if (state.loaded) {
      if (state.product) renderProduct(state.product);
      else renderCatalog();
    }
    polishSources();
  });
})();
