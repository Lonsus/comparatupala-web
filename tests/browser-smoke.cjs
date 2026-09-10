const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp' };

// Contract fake: exercises the real account forms and integration without credentials.
function installFake({ initialSession = false } = {}) {
  window.COMPARATUPALA_SUPABASE = { url: 'https://example.supabase.co', publishableKey: 'sb_publishable_test' };
  const accounts = { A: { id: 'A', email: 'a@example.test' }, B: { id: 'B', email: 'b@example.test' } };
  const remote = { A: [], B: [] }, profiles = {};
  const control = window.testSupabase = { fail: false, confirmed: false, remote, profiles };
  let session = initialSession ? { user: accounts.A } : null, callback = () => {};
  window.supabase = { createClient: () => ({
    auth: {
      getSession: async () => ({ data: { session }, error: null }),
      onAuthStateChange(fn) { callback = fn; return { data: { subscription: { unsubscribe() {} } } }; },
      signUp: async () => ({ data: { session: null }, error: null }),
      async signInWithPassword({ email, password }) {
        if (password !== 'testpassword') return { error: Error('bad password') };
        session = { user: email === accounts.B.email ? accounts.B : accounts.A };
        callback('SIGNED_IN', session);
        return { data: { session }, error: null };
      },
      async signOut() { session = null; callback('SIGNED_OUT', null); return { error: null }; }
    },
    from(table) {
      let op = 'select', values, options, uid, product, start = 0, end = 999;
      const query = {
        select() { return query; },
        eq(k, v) { if (k === 'id' || k === 'user_id') uid = v; else product = v; return query; },
        order() { return query; }, range(a, b) { start = a; end = b; return query; }, single() { return query; },
        upsert(data, opts) { op = 'upsert'; values = Array.isArray(data) ? data : [data]; options = opts; return query; },
        delete() { op = 'delete'; return query; },
        async then(resolve) {
          if (control.fail) return resolve({ error: Error('network') });
          if (op === 'upsert') for (const row of values) {
            if (table === 'favorites') remote[row.user_id] = [...new Set([...remote[row.user_id], row.product_id])];
            else if (!profiles[row.id] || !options?.ignoreDuplicates) profiles[row.id] = { username: '', ...row };
          }
          if (op === 'delete') remote[uid] = remote[uid].filter(id => id !== product);
          const data = table === 'favorites' ? (remote[uid] || []).sort().slice(start, end + 1).map(product_id => ({ product_id })) :
            (profiles[uid || values?.[0].id] || { username: '' });
          return resolve({ data, error: null });
        }
      };
      return query;
    }
  }) };
}

