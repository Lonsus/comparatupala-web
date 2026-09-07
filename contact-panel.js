(() => {
  'use strict';

  // Activar solo cuando exista un canal privado real y la información de privacidad esté completa.
  const CONTACT_EMAIL = '';
  // Activar solo cuando exista un proveedor/endpoint de newsletter configurado y revisado.
  const NEWSLETTER_ENDPOINT = '';

  const dialog = document.getElementById('contact-dialog');
  const openButtons = document.querySelectorAll('[data-open-contact]');
  const closeButton = document.getElementById('contact-close');
  const tabs = [...document.querySelectorAll('[role="tab"][data-contact-tab]')];
  const panes = [...document.querySelectorAll('[role="tabpanel"][data-contact-pane]')];
  const contactForm = document.getElementById('private-contact-form');
  const contactStatus = document.getElementById('contact-form-status');
  const newsletterForm = document.getElementById('newsletter-form');
  const newsletterStatus = document.getElementById('newsletter-form-status');

  if (!dialog) return;

  const setStatus = (element, message, type = '') => {
    if (!element) return;
    element.textContent = message;
    element.classList.remove('is-error', 'is-ok');
    if (type) element.classList.add(type === 'ok' ? 'is-ok' : 'is-error');
  };

  const selectTab = (name) => {
    tabs.forEach((tab) => {
      const selected = tab.dataset.contactTab === name;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    panes.forEach((pane) => {
      pane.hidden = pane.dataset.contactPane !== name;
    });
  };

  const openDialog = (tab = 'contact') => {
    selectTab(tab);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  };

  const closeDialog = () => {
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
  };

  openButtons.forEach((button) => {
    button.addEventListener('click', () => openDialog(button.dataset.openContact || 'contact'));
  });

  closeButton?.addEventListener('click', closeDialog);

  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) closeDialog();
  });

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectTab(tab.dataset.contactTab));
    tab.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const offset = event.key === 'ArrowRight' ? 1 : -1;
      const next = tabs[(index + offset + tabs.length) % tabs.length];
      selectTab(next.dataset.contactTab);
      next.focus();
    });
  });

  contactForm?.addEventListener('submit', (event) => {
    event.preventDefault();

    if (!CONTACT_EMAIL) {
      setStatus(
        contactStatus,
        'El contacto privado todavía no está activado. Este formulario no ha transmitido ningún dato. Puedes usar mientras tanto el canal público de GitHub.',
        'error'
      );
      return;
    }

    const data = new FormData(contactForm);
    const subject = `[ComparaTuPala] ${String(data.get('subject') || 'Consulta')}`;
    const body = [
      `Nombre: ${String(data.get('name') || 'No indicado')}`,
      `Email de respuesta: ${String(data.get('email') || '')}`,
      '',
      String(data.get('message') || '')
    ].join('\n');

    window.location.href = `mailto:${encodeURIComponent(CONTACT_EMAIL)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    setStatus(contactStatus, 'Se ha preparado el mensaje en tu aplicación de correo. Ningún dato se almacena en ComparaTuPala.', 'ok');
  });

  newsletterForm?.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!NEWSLETTER_ENDPOINT) {
      setStatus(
        newsletterStatus,
        'La newsletter todavía no está activada. Tu dirección no se ha enviado ni almacenado.',
        'error'
      );
      return;
    }

    const data = new FormData(newsletterForm);
    const payload = {
      email: String(data.get('newsletter-email') || '').trim(),
      consent: data.get('newsletter-consent') === 'on',
      source: 'comparatupala-web'
    };

    if (!payload.consent) {
      setStatus(newsletterStatus, 'Necesitamos tu consentimiento específico para suscribirte.', 'error');
      return;
    }

    try {
      const response = await fetch(NEWSLETTER_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error('Newsletter subscription failed');
      newsletterForm.reset();
      setStatus(newsletterStatus, 'Revisa tu correo para confirmar la suscripción.', 'ok');
    } catch {
      setStatus(newsletterStatus, 'No hemos podido procesar la suscripción. Inténtalo de nuevo más tarde.', 'error');
    }
  });
})();
