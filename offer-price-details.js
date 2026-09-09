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
      return {best: null, currency: 'EUR', bestStoreOffers: [], mostExpensiveStoreOffer: null, bestSaving: null, pvpOffer: null, pvpSaving: null};
    }

    const currency = best.currency || 'EUR';
    const bestPrice = priceCents(best.price);
    const storeOffers = comparableStoreOffers(product, currency);
    const bestStoreOffers = storeOffers.filter(offer => priceCents(offer.price) === bestPrice);
    const mostExpensiveStoreOffer = [...storeOffers]
      .sort((left, right) => priceCents(right.price) - priceCents(left.price))[0] || null;
    const savingCents = mostExpensiveStoreOffer ? priceCents(mostExpensiveStoreOffer.price) - bestPrice : null;
    const bestSaving = Number.isFinite(savingCents) && savingCents > 0 ? savingCents / 100 : null;
    const pvpCandidates = [
      best,
      ...bestStoreOffers.filter(offer => String(offer.id) !== String(best.id))
    ];
    const pvpOffer = pvpCandidates.find(offer =>
      validPrice(offer?.original_price)
      && priceCents(offer.original_price) > bestPrice
    ) || null;
    const pvpSavingCents = pvpOffer ? priceCents(pvpOffer.original_price) - bestPrice : null;
    const pvpSaving = Number.isFinite(pvpSavingCents) && pvpSavingCents > 0 ? pvpSavingCents / 100 : null;

    return {best, currency, bestStoreOffers, mostExpensiveStoreOffer, bestSaving, pvpOffer, pvpSaving};
  }

  function isBestStoreOffer(offer, context) {
    return context.bestStoreOffers.some(candidate => String(candidate.id) === String(offer.id));
  }

  function scrollToBestOffers() {
    const panel = document.getElementById('offers-panel');
    if (!panel) return;
    if (panel instanceof HTMLDetailsElement) panel.open = true;
    panel.scrollIntoView({
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      block: 'start'
    });
  }

  function enhanceBestPriceHero(product) {
    const box = document.querySelector('#product-view .buy-box');
    if (!box) return;

    box.querySelectorAll('.hero-pvp, .hero-savings, .hero-saving-vs-max').forEach(element => element.remove());

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

    const primaryAction = box.querySelector('.primary-button');
    if (primaryAction && context.bestStoreOffers.length > 1) {
      const offersButton = document.createElement('button');
      offersButton.type = 'button';
      offersButton.className = primaryAction.className;
      offersButton.textContent = 'Ver ofertas con mejor precio ↓';
      offersButton.addEventListener('click', scrollToBestOffers);
      primaryAction.replaceWith(offersButton);
    }

    let anchor = storeLine || priceElement;

    if (context.pvpOffer) {
      const pvpElement = document.createElement('span');
      pvpElement.className = 'hero-pvp';
      pvpElement.innerHTML = `PVP <s>${money(context.pvpOffer.original_price, context.currency)}</s>`;
      anchor.insertAdjacentElement('afterend', pvpElement);
      anchor = pvpElement;
    }

    const savingItems = [];
    if (Number.isFinite(context.bestSaving) && context.bestSaving > 0) {
      savingItems.push({
        className: 'hero-saving-vs-store',
        text: `Ahorras ${money(context.bestSaving, context.currency)} frente a la tienda más cara disponible`
      });
    }
    if (Number.isFinite(context.pvpSaving) && context.pvpSaving > 0) {
      savingItems.push({
        className: 'hero-saving-vs-pvp',
        text: `Ahorras ${money(context.pvpSaving, context.currency)} sobre el PVP`
      });
    }
    if (savingItems.length) {
      const savingsElement = document.createElement('div');
      savingsElement.className = 'hero-savings';
      savingsElement.innerHTML = savingItems
        .map(item => `<div class="hero-saving-vs-max ${item.className}">${item.text}</div>`)
        .join('');
      anchor.insertAdjacentElement('afterend', savingsElement);
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
    const bestPrice = best ? priceCents(best.price) : null;

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

        const savingItems = [];
        if (Number.isFinite(context.bestSaving) && context.bestSaving > 0) {
          savingItems.push({
            className: 'offer-saving-vs-store',
            text: `Ahorras ${money(context.bestSaving, bestCurrency)} frente a la tienda más cara disponible`
          });
          restoredLabels.add('Ahorro frente a la tienda más cara disponible');
        }
        const offerPvpSavingCents = hasDiscount && Number.isFinite(bestPrice)
          ? priceCents(offer.original_price) - bestPrice
          : null;
        const offerPvpSaving = Number.isFinite(offerPvpSavingCents) && offerPvpSavingCents > 0 ? offerPvpSavingCents / 100 : null;
        if (Number.isFinite(offerPvpSaving) && offerPvpSaving > 0) {
          savingItems.push({
            className: 'offer-saving-vs-pvp',
            text: `Ahorras ${money(offerPvpSaving, offerCurrency)} sobre el PVP`
          });
          restoredLabels.add('Ahorro sobre PVP');
        }
        if (savingItems.length) {
          const savingsElement = document.createElement('div');
          savingsElement.className = 'offer-savings';
          savingsElement.innerHTML = savingItems
            .map(item => `<span class="offer-saving-vs-max ${item.className}">${item.text}</span>`)
            .join('');
          priceBlock.appendChild(savingsElement);
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
