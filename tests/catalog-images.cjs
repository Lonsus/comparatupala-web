const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const types = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.jpg':'image/jpeg', '.png':'image/png', '.webp':'image/webp', '.gif':'image/gif'};

(async () => {
  const server = http.createServer(async (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    try { res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream'); res.end(await fs.readFile(file)); }
    catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({headless:true, ...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : process.platform === 'win32' ? {channel:'msedge'} : {})});
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    // Keep this test independent of analytics, authentication and remote stores.
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    await page.goto(`http://127.0.0.1:${server.address().port}/#catalogo`);
    await page.waitForSelector('#products .card:not(.skeleton-card)');
    const reject = page.getByRole('button', {name:'Rechazar', exact:true});
    if (await reject.isVisible()) await reject.click();
    for (const width of [1440, 390]) {
      await page.setViewportSize({width, height:1000});
      for (const view of ['list','grid']) {
        await page.locator(`[data-catalog-view="${view}"]`).click();
        await page.waitForFunction(() => {
          const img = document.querySelector('#products .product-media img');
          return img?.complete && img.naturalWidth > 0;
        });
        const result = await page.evaluate(() => {
          const card = document.querySelector('#products .card');
          const href = card.querySelector('a[href^="#pala/"]').getAttribute('href');
          const product = state.products.find(p => p.id === decodeURIComponent(href.slice(6)));
          const img = card.querySelector('.product-media img');
          return { actual:img.getAttribute('src'), expected:product.image_url,
            fit:getComputedStyle(img).objectFit, overflow:document.documentElement.scrollWidth > innerWidth };
        });
        assert.equal(result.actual, result.expected, 'Price selection must not replace the master cover');
        assert.equal(result.fit, 'contain');
        assert.equal(result.overflow, false);
        if (process.env.SCREENSHOT_DIR) {
          await fs.mkdir(process.env.SCREENSHOT_DIR, {recursive:true});
          await page.locator('#products').scrollIntoViewIfNeeded();
          await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR, `catalog-${view}-${width}.png`)});
        }
      }
    }
    const checks = await page.evaluate(() => {
      const valid = state.products.find(p => p.image_url?.startsWith('images/')).image_url;
      const missing = 'images/products/test-missing-image.jpg';
      const urls = productImageUrls({image_url:missing, image_urls:[missing, valid], offers:[{image_url:valid}, {image_url:'images/products/loader.gif', image_source_url:'https://example.com/reload.gif'}]});
      const host = document.createElement('div'); host.id = 'image-regression';
      host.innerHTML = productImage({name:'Prueba de alternativa', image_url:missing, image_urls:[missing, valid]}, true);
      document.body.append(host); bindImageFallback(host);
      return {urls, missing, valid};
    });
    assert.deepEqual(checks.urls, [checks.missing, checks.valid]);
    await page.waitForFunction(valid => {
      const img = document.querySelector('#image-regression img');
      return img?.getAttribute('src') === valid && img.complete && img.naturalWidth > 0;
    }, checks.valid);
    await page.evaluate(() => {
      const host = document.getElementById('image-regression');
      host.innerHTML = productImage({name:'Sin foto', image_url:'images/products/test-missing-image.jpg'}, true);
      bindImageFallback(host);
    });
    await page.waitForSelector('#image-regression .is-missing');
    assert.equal(await page.locator('#image-regression img').count(), 0);
    assert.deepEqual(errors, []);
    console.log('PASS: real catalog covers, list/grid, desktop/mobile, no overflow, gallery fallback, missing images, loader exclusion, no JS errors');
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => {console.error(error); process.exitCode = 1;});
