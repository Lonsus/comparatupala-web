/* Small interaction improvements built on the existing catalog controls. */
'use strict';
(() => {
  const search = document.getElementById('search');
  const clear = document.getElementById('search-clear');
  const quickFilters = [...document.querySelectorAll('[data-quick-filter]')];
  const presets = {'availability': 'available', 'offer-count': '>=2'};

  // Keep Guardadas in the original top navigation and preserve its existing
  // #guardadas route/counter behavior. The only new behavior is a stronger
  // account CTA inside the saved-items view for visitors without a session.
  const savedLink = document.getElementById('nav-saved');
  if (savedLink) savedLink.hidden = false;

  const catalogView = document.getElementById('catalog-view');
  const homeSearch = catalogView?.querySelector('.home-search');
  const accountOpen = document.getElementById('account-open');
  let savedAccountPrompt = null;

  if (catalogView && homeSearch && accountOpen) {
    savedAccountPrompt = document.createElement('section');
    savedAccountPrompt.className = 'saved-account-prompt';
    savedAccountPrompt.hidden = true;
    savedAccountPrompt.setAttribute('aria-label', 'Guardar palas con una cuenta');
    savedAccountPrompt.innerHTML = `
      <div class="saved-account-prompt-copy">
        <span class="saved-account-prompt-icon" aria-hidden="true">♥</span>
        <div>
          <p>GUARDA TUS PALAS</p>
          <h2>Tus favoritas, siempre contigo</h2>
          <span>Accede o crea una cuenta para sincronizar las palas que guardes y recuperarlas desde cualquier dispositivo.</span>
        </div>
      </div>
      <button type="button" class="saved-account-prompt-action">Acceder o crear cuenta</button>`;
    homeSearch.insertAdjacentElement('beforebegin', savedAccountPrompt);
    savedAccountPrompt.querySelector('.saved-account-prompt-action').addEventListener('click', () => accountOpen.click());
  }

  function syncSavedAccountPrompt() {
    if (!savedAccountPrompt || !accountOpen) return;
    const onSaved = location.hash === '#guardadas';
    const signedIn = accountOpen.textContent.trim().toLowerCase() === 'mi cuenta';
    savedAccountPrompt.hidden = !onSaved || signedIn;
  }

  if (accountOpen) new MutationObserver(syncSavedAccountPrompt).observe(accountOpen, {childList: true, characterData: true, subtree: true});

  // Rich reminder shown only when a visitor saves a racket without an account.
  let guestSaveNotice = null;
  let guestSaveTimer = null;
  function hideGuestSaveNotice() {
    if (!guestSaveNotice) return;
    guestSaveNotice.classList.remove('show');
    clearTimeout(guestSaveTimer);
  }
  function showGuestSaveNotice() {
    if (!guestSaveNotice) {
      guestSaveNotice = document.createElement('aside');
      guestSaveNotice.className = 'guest-save-notice';
      guestSaveNotice.setAttribute('role', 'status');
      guestSaveNotice.setAttribute('aria-live', 'polite');
      guestSaveNotice.innerHTML = `
        <button type="button" class="guest-save-notice-close" aria-label="Cerrar recordatorio">×</button>
        <div class="guest-save-notice-heart" aria-hidden="true">♥</div>
        <div class="guest-save-notice-copy">
          <span>GUARDADA PARA TI</span>
          <strong>Esta pala ya está en tus favoritas</strong>
          <p>Ahora vive en este dispositivo. Crea tu cuenta y llévatela contigo cuando cambies de móvil u ordenador.</p>
        </div>
        <button type="button" class="guest-save-notice-action">Guardar para siempre →</button>`;
      document.body.appendChild(guestSaveNotice);
      guestSaveNotice.querySelector('.guest-save-notice-close').addEventListener('click', hideGuestSaveNotice);
      guestSaveNotice.querySelector('.guest-save-notice-action').addEventListener('click', () => {
        hideGuestSaveNotice();
        accountOpen?.click();
      });
    }
    clearTimeout(guestSaveTimer);
    requestAnimationFrame(() => guestSaveNotice.classList.add('show'));
    guestSaveTimer = setTimeout(hideGuestSaveNotice, 7000);
  }
  window.addEventListener('ctp:guest-favorite-saved', showGuestSaveNotice);

  // Home savings ticker. It is derived from the current published catalog,
  // comparing only simultaneously available offers in the same currency.
  const landingView = document.getElementById('landing-view');
  const landingHero = landingView?.querySelector('.landing-hero');
  const landingHighlights = document.getElementById('landing-highlights');
  let savingsTicker = null;
  let savingsSignature = '';

  function escapeTickerText(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[char]));
  }

  function formatTickerMoney(value, currency) {
    try {
      return new Intl.NumberFormat('es-ES', {
        style: 'currency', currency: currency || 'EUR', maximumFractionDigits: 0
      }).format(value);
    } catch {
      return `${Math.round(value)} €`;
    }
  }

  function savingsForProduct(product) {
    const byCurrency = new Map();
    for (const offer of product?.offers || []) {
      if (!available(offer) || !validPrice(offer.price)) continue;
      const currency = offer.currency || 'EUR';
      if (!byCurrency.has(currency)) byCurrency.set(currency, []);
      byCurrency.get(currency).push(Number(offer.price));
    }

    let best = null;
    for (const [currency, prices] of byCurrency) {
      if (prices.length < 2) continue;
      const low = Math.min(...prices);
      const high = Math.max(...prices);
      const saving = high - low;
      if (saving <= 0) continue;
      if (!best || saving > best.saving) best = { saving, low, high, currency };
    }
    return best;
  }

  function renderSavingsTicker() {
    if (!landingHero || !state?.loaded || !Array.isArray(state.products)) return;

    const entries = state.products
      .map(product => ({ product, data: savingsForProduct(product) }))
      .filter(entry => entry.data)
      .sort((a, b) => b.data.saving - a.data.saving)
      .slice(0, 24);

    if (entries.length < 2) {
      savingsTicker?.remove();
      savingsTicker = null;
      savingsSignature = '';
      return;
    }

    const signature = entries.map(({product, data}) => `${product.id}:${data.saving.toFixed(2)}`).join('|');
    if (signature === savingsSignature && savingsTicker?.isConnected) return;
    savingsSignature = signature;

    if (!savingsTicker) {
      savingsTicker = document.createElement('section');
      savingsTicker.className = 'savings-ticker';
      savingsTicker.setAttribute('aria-label', 'Ahorros destacados del catálogo');
      landingHero.insertAdjacentElement('afterend', savingsTicker);
    }

    const itemMarkup = entries.map(({product, data}) => {
      const saving = formatTickerMoney(data.saving, data.currency);
      const low = formatTickerMoney(data.low, data.currency);
      return `<a class="savings-ticker-item" href="#pala/${encodeURIComponent(product.id)}">
        <span class="savings-ticker-name">${escapeTickerText(product.name)}</span>
        <strong class="savings-ticker-saving">Ahorra ${escapeTickerText(saving)}</strong>
        <small>desde ${escapeTickerText(low)}</small>
      </a>`;
    }).join('');

    savingsTicker.innerHTML = `
      <div class="savings-ticker-label">
        <span class="savings-ticker-pulse" aria-hidden="true"></span>
        <span><strong>Ahorros de hoy</strong><small>Comparando precios disponibles ahora</small></span>
      </div>
      <div class="savings-ticker-viewport" tabindex="0" aria-label="Ahorros destacados. Pasa el cursor o enfoca para pausar.">
        <div class="savings-ticker-track">
          <div class="savings-ticker-group">${itemMarkup}</div>
          <div class="savings-ticker-group" aria-hidden="true">${itemMarkup}</div>
        </div>
      </div>`;

    // Keep the visual travel speed stable when the strip contains more items.
    // Roughly 2.85 s per unique saving matches the previous 12-item cadence.
    const track = savingsTicker.querySelector('.savings-ticker-track');
    if (track) track.style.animationDuration = `${Math.max(34, Math.round(entries.length * 2.85))}s`;
  }

  if (landingHighlights) {
    new MutationObserver(renderSavingsTicker).observe(landingHighlights, {childList: true, subtree: true});
  }
  renderSavingsTicker();

  function syncControls() {
    clear.hidden = !search.value;
    for (const button of quickFilters) {
      const id = button.dataset.quickFilter;
      button.disabled = !state.loaded;
      button.setAttribute('aria-pressed', String(document.getElementById(id).value === presets[id]));
    }
    const saved = location.hash === '#guardadas';
    document.getElementById('catalog-location').textContent = saved ? 'Guardadas' : 'Catálogo';
    document.getElementById('home-search-title').textContent = saved ? 'Vuelve a tus favoritas' : 'Encuentra tu próxima pala';
    syncSavedAccountPrompt();
  }
  clear.addEventListener('click', () => {
    search.value = '';
    search.dispatchEvent(new Event('input', {bubbles: true}));
    search.focus();
    syncControls();
  });
  quickFilters.forEach(button => button.addEventListener('click', () => {
    const id = button.dataset.quickFilter;
    const input = document.getElementById(id);
    input.value = input.value === presets[id] ? '' : presets[id];
    input.dispatchEvent(new Event('input', {bubbles: true}));
    syncControls();
  }));
  search.addEventListener('input', syncControls);
  document.getElementById('filters').addEventListener('input', syncControls);
  document.getElementById('filters').addEventListener('reset', () => requestAnimationFrame(syncControls));
  // Rendered counts also change after removing a chip or clearing all filters.
  new MutationObserver(syncControls).observe(document.getElementById('result-count'), {childList: true, characterData: true, subtree: true});
  window.addEventListener('hashchange', syncControls);
  syncControls();

  // app.js renders these snippets dynamically. Keep the detail buy box concise
  // and add a clearly differentiated shortcut to the offers section.
  function ensureBuyBoxPolishStyles() {
    if (document.getElementById('buy-box-polish-styles')) return;
    const style = document.createElement('style');
    style.id = 'buy-box-polish-styles';
    style.textContent = `
      .professional-ui .buy-box .buy-box-compare-offers{
        width:100%!important;min-height:46px!important;display:flex!important;align-items:center!important;justify-content:space-between!important;
        gap:14px!important;margin:0 0 12px!important;padding:11px 14px!important;border:1px solid #607986!important;border-radius:9px!important;
        background:#263840!important;color:#f4f8f6!important;font:inherit!important;font-weight:760!important;letter-spacing:.01em!important;
        box-shadow:inset 0 1px 0 #ffffff12,0 4px 12px #00000016!important;cursor:pointer!important;
        transition:background .16s,border-color .16s,transform .16s,box-shadow .16s!important;
      }
      .professional-ui .buy-box .buy-box-compare-offers:hover{background:#314b55!important;border-color:#86a4b0!important;color:#fff!important;transform:translateY(-1px)!important;box-shadow:inset 0 1px 0 #ffffff18,0 6px 16px #00000020!important}
      .professional-ui .buy-box .buy-box-compare-offers:active{transform:translateY(0)!important}
      .professional-ui .buy-box .buy-box-compare-offers:focus-visible{outline:3px solid #9bc4d2!important;outline-offset:3px!important}
      .professional-ui .buy-box .buy-box-compare-arrow{display:grid;place-items:center;width:25px;height:25px;flex:0 0 25px;border-radius:50%;background:#ffffff12;color:#d8ebf0;font-size:1rem;line-height:1}
      .professional-ui .buy-box .primary-button{margin-bottom:8px!important}
      .professional-ui .buy-box>small{display:block;margin-top:0!important;color:#b9cfc0!important;font-size:.78rem!important;line-height:1.5!important}
      @media(max-width:540px){.professional-ui .buy-box .buy-box-compare-offers{min-height:48px!important;padding:12px 14px!important}}
      @media(prefers-reduced-motion:reduce){.professional-ui .buy-box .buy-box-compare-offers{transition:none!important}.professional-ui .buy-box .buy-box-compare-offers:hover{transform:none!important}}
    `;
    document.head.appendChild(style);
  }

  function syncShippingCopy() {
    const detailNote = document.querySelector('.buy-box small');
    if (detailNote) detailNote.textContent = 'Confirma el precio final en la tienda.';

    const landingNote = document.querySelector('.landing-product-note');
    if (landingNote?.textContent.includes('Sin gastos de envío')) {
      landingNote.textContent = landingNote.textContent.replace('Sin gastos de envío', 'No incluye gastos de envío');
    }
  }

  function syncCompareOffersShortcut() {
    const buyBox = document.querySelector('#product-view .buy-box');
    const offersPanel = document.getElementById('offers-panel');
    if (!buyBox || !offersPanel) return;

    let compareButton = buyBox.querySelector('.buy-box-compare-offers');
    if (!compareButton) {
      compareButton = document.createElement('button');
      compareButton.type = 'button';
      compareButton.className = 'buy-box-compare-offers';
      compareButton.setAttribute('aria-label', 'Comparar todas las ofertas de esta pala');
      compareButton.addEventListener('click', () => {
        const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
        offersPanel.scrollIntoView({behavior: reduceMotion ? 'auto' : 'smooth', block: 'start'});
        const heading = offersPanel.querySelector('h2');
        if (heading) {
          heading.setAttribute('tabindex', '-1');
          setTimeout(() => heading.focus({preventScroll: true}), reduceMotion ? 0 : 350);
        }
      });

      const shippingNote = buyBox.querySelector('small');
      if (shippingNote) buyBox.insertBefore(compareButton, shippingNote);
      else buyBox.appendChild(compareButton);
    }

    compareButton.innerHTML = '<span>Comparar ofertas</span><span class="buy-box-compare-arrow" aria-hidden="true">↓</span>';
  }

  ensureBuyBoxPolishStyles();
  const shippingObserver = new MutationObserver(() => {
    syncShippingCopy();
    syncCompareOffersShortcut();
  });
  [document.getElementById('product-view'), document.getElementById('landing-product')].filter(Boolean).forEach(node => {
    shippingObserver.observe(node, {childList: true, subtree: true});
  });
  syncShippingCopy();
  syncCompareOffersShortcut();

  const back = document.getElementById('back-to-top');
  let scheduled = false;
  function updateBackButton() {
    back.hidden = window.scrollY < 600;
    scheduled = false;
  }
  window.addEventListener('scroll', () => {
    if (!scheduled) {scheduled = true; requestAnimationFrame(updateBackButton);}
  }, {passive: true});
  back.addEventListener('click', () => {
    const heading = [...document.querySelectorAll('main h1, .store-page-title')].find(el => el.getClientRects().length);
    if (heading) {heading.setAttribute('tabindex', '-1'); heading.focus({preventScroll: true});}
    window.scrollTo({top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
  });
  updateBackButton();
})();
