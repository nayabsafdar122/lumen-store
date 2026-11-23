import {
  state, store, on, emit, hooks, api, errText, $, $$, esc, money, initials, stars, priceHtml, pct, badges, HEART,
  toast, openModal, closeModal, busy, refreshCart, refreshWishlist, addToCart, setQty, toggleWishlist, parseHash, debounce,
} from './core.js';

import home from './pages/home.js';
import shop from './pages/shop.js';
import product from './pages/product.js';
import checkout from './pages/checkout.js';
import orders from './pages/orders.js';
import wishlist from './pages/wishlist.js';
import account from './pages/account.js';
import feedback from './pages/feedback.js';
import admin from './pages/admin.js';

const app = $('#app');

// ---------- Auth ----------
async function loadMe() {
  if (!state.token) return;
  try { state.user = (await api('/auth/me')).user; } catch { state.user = null; state.token = null; store.set('token', null); }
}
function setSession({ token, user }) {
  state.token = token; state.user = user; store.set('token', token);
  renderAccount(); refreshCart(); refreshWishlist();
}
function logout(silent) {
  state.token = null; state.user = null; store.set('token', null);
  renderAccount(); refreshCart(); refreshWishlist();
  if (!silent) toast('You have been signed out');
  const { path } = parseHash();
  if (['/orders', '/admin', '/checkout', '/account', '/wishlist'].some((p) => path.startsWith(p))) location.hash = '#/';
}
on('expired', () => { if (state.user) { logout(true); toast('Your session expired — please sign in again', { type: 'error' }); } });

function renderAccount() {
  const slot = $('#account-slot');
  if (!state.user) {
    slot.innerHTML = `<button class="btn btn-ghost btn-sm" id="signin-btn" style="margin:0 4px">Sign in</button>`;
    $('#signin-btn').onclick = () => openAuth();
    return;
  }
  const u = state.user;
  slot.innerHTML = `
    <div class="account">
      <button class="avatar" id="avatar-btn" aria-label="Account menu" aria-haspopup="true">${esc(initials(u.name))}</button>
      <div class="menu" id="account-menu" hidden>
        <div class="menu-head"><strong>${esc(u.name)}</strong><span>${esc(u.email)}${u.role === 'admin' ? ' · Admin' : ''}</span></div>
        <a href="#/account">👤 My account</a>
        <a href="#/orders">📦 Orders</a>
        <a href="#/wishlist">♡ Wishlist</a>
        ${u.role === 'admin' ? '<hr><a href="#/admin">📊 Admin dashboard</a>' : ''}
        <hr><button id="logout-btn">↪ Sign out</button>
      </div>
    </div>`;
  const menu = $('#account-menu');
  $('#avatar-btn').onclick = (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; };
  menu.onclick = () => (menu.hidden = true);
  $('#logout-btn').onclick = () => logout();
}

function openAuth(mode = 'login', after) {
  const render = () => {
    const m = openModal(`
      <h2>${mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
      <p class="sub">${mode === 'login' ? 'Sign in to check out, save favourites and track orders.' : 'Join Lumen — it takes 10 seconds.'}</p>
      <div class="seg"><button data-m="login" class="${mode === 'login' ? 'active' : ''}">Sign in</button><button data-m="register" class="${mode === 'register' ? 'active' : ''}">Register</button></div>
      <form id="auth-form" novalidate>
        <div id="auth-error"></div>
        ${mode === 'register' ? '<div class="field"><label for="a-name">Full name</label><input class="input" id="a-name" name="name" required autocomplete="name"></div>' : ''}
        <div class="field"><label for="a-email">Email</label><input class="input" id="a-email" name="email" type="email" required autocomplete="email"></div>
        <div class="field"><label for="a-pass">Password</label><input class="input" id="a-pass" name="password" type="password" required autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}">${mode === 'register' ? '<span class="hint">At least 8 characters</span>' : ''}</div>
        <button class="btn btn-primary btn-block btn-lg" type="submit">${mode === 'login' ? 'Sign in' : 'Create account'}</button>
      </form>
      ${mode === 'login' ? `<div class="demo-box">Try a demo account: <button class="chip" data-demo="customer">Customer</button><button class="chip" data-demo="admin">Admin</button></div>` : ''}
    `);
    $$('[data-m]', m).forEach((b) => (b.onclick = () => { mode = b.dataset.m; render(); }));
    $$('[data-demo]', m).forEach((b) => (b.onclick = () => {
      const f = $('#auth-form');
      f.email.value = b.dataset.demo === 'admin' ? 'admin@example.com' : 'customer@example.com';
      f.password.value = b.dataset.demo === 'admin' ? 'admin12345' : 'customer123';
      f.requestSubmit();
    }));
    $('#auth-form').onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target; const btn = f.querySelector('[type=submit]');
      busy(btn);
      try {
        const body = { email: f.email.value, password: f.password.value };
        if (mode === 'register') body.name = f.elements['name'].value;
        const data = await api(`/auth/${mode}`, { method: 'POST', body });
        setSession(data); closeModal();
        toast(`${mode === 'login' ? 'Welcome back' : 'Welcome'}, ${data.user.name.split(' ')[0]} 👋`);
        if (after) after(); else route();
      } catch (err) {
        $('#auth-error').innerHTML = `<div class="form-error">${esc(errText(err))}</div>`;
        busy(btn, false);
      }
    };
  };
  render();
}

