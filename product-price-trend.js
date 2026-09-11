'use strict';

(() => {
  const ROOT_ID = 'product-view';
  const CARD_CLASS = 'product-price-trend';
  const DAY = 24 * 60 * 60 * 1000;
  const WEEK = 7 * DAY;
  let lastSignature = '';
  let scheduled = false;

  function scheduleRefresh() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      refresh();
    });
  }

  function safeText(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[char]));
  }

  function moneyShort(value, currency = 'EUR') {
    if (!Number.isFinite(Number(value))) return '—';
    try {
      return new Intl.NumberFormat('es-ES', {
        style: 'currency', currency: currency || 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2
      }).format(Number(value));
    } catch {
      return `${Number(value).toFixed(2).replace('.', ',')} €`;
    }
  }

  function moneyAxis(value, currency = 'EUR') {
    if (!Number.isFinite(Number(value))) return '—';
    try {
      return new Intl.NumberFormat('es-ES', {
        style: 'currency', currency: currency || 'EUR', maximumFractionDigits: 0
      }).format(Number(value));
    } catch {
      return `${Math.round(Number(value))} €`;
    }
  }

  function shortDate(time) {
    if (!Number.isFinite(Number(time))) return '';
    return new Intl.DateTimeFormat('es-ES', {day: 'numeric', month: 'short', timeZone: 'Europe/Madrid'}).format(new Date(time));
  }

  function fullDate(time) {
    if (!Number.isFinite(Number(time))) return '';
    return new Intl.DateTimeFormat('es-ES', {day: 'numeric', month: 'long', timeZone: 'Europe/Madrid'}).format(new Date(time));
  }

  function currencyForProduct(product) {
    const current = bestOffer(product?.offers || []);
    if (current?.currency) return current.currency;
    const priced = (product?.offers || []).find(offer => validPrice(offer?.price));
    return priced?.currency || 'EUR';
  }

  function valueAt(series, time) {
    const points = (series?.points || []).filter(point => Number.isFinite(point.time) && validPrice(point.price));
    if (!points.length) return null;
    if (time > points.at(-1).time) return null;
    let value = null;
    for (const point of points) {
      if (point.time > time) break;
      value = Number(point.price);
    }
    return Number.isFinite(value) ? value : null;
  }

  function weeklyBestPrice(product) {
    if (!product || typeof chartSeries !== 'function') return null;
    const currency = currencyForProduct(product);
    const model = chartSeries(product, state.history, 90, new Set());
    const series = (model?.series || []).filter(item => (item.offer?.currency || 'EUR') === currency);
    if (!series.length || !Number.isFinite(model.minT) || !Number.isFinite(model.maxT) || model.maxT <= model.minT) return null;

    const times = [];
    for (let time = model.minT; time < model.maxT; time += WEEK) times.push(time);
    if (!times.length || times.at(-1) !== model.maxT) times.push(model.maxT);

    const points = times.map(time => {
      const prices = series.map(item => valueAt(item, time)).filter(Number.isFinite);
      return prices.length ? {time, price: Math.min(...prices)} : null;
    }).filter(Boolean);

    const compact = [];
    for (const point of points) {
      if (compact.length && compact.at(-1).time === point.time) compact[compact.length - 1] = point;
      else compact.push(point);
    }

    return compact.length >= 2 ? {points: compact, currency} : null;
  }

  function statusCopy(points, currency) {
    const currentOffer = bestOffer(state.product?.offers || []);
    const current = validPrice(currentOffer?.price) ? Number(currentOffer.price) : points.at(-1).price;
    const history = points.length > 2 ? points.slice(0, -1).map(point => point.price) : points.map(point => point.price);
    const min = Math.min(...history);
    const max = Math.max(...history);
    const average = history.reduce((sum, value) => sum + value, 0) / history.length;
    const tolerance = Math.max(0.5, average * 0.01);
    const relation = current < average - tolerance ? 'por debajo de lo habitual' : current > average + tolerance ? 'por encima de lo habitual' : 'en línea con lo habitual';
    return {
      current,
      relation,
      range: `${moneyAxis(min, currency).replace(/\s/g, ' ')}–${moneyAxis(max, currency).replace(/\s/g, ' ')}`
    };
  }

  function chartSvg(points, currency) {
    const width = 1000;
    const height = 250;
    const left = 78;
    const right = 20;
    const top = 20;
    const bottom = 48;
    const plotW = width - left - right;
    const plotH = height - top - bottom;
    const prices = points.map(point => point.price);
    let min = Math.min(...prices);
    let max = Math.max(...prices);
    if (min === max) { min -= 1; max += 1; }
    const pad = Math.max((max - min) * .15, 1);
    min -= pad;
    max += pad;
    const x = index => left + (points.length === 1 ? plotW / 2 : index * plotW / (points.length - 1));
    const y = price => top + (max - price) / (max - min) * plotH;
    const line = points.map((point, index) => `${index ? 'L' : 'M'} ${x(index).toFixed(2)} ${y(point.price).toFixed(2)}`).join(' ');
    const area = `${line} L ${x(points.length - 1).toFixed(2)} ${(top + plotH).toFixed(2)} L ${x(0).toFixed(2)} ${(top + plotH).toFixed(2)} Z`;
    const tickValues = [max - pad, (min + max) / 2, min + pad];
    const dateIndexes = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])];

    return `<svg class="product-price-trend-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Evolución semanal del mejor precio">
      <g class="product-price-trend-grid">${tickValues.map(value => `<line x1="${left}" y1="${y(value).toFixed(2)}" x2="${width - right}" y2="${y(value).toFixed(2)}"></line><text x="${left - 14}" y="${(y(value) + 4).toFixed(2)}" text-anchor="end">${safeText(moneyAxis(value, currency))}</text>`).join('')}</g>
      <path class="product-price-trend-area" d="${area}"></path>
      <path class="product-price-trend-line" d="${line}"></path>
      ${points.map((point, index) => `<circle class="product-price-trend-dot" cx="${x(index).toFixed(2)}" cy="${y(point.price).toFixed(2)}" r="6"><title>${safeText(shortDate(point.time))}: ${safeText(moneyShort(point.price, currency))}</title></circle>`).join('')}
      <g class="product-price-trend-dates">${dateIndexes.map(index => `<text x="${x(index).toFixed(2)}" y="${height - 12}" text-anchor="${index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'}">${safeText(shortDate(points[index].time))}</text>`).join('')}</g>
    </svg>`;
  }

  function weeklyRows(points, currency) {
    return points.slice().reverse().map(point => `<div class="product-price-week-row"><span>${safeText(fullDate(point.time))}</span><strong>${safeText(moneyShort(point.price, currency))}</strong></div>`).join('');
  }

  function trendMarkup(product, model) {
    const {points, currency} = model;
    const first = points[0];
    const last = points.at(-1);
    const previous = points.at(-2);
    const status = statusCopy(points, currency);
    const change = previous ? status.current - previous.price : 0;
    const direction = change < -0.005 ? 'down' : change > 0.005 ? 'up' : 'flat';
    const changeLabel = direction === 'down' ? `↓ Bajó ${moneyShort(Math.abs(change), currency)} esta semana` : direction === 'up' ? `↑ Subió ${moneyShort(Math.abs(change), currency)} esta semana` : '→ Sin cambios esta semana';
    const signature = `${product.id}:${points.map(point => `${point.time}:${point.price}`).join('|')}:${status.current}`;

    return {signature, html: `<section class="${CARD_CLASS}" data-price-trend-signature="${safeText(signature)}" aria-labelledby="product-price-trend-title">
      <div class="product-price-trend-heading">
        <div>
          <p><strong id="product-price-trend-title">Evolución del precio</strong><span> · desde el ${safeText(shortDate(first.time))}</span></p>
          <small>Un punto por semana, usando el mejor precio registrado de la pala.</small>
        </div>
      </div>
      <p class="product-price-trend-summary"><strong>Hoy ${safeText(moneyShort(status.current, currency))}</strong> · ${safeText(status.relation)} desde el ${safeText(shortDate(first.time))}: ${safeText(status.range)}</p>
      <div class="product-price-trend-chart">${chartSvg(points, currency)}</div>
      <p class="product-price-trend-change product-price-trend-change-${direction}">${safeText(changeLabel)}</p>
      <details class="product-price-trend-details">
        <summary>Ver los precios semana a semana</summary>
        <div class="product-price-week-list">${weeklyRows(points, currency)}</div>
      </details>
    </section>`};
  }

  function refresh() {
    const root = document.getElementById(ROOT_ID);
    const product = state?.product;
    if (!root || root.hidden || !product) {
      lastSignature = '';
      return;
    }

    const hero = root.querySelector('.product-hero');
    const nav = root.querySelector('.detail-nav, .detail-nav-sticky');
    if (!hero || !nav) return;

    const model = weeklyBestPrice(product);
    const existing = root.querySelector(`.${CARD_CLASS}`);
    if (!model) {
      existing?.remove();
      lastSignature = '';
      return;
    }

    const rendered = trendMarkup(product, model);
    if (existing?.dataset.priceTrendSignature === rendered.signature && lastSignature === rendered.signature) return;

    if (existing) existing.remove();
    hero.insertAdjacentHTML('afterend', rendered.html);
    lastSignature = rendered.signature;
  }

  const root = document.getElementById(ROOT_ID);
  if (root) new MutationObserver(scheduleRefresh).observe(root, {childList: true, subtree: true});
  window.addEventListener('hashchange', scheduleRefresh);
  window.addEventListener('resize', scheduleRefresh, {passive: true});

  window.CTPProductPriceTrend = {refresh: scheduleRefresh};
  scheduleRefresh();
})();
