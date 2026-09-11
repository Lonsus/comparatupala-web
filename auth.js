'use strict';
(() => {
  const dialog = document.getElementById('account-dialog');
  const loginForm = document.getElementById('account-auth-form');
  const openButton = document.getElementById('account-open');
  const message = document.getElementById('account-status');
  const signedIn = document.getElementById('account-signed-in');
  const RESEND_COOLDOWN_MS = 60 * 1000;
  const RESEND_WINDOW_MS = 15 * 60 * 1000;
  const RESEND_MAX_ATTEMPTS = 3;

  signedIn.innerHTML = `
    <div class="account-session-heading">
      <div><p class="account-eyebrow">MI CUENTA</p><h3>Gestiona tu cuenta</h3></div>
      <p id="account-email-label" class="account-current-email"></p>
    </div>
    <div class="account-settings-grid">
      <section class="account-settings-card" aria-labelledby="account-profile-title">
        <div class="account-section-heading"><span>01</span><div><h4 id="account-profile-title">Perfil</h4><p>Datos visibles de tu cuenta.</p></div></div>
        <form id="account-profile-form">
          <label>Nombre de perfil<input name="username" autocomplete="nickname" maxlength="80"></label>
          <button type="submit">Guardar perfil</button>
        </form>
      </section>
      <section class="account-settings-card" aria-labelledby="account-email-title">
        <div class="account-section-heading"><span>02</span><div><h4 id="account-email-title">Correo electrónico</h4><p>Cambia la dirección asociada a tu cuenta.</p></div></div>
        <form id="account-email-form">
          <label>Nuevo email<input name="email" type="email" autocomplete="email" maxlength="254" required></label>
          <button type="submit">Cambiar correo</button>
          <p class="account-note">Supabase puede pedir que confirmes el cambio desde tu correo actual y/o el nuevo.</p>
        </form>
      </section>
      <section class="account-settings-card" aria-labelledby="account-password-title">
        <div class="account-section-heading"><span>03</span><div><h4 id="account-password-title">Contraseña</h4><p>Actualiza tu contraseña de forma segura.</p></div></div>
        <form id="account-password-form">
          <label>Contraseña actual<input name="currentPassword" type="password" autocomplete="current-password" maxlength="128" required></label>
          <label>Nueva contraseña<input name="newPassword" type="password" autocomplete="new-password" minlength="8" maxlength="128" required></label>
          <label>Repetir nueva contraseña<input name="confirmPassword" type="password" autocomplete="new-password" minlength="8" maxlength="128" required></label>
          <button type="submit">Cambiar contraseña</button>
        </form>
      </section>
      <section class="account-settings-card account-saved-card" aria-labelledby="account-saved-title">
        <div class="account-section-heading"><span>04</span><div><h4 id="account-saved-title">Palas guardadas</h4><p>Tus favoritas sincronizadas con esta cuenta.</p></div></div>
        <div id="account-saved-list" class="account-saved-list" aria-live="polite"><p class="account-note">Cargando palas guardadas…</p></div>
      </section>
    </div>
    <p id="account-sync-status" role="status" aria-live="polite"></p>
    <div class="account-actions account-footer-actions"><button id="account-sync" type="button">Reintentar sincronización</button><button id="account-signout" type="button">Cerrar sesión</button></div>`;

  const profileForm = document.getElementById('account-profile-form');
  const emailForm = document.getElementById('account-email-form');
  const passwordForm = document.getElementById('account-password-form');
  const savedList = document.getElementById('account-saved-list');

  let client = null;
  let user = null;
  let epoch = 0;
  let busy = false;
  let authMode = 'login';
  let pendingConfirmationEmail = '';
  let resendAvailableAt = 0;
  let resendTimer = null;
  let catalogById = null;

  const say = text => { message.textContent = text; };
  const check = result => { if (result.error) throw result.error; return result.data; };
  const validEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));

  function authErrorDetails(error) {
    const objects = [];
    const pushObject = value => {
      if (value && typeof value === 'object' && !objects.includes(value)) objects.push(value);
    };
    pushObject(error); pushObject(error?.error); pushObject(error?.cause); pushObject(error?.context);
    pushObject(error?.context?.error); pushObject(error?.response); pushObject(error?.response?.data);
    const cleanText = value => {
      if (typeof value !== 'string') return '';
      const text = value.trim();
      return text && text !== '{}' && text !== '[object Object]' ? text : '';
    };
    const firstText = values => values.map(cleanText).find(Boolean) || '';
    const messageText = firstText([typeof error === 'string' ? error : '', ...objects.flatMap(item => [item.message, item.error_description, item.msg, item.details, item.hint, item.reason])]);
    const code = firstText(objects.flatMap(item => [item.code, item.error_code, item.type]));
    const name = firstText(objects.map(item => item.name));
    const statusValue = objects.flatMap(item => [item.status, item.statusCode, item.status_code]).find(value => Number.isFinite(Number(value)) && Number(value) > 0);
    const status = statusValue ? Number(statusValue) : null;
    let serialized = '';
    if (!messageText && error && typeof error === 'object') {
      try { serialized = JSON.stringify(error, Object.getOwnPropertyNames(error)); } catch { serialized = ''; }
      if (serialized === '{}' || serialized === '[]') serialized = '';
    }
    return { message: messageText, code, name, status, serialized };
  }

  function normalizedAuthError(error) {
    const details = authErrorDetails(error);
    return { details, text: `${details.code} ${details.name} ${details.message} ${details.serialized}`.toLowerCase() };
  }

  function isConfirmationPendingError(error) {
    const { text } = normalizedAuthError(error);
    return text.includes('email not confirmed') || text.includes('email_not_confirmed');
  }

  function isExistingAccountError(error) {
    const { text } = normalizedAuthError(error);
    return text.includes('already registered') || text.includes('user_already_exists') || text.includes('email_exists');
  }

  function describeAuthError(error, action) {
    const { details, text: normalized } = normalizedAuthError(error);
    const technical = [details.code ? `código ${details.code}` : '', details.status ? `HTTP ${details.status}` : ''].filter(Boolean).join(' · ');
    if (isExistingAccountError(error)) return 'Ya existe una cuenta asociada a este email.';
    if (normalized.includes('email rate limit') || normalized.includes('over_email_send_rate_limit') || normalized.includes('email_send_rate_limit')) return `No se pudo enviar otro correo porque se ha alcanzado el límite temporal${technical ? ` (${technical})` : ''}. Espera unos minutos.`;
    if (normalized.includes('rate limit') || details.status === 429) return `Se ha alcanzado temporalmente el límite de intentos${technical ? ` (${technical})` : ''}. Espera unos minutos.`;
    if (normalized.includes('smtp') || normalized.includes('error sending')) return `Supabase no pudo enviar el correo${technical ? ` (${technical})` : ''}. Revisa la configuración SMTP.`;
    if (normalized.includes('weak_password') || (normalized.includes('password') && normalized.includes('weak'))) return 'La nueva contraseña no cumple la política de seguridad. Usa al menos 8 caracteres y combina distintos tipos de caracteres.';
    if (isConfirmationPendingError(error)) return 'El email todavía no está confirmado.';
    if (normalized.includes('invalid login credentials')) return 'El email o la contraseña no son correctos.';
    if (normalized.includes('failed to fetch') || normalized.includes('network') || normalized.includes('fetcherror')) return 'No se ha podido conectar con Supabase. Comprueba tu conexión.';
    const readableMessage = details.message || details.serialized;
    const prefix = action === 'register' ? 'No se pudo crear la cuenta.' : action === 'recovery' ? 'No se pudo completar la recuperación.' : 'No se pudo completar la operación.';
    return readableMessage ? `${prefix} ${readableMessage}${technical ? ` (${technical})` : ''}.` : `${prefix}${technical ? ` ${technical}.` : ''}`;
  }

  function passwordStrength(password) {
    if (!password) return { level: 0, label: 'Sin contraseña' };
    let score = 0;
    if (password.length >= 8) score += 1;
    if (password.length >= 12) score += 1;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
    if (/\d/.test(password)) score += 1;
    if (/[^A-Za-z0-9]/.test(password)) score += 1;
    const labels = ['Muy débil', 'Muy débil', 'Débil', 'Media', 'Fuerte', 'Muy fuerte'];
    return { level: Math.min(score, 5), label: labels[Math.min(score, 5)] };
  }

  function emailHash(email) {
    const normalized = email.trim().toLowerCase();
    let hash = 2166136261;
    for (let index = 0; index < normalized.length; index += 1) { hash ^= normalized.charCodeAt(index); hash = Math.imul(hash, 16777619); }
    return (hash >>> 0).toString(36);
  }
  const resendStorageKey = email => `comparatupala:confirm-resend:${emailHash(email)}`;
  function recentResendAttempts(email) {
    if (!email) return [];
    try {
      const parsed = JSON.parse(localStorage.getItem(resendStorageKey(email)) || '[]');
      if (!Array.isArray(parsed)) return [];
      const cutoff = Date.now() - RESEND_WINDOW_MS;
      const recent = parsed.filter(value => Number.isFinite(Number(value)) && Number(value) >= cutoff).map(Number);
      localStorage.setItem(resendStorageKey(email), JSON.stringify(recent));
      return recent;
    } catch { return []; }
  }
  function recordResendAttempt(email) {
    const recent = recentResendAttempts(email); recent.push(Date.now());
    try { localStorage.setItem(resendStorageKey(email), JSON.stringify(recent)); } catch {}
    return recent;
  }

  loginForm.innerHTML = `
    <div class="account-auth-view" data-auth-view="login">
      <div class="account-auth-intro"><p class="account-eyebrow">TU CUENTA</p><h3>Iniciar sesión</h3><p>Accede para mantener tus palas favoritas sincronizadas en tu cuenta.</p></div>
      <label>Email<input name="email" type="email" autocomplete="email" required maxlength="254" inputmode="email"></label>
      <label>Contraseña<input name="password" type="password" autocomplete="current-password" required maxlength="128"></label>
      <button class="account-forgot-link" type="button" data-show-recovery-request>¿Has olvidado tu contraseña?</button>
      <button class="account-primary-action" type="submit">Iniciar sesión</button>
      <p class="account-switch-copy">¿Todavía no tienes cuenta?</p>
      <button class="account-secondary-action" type="button" data-show-register>Crear una cuenta</button>
      <p class="account-note">Al iniciar sesión se incorporan a tu cuenta las palas guardadas sin sesión en este navegador.</p>
    </div>`;

  const registerForm = document.createElement('form');
  registerForm.id = 'account-register-form'; registerForm.hidden = true; registerForm.noValidate = true;
  registerForm.innerHTML = `
    <div class="account-auth-view" data-auth-view="register">
      <button class="account-back-action" type="button" data-show-login>← Volver a iniciar sesión</button>
      <div class="account-auth-intro"><p class="account-eyebrow">NUEVA CUENTA</p><h3>Crear cuenta</h3><p>Regístrate para sincronizar tus favoritas. Te enviaremos un correo para confirmar la dirección.</p></div>
      <label>Email<input name="email" type="email" autocomplete="email" required maxlength="254" inputmode="email"></label>
      <label>Contraseña<input name="password" type="password" autocomplete="new-password" required minlength="8" maxlength="128"></label>
      <div class="account-password-strength" id="password-strength" data-level="0"><div class="account-strength-heading"><span>Seguridad de la contraseña</span><strong data-strength-label>Sin contraseña</strong></div><div class="account-strength-track"><span></span></div><small>Una contraseña más larga y con mayúsculas, minúsculas, números y símbolos será más resistente.</small></div>
      <label>Repetir contraseña<input name="passwordConfirm" type="password" autocomplete="new-password" required minlength="8" maxlength="128"></label>
      <div class="account-requirements"><p>Requisitos para crear la cuenta</p><ul><li data-requirement="email"><span>○</span> Email con formato válido</li><li data-requirement="length"><span>○</span> Contraseña de al menos 8 caracteres</li><li data-requirement="match"><span>○</span> Las dos contraseñas coinciden</li></ul></div>
      <button class="account-primary-action" type="submit" disabled>Crear cuenta</button>
      <p class="account-note">Después del registro tendrás que confirmar tu email antes de poder iniciar sesión.</p>
    </div>`;
  loginForm.insertAdjacentElement('afterend', registerForm);

  const confirmationView = document.createElement('section');
  confirmationView.id = 'account-confirmation-view'; confirmationView.hidden = true;
  confirmationView.innerHTML = `<div class="account-auth-view account-confirmation-view"><div class="account-auth-intro"><p class="account-eyebrow">CONFIRMACIÓN PENDIENTE</p><h3>Confirma tu correo</h3><p>Esta cuenta ya existe, pero todavía necesita confirmar su dirección de email.</p></div><div class="account-confirmation-email" data-confirmation-email></div><button class="account-primary-action" type="button" data-resend-confirmation>Reenviar correo de confirmación</button><p class="account-note" data-resend-help></p></div>`;
  registerForm.insertAdjacentElement('afterend', confirmationView);

  const recoveryRequestForm = document.createElement('form');
  recoveryRequestForm.id = 'account-recovery-request-form'; recoveryRequestForm.hidden = true;
  recoveryRequestForm.innerHTML = `<div class="account-auth-view"><button class="account-back-action" type="button" data-show-login>← Volver a iniciar sesión</button><div class="account-auth-intro"><p class="account-eyebrow">RECUPERAR ACCESO</p><h3>Restablecer contraseña</h3><p>Te enviaremos un enlace seguro para crear una nueva contraseña.</p></div><label>Email<input name="email" type="email" autocomplete="email" required maxlength="254"></label><button class="account-primary-action" type="submit">Enviar enlace de recuperación</button></div>`;
  confirmationView.insertAdjacentElement('afterend', recoveryRequestForm);

  const recoveryPasswordForm = document.createElement('form');
  recoveryPasswordForm.id = 'account-recovery-password-form'; recoveryPasswordForm.hidden = true;
  recoveryPasswordForm.innerHTML = `<div class="account-auth-view"><div class="account-auth-intro"><p class="account-eyebrow">NUEVA CONTRASEÑA</p><h3>Crea una nueva contraseña</h3><p>El enlace de recuperación es válido solo durante un tiempo limitado.</p></div><label>Nueva contraseña<input name="password" type="password" autocomplete="new-password" minlength="8" maxlength="128" required></label><label>Repetir contraseña<input name="confirmPassword" type="password" autocomplete="new-password" minlength="8" maxlength="128" required></label><button class="account-primary-action" type="submit">Guardar nueva contraseña</button></div>`;
  recoveryRequestForm.insertAdjacentElement('afterend', recoveryPasswordForm);

  const resendButton = confirmationView.querySelector('[data-resend-confirmation]');
  const resendHelp = confirmationView.querySelector('[data-resend-help]');
  const confirmationEmail = confirmationView.querySelector('[data-confirmation-email]');

  function registrationState() {
    const email = registerForm.elements.email.value;
    const password = registerForm.elements.password.value;
    const passwordConfirm = registerForm.elements.passwordConfirm.value;
    return { email: validEmail(email) && email.length <= 254, length: password.length >= 8 && password.length <= 128, match: password.length > 0 && password === passwordConfirm };
  }
  function updatePasswordStrength() {
    const strength = passwordStrength(registerForm.elements.password.value);
    const container = registerForm.querySelector('.account-password-strength');
    container.dataset.level = String(strength.level); container.querySelector('[data-strength-label]').textContent = strength.label;
  }
  function updateRegistrationRequirements() {
    const state = registrationState();
    Object.entries(state).forEach(([name, ok]) => { const item = registerForm.querySelector(`[data-requirement="${name}"]`); item.dataset.valid = String(ok); item.querySelector('span').textContent = ok ? '✓' : '○'; });
    updatePasswordStrength();
    registerForm.querySelector('button[type="submit"]').disabled = busy || !client || !Object.values(state).every(Boolean);
    return Object.values(state).every(Boolean);
  }

  function updateResendUi() {
    confirmationEmail.textContent = pendingConfirmationEmail;
    if (!pendingConfirmationEmail) { resendButton.disabled = true; resendHelp.textContent = ''; return; }
    const attempts = recentResendAttempts(pendingConfirmationEmail); const now = Date.now(); const lastAttempt = attempts.length ? attempts.at(-1) : 0;
    const nextAllowedAt = Math.max(resendAvailableAt, lastAttempt + RESEND_COOLDOWN_MS); const secondsLeft = Math.max(0, Math.ceil((nextAllowedAt - now) / 1000));
    const resetSeconds = attempts.length ? Math.max(0, Math.ceil((attempts[0] + RESEND_WINDOW_MS - now) / 1000)) : 0; const quotaReached = attempts.length >= RESEND_MAX_ATTEMPTS;
    resendButton.disabled = busy || secondsLeft > 0 || quotaReached;
    resendHelp.textContent = quotaReached ? `Has alcanzado el máximo de ${RESEND_MAX_ATTEMPTS} reenvíos en 15 minutos. Vuelve a intentarlo en aproximadamente ${Math.max(1, Math.ceil(resetSeconds / 60))} min.` : secondsLeft > 0 ? `Puedes solicitar otro correo en ${secondsLeft} s.` : `Puedes solicitar un nuevo correo. Máximo local: ${RESEND_MAX_ATTEMPTS} reenvíos cada 15 minutos.`;
  }
  function startResendTimer() {
    if (resendTimer) clearInterval(resendTimer); updateResendUi();
    resendTimer = setInterval(() => { updateResendUi(); if (!pendingConfirmationEmail) { clearInterval(resendTimer); resendTimer = null; } }, 1000);
  }
  function showConfirmationOnly(email, initialCooldown = false) {
    pendingConfirmationEmail = email.trim(); authMode = 'confirmation'; registerForm.elements.password.value = ''; registerForm.elements.passwordConfirm.value = '';
    resendAvailableAt = initialCooldown ? Date.now() + RESEND_COOLDOWN_MS : Math.max(resendAvailableAt, Date.now());
    startResendTimer(); render(); say('La cuenta necesita confirmar su correo. Desde aquí puedes solicitar un nuevo email de confirmación.');
  }

  async function ensureCatalog() {
    if (catalogById) return catalogById;
    try {
      const response = await fetch('data/products.json', { cache: 'no-cache' });
      if (!response.ok) throw new Error('catalog');
      const products = await response.json();
      catalogById = new Map((Array.isArray(products) ? products : []).map(product => [String(product.id), product]));
    } catch { catalogById = new Map(); }
    return catalogById;
  }

  async function renderSavedRackets() {
    if (!user) { savedList.innerHTML = ''; return; }
    const ids = [...window.CTPFavorites.get()];
    if (!ids.length) { savedList.innerHTML = '<div class="account-saved-empty"><strong>Aún no tienes palas guardadas.</strong><p>Guarda una pala desde el catálogo y aparecerá aquí.</p></div>'; return; }
    savedList.innerHTML = '<p class="account-note">Cargando tus palas…</p>';
    const catalog = await ensureCatalog();
    if (!user) return;
    savedList.innerHTML = ids.map(id => {
      const product = catalog.get(String(id));
      const name = product?.name || `Pala ${id}`;
      const brand = product?.brand || 'Catálogo ComparaTuPala';
      return `<article class="account-saved-item"><div><span>${esc(brand)}</span><strong>${esc(name)}</strong></div><div class="account-saved-actions"><a href="#pala/${encodeURIComponent(id)}" data-open-saved>Ver ficha</a><button type="button" data-remove-saved="${esc(id)}" aria-label="Quitar ${esc(name)} de guardadas">Quitar</button></div></article>`;
    }).join('');
  }

  function setAuthMode(mode) {
    authMode = mode; render();
    if (!user && client && !['confirmation', 'recovery-password'].includes(mode)) {
      const target = mode === 'register' ? registerForm.elements.email : mode === 'recovery-request' ? recoveryRequestForm.elements.email : loginForm.elements.email;
      setTimeout(() => target?.focus(), 0);
    }
  }

  function render() {
    loginForm.hidden = !!user || !client || authMode !== 'login';
    registerForm.hidden = !!user || !client || authMode !== 'register';
    confirmationView.hidden = !!user || !client || authMode !== 'confirmation';
    recoveryRequestForm.hidden = !!user || !client || authMode !== 'recovery-request';
    recoveryPasswordForm.hidden = authMode !== 'recovery-password';
    signedIn.hidden = !user || authMode === 'recovery-password';
    openButton.textContent = user ? 'Mi cuenta' : 'Acceder';
    document.getElementById('account-email-label').textContent = user?.email || '';
    dialog.querySelectorAll('button:not([data-account-close]), input').forEach(el => { el.disabled = busy; });
    if (!busy) {
      [...loginForm.querySelectorAll('button, input'), ...registerForm.querySelectorAll('button, input'), ...recoveryRequestForm.querySelectorAll('button, input'), ...recoveryPasswordForm.querySelectorAll('button, input'), ...signedIn.querySelectorAll('button, input')].forEach(el => { el.disabled = false; });
    }
    updateRegistrationRequirements(); updateResendUi();
  }

  async function loadProfile(current, version) {
    try {
      check(await client.from('profiles').upsert({ id: current.id }, { onConflict: 'id', ignoreDuplicates: true }));
      const profile = check(await client.from('profiles').select('username').eq('id', current.id).single());
      if (version !== epoch) return;
      profileForm.elements.username.value = profile.username || '';
      emailForm.elements.email.value = current.email || '';
    } catch { if (version === epoch) say('Sesión iniciada. No se pudo cargar el perfil.'); }
  }

  function applySession(session) {
    const next = session?.user || null;
    if (next?.id === user?.id && next?.email === user?.email) return;
    user = next; const version = ++epoch; profileForm.reset(); emailForm.reset(); passwordForm.reset();
    window.CTPFavorites.setSession(client, user);
    if (!user && authMode !== 'recovery-password') authMode = 'login';
    if (user) { pendingConfirmationEmail = ''; resendAvailableAt = 0; }
    render();
    if (user) { say('Sesión iniciada.'); void loadProfile(user, version); void renderSavedRackets(); }
    else say('Puedes iniciar sesión o crear una cuenta para sincronizar tus favoritas.');
  }

  openButton.addEventListener('click', () => { dialog.showModal(); if (user) { void loadProfile(user, epoch); void renderSavedRackets(); } else setAuthMode('login'); });
  dialog.querySelector('[data-account-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { loginForm.elements.password.value = ''; registerForm.elements.password.value = ''; registerForm.elements.passwordConfirm.value = ''; passwordForm.reset(); updateRegistrationRequirements(); });

  loginForm.querySelector('[data-show-register]').addEventListener('click', () => { registerForm.elements.email.value = loginForm.elements.email.value.trim(); setAuthMode('register'); say('Completa los requisitos para crear tu cuenta.'); });
  loginForm.querySelector('[data-show-recovery-request]').addEventListener('click', () => { recoveryRequestForm.elements.email.value = loginForm.elements.email.value.trim(); setAuthMode('recovery-request'); say('Introduce tu email y te enviaremos un enlace para restablecer la contraseña.'); });
  registerForm.querySelector('[data-show-login]').addEventListener('click', () => { loginForm.elements.email.value = registerForm.elements.email.value.trim(); setAuthMode('login'); say('Introduce tus datos para iniciar sesión.'); });
  recoveryRequestForm.querySelector('[data-show-login]').addEventListener('click', () => { loginForm.elements.email.value = recoveryRequestForm.elements.email.value.trim(); setAuthMode('login'); say('Introduce tus datos para iniciar sesión.'); });
  registerForm.addEventListener('input', updateRegistrationRequirements);

  window.addEventListener('ctp:favorites-status', event => { document.getElementById('account-sync-status').textContent = event.detail; void renderSavedRackets(); });
  window.CTPFavorites.subscribe(() => { if (user) void renderSavedRackets(); });

  loginForm.addEventListener('submit', async event => {
    event.preventDefault(); if (busy || !client) return;
    const email = loginForm.elements.email.value.trim(); const password = loginForm.elements.password.value;
    if (!validEmail(email)) { say('Introduce un email válido.'); return; }
    if (!password) { say('Introduce tu contraseña.'); return; }
    busy = true; render(); say('Iniciando sesión…');
    try { const data = check(await client.auth.signInWithPassword({ email, password })); loginForm.elements.password.value = ''; if (data.session) applySession(data.session); }
    catch (error) { console.error('Supabase sign-in failed', error, authErrorDetails(error)); if (isConfirmationPendingError(error)) showConfirmationOnly(email, false); else say(describeAuthError(error, 'login')); }
    finally { busy = false; render(); }
  });

  registerForm.addEventListener('submit', async event => {
    event.preventDefault(); if (busy || !client || !updateRegistrationRequirements()) { say('Revisa los requisitos marcados antes de crear la cuenta.'); return; }
    const email = registerForm.elements.email.value.trim(); const password = registerForm.elements.password.value;
    busy = true; render(); say('Creando cuenta…');
    try {
      const data = check(await client.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } }));
      registerForm.elements.password.value = ''; registerForm.elements.passwordConfirm.value = '';
      if (data.session) applySession(data.session); else showConfirmationOnly(email, true);
    } catch (error) { console.error('Supabase sign-up failed', error, authErrorDetails(error)); if (isExistingAccountError(error) || isConfirmationPendingError(error)) showConfirmationOnly(email, false); else say(describeAuthError(error, 'register')); }
    finally { busy = false; render(); }
  });

  resendButton.addEventListener('click', async () => {
    if (busy || !client || !pendingConfirmationEmail) return;
    const attempts = recentResendAttempts(pendingConfirmationEmail); const lastAttempt = attempts.length ? attempts.at(-1) : 0; const now = Date.now();
    if (attempts.length >= RESEND_MAX_ATTEMPTS) { updateResendUi(); say('Has alcanzado el máximo local de 3 reenvíos en 15 minutos.'); return; }
    const nextAllowedAt = Math.max(resendAvailableAt, lastAttempt + RESEND_COOLDOWN_MS);
    if (now < nextAllowedAt) { updateResendUi(); say(`Espera ${Math.ceil((nextAllowedAt - now) / 1000)} s antes de solicitar otro correo.`); return; }
    busy = true; render(); say('Solicitando un nuevo correo de confirmación…');
    try { check(await client.auth.resend({ type: 'signup', email: pendingConfirmationEmail, options: { emailRedirectTo: location.origin + location.pathname } })); recordResendAttempt(pendingConfirmationEmail); resendAvailableAt = Date.now() + RESEND_COOLDOWN_MS; say('Correo de confirmación reenviado. Revisa también spam.'); }
    catch (error) { say(describeAuthError(error, 'register')); }
    finally { busy = false; render(); startResendTimer(); }
  });

  recoveryRequestForm.addEventListener('submit', async event => {
    event.preventDefault(); if (busy || !client) return;
    const email = recoveryRequestForm.elements.email.value.trim(); if (!validEmail(email)) { say('Introduce un email válido.'); return; }
    busy = true; render(); say('Enviando enlace de recuperación…');
    try {
      check(await client.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}${location.pathname}?recovery=1` }));
      say('Si existe una cuenta con ese email, recibirás un enlace para crear una nueva contraseña. Revisa también spam.');
    } catch (error) { console.error('Supabase password recovery failed', error, authErrorDetails(error)); say(describeAuthError(error, 'recovery')); }
    finally { busy = false; render(); }
  });

  recoveryPasswordForm.addEventListener('submit', async event => {
    event.preventDefault(); if (busy || !client) return;
    const password = recoveryPasswordForm.elements.password.value; const confirmPassword = recoveryPasswordForm.elements.confirmPassword.value;
    if (password.length < 8) { say('La nueva contraseña debe tener al menos 8 caracteres.'); return; }
    if (password !== confirmPassword) { say('Las dos contraseñas no coinciden.'); return; }
    busy = true; render(); say('Guardando la nueva contraseña…');
    try {
      check(await client.auth.updateUser({ password })); recoveryPasswordForm.reset(); authMode = user ? 'account' : 'login';
      history.replaceState({}, '', location.pathname + location.hash); render(); say('Contraseña actualizada correctamente. Ya puedes seguir usando tu cuenta.');
    } catch (error) { console.error('Supabase recovery update failed', error, authErrorDetails(error)); say(describeAuthError(error, 'recovery')); }
    finally { busy = false; render(); }
  });

  profileForm.addEventListener('submit', async event => {
    event.preventDefault(); if (busy || !user) return; const current = user; const version = epoch; const username = profileForm.elements.username.value.trim();
    busy = true; render();
    try { check(await client.from('profiles').upsert({ id: current.id, username }, { onConflict: 'id' }).select('id').single()); if (version === epoch) say('Perfil guardado.'); }
    catch { if (version === epoch) say('No se pudo guardar el perfil.'); }
    finally { busy = false; render(); }
  });

  emailForm.addEventListener('submit', async event => {
    event.preventDefault(); if (busy || !user) return;
    const nextEmail = emailForm.elements.email.value.trim();
    if (!validEmail(nextEmail)) { say('Introduce un email válido.'); return; }
    if (nextEmail.toLowerCase() === (user.email || '').toLowerCase()) { say('Ese es ya el correo asociado a tu cuenta.'); return; }
    busy = true; render(); say('Solicitando el cambio de correo…');
    try {
      check(await client.auth.updateUser({ email: nextEmail }, { emailRedirectTo: location.origin + location.pathname }));
      say('Cambio solicitado. Revisa los correos de verificación que envíe Supabase antes de que el nuevo email quede activo.');
    } catch (error) { console.error('Supabase email update failed', error, authErrorDetails(error)); say(describeAuthError(error, 'account')); }
    finally { busy = false; render(); }
  });

  passwordForm.addEventListener('submit', async event => {
    event.preventDefault(); if (busy || !user) return;
    const currentPassword = passwordForm.elements.currentPassword.value;
    const newPassword = passwordForm.elements.newPassword.value;
    const confirmPassword = passwordForm.elements.confirmPassword.value;
    if (newPassword.length < 8) { say('La nueva contraseña debe tener al menos 8 caracteres.'); return; }
    if (newPassword !== confirmPassword) { say('Las dos contraseñas nuevas no coinciden.'); return; }
    if (currentPassword === newPassword) { say('La nueva contraseña debe ser distinta de la actual.'); return; }
    busy = true; render(); say('Verificando tu contraseña actual…');
    try {
      check(await client.auth.signInWithPassword({ email: user.email, password: currentPassword }));
      check(await client.auth.updateUser({ password: newPassword })); passwordForm.reset(); say('Contraseña actualizada correctamente.');
    } catch (error) { console.error('Supabase password update failed', error, authErrorDetails(error)); say(describeAuthError(error, 'account')); }
    finally { busy = false; render(); }
  });

  savedList.addEventListener('click', async event => {
    const remove = event.target.closest('[data-remove-saved]');
    const open = event.target.closest('[data-open-saved]');
    if (open) dialog.close();
    if (!remove || busy) return;
    const id = remove.dataset.removeSaved; remove.disabled = true;
    const result = await window.CTPFavorites.toggle(id);
    if (result?.message) say(result.message); await renderSavedRackets();
  });

  document.getElementById('account-signout').addEventListener('click', async () => {
    if (busy || !client) return; busy = true; render();
    try { check(await client.auth.signOut({ scope: 'local' })); applySession(null); say('Sesión cerrada en este navegador.'); }
    catch { say('No se pudo cerrar la sesión.'); }
    finally { busy = false; render(); }
  });
  document.getElementById('account-sync').addEventListener('click', () => window.CTPFavorites.retry());

  render(); say('Preparando el acceso…');
  window.comparatupalaSupabaseReady.then(async value => {
    client = value; render();
    if (!client) { say('El acceso con cuenta aún no está disponible. Puedes guardar palas en este dispositivo sin registrarte.'); return; }
    try {
      const { session } = check(await client.auth.getSession()); applySession(session);
      client.auth.onAuthStateChange((event, nextSession) => {
        setTimeout(() => {
          if (event === 'PASSWORD_RECOVERY') {
            user = nextSession?.user || user; authMode = 'recovery-password'; render(); if (!dialog.open) dialog.showModal(); say('Introduce una nueva contraseña para recuperar tu cuenta.'); return;
          }
          applySession(nextSession);
        }, 0);
      });
      if (!session) say('Inicia sesión o crea una cuenta para sincronizar tus favoritas.');
      if (new URLSearchParams(location.search).get('recovery') === '1' && session) { authMode = 'recovery-password'; render(); if (!dialog.open) dialog.showModal(); say('Introduce una nueva contraseña para recuperar tu cuenta.'); }
    } catch { client = null; render(); say('No se pudo recuperar la sesión. Tus favoritos locales siguen disponibles.'); }
  });
})();