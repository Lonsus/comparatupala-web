'use strict';

(() => {
  const baseRenderOffers = renderOffers;

  function mostExpensiveComparableStoreOffer(product, best) {
    if (!best || !available(best) || !validPrice(best.price)) return null;
    const bestCurrency = best.currency || 'EUR';
    const byStore = new Map();

    product.offers.forEach(offer => {
      if (!offer?.store || !available(offer) || !validPrice(offer.price)) return;
      if ((offer.currency || 'EUR') !== bestCurrency) return;
      const previous = byStore.get(offer.store);
      if (!previous || Number(offer.price) < Number(previous.price)) byStore.set(offer.store, offer);
    });

    byStore.delete(best.store);
    return [...byStore.values()]
      .sort((left, right) => Number(right.price) - Number(left.price))[0] || null;
  }

  renderOffers = function renderOffersWithPriceDetails(product) {
    const html = baseRenderOffers(product);
    if (!html || !product?.offers?.length) return html;

    const template = document.createElement('template');
    template.innerHTML = html;

    const best = bestOffer(product.offers);
    const bestCurrency = best?.currency || 'EUR';
    const mostExpensiveStoreOffer = mostExpensiveComparableStoreOffer(product, best);
    const bestSaving = best
      && mostExpensiveStoreOffer
      && validPrice(best.price)
      && validPrice(mostExpensiveStoreOffer.price)
      ? Number(mostExpensiveStoreOffer.price) - Number(best.price)
      : null;

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

      if (best && String(offer.id) === String(best.id) && Number.isFinite(bestSaving) && bestSaving > 0) {
        const savingElement = document.createElement('span');
        savingElement.className = 'offer-original offer-saving-vs-max';
        savingElement.textContent = `Ahorras ${money(bestSaving, bestCurrency)} frente a la tienda más cara (${storeName(mostExpensiveStoreOffer.store)})`;
        priceBlock.appendChild(savingElement);
        restoredLabels.add('Ahorro frente a la tienda más cara');
      }

      const delta = best
        && offer.id !== best.id
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

  document.addEventListener('toggle', event => {
    const panel = event.target;
    if (!(panel instanceof HTMLDetailsElement) || panel.id !== 'offers-panel' || panel.open) return;
    panel.querySelectorAll('details.offers-overflow[open]').forEach(details => {
      details.open = false;
    });
  }, true);
})();