(async () => {
  const server = http.createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
      if (!file.startsWith(root + path.sep)) throw Error('path');
      const content = await fs.readFile(file);
      response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
      response.end(content);
    } catch { response.writeHead(404); response.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
    const products = JSON.parse(await fs.readFile(path.join(root, 'data/products.json'), 'utf8'));
    const id = products[0].id;
    const context = await browser.newContext();
    const page = await context.newPage(), errors = [], requests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => requests.push(request.url()));
    await page.addInitScript(id => {
      window.COMPARATUPALA_SUPABASE = { url: '', publishableKey: '' };
      if (!localStorage.getItem('test-seeded')) {
        localStorage.setItem('comparatupala:saved', JSON.stringify([id]));
        localStorage.setItem('test-seeded', 'yes');
      }
    }, id);
    await page.goto(url + '#guardadas');
    await page.waitForFunction(() => document.querySelector('#products .card'));
    assert.equal(await page.locator('#saved-count').textContent(), '1');
    await page.locator('#products [data-save]').first().click();
    await page.waitForFunction(() => document.querySelector('#saved-count').textContent === '0');
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#products').getAttribute('aria-busy') === 'false');
    assert.equal(await page.locator('#saved-count').textContent(), '0');
    await page.locator('#nav-catalog').click();
    await page.locator('#products [data-save]').first().click();
    await page.waitForFunction(() => document.querySelector('#saved-count').textContent === '1');
    await page.locator('#products h3 a').first().click();
    await page.waitForSelector('#product-view .product-title');
    await page.locator('#account-open').click();
    assert.match(await page.locator('#account-status').textContent(), /sin registrarte/);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#account-dialog').isVisible(), false);
    assert.equal(requests.some(item => /supabase|jsdelivr/.test(new URL(item).hostname)), false);
    assert.deepEqual(errors, []);
    console.log('PASS unconfigured: real JSON catalog/detail, legacy favorites, remove/add/reload, no SDK request, accessible dialog');

    // A configured site with a blocked CDN must also remain usable.
    const blocked = await browser.newContext();
    await blocked.addInitScript(() => {
      window.COMPARATUPALA_SUPABASE = { url: 'https://example.supabase.co', publishableKey: 'sb_publishable_test' };
    });
    await blocked.route('https://cdn.jsdelivr.net/**', route => route.abort());
    const blockedPage = await blocked.newPage();
    await blockedPage.goto(url + '#catalogo');
    await blockedPage.waitForSelector('#products .card');
    await blockedPage.locator('#products [data-save]').first().click();
    await blockedPage.waitForFunction(() => document.querySelector('#saved-count').textContent === '1');
    await blockedPage.locator('#account-open').click();
    assert.match(await blockedPage.locator('#account-status').textContent(), /sin registrarte/);
    console.log('PASS unavailable CDN: catalog and local favorites remain usable');

    const authContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await authContext.addInitScript(installFake);
    await authContext.addInitScript(id => localStorage.setItem('comparatupala:saved', JSON.stringify([id])), id);
    const authPage = await authContext.newPage(), authErrors = [];
    authPage.on('pageerror', error => authErrors.push(error.message));
    await authPage.goto(url + '#guardadas');
    await authPage.waitForSelector('#products .card');
    await authPage.locator('#account-open').click();
    await authPage.locator('#account-auth-form [name=email]').fill('a@example.test');
    await authPage.locator('[name=password]').fill('testpassword');
    await authPage.locator('button[value=register]').click();
    await authPage.waitForFunction(() => document.querySelector('#account-status').textContent.includes('Revisa tu email'));
    await authPage.locator('[name=password]').fill('incorrect');
    await authPage.locator('button[value=login]').click();
    await authPage.waitForFunction(() => document.querySelector('#account-status').textContent.includes('No se pudo iniciar sesión'));
    await authPage.locator('[name=password]').fill('testpassword');
    await authPage.locator('button[value=login]').click();
    await authPage.waitForFunction(() => document.querySelector('#account-sync-status').textContent.includes('sincronizados'));
    assert.deepEqual(await authPage.evaluate(() => JSON.parse(localStorage.getItem('comparatupala:saved'))), []);
    assert.deepEqual(await authPage.evaluate(() => window.testSupabase.remote.A), [id]);
    await authPage.locator('[name=username]').fill('Mi perfil');
    await authPage.locator('#account-profile-form button').click();
    await authPage.waitForFunction(() => document.querySelector('#account-status').textContent === 'Perfil guardado.');
    assert.equal(await authPage.evaluate(() => window.testSupabase.profiles.A.username), 'Mi perfil');
    const box = await authPage.locator('#account-dialog').boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= 390);
    if (process.env.SCREENSHOT_DIR) {
      await fs.mkdir(process.env.SCREENSHOT_DIR, { recursive: true });
      await authPage.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, 'account-mobile.png') });
    }
    await authPage.keyboard.press('Escape');
    await authPage.evaluate(() => { window.testSupabase.fail = true; });
    await authPage.locator('#products [data-save]').first().click();
    await authPage.waitForFunction(() => document.querySelector('#toast').textContent.includes('No se pudo guardar'));
    assert.equal(await authPage.locator('#saved-count').textContent(), '1');
    await authPage.evaluate(() => { window.testSupabase.fail = false; });
    await authPage.locator('#products [data-save]').first().click();
    await authPage.waitForFunction(() => document.querySelector('#saved-count').textContent === '0');
    await authPage.locator('#account-open').click();
    await authPage.locator('#account-signout').click();
    await authPage.waitForFunction(() => !document.querySelector('#account-auth-form').hidden);
    await authPage.locator('#account-auth-form [name=email]').fill('b@example.test');
    await authPage.locator('[name=password]').fill('testpassword');
    await authPage.locator('button[value=login]').click();
    await authPage.waitForFunction(() => document.querySelector('#account-email-label').textContent === 'b@example.test');
    assert.equal(await authPage.locator('#saved-count').textContent(), '0');
    assert.deepEqual(authErrors, []);
    console.log('PASS simulated Supabase: signup confirmation, bad password, login/import, profile, network failure/retry, logout/account switch, mobile dialog');
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
