'use strict';
(() => {
  const dialog = document.getElementById('account-dialog');
  const loginForm = document.getElementById('account-auth-form');
  const profileForm = document.getElementById('account-profile-form');
  const openButton = document.getElementById('account-open');
  const message = document.getElementById('account-status');
  const signedIn = document.getElementById('account-signed-in');
  const RESEND_COOLDOWN_MS = 60 * 1000;
  const RESEND_WINDOW_MS = 15 * 60 * 1000;
  const RESEND_MAX_ATTEMPTS = 3;

  let client = null;
  let user = null;
  let epoch = 0;
  let busy = false;
  let authMode = 'login';
  let pendingConfirmationEmail = '';
  let resendAvailableAt = 0;
  let resendTimer = null;

  const say = text => { message.textContent = text; };
  const check = result => { if (result.error) throw result.error; return result.data; };
  const validEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

  function authErrorDetails(error) {
    const objects = [];
    const pushObject = value => {
      if (value && typeof value === 'object' && !objects.includes(value)) objects.push(value);
    };
    pushObject(error);
    pushObject(error?.error);
    pushObject(error?.cause);
    pushObject(error?.context);
    pushObject(error?.context?.error);
    pushObject(error?.response);
    pushObject(error?.response?.data);

    const cleanText = value => {
      if (typeof value !== 'string') return '';
      const text = value.trim();
      return text && text !== '{}' && text !== '[object Object]' ? text : '';
    };
    const firstText = values => values.map(cleanText).find(Boolean) || '';
    const messageText = firstText([
      typeof error === 'string' ? error : '',
      ...objects.flatMap(item => [item.message, item.error_description, item.msg, item.details, item.hint, item.reason])
    ]);
    const code = firstText(objects.flatMap(item => [item.code, item.error_code, item.type]));
    const name = firstText(objects.map(item => item.name));
    const statusValue = objects.flatMap(item => [item.status, item.statusCode, item.status_code])
      .find(value => Number.isFinite(Number(value)) && Number(value) > 0);
    const status = statusValue ? Number(statusValue) : null;

    let serialized = '';
    if (!messageText && error && typeof error === 'object') {
      try { serialized = JSON.stringify(error, Object.getOwnPropertyNames(error)); }
      catch { serialized = ''; }
      if (serialized === '{}' || serialized === '[]') serialized = '';
    }

    return { message: messageText, code, name, status, serialized };
  }

  function normalizedAuthError(error) {
    const details = authErrorDetails(error);
    return {
      details,
      text: `${details.code} ${details.name} ${details.message} ${details.serialized}`.toLowerCase()
    };
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
    const technical = [
      details.code ? `código ${details.code}` : '',
      details.status ? `HTTP ${details.status}` : ''
    ].filter(Boolean).join(' · ');

    if (isExistingAccountError(error)) {
      return 'Ya existe una cuenta asociada a este email.';
    }
    if (normalized.includes('email rate limit') || normalized.includes('over_email_send_rate_limit') || normalized.includes('email_send_rate_limit')) {
      return `No se pudo enviar otro correo de confirmación porque se ha alcanzado el límite temporal de emails${technical ? ` (${technical})` : ''}. Espera unos minutos y vuelve a intentarlo.`;
    }
    if (normalized.includes('rate limit') || details.status === 429) {
      return `Se ha alcanzado temporalmente el límite de intentos de autenticación${technical ? ` (${technical})` : ''}. Espera unos minutos y vuelve a intentarlo.`;
    }
    if (normalized.includes('error sending confirmation email') || normalized.includes('email confirmation') || normalized.includes('smtp')) {
      return `Supabase no pudo enviar el correo de confirmación${technical ? ` (${technical})` : ''}. Revisa la configuración SMTP antes de volver a intentarlo.`;
    }
    if (normalized.includes('signup') && normalized.includes('disabled')) {
      return 'El registro de nuevos usuarios está desactivado en Supabase.';
    }
    if (normalized.includes('email') && (normalized.includes('invalid') || normalized.includes('not valid'))) {
      return `Supabase ha rechazado la dirección de email${technical ? ` (${technical})` : ''}. Revisa que esté escrita correctamente.`;
    }
    if (normalized.includes('weak_password') || (normalized.includes('password') && normalized.includes('weak'))) {
      return `Supabase considera que la contraseña no cumple la política de seguridad${technical ? ` (${technical})` : ''}. Utiliza una contraseña más larga y combina mayúsculas, minúsculas, números y símbolos.`;
    }
    if (isConfirmationPendingError(error)) {
      return 'El email todavía no está confirmado.';
    }
    if (normalized.includes('invalid login credentials')) {
      return 'El email o la contraseña no son correctos.';
    }
    if (normalized.includes('failed to fetch') || normalized.includes('network') || normalized.includes('fetcherror')) {
      return 'No se ha podido conectar con Supabase. Comprueba tu conexión a Internet y vuelve a intentarlo.';
    }
    if (normalized.includes('unexpected_failure') || (details.status && details.status >= 500)) {
      if (action === 'register') {
        return `Supabase devolvió un error interno al crear la cuenta${technical ? ` (${technical})` : ''}. Revisa Authentication → Logs y el SMTP.`;
      }
      return `Supabase devolvió un error interno al iniciar sesión${technical ? ` (${technical})` : ''}. Revisa Authentication → Logs.`;
    }

    const readableMessage = details.message || details.serialized;
    const prefix = action === 'register' ? 'No se pudo crear la cuenta.' : 'No se pudo iniciar sesión.';
    if (readableMessage) return `${prefix} Detalle de Supabase: ${readableMessage}${technical ? ` (${technical})` : ''}.`;
    if (technical) return `${prefix} Supabase devolvió ${technical}, pero no proporcionó un mensaje legible.`;
    return `${prefix} Supabase no proporcionó un detalle legible del error.`;
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
    for (let index = 0; index < normalized.length; index += 1) {
      hash ^= normalized.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function resendStorageKey(email) {
    return `comparatupala:confirm-resend:${emailHash(email)}`;
  }

  function recentResendAttempts(email) {
    if (!email) return [];
    try {
      const parsed = JSON.parse(localStorage.getItem(resendStorageKey(email)) || '[]');
      if (!Array.isArray(parsed)) return [];
      const cutoff = Date.now() - RESEND_WINDOW_MS;
      const recent = parsed.filter(value => Number.isFinite(Number(value)) && Number(value) >= cutoff).map(Number);
      localStorage.setItem(resendStorageKey(email), JSON.stringify(recent));
      return recent;
    } catch {
      return [];
    }
  }

  function recordResendAttempt(email) {
    const recent = recentResendAttempts(email);
    recent.push(Date.now());
    try { localStorage.setItem(resendStorageKey(email), JSON.stringify(recent)); } catch { /* storage unavailable */ }
    return recent;
  }

  loginForm.innerHTML = `
    <div class="account-auth-view" data-auth-view="login">
      <div class="account-auth-intro">
        <p class="account-eyebrow">TU CUENTA</p>
        <h3>Iniciar sesión</h3>
        <p>Accede para mantener tus palas favoritas sincronizadas en tu cuenta.</p>
      </div>
      <label>Email
        <input name="email" type="email" autocomplete="email" required maxlength="254" inputmode="email">
      </label>
      <label>Contraseña
        <input name="password" type="password" autocomplete="current-password" required maxlength="128">
      </label>
      <button class="account-primary-action" type="submit">Iniciar sesión</button>
      <p class="account-switch-copy">¿Todavía no tienes cuenta?</p>
      <button class="account-secondary-action" type="button" data-show-register>Crear una cuenta</button>
      <p class="account-note">Al iniciar sesión se incorporan a tu cuenta las palas guardadas sin sesión en este navegador.</p>
    </div>`;

  const registerForm = document.createElement('form');
  registerForm.id = 'account-register-form';
  registerForm.hidden = true;
  registerForm.noValidate = true;
  registerForm.innerHTML = `
    <div class="account-auth-view" data-auth-view="register">
      <button class="account-back-action" type="button" data-show-login aria-label="Volver a iniciar sesión">← Volver a iniciar sesión</button>
      <div class="account-auth-intro">
        <p class="account-eyebrow">NUEVA CUENTA</p>
        <h3>Crear cuenta</h3>
        <p>Regístrate para sincronizar tus favoritas. Te enviaremos un correo para confirmar la dirección.</p>
      </div>
      <label>Email
        <input name="email" type="email" autocomplete="email" required maxlength="254" inputmode="email" aria-describedby="register-requirements">
      </label>
      <label>Contraseña
        <input name="password" type="password" autocomplete="new-password" required minlength="8" maxlength="128" aria-describedby="password-strength register-requirements">
      </label>
      <div class="account-password-strength" id="password-strength" data-level="0" aria-live="polite">
        <div class="account-strength-heading"><span>Seguridad de la contraseña</span><strong data-strength-label>Sin contraseña</strong></div>
        <div class="account-strength-track" aria-hidden="true"><span></span></div>
        <small>Una contraseña más larga y con mayúsculas, minúsculas, números y símbolos será más resistente.</small>
      </div>
      <label>Repetir contraseña
        <input name="passwordConfirm" type="password" autocomplete="new-password" required minlength="8" maxlength="128" aria-describedby="register-requirements">
      </label>
      <div class="account-requirements" id="register-requirements" aria-live="polite">
        <p>Requisitos para crear la cuenta</p>
        <ul>
          <li data-requirement="email"><span aria-hidden="true">○</span> Email con formato válido</li>
          <li data-requirement="length"><span aria-hidden="true">○</span> Contraseña de al menos 8 caracteres</li>
          <li data-requirement="match"><span aria-hidden="true">○</span> Las dos contraseñas coinciden</li>
        </ul>
      </div>
      <button class="account-primary-action" type="submit" disabled>Crear cuenta</button>
      <p class="account-note">Después del registro tendrás que confirmar tu email antes de poder iniciar sesión.</p>
    </div>`;
  loginForm.insertAdjacentElement('afterend', registerForm);

  const confirmationView = document.createElement('section');
  confirmationView.id = 'account-confirmation-view';
  confirmationView.hidden = true;
  confirmationView.setAttribute('aria-labelledby', 'account-confirmation-title');
  confirmationView.innerHTML = `
    <div class="account-auth-view account-confirmation-view">
      <div class="account-auth-intro">
        <p class="account-eyebrow">CONFIRMACIÓN PENDIENTE</p>
        <h3 id="account-confirmation-title">Confirma tu correo</h3>
        <p>Esta cuenta ya existe, pero todavía necesita confirmar su dirección de email.</p>
      </div>
      <div class="account-confirmation-email" data-confirmation-email></div>
      <button class="account-primary-action" type="button" data-resend-confirmation>Reenviar correo de confirmación</button>
      <p class="account-note" data-resend-help aria-live="polite"></p>
    </div>`;
  registerForm.insertAdjacentElement('afterend', confirmationView);

  const resendButton = confirmationView.querySelector('[data-resend-confirmation]');
  const resendHelp = confirmationView.querySelector('[data-resend-help]');
  const confirmationEmail = confirmationView.querySelector('[data-confirmation-email]');

  function registrationState() {
    const email = registerForm.elements.email.value;
    const password = registerForm.elements.password.value;
    const passwordConfirm = registerForm.elements.passwordConfirm.value;
    return {
      email: validEmail(email) && email.length <= 254,
      length: password.length >= 8 && password.length <= 128,
      match: password.length > 0 && password === passwordConfirm
    };
  }

  function updatePasswordStrength() {
    const strength = passwordStrength(registerForm.elements.password.value);
    const container = registerForm.querySelector('.account-password-strength');
    container.dataset.level = String(strength.level);
    container.querySelector('[data-strength-label]').textContent = strength.label;
  }

  function updateResendUi() {
    confirmationEmail.textContent = pendingConfirmationEmail;
    if (!pendingConfirmationEmail) {
      resendButton.disabled = true;
      resendHelp.textContent = '';
      return;
    }

    const attempts = recentResendAttempts(pendingConfirmationEmail);
    const now = Date.now();
    const lastAttempt = attempts.length ? attempts[attempts.length - 1] : 0;
    const nextAllowedAt = Math.max(resendAvailableAt, lastAttempt + RESEND_COOLDOWN_MS);
    const secondsLeft = Math.max(0, Math.ceil((nextAllowedAt - now) / 1000));
    const windowResetAt = attempts.length ? attempts[0] + RESEND_WINDOW_MS : 0;
    const windowSeconds = Math.max(0, Math.ceil((windowResetAt - now) / 1000));
    const quotaReached = attempts.length >= RESEND_MAX_ATTEMPTS;

    resendButton.disabled = busy || secondsLeft > 0 || quotaReached;
    if (quotaReached) {
      resendHelp.textContent = `Has alcanzado el máximo de ${RESEND_MAX_ATTEMPTS} reenvíos en 15 minutos. Podrás volver a intentarlo en aproximadamente ${Math.max(1, Math.ceil(windowSeconds / 60))} min.`;
    } else if (secondsLeft > 0) {
      resendHelp.textContent = `Puedes solicitar otro correo en ${secondsLeft} s. Reenvíos disponibles en esta ventana: ${RESEND_MAX_ATTEMPTS - attempts.length}.`;
    } else {
      resendHelp.textContent = `Puedes solicitar un nuevo correo. Máximo local: ${RESEND_MAX_ATTEMPTS} reenvíos cada 15 minutos.`;
    }
  }

  function startResendTimer() {
    if (resendTimer) clearInterval(resendTimer);
    updateResendUi();
    resendTimer = setInterval(() => {
      updateResendUi();
      if (!pendingConfirmationEmail) {
        clearInterval(resendTimer);
        resendTimer = null;
      }
    }, 1000);
  }

  function showConfirmationOnly(email, initialCooldown = false) {
    pendingConfirmationEmail = email.trim();
    authMode = 'confirmation';
    registerForm.elements.password.value = '';
    registerForm.elements.passwordConfirm.value = '';
    if (initialCooldown) resendAvailableAt = Date.now() + RESEND_COOLDOWN_MS;
    else resendAvailableAt = Math.max(resendAvailableAt, Date.now());
    startResendTimer();
    render();
    say('La cuenta necesita confirmar su correo. Desde aquí solo puedes solicitar un nuevo email de confirmación.');
  }

  function updateRegistrationRequirements() {
    const state = registrationState();
    Object.entries(state).forEach(([name, ok]) => {
      const item = registerForm.querySelector(`[data-requirement="${name}"]`);
      item.dataset.valid = String(ok);
      item.querySelector('span').textContent = ok ? '✓' : '○';
    });
    updatePasswordStrength();
    registerForm.querySelector('button[type="submit"]').disabled = busy || !client || !Object.values(state).every(Boolean);
    updateResendUi();
    return Object.values(state).every(Boolean);
  }

  function setAuthMode(mode) {
    authMode = mode;
    render();
    if (!user && client && mode !== 'confirmation') {
      say(mode === 'register' ? 'Completa los requisitos para crear tu cuenta.' : 'Introduce tus datos para iniciar sesión.');
      const target = mode === 'register' ? registerForm.elements.email : loginForm.elements.email;
      setTimeout(() => target?.focus(), 0);
    }
  }

  function render() {
    loginForm.hidden = !!user || !client || authMode !== 'login';
    registerForm.hidden = !!user || !client || authMode !== 'register';
    confirmationView.hidden = !!user || !client || authMode !== 'confirmation';
    signedIn.hidden = !user;
    openButton.textContent = user ? 'Mi cuenta' : 'Acceder';
    document.getElementById('account-email-label').textContent = user?.email || '';

    dialog.querySelectorAll('button:not([data-account-close]), input').forEach(el => { el.disabled = busy; });
    if (!busy) {
      loginForm.querySelectorAll('button, input').forEach(el => { el.disabled = false; });
      registerForm.querySelectorAll('button, input').forEach(el => { el.disabled = false; });
      profileForm.querySelectorAll('button, input').forEach(el => { el.disabled = false; });
      document.getElementById('account-sync').disabled = false;
      document.getElementById('account-signout').disabled = false;
    }
    updateRegistrationRequirements();
    updateResendUi();
  }

  async function loadProfile(current, version) {
    try {
      check(await client.from('profiles').upsert({ id: current.id }, { onConflict: 'id', ignoreDuplicates: true }));
      const profile = check(await client.from('profiles').select('username').eq('id', current.id).single());
      if (version !== epoch) return;
      profileForm.elements.username.value = profile.username || '';
    } catch {
      if (version === epoch) say('Sesión iniciada. No se pudo cargar el perfil; vuelve a abrir Mi cuenta para reintentar.');
    }
  }

  function applySession(session) {
    const next = session?.user || null;
    if (next?.id === user?.id) return;
    user = next;
    const version = ++epoch;
    profileForm.reset();
    window.CTPFavorites.setSession(client, user);
    if (!user) authMode = 'login';
    if (user) {
      pendingConfirmationEmail = '';
      resendAvailableAt = 0;
    }
    render();
    say(user ? 'Sesión iniciada.' : 'Puedes iniciar sesión o crear una cuenta para sincronizar tus favoritas.');
    if (user) void loadProfile(user, version);
  }

  openButton.addEventListener('click', () => {
    dialog.showModal();
    if (user) void loadProfile(user, epoch);
    else setAuthMode('login');
  });

  dialog.querySelector('[data-account-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    loginForm.elements.password.value = '';
    registerForm.elements.password.value = '';
    registerForm.elements.passwordConfirm.value = '';
    updateRegistrationRequirements();
  });

  loginForm.querySelector('[data-show-register]').addEventListener('click', () => {
    registerForm.elements.email.value = loginForm.elements.email.value.trim();
    setAuthMode('register');
  });

  registerForm.querySelector('[data-show-login]').addEventListener('click', () => {
    loginForm.elements.email.value = registerForm.elements.email.value.trim();
    registerForm.elements.password.value = '';
    registerForm.elements.passwordConfirm.value = '';
    setAuthMode('login');
  });

  registerForm.addEventListener('input', updateRegistrationRequirements);

  window.addEventListener('ctp:favorites-status', event => {
    document.getElementById('account-sync-status').textContent = event.detail;
  });

  loginForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy || !client) return;
    const email = loginForm.elements.email.value.trim();
    const password = loginForm.elements.password.value;
    if (!validEmail(email)) { say('Introduce un email válido.'); loginForm.elements.email.focus(); return; }
    if (!password) { say('Introduce tu contraseña.'); loginForm.elements.password.focus(); return; }

    busy = true;
    render();
    say('Iniciando sesión…');
    try {
      const data = check(await client.auth.signInWithPassword({ email, password }));
      loginForm.elements.password.value = '';
      if (data.session) applySession(data.session);
    } catch (error) {
      const details = authErrorDetails(error);
      console.error('Supabase sign-in failed', error, details);
      if (isConfirmationPendingError(error)) {
        showConfirmationOnly(email, false);
      } else {
        say(describeAuthError(error, 'login'));
      }
    } finally {
      busy = false;
      render();
    }
  });

  registerForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy || !client || !updateRegistrationRequirements()) {
      say('Revisa los requisitos marcados antes de crear la cuenta.');
      return;
    }

    const email = registerForm.elements.email.value.trim();
    const password = registerForm.elements.password.value;
    busy = true;
    render();
    say('Creando cuenta…');
    try {
      const data = check(await client.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: location.origin + location.pathname }
      }));
      registerForm.elements.password.value = '';
      registerForm.elements.passwordConfirm.value = '';

      if (data.session) {
        applySession(data.session);
      } else {
        showConfirmationOnly(email, true);
      }
    } catch (error) {
      const details = authErrorDetails(error);
      console.error('Supabase sign-up failed', error, details);
      if (isExistingAccountError(error) || isConfirmationPendingError(error)) {
        showConfirmationOnly(email, false);
      } else {
        say(describeAuthError(error, 'register'));
      }
    } finally {
      busy = false;
      render();
    }
  });

  resendButton.addEventListener('click', async () => {
    if (busy || !client || !pendingConfirmationEmail) return;
    const attempts = recentResendAttempts(pendingConfirmationEmail);
    const lastAttempt = attempts.length ? attempts[attempts.length - 1] : 0;
    const now = Date.now();

    if (attempts.length >= RESEND_MAX_ATTEMPTS) {
      updateResendUi();
      say('Has alcanzado el máximo local de 3 reenvíos en 15 minutos para este correo.');
      return;
    }

    const nextAllowedAt = Math.max(resendAvailableAt, lastAttempt + RESEND_COOLDOWN_MS);
    if (now < nextAllowedAt) {
      updateResendUi();
      say(`Espera ${Math.ceil((nextAllowedAt - now) / 1000)} s antes de solicitar otro correo.`);
      return;
    }

    busy = true;
    render();
    say('Solicitando un nuevo correo de confirmación…');
    try {
      check(await client.auth.resend({
        type: 'signup',
        email: pendingConfirmationEmail,
        options: { emailRedirectTo: location.origin + location.pathname }
      }));
      recordResendAttempt(pendingConfirmationEmail);
      resendAvailableAt = Date.now() + RESEND_COOLDOWN_MS;
      say('Correo de confirmación reenviado. Revisa también spam o correo no deseado.');
    } catch (error) {
      const details = authErrorDetails(error);
      console.error('Supabase confirmation resend failed', error, details);
      const normalized = `${details.code} ${details.name} ${details.message} ${details.serialized}`.toLowerCase();
      if (details.status === 429 || normalized.includes('rate limit') || normalized.includes('over_email_send_rate_limit')) {
        resendAvailableAt = Date.now() + RESEND_COOLDOWN_MS;
        say('Supabase ha bloqueado temporalmente el reenvío por exceso de solicitudes. Espera al menos un minuto.');
      } else {
        say(describeAuthError(error, 'register'));
      }
    } finally {
      busy = false;
      render();
      startResendTimer();
    }
  });

  profileForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy || !user) return;
    const current = user;
    const version = epoch;
    const username = profileForm.elements.username.value.trim();
    busy = true;
    render();
    try {
      check(await client.from('profiles').upsert({ id: current.id, username }, { onConflict: 'id' }).select('id').single());
      if (version === epoch) say('Perfil guardado.');
    } catch {
      if (version === epoch) say('No se pudo guardar el perfil. Vuelve a intentarlo.');
    } finally {
      busy = false;
      render();
    }
  });

  document.getElementById('account-signout').addEventListener('click', async () => {
    if (busy || !client) return;
    busy = true;
    render();
    try {
      check(await client.auth.signOut({ scope: 'local' }));
      applySession(null);
      say('Sesión cerrada en este navegador. Tus favoritas de la cuenta siguen guardadas online.');
    } catch {
      say('No se pudo cerrar la sesión. Comprueba la conexión y vuelve a intentarlo.');
    } finally {
      busy = false;
      render();
    }
  });

  document.getElementById('account-sync').addEventListener('click', () => window.CTPFavorites.retry());

  render();
  say('Preparando el acceso…');
  window.comparatupalaSupabaseReady.then(async value => {
    client = value;
    render();
    if (!client) {
      say('El acceso con cuenta aún no está disponible. Puedes guardar palas en este dispositivo sin registrarte.');
      return;
    }
    try {
      const { session } = check(await client.auth.getSession());
      applySession(session);
      client.auth.onAuthStateChange((_event, nextSession) => {
        setTimeout(() => applySession(nextSession), 0);
      });
      if (!session) say('Inicia sesión o crea una cuenta para sincronizar tus favoritas.');
    } catch {
      client = null;
      render();
      say('No se pudo recuperar la sesión. Tus favoritos locales siguen disponibles. Recarga para reintentar.');
    }
  });
})();