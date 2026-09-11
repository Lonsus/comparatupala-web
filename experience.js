/* Small interaction improvements built on the existing catalog controls. */
'use strict';
(() => {
  const search = document.getElementById('search');
  const clear = document.getElementById('search-clear');
  const quickFilters = [...document.querySelectorAll('[data-quick-filter]')];
  const presets = {'availability': 'available', 'offer-count': '>=2'};

  // Keep "Guardadas" out of the primary site navigation. For signed-in users it
  // becomes the first, prominent action inside Mi cuenta while preserving the
  // existing #saved-count element used by app.js.
  const savedLink = document.getElementById('nav-saved');
  const signedInAccount = document.getElementById('account-signed-in');
  const accountDialog = document.getElementById('account-dialog');
  if (savedLink && signedInAccount) {
    const initialCount = savedLink.querySelector('#saved-count')?.textContent || '0';
    savedLink.className = 'account-saved-shortcut';
    savedLink.removeAttribute('aria-current');
    savedLink.innerHTML = `
      <span class="account-saved-shortcut-icon" aria-hidden="true">♥</span>
      <span class="account-saved-shortcut-copy">
        <strong>Mis palas guardadas</strong>
        <small>Abre todas tus favoritas en el catálogo</small>
      </span>
      <span class="account-saved-shortcut-count"><span id="saved-count">${initialCount}</span> guardadas <span aria-hidden="true">→</span></span>`;
    signedInAccount.prepend(savedLink);
    savedLink.addEventListener('click', () => {
      if (accountDialog?.open) accountDialog.close();
    });
  }

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
