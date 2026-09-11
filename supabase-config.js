'use strict';
// Public frontend settings only. See docs/supabase-setup.md before enabling.
window.COMPARATUPALA_SUPABASE = window.COMPARATUPALA_SUPABASE || {
  url: 'https://tmvyidpxvlsimttcdckr.supabase.co',
  publishableKey: 'sb_publishable_XRUcPQGeU-0UPRMSSCODBg_5IQ2Fx1n'
};

window.comparatupalaSupabaseReady = (async () => {
  const { url, publishableKey } = window.COMPARATUPALA_SUPABASE;
  window.supabaseClient = null;
  if (!url || !publishableKey || /YOUR_|XXXXX/.test(url + publishableKey)) return null;
  // Accept only the new public key format; never a secret key or legacy JWT.
  if (!/^https:\/\/[^/]+\/?$/.test(url) || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey)) {
    console.warn('Configuración pública de Supabase no válida. Se mantiene el modo local.');
    return null;
  }
  try {
    if (!window.supabase?.createClient) await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const timer = setTimeout(() => reject(new Error('SDK timeout')), 10000);
      script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/dist/umd/supabase.js';
      script.async = true;
      script.onload = () => { clearTimeout(timer); resolve(); };
      script.onerror = () => { clearTimeout(timer); reject(new Error('SDK unavailable')); };
      document.head.append(script);
    });
    window.supabaseClient = window.supabase.createClient(url, publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    return window.supabaseClient;
  } catch {
    console.warn('Supabase no está disponible. Se mantiene el modo local.');
    return null;
  }
})();
