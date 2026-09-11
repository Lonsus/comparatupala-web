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

  // app.js renders these two snippets dynamically. Keep their shipping copy
  // explicit: displayed prices do not include shipping costs.
  function syncShippingCopy() {
    const detailNote = document.querySelector('.buy-box small');
    if (detailNote?.textContent.includes('Sin gastos de envío')) {
      detailNote.textContent = detailNote.textContent.replace('Sin gastos de envío', 'No incluye gastos de envío');
    }
    const landingNote = document.querySelector('.landing-product-note');
    if (landingNote?.textContent.includes('Sin gastos de envío')) {
      landingNote.textContent = landingNote.textContent.replace('Sin gastos de envío', 'No incluye gastos de envío');
    }
  }
  const shippingObserver = new MutationObserver(syncShippingCopy);
  [document.getElementById('product-view'), document.getElementById('landing-product')].filter(Boolean).forEach(node => {
    shippingObserver.observe(node, {childList: true, subtree: true});
  });
  syncShippingCopy();

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