// ---------- Sheets (cart & mobile menu) ----------
function openSheet(id) {
  $$('.sheet.open').forEach((s) => s.classList.remove('open'));
  $(`#${id}`).classList.add('open');
  $(`#${id}`).setAttribute('aria-hidden', 'false');
  $('#scrim').hidden = false;
  document.body.style.overflow = 'hidden';
}
function closeSheets() {
  $$('.sheet').forEach((s) => { s.classList.remove('open'); s.setAttribute('aria-hidden', 'true'); });
  $('.filters.open')?.classList.remove('open');
  $('#scrim').hidden = true;
  document.body.style.overflow = '';
}
function openCart() {
  if (!state.user) return openAuth('login', openCart);
  renderCart();
  openSheet('cart-sheet');
}

function shipMeter(c) {
  const left = c.freeShippingThresholdCents - c.subtotalCents;
  const p = Math.min(100, (c.subtotalCents / c.freeShippingThresholdCents) * 100);
  return `<div class="ship-meter">${left > 0 ? `You're <strong>${money(left)}</strong> away from <strong>free shipping</strong> 🚚` : '🎉 You’ve unlocked <strong>free shipping</strong>!'}<div class="track"><div class="fill" style="width:${p}%"></div></div></div>`;
}
export function cartLine(i) {
  return `
    <div class="line">
      <a href="#/product/${i.productId}" class="line-img"><img src="${esc(i.imageUrl || '')}" alt=""></a>
      <div>
        <a href="#/product/${i.productId}" class="line-title">${esc(i.name)}</a>
        <div class="line-sub">${esc(i.brand || '')}${i.brand ? ' · ' : ''}${money(i.unitPriceCents)}${i.available ? '' : ' · <span style="color:var(--bad)">Not enough stock</span>'}</div>
        <div class="qty sm">
          <button data-qty="${i.productId}" data-v="${i.quantity - 1}" aria-label="Decrease quantity">−</button>
          <span>${i.quantity}</span>
          <button data-qty="${i.productId}" data-v="${i.quantity + 1}" ${i.quantity >= i.stock ? 'disabled' : ''} aria-label="Increase quantity">+</button>
        </div>
      </div>
      <div class="line-right"><strong>${money(i.lineTotalCents)}</strong><button class="remove" data-qty="${i.productId}" data-v="0">Remove</button></div>
    </div>`;
}
function renderCart() {
  const c = state.cart;
  $('#cart-head-count').textContent = c.itemCount ? `(${c.itemCount})` : '';
  if (!c.items.length) {
    $('#cart-body').innerHTML = `<div class="empty"><div class="empty-icon">🛍️</div><h3>Your bag is empty</h3><p>Discover something you’ll love.</p></div>`;
    $('#cart-foot').innerHTML = `<a href="#/shop" class="btn btn-primary btn-block" data-close-sheet>Start shopping</a>`;
    return;
  }
  $('#cart-body').innerHTML = shipMeter(c) + c.items.map(cartLine).join('');
  $('#cart-foot').innerHTML = `
    <div class="sum"><span>Subtotal</span><span>${money(c.subtotalCents)}</span></div>
    <div class="sum"><span>Shipping</span><span>${c.shippingCents ? money(c.shippingCents) : 'Free'}</span></div>
    <div class="sum total"><span>Total</span><span>${money(c.totalCents)}</span></div>
    <a href="#/checkout" class="btn btn-accent btn-block btn-lg" data-close-sheet>Checkout securely →</a>
    <p class="hint" style="text-align:center;margin:10px 0 0">Have a promo code? Add it at checkout.</p>`;
}

