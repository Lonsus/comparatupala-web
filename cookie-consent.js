(() => {
  const STORAGE_KEY = 'comparatupala.cookieConsent.v1';
  const CONSENT_VERSION = 1;
  const MEASUREMENT_ID = 'G-BH1GN09MC9';
  const GA_DISABLE_KEY = `ga-disable-${MEASUREMENT_ID}`;

  function readChoice() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed?.version !== CONSENT_VERSION || typeof parsed.analytics !== 'boolean') return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function writeChoice(analytics) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
        version: CONSENT_VERSION,
        analytics,
        updatedAt: new Date().toISOString()
      }));
    } catch {
      // Consent still applies for the current page if storage is unavailable.
    }
  }

  function clearAnalyticsCookies() {
    const cookieNames = document.cookie
      .split(';')
      .map((cookie) => cookie.split('=')[0].trim())
      .filter((name) => name === '_ga' || name.startsWith('_ga_'));

    if (!cookieNames.length) return;

    const hostname = window.location.hostname;
    const parts = hostname.split('.');
    const baseDomain = parts.length > 1 ? `.${parts.slice(-2).join('.')}` : null;
    const domains = [null, hostname, `.${hostname}`, baseDomain].filter((value, index, list) => value && list.indexOf(value) === index);

    cookieNames.forEach((name) => {
      document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`;
      domains.forEach((domain) => {
        document.cookie = `${name}=; Max-Age=0; path=/; domain=${domain}; SameSite=Lax`;
      });
    });
  }

  function setAnalyticsEnabled(enabled) {
    window[GA_DISABLE_KEY] = !enabled;
    if (!enabled) clearAnalyticsCookies();
  }

  function updateGoogleConsent(analytics) {
    if (typeof window.gtag !== 'function') return;

    window.gtag('consent', 'update', {
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      analytics_storage: analytics ? 'granted' : 'denied'
    });
  }

  function loadGoogleAnalytics() {
    const existing = document.querySelector(`script[data-ga4-id="${MEASUREMENT_ID}"]`);
    if (existing) {
      window.gtag('config', MEASUREMENT_ID);
      return;
    }

    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(MEASUREMENT_ID)}`;
    script.dataset.ga4Id = MEASUREMENT_ID;
    script.addEventListener('load', () => {
      window.gtag('js', new Date());
      window.gtag('config', MEASUREMENT_ID);
    }, { once: true });
    document.head.appendChild(script);
  }

  function applyChoice(analytics) {
    setAnalyticsEnabled(analytics);
    updateGoogleConsent(analytics);
    if (analytics) loadGoogleAnalytics();
  }

  function createInterface() {
    const banner = document.createElement('section');
    banner.className = 'cookie-consent';
    banner.id = 'cookie-consent-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-modal', 'false');
    banner.setAttribute('aria-labelledby', 'cookie-consent-title');
    banner.hidden = true;
    banner.innerHTML = `
      <div class="cookie-consent__copy">
        <p class="cookie-consent__eyebrow">PRIVACIDAD · ANALÍTICA</p>
        <h2 id="cookie-consent-title">Tus datos, bajo tu control</h2>
        <p>Usamos Google Analytics únicamente si lo aceptas para conocer de forma agregada cómo se utiliza ComparaTuPala. Las cookies analíticas son opcionales y Google Analytics no se carga hasta que das tu consentimiento.</p>
      </div>
      <div class="cookie-consent__actions">
        <button type="button" class="cookie-button cookie-button--ghost" data-cookie-action="settings">Configurar</button>
        <button type="button" class="cookie-button cookie-button--secondary" data-cookie-action="reject">Rechazar</button>
        <button type="button" class="cookie-button cookie-button--primary" data-cookie-action="accept">Aceptar analítica</button>
      </div>`;

    const dialog = document.createElement('dialog');
    dialog.className = 'cookie-preferences';
    dialog.id = 'cookie-preferences-dialog';
    dialog.setAttribute('aria-labelledby', 'cookie-preferences-title');
    dialog.innerHTML = `
      <div class="cookie-preferences__panel">
        <div class="cookie-preferences__head">
          <div>
            <p class="cookie-consent__eyebrow">PREFERENCIAS DE COOKIES</p>
            <h2 id="cookie-preferences-title">Configura tu privacidad</h2>
          </div>
          <button type="button" class="cookie-preferences__close" data-cookie-action="close" aria-label="Cerrar preferencias">×</button>
        </div>
        <p class="cookie-preferences__intro">Puedes cambiar esta decisión en cualquier momento desde “Preferencias de cookies” en el pie de página.</p>
        <div class="cookie-category">
          <div>
            <strong>Almacenamiento necesario</strong>
            <p>Se utiliza únicamente para recordar tu elección de privacidad y para funciones esenciales de la web.</p>
          </div>
          <span class="cookie-category__status">Siempre activo</span>
        </div>
        <label class="cookie-category cookie-category--toggle">
          <div>
            <strong>Analítica opcional</strong>
            <p>Permite Google Analytics (GA4, ID ${MEASUREMENT_ID}) para medir visitas y uso del sitio. No se usa para publicidad personalizada.</p>
          </div>
          <input id="cookie-analytics-toggle" type="checkbox" aria-label="Permitir Google Analytics">
        </label>
        <div class="cookie-preferences__note">
          <strong>Google Consent Mode</strong>
          <p>La analítica y el almacenamiento publicitario parten de estado denegado. Los permisos publicitarios permanecen denegados; solo puedes autorizar la analítica.</p>
        </div>
        <div class="cookie-preferences__actions">
          <button type="button" class="cookie-button cookie-button--secondary" data-cookie-action="reject">Rechazar analítica</button>
          <button type="button" class="cookie-button cookie-button--primary" data-cookie-action="save">Guardar preferencias</button>
        </div>
      </div>`;

    document.body.append(banner, dialog);

    const footer = document.querySelector('footer');
    if (footer && !document.getElementById('cookie-preferences-link')) {
      const settingsButton = document.createElement('button');
      settingsButton.type = 'button';
      settingsButton.id = 'cookie-preferences-link';
      settingsButton.className = 'cookie-settings-link';
      settingsButton.dataset.cookieAction = 'settings';
      settingsButton.textContent = 'Preferencias de cookies';
      footer.appendChild(settingsButton);
    }

    const analyticsToggle = dialog.querySelector('#cookie-analytics-toggle');

    function openSettings() {
      const current = readChoice();
      analyticsToggle.checked = current?.analytics === true;
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    }

    function closeSettings() {
      if (typeof dialog.close === 'function' && dialog.open) dialog.close();
      else dialog.removeAttribute('open');
    }

    function save(analytics) {
      writeChoice(analytics);
      applyChoice(analytics);
      banner.hidden = true;
      closeSettings();
    }

    document.addEventListener('click', (event) => {
      const button = event.target.closest('[data-cookie-action]');
      if (!button) return;

      switch (button.dataset.cookieAction) {
        case 'accept':
          save(true);
          break;
        case 'reject':
          save(false);
          break;
        case 'save':
          save(analyticsToggle.checked);
          break;
        case 'settings':
          openSettings();
          break;
        case 'close':
          closeSettings();
          break;
      }
    });

    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) closeSettings();
    });

    return { banner };
  }

  function init() {
    const ui = createInterface();
    const saved = readChoice();

    if (saved) {
      applyChoice(saved.analytics);
    } else {
      setAnalyticsEnabled(false);
      ui.banner.hidden = false;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
