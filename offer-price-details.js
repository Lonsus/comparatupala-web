'use strict';

(() => {
  const baseRenderOffers = renderOffers;

  renderOffers = function renderOffersWithPriceDetails(product) {
    const html = baseRenderOffers(product);
    if (!html || !product?.offers?.length) return html;

    const template = document.createElement('template');
    template.innerHTML = html;

    const best = bestOffer(product.offers);
    const bestCurrency = best?.currency || 'EUR';

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
})();
