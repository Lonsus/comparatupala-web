'use strict';
(() => {
  const dialog = document.getElementById('account-dialog');
  const form = document.getElementById('account-auth-form');
  const profileForm = document.getElementById('account-profile-form');
  const openButton = document.getElementById('account-open');
  const message = document.getElementById('account-status');
  const signedIn = document.getElementById('account-signed-in');
  let client = null, user = null, epoch = 0, busy = false;
  const say = text => { message.textContent = text; };
  const check = result => { if (result.error) throw result.error; return result.data; };
  function render() {
    form.hidden = !!user || !client;
    signedIn.hidden = !user;
    openButton.textContent = user ? 'Mi cuenta' : 'Acceder';
    document.getElementById('account-email-label').textContent = user?.email || '';
    dialog.querySelectorAll('button:not([data-account-close]), input').forEach(el => { el.disabled = busy; });
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
    render();
    say(user ? 'Sesión iniciada.' : 'Puedes acceder o crear una cuenta para sincronizar tus favoritas.');
    if (user) void loadProfile(user, version);
  }
  openButton.addEventListener('click', () => {
    dialog.showModal();
    if (user) void loadProfile(user, epoch);
  });
  dialog.querySelector('[data-account-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { form.elements.password.value = ''; });
  window.addEventListener('ctp:favorites-status', event => {
    document.getElementById('account-sync-status').textContent = event.detail;
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy || !client) return;
    const register = event.submitter?.value === 'register';
    const email = form.elements.email.value.trim(), password = form.elements.password.value;
    if (register && password.length < 8) { say('Utiliza una contraseña de al menos 8 caracteres para registrarte.'); return; }
    busy = true; render(); say(register ? 'Creando cuenta…' : 'Iniciando sesión…');
    try {
      const data = check(await (register ? client.auth.signUp({ email, password,
        options: { emailRedirectTo: location.origin + location.pathname } }) :
        client.auth.signInWithPassword({ email, password })));
      form.elements.password.value = '';
      if (data.session) applySession(data.session);
      else say('Revisa tu email para confirmar el registro. Si ya tienes cuenta, inicia sesión.');
    } catch {
      say(register ? 'No se pudo crear la cuenta. Revisa los datos y vuelve a intentarlo.' :
        'No se pudo iniciar sesión. Revisa el email, la contraseña, la confirmación del correo y la conexión.');
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
      // Register after initialization; never await Supabase calls inside its auth callback.
      const { session } = check(await client.auth.getSession());
      applySession(session);
      client.auth.onAuthStateChange((_event, nextSession) => {
        setTimeout(() => applySession(nextSession), 0);
      });
      if (!session) say('Accede o crea una cuenta para sincronizar tus favoritas.');
    } catch {
      client = null; render();
      say('No se pudo recuperar la sesión. Tus favoritos locales siguen disponibles. Recarga para reintentar.');
    }
  });
})();
