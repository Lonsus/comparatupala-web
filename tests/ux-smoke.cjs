/* Run with Node and Playwright installed. No requests are sent to stores or GitHub. */
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const root = path.resolve(__dirname, '..');
const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg' };
const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = path.resolve(root, '.' + decodeURIComponent(pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  try { res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream'); res.end(await fs.readFile(file)); }
  catch { res.writeHead(404).end(); }
});

async function visible(page, selector) {
  await page.locator(selector).first().waitFor({ state:'visible' });
}
async function noOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({ content:document.documentElement.scrollWidth, viewport:document.documentElement.clientWidth }));
  assert.ok(dimensions.content <= dimensions.viewport + 1, `${label}: page overflows ${JSON.stringify(dimensions)}`);
}
async function check(page, predicate, label) {
  await page.waitForFunction(predicate, null, { timeout:5000 }).catch(() => { throw new Error(label); });
}
async function screenshot(page, name) {
  if (!process.env.UX_SCREENSHOTS) return;
  await fs.mkdir(process.env.UX_SCREENSHOTS, { recursive:true });
  await page.screenshot({ path:path.join(process.env.UX_SCREENSHOTS, name + '.png') });
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless:true, ...(process.env.BROWSER_CHANNEL ? { channel:process.env.BROWSER_CHANNEL } : {}) });
  const errors = [];
  try {
    for (const width of [320, 390, 540, 768, 1024, 1440, 1920]) {
      const context = await browser.newContext({ viewport:{ width, height:900 }, reducedMotion:'reduce' });
      // Keep the suite deterministic and offline beyond the local server.
      await context.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(base);
      await visible(page, '.card');
      await noOverflow(page, `catalog ${width}`);
      assert.equal(await page.locator('#filter-toggle').getAttribute('aria-expanded'), String(width > 800));
      assert.equal(await page.locator('#catalog-summary').evaluate(el => el.open), width > 800);
      assert.equal(await page.locator('.about-collapse-toggle').getAttribute('aria-expanded'), 'false');
      await screenshot(page, `catalog-${width}`);

      if (width > 800) await page.locator('#filter-toggle').click();
      assert.equal(await page.locator('#filter-content').isVisible(), false);
      await page.locator('#filter-toggle').focus();
      await page.keyboard.press('Enter');
      await visible(page, '#filter-content');
      await page.locator('#offer-count').fill('>=');
      await check(page, () => document.querySelector('#offer-count').getAttribute('aria-invalid') === 'true', 'invalid filter not announced');
      await page.locator('#filter-toggle').click();
      assert.equal(await page.locator('#filter-summary').textContent(), 'Revisa los filtros');
      await page.locator('[data-clear="offer-count"]').click();
      assert.equal(await page.locator('#results-title').evaluate(el => el === document.activeElement), true);
      await visible(page, '.card');
      await page.locator('#filter-toggle').click();
      await page.locator('#min-price').fill('500');
      await page.locator('#max-price').fill('100');
      await check(page, () => document.querySelector('#min-price').getAttribute('aria-invalid') === 'true', 'invalid range not detected');
      await page.locator('#reset').click();
      await page.locator('#search').fill('Adidas');
      await visible(page, '[data-clear="search"]');
      assert.ok((await page.locator('.card .brand').allTextContents()).every(text => /adidas/i.test(text)));
      await page.locator('[data-clear="search"]').click();
      await page.locator('#pagination button').last().click();
      assert.match(await page.locator('#pagination span').textContent(), /Página 2 de/);
      assert.equal(await page.locator('#results-title').evaluate(el => el === document.activeElement), true);

      await page.locator('.card [data-save]').first().click();
      assert.equal(await page.locator('#saved-count').textContent(), '1');
      const link = page.locator('.card h3 a').first();
      const href = await link.getAttribute('href');
      await link.scrollIntoViewIfNeeded();
      const listY = await page.evaluate(() => scrollY);
      await link.click();
      await visible(page, '.product-title');
      await noOverflow(page, `detail ${width}`);
      assert.equal(await page.locator('#offers-panel').evaluate(el => el.open), true);
      assert.equal(await page.locator('#history-panel').evaluate(el => el.open), false);
      assert.equal(await page.locator('#specs-panel').evaluate(el => el.open), width > 800);
      await screenshot(page, `detail-${width}`);
      await page.locator('[data-scroll="history-panel"]').click();
      assert.equal(await page.locator('#history-panel summary').first().evaluate(el => el === document.activeElement), true);
      await page.locator('[data-range="7"]').click();
      assert.equal(await page.locator('[data-range="7"]').getAttribute('aria-pressed'), 'true');
      await page.locator('#history-records summary').click();
      await visible(page, '#history-records .table-wrap');
      await noOverflow(page, `history ${width}`);
      await page.locator('#offers-panel [data-spec-offer]').last().click();
      assert.equal(await page.locator('#specs-panel').evaluate(el => el.open), true);
      assert.equal(await page.locator('#specs-panel > summary').evaluate(el => el === document.activeElement), true);
      assert.equal(await page.locator('#specs-panel > summary').evaluate(el => el.tabIndex), 0);
      assert.match(page.url(), /\?tienda=/);
      await page.locator('#store-tabs button').first().click();
      assert.equal(await page.locator('#store-tabs button').first().evaluate(el => el === document.activeElement), true);
      const comparison = page.locator('#comparison-panel .table-wrap');
      if (await comparison.count()) {
        await comparison.focus();
        const scrollable = await comparison.evaluate(el => el.scrollWidth > el.clientWidth);
        await page.keyboard.press('ArrowRight');
        if (scrollable) await check(page, () => document.querySelector('#comparison-panel .table-wrap').scrollLeft > 0, 'comparison cannot scroll with keyboard');
      }

      await page.locator('.breadcrumb > a').click();
      await visible(page, '.card');
      await check(page, () => document.activeElement.matches('.card h3 a'), 'return focus lost');
      assert.equal(await page.evaluate(() => document.activeElement.getAttribute('href')), href);
      assert.ok(Math.abs(await page.evaluate(() => scrollY) - listY) < 4, 'return scroll lost');
      assert.match(await page.locator('#pagination span').textContent(), /Página 2 de/);
      await page.locator('.card h3 a').first().click();
      await visible(page, '.product-title');
      await page.goBack();
      await check(page, () => document.activeElement.matches('.card h3 a'), 'browser Back loses catalog focus');

      await page.locator('#nav-saved').click();
      await check(page, () => document.querySelector('#results-title').textContent === 'Tus palas guardadas', 'saved route not rendered');
      assert.equal(await page.locator('.card').count(), 1);
      assert.equal(await page.locator('.intro').isVisible(), false);
      await page.reload();
      await visible(page, '.card');
      assert.equal(await page.locator('.card').count(), 1);
      await page.locator('.card [data-save]').click();
      await visible(page, '.empty a[href="#catalogo"]');
      assert.equal(await page.locator('#results-title').evaluate(el => el === document.activeElement), true);

      await page.locator('footer a[href="#contacto"]').click();
      await visible(page, '#contacto');
      assert.equal(await page.locator('.about-collapse-toggle').getAttribute('aria-expanded'), 'true');
      assert.equal(await page.locator('#nav-about').getAttribute('aria-current'), 'page');
      await noOverflow(page, `about ${width}`);
      await page.locator('.about-legal-toggle').click();
      await visible(page, '.about-legal-content');
      await noOverflow(page, `legal ${width}`);
      await page.locator('#nav-catalog').click();
      await check(page, () => document.activeElement.id === 'results-title', 'catalog navigation from about loses destination');
      await page.locator('footer').scrollIntoViewIfNeeded();
      await page.locator('#nav-catalog').click();
      await check(page, () => document.activeElement.id === 'results-title', 'reselecting catalog loses destination');

      await page.locator('.contact-fab').click();
      await visible(page, '#contact-dialog');
      assert.equal(await page.locator('#contact-close').evaluate(el => el === document.activeElement), true);
      assert.equal(await page.locator('#private-contact-form input').first().isEnabled(), false);
      assert.equal(await page.locator('#private-contact-form input').first().isVisible(), false);
      await page.locator('#contact-tab-contact').click();
      await page.locator('#contact-tab-contact').click();
      assert.equal(await page.locator('#contact-pane-contact').isVisible(), true);
      await page.keyboard.press('End');
      assert.equal(await page.locator('#contact-tab-newsletter').getAttribute('aria-selected'), 'true');
      assert.equal(await page.locator('#newsletter-form input[type="checkbox"]').isVisible(), false);
      await screenshot(page, `contact-${width}`);
      await noOverflow(page, `contact ${width}`);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#contact-dialog').isVisible(), false);
      assert.equal(await page.locator('.contact-fab').evaluate(el => el === document.activeElement), true);
      assert.equal(await page.locator('body').evaluate(el => el.classList.contains('contact-open')), false);
      await page.goto(base + '/#contacto');
      await visible(page, '#contacto');
      assert.equal(await page.locator('.about-collapse-toggle').getAttribute('aria-expanded'), 'true');
      assert.equal(await page.locator('#saved-count').textContent(), '0');
      await context.close();
      console.log(`PASS ${width}px: catalog, filters, detail, history, return position, saved, about and contact`);
    }

    const page = await browser.newPage({ viewport:{ width:844, height:390 }, reducedMotion:'reduce' });
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
    await page.goto(base);
    await visible(page, '.card');
    await page.locator('.contact-fab').click();
    await visible(page, '#contact-dialog');
    const closeBox = await page.locator('#contact-close').boundingBox();
    assert.ok(closeBox.y >= 0 && closeBox.y + closeBox.height <= 390, 'close button inaccessible in landscape');
    await page.locator('.contact-panel-body').evaluate(el => el.scrollTop = el.scrollHeight);
    await noOverflow(page, 'landscape contact');
    await screenshot(page, 'contact-landscape');
    await page.keyboard.press('Escape');
    console.log('PASS 844×390 landscape dialog');
    await page.route('**/data/products.json', route => route.fulfill({ json:[] }));
    await page.goto(base);
    await visible(page, '.empty');
    await page.locator('#nav-saved').click();
    await visible(page, '.empty a[href="#catalogo"]');
    assert.equal(await page.locator('#nav-saved').getAttribute('aria-current'), 'page');
    await page.unroute('**/data/products.json');
    await page.route('**/data/products.json', route => route.fulfill({ status:503, body:'Unavailable' }));
    await page.reload();
    await visible(page, '.empty button');
    assert.match(await page.locator('.empty h3').textContent(), /No pudimos cargar/);
    assert.equal(await page.locator('#products').getAttribute('aria-busy'), 'false');
    assert.deepEqual(errors, []);
    console.log('PASS empty catalog and loading error; no application JavaScript errors');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