// ---------- Quick view ----------
async function quickView(id) {
  const m = openModal('<div class="skel" style="height:420px;border-radius:26px"></div>', 'xl');
  try {
    const p = (await api(`/products/${id}`)).data;
    const fav = state.wishlist.has(p.id);
    m.innerHTML = `
      <button class="icon-btn modal-close" data-close-modal aria-label="Close">✕</button>
      <div class="quickview">
        <div class="qv-media" style="position:relative">${badges(p)}<img src="${esc(p.imageUrl || '')}" alt="${esc(p.name)}"></div>
        <div class="qv-info">
          <span class="card-brand">${esc(p.brand || p.subcategory || '')}</span>
          <h2>${esc(p.name)}</h2>
          <div class="pdp-rating">${stars(p.ratingAvg, 15)} <span>${(+p.ratingAvg).toFixed(1)} · ${p.ratingCount} reviews</span></div>
          <div class="pdp-price">${priceHtml(p)}${pct(p) ? `<span class="save">Save ${money(p.compareAtPriceCents - p.priceCents)}</span>` : ''}</div>
          <p class="pdp-desc" style="margin:10px 0 18px">${esc(p.description)}</p>
          <span class="stock-line ${p.stock === 0 ? 'stock-out' : p.stock <= 10 ? 'stock-low' : 'stock-ok'}">${p.stock === 0 ? 'Sold out' : p.stock <= 10 ? `Only ${p.stock} left` : 'In stock'}</span>
          <div class="buy-row" style="margin-top:auto;padding-top:22px">
            <button class="btn btn-accent btn-lg" id="qv-add" ${p.stock === 0 ? 'disabled' : ''}>Add to bag</button>
            <button class="fav-lg ${fav ? 'on' : ''}" data-fav="${p.id}" aria-label="Wishlist">${HEART}</button>
          </div>
          <a href="#/product/${p.id}" class="link" style="margin-top:16px" data-close-modal>View full details →</a>
        </div>
      </div>`;
    $('#qv-add').onclick = async (e) => { busy(e.currentTarget); if (await addToCart(p.id, 1, p)) closeModal(); else busy(e.currentTarget, false); };
  } catch (e) { m.innerHTML = `<div class="empty"><h3>Couldn't load product</h3><p>${esc(e.message)}</p></div>`; }
}

// ---------- Header: categories, search, promo ----------
function renderCatNav() {
  const { path, params } = parseHash();
  const cur = path === '/shop' ? params.get('category') || (params.get('sale') ? '__sale' : '__all') : '';
  $('#catnav').innerHTML = [
    `<a href="#/shop" class="${cur === '__all' ? 'active' : ''}">All products</a>`,
    ...state.categories.map((c) => `<a href="#/shop?category=${c.slug}" class="${cur === c.slug ? 'active' : ''}">${esc(c.name)}</a>`),
    `<a href="#/shop?sale=1&sort=discount" class="deal ${cur === '__sale' ? 'active' : ''}">🔥 Deals</a>`,
  ].join('');
  $('#footer-cats').innerHTML = state.categories.map((c) => `<a href="#/shop?category=${c.slug}">${esc(c.name)}</a>`).join('');
  $('#menu-body').innerHTML = `<div class="menu-links">
    <a href="#/">Home <span>→</span></a><a href="#/shop">All products <span>→</span></a>
    ${state.categories.map((c) => `<a href="#/shop?category=${c.slug}">${esc(c.name)} <span class="muted">${c.productCount}</span></a>`).join('')}
    <a href="#/shop?sale=1&sort=discount" style="color:var(--accent)">🔥 Deals <span>→</span></a>
    <a href="#/wishlist">Wishlist <span>→</span></a><a href="#/orders">Orders <span>→</span></a><a href="#/feedback">Contact & feedback <span>→</span></a>
  </div><button class="btn btn-ghost btn-block" id="menu-theme" style="margin-top:14px">Toggle dark mode</button>`;
  $('#menu-theme').onclick = toggleTheme;
}

