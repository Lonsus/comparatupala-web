(() => {
  'use strict';

  // Activar solo cuando exista un canal privado real y la información de privacidad esté completa.
  const CONTACT_EMAIL = '';
  // Activar solo cuando exista un proveedor/endpoint de newsletter configurado y revisado.
  const NEWSLETTER_ENDPOINT = '';

  const setupAboutCollapsibles = () => {
    const aboutSection = document.getElementById('quienes-somos');
    const aboutHeading = aboutSection?.querySelector('.about-heading');

    if (aboutSection && aboutHeading && !aboutSection.querySelector('.about-collapse-toggle')) {
      const content = document.createElement('div');
      content.className = 'about-collapsible-content';
      content.id = 'about-collapsible-content';

      [...aboutSection.children]
        .filter((child) => child !== aboutHeading)
        .forEach((child) => content.appendChild(child));
      aboutSection.appendChild(content);

      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'about-collapse-toggle';
      toggle.setAttribute('aria-expanded', 'true');
      toggle.setAttribute('aria-controls', content.id);
      toggle.setAttribute('aria-label', 'Contraer sección Quiénes somos');
      aboutHeading.appendChild(toggle);

      const setAboutExpanded = (expanded) => {
        content.hidden = !expanded;
        aboutSection.classList.toggle('is-collapsed', !expanded);
        toggle.setAttribute('aria-expanded', String(expanded));
        toggle.setAttribute(
          'aria-label',
          expanded ? 'Contraer sección Quiénes somos' : 'Expandir sección Quiénes somos'
        );
      };

      toggle.addEventListener('click', () => {
        setAboutExpanded(toggle.getAttribute('aria-expanded') !== 'true');
      });

      setAboutExpanded(false);
      document.addEventListener('show-about', () => setAboutExpanded(true));
      document.querySelectorAll('a[href="#quienes-somos"], a[href="#contacto"]').forEach((link) => {
        link.addEventListener('click', () => setAboutExpanded(true));
      });
    }

    const legalCard = aboutSection?.querySelector('.about-card-wide');
    if (legalCard && !legalCard.querySelector('.about-legal-toggle')) {
      const legalTitle = legalCard.querySelector('h3');
      const legalParagraphs = [...legalCard.children].filter(
        (child) => child.tagName === 'P' && !child.classList.contains('about-card-label')
      );

      if (legalTitle && legalParagraphs.length) {
        const legalContent = document.createElement('div');
        legalContent.className = 'about-legal-content';
        legalContent.id = 'about-legal-content';
        legalParagraphs.forEach((paragraph) => legalContent.appendChild(paragraph));
        legalCard.appendChild(legalContent);

        const legalToggle = document.createElement('button');
        legalToggle.type = 'button';
        legalToggle.className = 'about-legal-toggle';
        legalToggle.setAttribute('aria-expanded', 'true');
        legalToggle.setAttribute('aria-controls', legalContent.id);
        legalToggle.setAttribute('aria-label', 'Contraer marco normativo');
        legalCard.appendChild(legalToggle);

        const setLegalExpanded = (expanded) => {
          legalContent.hidden = !expanded;
          legalCard.classList.toggle('is-collapsed', !expanded);
          legalToggle.setAttribute('aria-expanded', String(expanded));
          legalToggle.setAttribute(
            'aria-label',
            expanded ? 'Contraer marco normativo' : 'Expandir marco normativo'
          );
        };
        setLegalExpanded(false);
        legalToggle.addEventListener('click', () => setLegalExpanded(legalToggle.getAttribute('aria-expanded') !== 'true'));
      }
    }
  };

  setupAboutCollapsibles();

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
    const activeTab = tabs.find((tab) => tab.dataset.contactTab === name);
    const activePane = panes.find((pane) => pane.dataset.contactPane === name);
    if (!activeTab || !activePane) return;

    tabs.forEach((tab) => {
      const selected = tab.dataset.contactTab === name;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });

    panes.forEach((pane) => {
      const isActive = pane.dataset.contactPane === name;
      pane.hidden = !isActive;
    });
  };

  let returnFocus;
  const openDialog = (tab = 'contact') => {
    selectTab(tab);
    returnFocus = document.activeElement;
    dialog.showModal();
    document.body.classList.add('contact-open');
    closeButton?.focus({preventScroll:true});
  };

  const closeDialog = () => {
    dialog.close();
  };

  dialog.addEventListener('close', () => {
    document.body.classList.remove('contact-open');
    returnFocus?.focus({preventScroll:true});
  });

  // Do not ask visitors to complete forms before their channels are available.
  [[contactForm, CONTACT_EMAIL, contactStatus, 'El contacto privado aún no está disponible. Para corregir datos, puedes abrir una incidencia en GitHub.'],
    [newsletterForm, NEWSLETTER_ENDPOINT, newsletterStatus, 'Las novedades por email aún no están disponibles.']].forEach(([form, configured, status, message]) => {
    if (!form || configured) return;
    form.classList.add('is-unavailable');
    form.querySelectorAll('input, select, textarea, button').forEach(control => control.disabled = true);
    setStatus(status, message);
    form.prepend(status);
    form.setAttribute('aria-describedby', status.id);
  });

  openButtons.forEach((button) => {
    button.addEventListener('click', () => openDialog(button.dataset.openContact || 'contact'));
  });

  closeButton?.addEventListener('click', closeDialog);

  dialog.addEventListener('click', (event) => {
    const rect = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) closeDialog();
  });

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectTab(tab.dataset.contactTab));
    tab.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const offset = event.key === 'ArrowRight' ? 1 : -1;
      const next = event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs.at(-1) : tabs[(index + offset + tabs.length) % tabs.length];
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
