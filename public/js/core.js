// Shared state, API client and UI helpers used by every page.

// ---------- Storage ----------
export const store = {
  get(k, fallback = null) { try { const v = localStorage.getItem(k); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};

// ---------- State & events ----------
export const state = {
  token: store.get('token'),
  user: null,
  categories: [],
  cart: { items: [], itemCount: 0, subtotalCents: 0, totalCents: 0, shippingCents: 0, freeShippingThresholdCents: 5000 },
  wishlist: new Set(),
};
const listeners = {};
export const on = (evt, fn) => ((listeners[evt] ||= []).push(fn));
export const emit = (evt, data) => (listeners[evt] || []).forEach((fn) => fn(data));

// Functions provided by app.js (avoids circular imports).
export const hooks = { openAuth: () => {}, openCart: () => {}, quickView: () => {}, navigate: (h) => (location.hash = h) };

// ---------- API ----------
export async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  let res;
  try {
    res = await fetch(`/api${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new Error('Cannot reach the server. Is it running?');
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && state.token && !path.startsWith('/auth/login')) emit('expired');
    const err = new Error(data.error?.message || `Request failed (${res.status})`);
    err.status = res.status;
    err.details = data.error?.details;
    throw err;
  }
  return data;
}
export const errText = (e) =>
  e.details?.length ? e.details.map((d) => `${d.path ? d.path.split('.').pop() + ': ' : ''}${d.message}`).join(' · ') : e.message;

// ---------- Formatting ----------
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const money = (cents) => ((cents || 0) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
export const fmtDate = (d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
export function timeAgo(d) {
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return 'just now';
  const units = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];
  for (const [u, n] of units) if (s >= n) { const v = Math.floor(s / n); return `${v} ${u}${v > 1 ? 's' : ''} ago`; }
  return 'just now';
}
export const initials = (name = '') => name.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
const AVATAR_COLORS = ['#e8643b', '#2d62b5', '#2c8a57', '#7347b8', '#b46f12', '#c13e2b', '#0f8a8a', '#a8457a'];
export const avatarColor = (name = '') => AVATAR_COLORS[[...name].reduce((n, c) => n + c.charCodeAt(0), 0) % AVATAR_COLORS.length];
export const pct = (p) => (p.compareAtPriceCents > p.priceCents ? Math.round((1 - p.priceCents / p.compareAtPriceCents) * 100) : 0);
export const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

// ---------- Small components ----------
const STAR = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.1l-5.7 3.2 1.2-6.4L2.8 9.5l6.4-.8z"/></svg>';
export function stars(rating = 0, size = 14) {
  const w = Math.max(0, Math.min(100, (rating / 5) * 100));
  return `<span class="stars" style="--size:${size}px" role="img" aria-label="${(+rating).toFixed(1)} out of 5 stars"><span class="bg">${STAR.repeat(5)}</span><span class="fg" style="width:${w}%">${STAR.repeat(5)}</span></span>`;
}
export function starInput(name = 'rating', value = 0) {
  return `<div class="star-input">${[5, 4, 3, 2, 1].map((n) => `<input type="radio" id="${name}-${n}" name="${name}" value="${n}" ${n === value ? 'checked' : ''}><label for="${name}-${n}" title="${n} star${n > 1 ? 's' : ''}">${STAR}</label>`).join('')}</div>`;
}
export const HEART = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M12 20s-7-4.4-9.3-9A5 5 0 0 1 12 6a5 5 0 0 1 9.3 5c-2.3 4.6-9.3 9-9.3 9z"/></svg>';

export function priceHtml(p) {
  const sale = pct(p) > 0;
  return `<span class="price"><span class="now ${sale ? 'sale' : ''}">${money(p.priceCents)}</span>${sale ? `<s>${money(p.compareAtPriceCents)}</s>` : ''}</span>`;
}

export function badges(p) {
  const out = [];
  if (pct(p) > 0) out.push(`<span class="pill sale">−${pct(p)}%</span>`);
  if (p.stock === 0) out.push('<span class="pill out">Sold out</span>');
  else if (p.stock <= 10) out.push(`<span class="pill low">Only ${p.stock} left</span>`);
  if (p.isFeatured && out.length < 2) out.push('<span class="pill feat">★ Editor’s pick</span>');
  return `<div class="card-badges">${out.join('')}</div>`;
}

export function productCard(p, i = 0) {
  const img2 = (p.images || [])[1];
  const fav = state.wishlist.has(p.id);
  return `
    <article class="card" style="animation-delay:${Math.min(i, 12) * 35}ms">
      <a href="#/product/${p.id}" class="card-media" aria-label="${esc(p.name)}">
        <img class="main ${img2 ? 'has-alt' : ''}" src="${esc(p.imageUrl || '')}" alt="${esc(p.name)}" loading="lazy">
        ${img2 ? `<img class="alt" src="${esc(img2)}" alt="" loading="lazy">` : ''}
      </a>
      ${badges(p)}
      <button class="card-fav ${fav ? 'on' : ''}" data-fav="${p.id}" aria-label="${fav ? 'Remove from' : 'Save to'} wishlist" aria-pressed="${fav}">${HEART}</button>
      <div class="card-quick"><button class="btn btn-ghost" data-quick="${p.id}">Quick view</button></div>
      <div class="card-body">
        <span class="card-brand">${esc(p.brand || p.subcategory || p.Category?.name || 'Lumen')}</span>
        <a href="#/product/${p.id}" class="card-title">${esc(p.name)}</a>
        <p class="card-desc">${esc(p.description || '')}</p>
        <div class="card-rating">${stars(p.ratingAvg, 13)}<span>${p.ratingCount ? `${(+p.ratingAvg).toFixed(1)} (${p.ratingCount})` : 'No reviews yet'}</span></div>
        <div class="card-foot">
          ${priceHtml(p)}
          <button class="add-btn" data-add="${p.id}" ${p.stock === 0 ? 'disabled' : ''} aria-label="Add ${esc(p.name)} to bag" title="${p.stock === 0 ? 'Sold out' : 'Add to bag'}">+</button>
        </div>
      </div>
    </article>`;
}
export const skeletonCards = (n = 8) => Array.from({ length: n }, () => '<div class="skel" style="aspect-ratio:3/4.3"></div>').join('');
export const emptyState = (icon, title, text, action = '') => `<div class="empty"><div class="empty-icon">${icon}</div><h3>${esc(title)}</h3><p>${text}</p>${action}</div>`;

// Remember products the user looked at.
export function trackViewed(p) {
  const list = store.get('viewed', []).filter((x) => x.id !== p.id);
  list.unshift({ id: p.id, name: p.name, imageUrl: p.imageUrl, priceCents: p.priceCents, compareAtPriceCents: p.compareAtPriceCents, brand: p.brand, ratingAvg: p.ratingAvg, ratingCount: p.ratingCount, stock: p.stock, images: (p.images || []).slice(0, 2), isFeatured: p.isFeatured });
  store.set('viewed', list.slice(0, 12));
}

// ---------- Feedback UI ----------
export function toast(msg, { type = '', img = '', action = '' } = {}) {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `${img ? `<img src="${esc(img)}" alt="">` : ''}<span>${esc(msg)}</span>${action}`;
  $('#toasts').appendChild(el);
  setTimeout(() => { el.style.transition = 'opacity .3s, transform .3s'; el.style.opacity = '0'; el.style.transform = 'translateY(8px)'; setTimeout(() => el.remove(), 300); }, 3000);
}

export function openModal(html, size = '') {
  const m = $('#modal-content');
  m.className = `modal ${size}`;
  m.innerHTML = `<button class="icon-btn modal-close" data-close-modal aria-label="Close">✕</button>${html}`;
  $('#modal').hidden = false;
  document.body.style.overflow = 'hidden';
  setTimeout(() => m.querySelector('input:not([type=hidden]), textarea, select')?.focus(), 60);
  return m;
}
export function closeModal() {
  $('#modal').hidden = true;
  document.body.style.overflow = '';
}

// Two-click confirmation without blocking browser dialogs.
export function confirmInline(btn, label = 'Click again to confirm') {
  if (btn.dataset.armed) return true;
  btn.dataset.armed = '1';
  const old = btn.innerHTML;
  btn.textContent = label;
  setTimeout(() => { delete btn.dataset.armed; btn.innerHTML = old; }, 3000);
  return false;
}

export function busy(btn, on = true) {
  if (!btn) return;
  if (on) { btn.dataset.label = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spin"></span>'; }
  else { btn.disabled = false; if (btn.dataset.label) btn.innerHTML = btn.dataset.label; }
}

// ---------- Cart & wishlist actions ----------
export async function refreshCart() {
  if (!state.user) { state.cart = { items: [], itemCount: 0, subtotalCents: 0, totalCents: 0, shippingCents: 0, freeShippingThresholdCents: 5000 }; emit('cart'); return; }
  try { state.cart = (await api('/cart')).data; } catch { /* ignore */ }
  emit('cart');
}
export async function refreshWishlist() {
  if (!state.user) { state.wishlist = new Set(); emit('wishlist'); return; }
  try { state.wishlist = new Set((await api('/wishlist')).data.map((p) => p.id)); } catch { /* ignore */ }
  emit('wishlist');
}

export async function addToCart(productId, quantity = 1, meta = {}) {
  if (!state.user) return hooks.openAuth('login', () => addToCart(productId, quantity, meta));
  try {
    state.cart = (await api('/cart/items', { method: 'POST', body: { productId, quantity } })).data;
    emit('cart', { bump: true });
    toast('Added to your bag', { img: meta.imageUrl, action: '<a href="#" data-open-cart>View bag</a>' });
    return true;
  } catch (e) { toast(errText(e), { type: 'error' }); return false; }
}
export async function setQty(productId, quantity) {
  try {
    state.cart = quantity < 1
      ? (await api(`/cart/items/${productId}`, { method: 'DELETE' })).data
      : (await api(`/cart/items/${productId}`, { method: 'PATCH', body: { quantity } })).data;
    emit('cart');
  } catch (e) { toast(errText(e), { type: 'error' }); }
}
export async function toggleWishlist(productId) {
  if (!state.user) return hooks.openAuth('login', () => toggleWishlist(productId));
  const has = state.wishlist.has(productId);
  try {
    await api(`/wishlist/${productId}`, { method: has ? 'DELETE' : 'POST' });
    has ? state.wishlist.delete(productId) : state.wishlist.add(productId);
    emit('wishlist', { bump: !has });
    toast(has ? 'Removed from wishlist' : 'Saved to your wishlist ♥');
  } catch (e) { toast(errText(e), { type: 'error' }); }
}

// ---------- Hash query helpers ----------
export function parseHash() {
  const raw = location.hash.slice(1) || '/';
  const [path, qs = ''] = raw.split('?');
  return { path: path || '/', params: new URLSearchParams(qs) };
}
export const SVG_GRID = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/><rect x="13" y="13" width="8" height="8" rx="2"/></svg>';
export const SVG_LIST = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="4" width="18" height="4" rx="2"/><rect x="3" y="10" width="18" height="4" rx="2"/><rect x="3" y="16" width="18" height="4" rx="2"/></svg>';
