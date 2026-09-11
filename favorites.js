'use strict';
(() => {
  const KEY = 'comparatupala:saved';
  const listeners = new Set();
  let guest = readGuest(), saved = new Set(guest), userId = null, client = null;
  let generation = 0, ready = true, queue = Promise.resolve();
  function readGuest() {
    try {
      const values = JSON.parse(localStorage.getItem(KEY) || '[]');
      return new Set(Array.isArray(values) ? values.filter(id => typeof id === 'string' && id.length > 0) : []);
    } catch { return new Set(); }
  }
  function writeGuest() {
    try { localStorage.setItem(KEY, JSON.stringify([...guest])); return true; }
    catch { return false; }
  }
  function emit() { listeners.forEach(fn => fn(new Set(saved))); }
  function status(message) {
    window.dispatchEvent(new CustomEvent('ctp:favorites-status', { detail: message }));
  }
  function check(result) { if (result.error) throw result.error; return result.data; }
  async function synchronize(epoch, uid) {
    ready = false;
    status('Sincronizando tus palas guardadas…');
    try {
      const remote = new Set();
      for (let start = 0; ; start += 1000) {
        const rows = check(await client.from('favorites').select('product_id').eq('user_id', uid)
          .order('product_id').range(start, start + 999));
        if (epoch !== generation) return;
        rows.forEach(row => remote.add(row.product_id));
        if (rows.length < 1000) break;
      }
      // Consume guest favorites only once the complete upload succeeds.
      const imported = [...guest];
      for (let i = 0; i < imported.length; i += 200) {
        check(await client.from('favorites').upsert(imported.slice(i, i + 200).map(product_id => ({
          user_id: uid, product_id
        })), { onConflict: 'user_id,product_id', ignoreDuplicates: true }));
        if (epoch !== generation) return;
      }
      imported.forEach(id => { remote.add(id); guest.delete(id); });
      const persisted = writeGuest();
      saved = remote;
      ready = true;
      emit();
      status(persisted ? 'Favoritos sincronizados con tu cuenta.' :
        'Favoritos sincronizados. El navegador no permite limpiar la copia local; podría importarse otra vez.');
    } catch {
      if (epoch !== generation) return;
      status('No se pudieron sincronizar los favoritos. Tu copia local se conserva. Pulsa Reintentar sincronización.');
    }
  }
  function setSession(nextClient, user) {
    client = nextClient;
    const nextId = user?.id || null;
    if (nextId === userId) return;
    userId = nextId;
    const epoch = ++generation;
    // Do not expose another account's favorites while loading or after sign-out.
    saved = nextId ? new Set() : new Set(guest);
    ready = !nextId;
    emit();
    if (nextId) queue = queue.then(() => epoch === generation && synchronize(epoch, nextId));
    else status('Tus favoritos sin sesión se guardan en este dispositivo.');
  }
  function toggle(id) {
    if (typeof id !== 'string' || !id) return Promise.resolve({ ok: false });
    if (!userId) {
      const was = guest.has(id);
      was ? guest.delete(id) : guest.add(id);
      saved = new Set(guest);
      const persisted = writeGuest();
      emit();
      return Promise.resolve({ ok: true, message: persisted ?
        (was ? 'Pala quitada de guardadas' : 'Pala guardada en este dispositivo. Accede o crea una cuenta para sincronizarla y recuperarla desde cualquier dispositivo.') :
        'Cambio guardado solo durante esta sesión: el navegador no permite almacenamiento' });
    }
    const epoch = generation, uid = userId;
    queue = queue.then(async () => {
      if (epoch !== generation) return { ok: false, message: 'La sesión ha cambiado. Vuelve a intentarlo.' };
      if (!ready) return { ok: false, message: 'Sincroniza tus favoritos desde Mi cuenta antes de cambiarlos.' };
      const was = saved.has(id);
      try {
        check(await (was ? client.from('favorites').delete().eq('user_id', uid).eq('product_id', id) :
          client.from('favorites').upsert({ user_id: uid, product_id: id }, { onConflict: 'user_id,product_id' })));
        if (epoch !== generation) return { ok: false, message: 'La sesión ha cambiado.' };
        was ? saved.delete(id) : saved.add(id);
        emit();
        return { ok: true, message: was ? 'Pala quitada de tu cuenta' : 'Pala guardada en tu cuenta' };
      } catch {
        return { ok: false, message: 'No se pudo guardar el cambio. Comprueba la conexión y vuelve a intentarlo.' };
      }
    });
    return queue;
  }
  window.CTPFavorites = {
    get: () => new Set(saved),
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    setSession, toggle,
    retry() {
      const epoch = generation, uid = userId;
      if (!uid) return Promise.resolve();
      queue = queue.then(() => epoch === generation && synchronize(epoch, uid));
      return queue;
    }
  };
  window.addEventListener('storage', event => {
    if (event.key !== KEY && event.key !== null) return;
    guest = readGuest();
    if (!userId) { saved = new Set(guest); emit(); }
  });
})();