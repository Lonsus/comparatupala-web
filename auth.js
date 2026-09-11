'use strict';
(() => {
  const dialog = document.getElementById('account-dialog');
  const loginForm = document.getElementById('account-auth-form');
  const profileForm = document.getElementById('account-profile-form');
  const openButton = document.getElementById('account-open');
  const message = document.getElementById('account-status');
  const signedIn = document.getElementById('account-signed-in');
  let client = null, user = null, epoch = 0, busy = false, authMode = 'login';

  const say = text => { message.textContent = text; };
  const check = result => { if (result.error) throw result.error; return result.data; };
  const validEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

  function describeAuthError(error, action) {
    const rawMessage = String(error?.message || '').trim();
    const code = String(error?.code || '').trim();
    const normalized = `${code} ${rawMessage}`.toLowerCase();

    if (normalized.includes('already registered') || normalized.includes('user_already_exists')) {
      return 'Ya existe una cuenta asociada a este email. Vuelve a iniciar sesión o utiliza otra dirección.';
    }
    if (normalized.includes('email rate limit') || normalized.includes('over_email_send_rate_limit')) {
      return 'Se han enviado demasiados correos en poco tiempo. Espera unos minutos antes de solicitar otro registro o confirmación.';
    }
    if (normalized.includes('rate limit')) {
      return 'Se ha alcanzado temporalmente el límite de intentos de autenticación. Espera unos minutos y vuelve a intentarlo.';
    }
    if (normalized.includes('error sending confirmation email') || normalized.includes('smtp')) {
      return 'Supabase no ha podido enviar el correo de confirmación. Revisa Authentication → Emails → SMTP Settings y las credenciales SMTP configuradas antes de volver a intentarlo.';
    }
    if (normalized.includes('signup') && normalized.includes('disabled')) {
      return 'El registro de nuevos usuarios está desactivado en Supabase. Activa Allow new users to sign up en Authentication → Providers → Email.';
    }
    if (normalized.includes('email') && (normalized.includes('invalid') || normalized.includes('not valid'))) {
      return 'Supabase ha rechazado la dirección de email. Revisa que esté escrita correctamente y vuelve a intentarlo.';
    }
    if (normalized.includes('weak_password') || (normalized.includes('password') && normalized.includes('weak'))) {
      return 'Supabase considera que la contraseña no cumple la política de seguridad configurada. Utiliza una contraseña más larga y combina mayúsculas, minúsculas, números y símbolos.';
    }
    if (normalized.includes('email not confirmed')) {
      return 'El email todavía no está confirmado. Abre el mensaje de confirmación que te envió ComparaTuPala antes de iniciar sesión.';
    }
    if (normalized.includes('invalid login credentials')) {
      return 'El email o la contraseña no son correctos. Si acabas de registrarte, comprueba también que hayas confirmado el correo.';
    }

    const detail = rawMessage ? ` Supabase indica: ${rawMessage}${code ? ` (código: ${code})` : ''}.` : '';
    return action === 'register'
      ? `No se pudo crear la cuenta.${detail || ' Comprueba la conexión y vuelve a intentarlo.'}`
      : `No se pudo iniciar sesión.${detail || ' Comprueba los datos y vuelve a intentarlo.'}`;
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

  function updateRegistrationRequirements() {
    const state = registrationState();
    Object.entries(state).forEach(([name, ok]) => {
      const item = registerForm.querySelector(`[data-requirement="${name}"]`);
      item.dataset.valid = String(ok);
      item.querySelector('span').textContent = ok ? '✓' : '○';
    });
    updatePasswordStrength();
    registerForm.querySelector('button[type="submit"]').disabled = busy || !client || !Object.values(state).every(Boolean);
    return Object.values(state).every(Boolean);
  }

  function setAuthMode(mode) {
    authMode = mode;
    loginForm.hidden = !!user || !client || mode !== 'login';
    registerForm.hidden = !!user || !client || mode !== 'register';
    if (!user && client) {
      say(mode === 'register' ? 'Completa los requisitos para crear tu cuenta.' : 'Introduce tus datos para iniciar sesión.');
      const target = mode === 'register' ? registerForm.elements.email : loginForm.elements.email;
      setTimeout(() => target?.focus(), 0);
    }
    updateRegistrationRequirements();
  }

  function render() {
    loginForm.hidden = !!user || !client || authMode !== 'login';
    registerForm.hidden = !!user || !client || authMode !== 'register';
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
    busy = true; render(); say('Iniciando sesión…');
    try {
      const data = check(await client.auth.signInWithPassword({ email, password }));
      loginForm.elements.password.value = '';
      if (data.session) applySession(data.session);
    } catch (error) {
      console.error('Supabase sign-in failed', { code: error?.code, status: error?.status, message: error?.message });
      say(describeAuthError(error, 'login'));
    } finally { busy = false; render(); }
  });

  registerForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy || !client || !updateRegistrationRequirements()) {
      say('Revisa los requisitos marcados antes de crear la cuenta.');
      return;
    }
    const email = registerForm.elements.email.value.trim();
    const password = registerForm.elements.password.value;
    busy = true; render(); say('Creando cuenta…');
    try {
      const data = check(await client.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: location.origin + location.pathname }
      }));
      registerForm.elements.password.value = '';
      registerForm.elements.passwordConfirm.value = '';
      if (data.session) applySession(data.session);
      else say('Cuenta creada. Revisa tu email y confirma el registro antes de iniciar sesión.');
    } catch (error) {
      console.error('Supabase sign-up failed', { code: error?.code, status: error?.status, message: error?.message });
      say(describeAuthError(error, 'register'));
    } finally { busy = false; render(); }
  });

  profileForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy || !user) return;
    const current = user, version = epoch;
    const username = profileForm.elements.username.value.trim();
    busy = true; render();
    try {
      check(await client.from('profiles').upsert({ id: current.id, username }, { onConflict: 'id' }).select('id').single());
      if (version === epoch) say('Perfil guardado.');
    } catch { if (version === epoch) say('No se pudo guardar el perfil. Vuelve a intentarlo.'); }
    finally { busy = false; render(); }
  });

  document.getElementById('account-signout').addEventListener('click', async () => {
    if (busy || !client) return;
    busy = true; render();
    try {
      check(await client.auth.signOut({ scope: 'local' }));
      applySession(null);
      say('Sesión cerrada en este navegador. Tus favoritas de la cuenta siguen guardadas online.');
    } catch { say('No se pudo cerrar la sesión. Comprueba la conexión y vuelve a intentarlo.'); }
    finally { busy = false; render(); }
  });

  document.getElementById('account-sync').addEventListener('click', () => window.CTPFavorites.retry());
  render();
  say('Preparando el acceso…');
  window.comparatupalaSupabaseReady.then(async value => {
    client = value;
    render();
    if (!client) { say('El acceso con cuenta aún no está disponible. Puedes guardar palas en este dispositivo sin registrarte.'); return; }
    try {
      const { session } = check(await client.auth.getSession());
      applySession(session);
      client.auth.onAuthStateChange((_event, nextSession) => {
        setTimeout(() => applySession(nextSession), 0);
      });
      if (!session) say('Inicia sesión o crea una cuenta para sincronizar tus favoritas.');
    } catch {
      client = null; render();
      say('No se pudo recuperar la sesión. Tus favoritos locales siguen disponibles. Recarga para reintentar.');
    }
  });
})();
