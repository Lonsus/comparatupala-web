(() => {
  'use strict';

  const CONTACT_FUNCTION = 'contact-form';
  const CONTACT_COOLDOWN_MS = 30 * 1000;
  const CONTACT_COOLDOWN_KEY = 'comparatupala:contact-last-send';
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

    aboutSection?.querySelectorAll('.about-card').forEach((card, index) => {
      if (card.querySelector(':scope > .about-legal-toggle')) return;

      const title = card.querySelector(':scope > h3');
      const label = card.querySelector(':scope > .about-card-label');
      const contentNodes = [...card.children].filter(
        (child) => child !== title && child !== label && !child.classList.contains('about-legal-toggle')
      );

      if (!title || !contentNodes.length) return;

      const cardContent = document.createElement('div');
      cardContent.className = 'about-legal-content';
      cardContent.id = `about-card-content-${index + 1}`;
      contentNodes.forEach((node) => cardContent.appendChild(node));
      card.appendChild(cardContent);

      const cardToggle = document.createElement('button');
      cardToggle.type = 'button';
      cardToggle.className = 'about-legal-toggle';
      cardToggle.setAttribute('aria-expanded', 'true');
      cardToggle.setAttribute('aria-controls', cardContent.id);
      card.appendChild(cardToggle);

      const sectionName = (label?.textContent || title.textContent || 'sección').trim();
      const setCardExpanded = (expanded) => {
        cardContent.hidden = !expanded;
        card.classList.toggle('is-collapsed', !expanded);
        cardToggle.setAttribute('aria-expanded', String(expanded));
        cardToggle.setAttribute(
          'aria-label',
          expanded ? `Contraer ${sectionName}` : `Expandir ${sectionName}`
        );
      };

      setCardExpanded(false);
      cardToggle.addEventListener('click', () => {
        setCardExpanded(cardToggle.getAttribute('aria-expanded') !== 'true');
      });
    });

    const contactSection = document.getElementById('contacto');
    if (contactSection && !contactSection.querySelector(':scope > .about-legal-toggle')) {
      const contactCopy = contactSection.querySelector('.contact-copy');
      const contactTitle = contactCopy?.querySelector('h3');
      const contactEyebrow = contactCopy?.querySelector('.eyebrow');
      const contactActions = contactSection.querySelector('.contact-actions');
      const contactNodes = contactCopy
        ? [...contactCopy.children].filter((child) => child !== contactTitle && child !== contactEyebrow)
        : [];

      if (contactCopy && contactTitle && contactActions && contactNodes.length) {
        const contactContent = document.createElement('div');
        contactContent.className = 'contact-collapsible-content contact-copy';
        contactContent.id = 'contact-collapsible-content';
        contactNodes.forEach((node) => contactContent.appendChild(node));
        contactCopy.appendChild(contactContent);

        contactActions.id = contactActions.id || 'contact-collapsible-actions';

        const contactToggle = document.createElement('button');
        contactToggle.type = 'button';
        contactToggle.className = 'about-legal-toggle';
        contactToggle.setAttribute('aria-expanded', 'true');
        contactToggle.setAttribute('aria-controls', `${contactContent.id} ${contactActions.id}`);
        contactSection.appendChild(contactToggle);

        const setContactExpanded = (expanded) => {
          contactContent.hidden = !expanded;
          contactActions.hidden = !expanded;
          contactSection.classList.toggle('is-collapsed', !expanded);
          contactToggle.setAttribute('aria-expanded', String(expanded));
          contactToggle.setAttribute(
            'aria-label',
            expanded ? 'Contraer contacto y correcciones' : 'Expandir contacto y correcciones'
          );
        };

        setContactExpanded(false);
        contactToggle.addEventListener('click', () => {
          setContactExpanded(contactToggle.getAttribute('aria-expanded') !== 'true');
        });
        document.querySelectorAll('a[href="#contacto"]').forEach((link) => {
          link.addEventListener('click', () => setContactExpanded(true));
        });
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
      pane.hidden = pane.dataset.contactPane !== name;
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

  const closeDialog = () => dialog.close();

  dialog.addEventListener('close', () => {
    document.body.classList.remove('contact-open');
    returnFocus?.focus({preventScroll:true});
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

  function prepareContactForm() {
    if (!contactForm) return;
    contactForm.classList.remove('is-unavailable');
    contactForm.querySelectorAll('input, select, textarea, button').forEach(control => { control.disabled = false; });

    const message = contactForm.elements.namedItem('message');
    if (message) message.setAttribute('minlength', '10');

    const submit = contactForm.querySelector('button[type="submit"]');
    if (submit) submit.textContent = 'Enviar mensaje';

    const intro = document.querySelector('#contact-pane-contact .contact-intro');
    if (intro) intro.textContent = 'Escríbenos directamente desde ComparaTuPala. Utilizaremos tus datos únicamente para gestionar y responder a tu consulta.';

    const legal = document.querySelector('#contact-pane-contact .contact-legal-note');
    if (legal) legal.innerHTML = '<strong>Uso de tus datos.</strong> El mensaje se procesa a través de Supabase y del proveedor transaccional configurado únicamente para gestionar tu consulta. No se añade tu email a la newsletter ni a listas de marketing.';

    if (!contactForm.elements.namedItem('website')) {
      const honeypot = document.createElement('label');
      honeypot.setAttribute('aria-hidden', 'true');
      honeypot.style.cssText = 'position:absolute;left:-10000px;top:auto;width:1px;height:1px;overflow:hidden;';
      honeypot.innerHTML = 'Sitio web<input name="website" type="text" tabindex="-1" autocomplete="off">';
      contactForm.appendChild(honeypot);
    }
  }

  function lastContactSend() {
    try { return Number(sessionStorage.getItem(CONTACT_COOLDOWN_KEY) || 0); }
    catch { return 0; }
  }

  function recordContactSend() {
    try { sessionStorage.setItem(CONTACT_COOLDOWN_KEY, String(Date.now())); }
    catch {}
  }

  prepareContactForm();

  contactForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!contactForm.reportValidity()) return;

    const elapsed = Date.now() - lastContactSend();
    if (elapsed < CONTACT_COOLDOWN_MS) {
      const seconds = Math.ceil((CONTACT_COOLDOWN_MS - elapsed) / 1000);
      setStatus(contactStatus, `Mensaje enviado recientemente. Espera ${seconds} s antes de volver a enviar.`, 'error');
      return;
    }

    const formData = new FormData(contactForm);
    const payload = {
      name: String(formData.get('name') || '').trim(),
      email: String(formData.get('email') || '').trim(),
      subject: String(formData.get('subject') || '').trim(),
      message: String(formData.get('message') || '').trim(),
      website: String(formData.get('website') || '').trim()
    };

    if (payload.message.length < 10) {
      setStatus(contactStatus, 'El mensaje debe tener al menos 10 caracteres.', 'error');
      return;
    }

    const submit = contactForm.querySelector('button[type="submit"]');
    const previousLabel = submit?.textContent || 'Enviar mensaje';
    if (submit) {
      submit.disabled = true;
      submit.textContent = 'Enviando…';
    }
    setStatus(contactStatus, 'Enviando mensaje…');

    try {
      const client = await window.comparatupalaSupabaseReady;
      if (!client) throw new Error('Supabase client unavailable');

      const {data, error} = await client.functions.invoke(CONTACT_FUNCTION, {body: payload});
      if (error || data?.ok !== true) throw error || new Error('Contact function failed');

      recordContactSend();
      contactForm.reset();
      setStatus(contactStatus, 'Mensaje enviado correctamente. Gracias por contactar con ComparaTuPala.', 'ok');
    } catch (error) {
      console.error('Contact form error:', error);
      setStatus(contactStatus, 'No hemos podido enviar el mensaje. Inténtalo de nuevo en unos minutos.', 'error');
    } finally {
      if (submit) {
        submit.disabled = false;
        submit.textContent = previousLabel;
      }
    }
  });

  // Newsletter remains disabled until its independent provider/consent flow is configured.
  if (newsletterForm && !NEWSLETTER_ENDPOINT) {
    newsletterForm.classList.add('is-unavailable');
    newsletterForm.querySelectorAll('input, select, textarea, button').forEach(control => { control.disabled = true; });
    setStatus(newsletterStatus, 'Las novedades por email aún no están disponibles.');
    if (newsletterStatus && newsletterStatus.parentElement === newsletterForm) newsletterForm.prepend(newsletterStatus);
    if (newsletterStatus?.id) newsletterForm.setAttribute('aria-describedby', newsletterStatus.id);
  }

  newsletterForm?.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!NEWSLETTER_ENDPOINT) {
      setStatus(newsletterStatus, 'La newsletter todavía no está activada. Tu dirección no se ha enviado ni almacenado.', 'error');
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
        headers: {'Content-Type': 'application/json'},
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
