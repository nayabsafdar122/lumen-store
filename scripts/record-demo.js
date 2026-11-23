// Records a short guided tour of the live store with Playwright.
// Usage: SITE_URL=https://... node scripts/record-demo.js   (writes media/raw/*.webm)
const { chromium } = require('playwright');

const SITE = process.env.SITE_URL || 'https://lumen-store-wheat.vercel.app';
const W = 1440;
const H = 900;

// Headless browsers don't draw a mouse pointer, so we inject a visible one.
const CURSOR = `
  (() => {
    if (window.__cursor) return;
    const c = document.createElement('div');
    c.id = '__cursor';
    c.style.cssText = 'position:fixed;z-index:2147483647;left:0;top:0;width:22px;height:22px;pointer-events:none;transition:transform .05s linear;';
    c.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M3 2l7 19 2.6-7.4L20 11z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    const ring = document.createElement('div');
    ring.style.cssText = 'position:fixed;z-index:2147483646;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;background:rgba(232,100,59,.35);pointer-events:none;opacity:0;transition:opacity .25s, transform .25s;transform:scale(.4)';
    const add = () => { document.body.appendChild(c); document.body.appendChild(ring); };
    document.body ? add() : document.addEventListener('DOMContentLoaded', add);
    document.addEventListener('mousemove', (e) => { c.style.transform = 'translate(' + e.clientX + 'px,' + e.clientY + 'px)'; ring.style.left = e.clientX + 'px'; ring.style.top = e.clientY + 'px'; }, true);
    document.addEventListener('mousedown', () => { ring.style.opacity = '1'; ring.style.transform = 'scale(1)'; setTimeout(() => { ring.style.opacity = '0'; ring.style.transform = 'scale(.4)'; }, 250); }, true);
    window.__cursor = true;
  })();`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const ctx = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 1,
    colorScheme: 'light',
    recordVideo: { dir: 'media/raw', size: { width: W, height: H } },
  });
  await ctx.addInitScript(CURSOR);
  const page = await ctx.newPage();
  let mx = W / 2;
  let my = H / 2;

  const moveTo = async (locator) => {
    const el = page.locator(locator).first();
    await el.scrollIntoViewIfNeeded();
    const b = await el.boundingBox();
    const x = b.x + b.width / 2;
    const y = b.y + b.height / 2;
    await page.mouse.move(x, y, { steps: 18 });
    mx = x; my = y;
    await sleep(250);
  };
  const click = async (locator, pause = 900) => { await moveTo(locator); await page.mouse.down(); await page.mouse.up(); await sleep(pause); };
  const type = async (locator, text) => { await click(locator, 200); await page.keyboard.type(text, { delay: 55 }); await sleep(300); };
  const smoothScroll = async (dy, steps = 25) => { for (let i = 0; i < steps; i++) { await page.mouse.wheel(0, dy / steps); await sleep(28); } await sleep(500); };

  // Warm up (first request seeds the database) without recording a blank screen for long.
  await fetch(`${SITE}/api/products?limit=1`).catch(() => {});

  // 1. Home page
  await page.goto(SITE, { waitUntil: 'networkidle' });
  await page.waitForSelector('#deals .card img');
  await page.mouse.move(mx, my);
  await sleep(2600);
  await smoothScroll(700);
  await sleep(900);
  await smoothScroll(900);
  await sleep(800);
  await smoothScroll(900);
  await sleep(700);

  // 2. Search with live suggestions
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await sleep(800);
  await type('#search-input', 'iphone');
  await page.waitForSelector('#suggest a[data-i]');
  await sleep(1400);
  await page.keyboard.press('Escape');

  // 3. Shop with filters
  await click('#catnav a[href*="electronics"]', 1500);
  await page.waitForSelector('#results .card img');
  await click('[data-rating="3"]', 1300);
  await page.selectOption('#sort', 'price_desc');
  await sleep(1300);
  if ((await page.locator('#results .card').count()) < 2) { await page.goto(`${SITE}/#/shop?category=electronics`); await sleep(1200); }
  await page.waitForSelector('#results .card');
  await smoothScroll(500);

  // 4. Quick view
  await page.hover('#results .card >> nth=0');
  await sleep(400);
  await click('#results .card >> nth=0 >> [data-quick]', 1800);
  await click('[data-close-modal]', 600);

  // 5. Product page: gallery, reviews
  await click('#results .card >> nth=0 >> .card-title', 1800);
  await page.waitForSelector('.pdp-info h1');
  await sleep(800);
  if (await page.locator('.gallery-thumbs button').count() > 1) {
    await click('.gallery-thumbs button >> nth=1', 900);
    await click('.gallery-thumbs button >> nth=2', 900);
  }
  await moveTo('#gallery-main');
  await sleep(1200);
  await click('[data-tab="reviews"]', 1600);
  await smoothScroll(500);
  await sleep(1200);

  // 6. Sign in (demo customer) and add to bag
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await sleep(700);
  await click('#signin-btn', 900);
  await click('[data-demo="customer"]', 1600);
  await click('#add', 1400);
  await click('#cart-btn', 1800);

  // 7. Checkout with a coupon
  await click('#cart-foot a.btn-accent', 1500);
  await page.waitForSelector('#ck-form');
  const fill = async (sel, v) => { if (!(await page.inputValue(sel))) await type(sel, v); };
  await fill('#ck-l1', '221B Market Street');
  await fill('#ck-city', 'San Francisco');
  await fill('#ck-zip', '94103');
  await click('[data-try="WELCOME10"]', 1600);
  await click('#place', 3200); // confetti!
  const orderId = await page.evaluate(() => (location.hash.match(/orders\/(\d+)/) || [])[1] || document.querySelector('.success strong')?.textContent);
  await click('text=Track your order', 2200);

  // 8. Admin dashboard
  await click('#avatar-btn', 700);
  await click('#logout-btn', 900);
  await click('#signin-btn', 800);
  await click('[data-demo="admin"]', 1500);
  await page.goto(`${SITE}/#/admin`);
  await page.waitForSelector('.chart');
  await page.mouse.move(mx, my);
  await sleep(2600);
  await smoothScroll(500);
  await sleep(1000);
  await click('#adm-nav a[href="#/admin/products"]', 1800);
  await click('#adm-nav a[href="#/admin/feedback"]', 1800);

  // 9. Dark mode finale
  await page.goto(`${SITE}/#/`);
  await page.waitForSelector('#deals .card img');
  await page.mouse.move(mx, my);
  await click('#theme-btn', 2600);

  // Clean up: cancel the demo order so the live store isn't left with test data.
  await page.evaluate(async () => {
    const token = JSON.parse(localStorage.getItem('token') || 'null');
    const h = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
    const { data } = await fetch('/api/orders?status=pending&limit=5', { headers: h }).then((r) => r.json());
    const mine = data.find((o) => o.shippingAddress?.line1 === '221B Market Street');
    if (mine) await fetch(`/api/orders/${mine.id}/cancel`, { method: 'POST', headers: h });
  }).catch(() => {});

  await ctx.close();
  await browser.close();
  console.log('Recorded tour. Order used in demo:', orderId);
})().catch((e) => { console.error(e); process.exit(1); });