function initSearch() {
  const input = $('#search-input'); const box = $('#suggest');
  let items = []; let active = -1;
  const show = (html) => { box.innerHTML = html; box.hidden = !html; };
  const fetchSuggest = debounce(async (q) => {
    if (q.length < 2) return show('');
    try {
      items = (await api(`/products/suggest?q=${encodeURIComponent(q)}`)).data; active = -1;
      show(items.length
        ? items.map((p, i) => `<a href="#/product/${p.id}" data-i="${i}"><img src="${esc(p.imageUrl || '')}" alt=""><span><span class="s-name">${esc(p.name)}</span><br><span class="s-brand">${esc(p.brand || '')}</span></span><strong>${money(p.priceCents)}</strong></a>`).join('') + `<a href="#/shop?q=${encodeURIComponent(q)}" class="s-all">See all results for “${esc(q)}”</a>`
        : `<a href="#/shop?q=${encodeURIComponent(q)}" class="s-all">No quick matches — search all for “${esc(q)}”</a>`);
    } catch { show(''); }
  }, 180);
  input.addEventListener('input', () => fetchSuggest(input.value.trim()));
  input.addEventListener('keydown', (e) => {
    const links = $$('a[data-i]', box);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + links.length) % Math.max(links.length, 1);
      links.forEach((l, i) => l.classList.toggle('active', i === active));
    } else if (e.key === 'Enter' && active >= 0 && links[active]) { e.preventDefault(); location.hash = links[active].getAttribute('href'); }
    else if (e.key === 'Escape') { show(''); input.blur(); }
  });
  $('#search-form').onsubmit = (e) => { e.preventDefault(); const q = input.value.trim(); show(''); location.hash = `#/shop${q ? `?q=${encodeURIComponent(q)}` : ''}`; input.blur(); };
  box.addEventListener('click', () => { show(''); });
  document.addEventListener('click', (e) => { if (!e.target.closest('#search-form')) show(''); });
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !e.target.closest('input, textarea, select')) { e.preventDefault(); input.focus(); }
  });
}

async function initPromo() {
  let msgs = ['Free shipping on orders over <b>$50</b>', 'Easy cancellations on any pending order'];
  try {
    const { data } = await api('/coupons/public');
    msgs = [...data.map((c) => `${esc(c.description || '')} — use code <b>${esc(c.code)}</b>`), ...msgs];
  } catch { /* ignore */ }
  const track = $('#promo-track');
  track.innerHTML = msgs.map((m) => `<span>${m}</span>`).join('');
  let i = 0;
  setInterval(() => { i = (i + 1) % msgs.length; track.style.transform = `translateY(-${i * 20}px)`; }, 4000);
}

function toggleTheme() {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem('theme', next); } catch { /* ignore */ }
}

// ---------- Badges ----------
function bumpEl(el) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
on('cart', (opts) => {
  const c = $('#cart-count');
  c.textContent = state.cart.itemCount; c.hidden = !state.cart.itemCount;
  if (opts?.bump) bumpEl(c);
  if ($('#cart-sheet').classList.contains('open')) renderCart();
});
on('wishlist', (opts) => {
  const c = $('#wish-count');
  c.textContent = state.wishlist.size; c.hidden = !state.wishlist.size;
  if (opts?.bump) bumpEl(c);
  $$('[data-fav]').forEach((b) => {
    const onNow = state.wishlist.has(+b.dataset.fav);
    b.classList.toggle('on', onNow); b.setAttribute('aria-pressed', onNow);
  });
});

