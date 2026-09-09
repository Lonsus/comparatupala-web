'use strict';

(() => {
  const baseRenderOffers = renderOffers;
  const baseRenderProduct = renderProduct;

  const priceCents = value => Math.round(Number(value) * 100);

  function comparableStoreOffers(product, currency) {
    const byStore = new Map();

    (product?.offers || []).forEach(offer => {
      if (!offer?.store || !available(offer) || !validPrice(offer.price)) return;
      if ((offer.currency || 'EUR') !== currency) return;
      const previous = byStore.get(offer.store);
      if (!previous || priceCents(offer.price) < priceCents(previous.price)) byStore.set(offer.store, offer);
    });

    return [...byStore.values()];
  }

  function bestPriceContext(product) {
    const best = bestOffer(product?.offers || []);
    if (!best || !validPrice(best.price)) {
      return {best: null, currency: 'EUR', bestStoreOffers: [], mostExpensiveStoreOffer: null, bestSaving: null, pvpOffer: null};
    }

    const currency = best.currency || 'EUR';
    const bestPrice = priceCents(best.price);
    const storeOffers = comparableStoreOffers(product, currency);
    const bestStoreOffers = storeOffers.filter(offer => priceCents(offer.price) === bestPrice);
    const mostExpensiveStoreOffer = [...storeOffers]
      .sort((left, right) => priceCents(right.price) - priceCents(left.price))[0] || null;
    const savingCents = mostExpensiveStoreOffer ? priceCents(mostExpensiveStoreOffer.price) - bestPrice : null;
    const bestSaving = Number.isFinite(savingCents) && savingCents > 0 ? savingCents / 100 : null;
    const pvpOffer = [...bestStoreOffers, ...storeOffers].find(offer =>
      validPrice(offer.original_price)
      && priceCents(offer.original_price) > bestPrice
    ) || null;

    return {best, currency, bestStoreOffers, mostExpensiveStoreOffer, bestSaving, pvpOffer};
  }

  function isBestStoreOffer(offer, context) {
    return context.bestStoreOffers.some(candidate => String(candidate.id) === String(offer.id));
  }

  function enhanceBestPriceHero(product) {
    const box = document.querySelector('#product-view .buy-box');
    if (!box) return;

    box.querySelectorAll('.hero-pvp, .hero-saving-vs-max').forEach(element => element.remove());

    const context = bestPriceContext(product);
    if (!context.best) return;

    const priceElement = box.querySelector('.hero-price');
    if (!priceElement) return;

    priceElement.textContent = money(context.best.price, context.currency);

    const storeLine = priceElement.nextElementSibling;
    if (storeLine instanceof HTMLParagraphElement) {
      const storeNames = [...new Set(context.bestStoreOffers.map(offer => storeName(offer.store)).filter(Boolean))];
      storeLine.classList.add('hero-best-stores');
      storeLine.textContent = storeNames.length ? storeNames.join(' · ') : storeName(context.best.store);
    }

    let anchor = storeLine || priceElement;

    if (context.pvpOffer) {
      const pvpElement = document.createElement('span');
      pvpElement.className = 'hero-pvp';
      pvpElement.innerHTML = `PVP <s>${money(context.pvpOffer.original_price, context.currency)}</s> · −${discount(context.pvpOffer)}%`;
      anchor.insertAdjacentElement('afterend', pvpElement);
      anchor = pvpElement;
    }

    if (Number.isFinite(context.bestSaving) && context.bestSaving > 0) {
      const savingElement = document.createElement('div');
      savingElement.className = 'hero-saving-vs-max';
      savingElement.textContent = `Ahorras ${money(context.bestSaving, context.currency)} frente a la tienda más cara`;
      anchor.insertAdjacentElement('afterend', savingElement);
    }
  }

  renderOffers = function renderOffersWithPriceDetails(product) {
    const html = baseRenderOffers(product);
    if (!html || !product?.offers?.length) return html;

    const template = document.createElement('template');
    template.innerHTML = html;

    const context = bestPriceContext(product);
    const best = context.best;
    const bestCurrency = context.currency;

    template.content.querySelectorAll('.compact-offer').forEach(row => {
      const offerId = row.querySelector('[data-spec-offer]')?.dataset.specOffer;
      const offer = product.offers.find(candidate => String(candidate.id) === String(offerId));
      const priceBlock = row.querySelector('.offer-price');
      if (!offer || !priceBlock) return;

      const restoredLabels = new Set();
      const offerCurrency = offer.currency || 'EUR';
      const hasDiscount = validPrice(offer.original_price)
        && validPrice(offer.price)
        && Number(offer.original_price) > Number(offer.price);

      if (hasDiscount) {
        const original = document.createElement('span');
        original.className = 'offer-original';
        original.innerHTML = `PVP <s>${money(offer.original_price, offerCurrency)}</s> · −${discount(offer)}%`;
        priceBlock.appendChild(original);
        restoredLabels.add('PVP');
        restoredLabels.add('Descuento');
      }

      if (isBestStoreOffer(offer, context)) {
        row.classList.add('best-offer');
        const info = row.querySelector('.offer-info');
        if (info && !info.textContent.includes('Mejor precio disponible')) {
          info.textContent = `Mejor precio disponible · ${info.textContent}`;
        }

        if (Number.isFinite(context.bestSaving) && context.bestSaving > 0) {
          const savingElement = document.createElement('span');
          savingElement.className = 'offer-saving-vs-max';
          savingElement.textContent = `Ahorras ${money(context.bestSaving, bestCurrency)} frente a la tienda más cara`;
          priceBlock.appendChild(savingElement);
          restoredLabels.add('Ahorro frente a la tienda más cara');
        }
      }

      const delta = best
        && priceCents(offer.price) !== priceCents(best.price)
        && offerCurrency === bestCurrency
        && validPrice(offer.price)
        && validPrice(best.price)
        ? Number(offer.price) - Number(best.price)
        : null;

      if (Number.isFinite(delta) && delta > 0) {
        const deltaElement = document.createElement('span');
        deltaElement.className = 'offer-delta';
        deltaElement.textContent = `+${money(delta, offerCurrency)} frente al mejor precio`;
        priceBlock.appendChild(deltaElement);
        restoredLabels.add('Frente al mejor precio');
      }

      const details = row.querySelector('.offer-more dl');
      details?.querySelectorAll(':scope > div').forEach(item => {
        const label = item.querySelector('dt')?.textContent?.trim();
        if (label && restoredLabels.has(label)) item.remove();
      });

      if (details && !details.children.length) row.querySelector('.offer-more')?.remove();
    });

    return template.innerHTML;
  };

  renderProduct = function renderProductWithBestPriceSummary(product) {
    baseRenderProduct(product);
    enhanceBestPriceHero(product);
  };

  document.addEventListener('toggle', event => {
    const panel = event.target;
    if (!(panel instanceof HTMLDetailsElement) || panel.id !== 'offers-panel' || panel.open) return;
    panel.querySelectorAll('details.offers-overflow[open]').forEach(details => {
      details.open = false;
    });
  }, true);
})();