// ---------- Global event delegation ----------
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-add],[data-fav],[data-quick],[data-qty],[data-open-cart],[data-close-sheet],[data-close-modal]');
  if (!t) { if (!e.target.closest('#account-menu, #avatar-btn')) { const m = $('#account-menu'); if (m) m.hidden = true; } return; }
  if (t.dataset.add) { e.preventDefault(); const card = t.closest('.card'); addToCart(+t.dataset.add, 1, { imageUrl: card?.querySelector('img')?.src }); }
  else if (t.dataset.fav) { e.preventDefault(); toggleWishlist(+t.dataset.fav); }
  else if (t.dataset.quick) { e.preventDefault(); quickView(+t.dataset.quick); }
  else if (t.dataset.qty) { e.preventDefault(); setQty(+t.dataset.qty, +t.dataset.v); }
  else if ('openCart' in t.dataset) { e.preventDefault(); openCart(); }
  else if ('closeSheet' in t.dataset) closeSheets();
  else if ('closeModal' in t.dataset) closeModal();
});
$('#modal').addEventListener('mousedown', (e) => { if (e.target.id === 'modal') closeModal(); });
$('#scrim').onclick = closeSheets;
$('#cart-btn').onclick = openCart;
$('#menu-btn').onclick = () => openSheet('menu-sheet');
$('#theme-btn').onclick = toggleTheme;
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeModal(); closeSheets(); } });

// Broken image → friendly placeholder (inline onerror handlers are blocked by the security policy).
document.addEventListener('error', (e) => {
  const img = e.target;
  if (img.tagName !== 'IMG' || img.dataset.failed) return;
  img.dataset.failed = '1';
  img.src = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#ece6dc"/><path d="M30 66l14-18 10 12 8-9 12 15z" fill="#c9bfb1"/><circle cx="62" cy="38" r="6" fill="#c9bfb1"/></svg>');
}, true);

// Footer newsletter
$('#footer-newsletter').onsubmit = async (e) => {
  e.preventDefault();
  const input = e.target.querySelector('input');
  try {
    const { data } = await api('/newsletter', { method: 'POST', body: { email: input.value } });
    toast(data.alreadySubscribed ? 'You’re already subscribed 💌' : 'Subscribed! Watch your inbox for deals 💌');
    input.value = '';
  } catch (err) { toast(errText(err), { type: 'error' }); }
};
$('#year').textContent = new Date().getFullYear();

// Back to top
const toTop = $('#to-top');
window.addEventListener('scroll', () => { toTop.hidden = window.scrollY < 700; }, { passive: true });
toTop.onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });

// ---------- Router ----------
const ROUTES = [
  [/^\/$/, home],
  [/^\/shop$/, shop],
  [/^\/product\/(\d+)$/, product],
  [/^\/checkout$/, checkout],
  [/^\/orders(?:\/(\d+))?$/, orders],
  [/^\/wishlist$/, wishlist],
  [/^\/account$/, account],
  [/^\/feedback$/, feedback],
  [/^\/admin(?:\/(\w+))?$/, admin],
];
let lastPath = null;
async function route() {
  const { path, params } = parseHash();
  closeSheets();
  renderCatNav();
  $('#search-input').value = path === '/shop' ? params.get('q') || '' : '';
  const match = ROUTES.find(([re]) => re.test(path));
  if (!match) { app.innerHTML = `<div class="empty"><div class="empty-icon">🧭</div><h3>Page not found</h3><p>The page you’re looking for doesn’t exist.</p><a class="btn btn-primary" href="#/">Go home</a></div>`; return; }
  const [re, page] = match;
  const args = path.match(re).slice(1);
  // Only jump to the top when the page itself changes (not when a filter changes).
  if (path !== lastPath) window.scrollTo(0, 0);
  lastPath = path;
  try {
    await page({ app, params, args, route });
  } catch (e) {
    console.error(e);
    app.innerHTML = `<div class="empty"><div class="empty-icon">⚠️</div><h3>Something went wrong</h3><p>${esc(e.message)}</p><a class="btn btn-primary" href="#/">Back home</a></div>`;
  }
}
window.addEventListener('hashchange', route);

Object.assign(hooks, { openAuth, openCart, quickView, route });

// ---------- Boot ----------
(async () => {
  await loadMe();
  renderAccount();
  try { state.categories = (await api('/categories')).data.filter((c) => c.productCount > 0); } catch { /* ignore */ }
  await Promise.all([refreshCart(), refreshWishlist()]);
  initSearch();
  initPromo();
  route();
})();
