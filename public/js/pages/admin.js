import {
  state, hooks, api, errText, esc, money, fmtDate, timeAgo, stars, emptyState, toast, busy, confirmInline,
  openModal, closeModal, debounce, pct, $, $$,
} from '../core.js';

const TABS = [['overview', '📊', 'Overview'], ['products', '🛍️', 'Products'], ['orders', '📦', 'Orders'], ['reviews', '⭐', 'Reviews'], ['feedback', '💬', 'Feedback'], ['coupons', '🏷️', 'Coupons'], ['subscribers', '💌', 'Subscribers']];
const STATUS_COLORS = { pending: 'var(--warn)', paid: 'var(--info)', shipped: 'var(--violet)', delivered: 'var(--ok)', cancelled: 'var(--muted)' };
const NEXT = { pending: ['paid', 'cancelled'], paid: ['shipped', 'cancelled'], shipped: ['delivered'], delivered: [], cancelled: [] };

export default async function admin({ app, args, params }) {
  if (state.user?.role !== 'admin') {
    app.innerHTML = emptyState('🔐', 'Admins only', 'Sign in with an admin account to manage the store.', state.user ? '' : '<button class="btn btn-primary" id="adm-login">Sign in</button>');
    $('#adm-login')?.addEventListener('click', () => hooks.openAuth('login', () => hooks.route()));
    return;
  }
  const tab = TABS.some(([t]) => t === args[0]) ? args[0] : 'overview';
  app.innerHTML = `
    <div class="admin">
      <nav class="side-nav" id="adm-nav">${TABS.map(([t, i, l]) => `<a href="#/admin/${t}" class="${t === tab ? 'active' : ''}">${i} ${l}<span class="count" data-count="${t}" hidden></span></a>`).join('')}
        <a href="#/" style="margin-top:12px">← Back to store</a></nav>
      <section id="adm-body"><div class="skel" style="height:500px"></div></section>
    </div>`;
  api('/admin/stats').then(({ data }) => {
    const c = $('[data-count="feedback"]'); if (c && data.newFeedback) { c.textContent = data.newFeedback; c.hidden = false; }
  }).catch(() => {});
  const body = $('#adm-body');
  await ({ overview, products, orders, reviews, feedback, coupons, subscribers })[tab](body, params);
}

const head = (title, sub, actions = '') => `<div class="page-head" style="margin-top:0"><div><h1 style="font-size:34px">${title}</h1><p>${sub}</p></div>${actions}</div>`;

// ---------- Overview ----------
async function overview(body) {
  const { data: s } = await api('/admin/stats');
  const max = Math.max(...s.salesByDay.map((d) => d.revenueCents), 1);
  const W = 640; const H = 200; const bw = W / s.salesByDay.length;
  const totalStatus = Object.values(s.byStatus).reduce((a, b) => a + b, 0) || 1;
  body.innerHTML = `
    ${head('Dashboard', `Welcome back, ${esc(state.user.name.split(' ')[0])}. Here’s how the store is doing.`, '<a class="btn btn-accent" href="#/admin/products?new=1">+ Add product</a>')}
    <div class="stats">
      <div class="stat"><span>Revenue <b>💰</b></span><strong>${money(s.revenueCents)}</strong><small>excl. cancelled orders</small></div>
      <div class="stat"><span>Orders <b>📦</b></span><strong>${s.orderCount}</strong><small>avg. ${money(s.avgOrderCents)}</small></div>
      <div class="stat"><span>Customers <b>👥</b></span><strong>${s.customers}</strong><small>${s.subscribers} newsletter subscribers</small></div>
      <div class="stat"><span>Reviews <b>⭐</b></span><strong>${s.reviews}</strong><small>${s.newFeedback} new feedback message${s.newFeedback === 1 ? '' : 's'}</small></div>
    </div>
    <div class="admin-grid">
      <div class="panel">
        <h3>Revenue · last 14 days</h3>
        <svg class="chart" viewBox="0 0 ${W} ${H + 24}" preserveAspectRatio="none" role="img" aria-label="Revenue per day">
          ${[0.25, 0.5, 0.75, 1].map((f) => `<line x1="0" x2="${W}" y1="${H - H * f}" y2="${H - H * f}" stroke-dasharray="3 4"/>`).join('')}
          ${s.salesByDay.map((d, i) => {
            const h = Math.max(2, (d.revenueCents / max) * (H - 10));
            return `<rect class="bar" x="${i * bw + bw * 0.18}" y="${H - h}" width="${bw * 0.64}" height="${h}" rx="5"><title>${d.date}: ${money(d.revenueCents)} · ${d.orders} orders</title></rect>
              ${i % 2 === 0 ? `<text x="${i * bw + bw / 2}" y="${H + 18}" text-anchor="middle">${new Date(d.date + 'T12:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</text>` : ''}`;
          }).join('')}
        </svg>
      </div>
      <div class="panel">
        <h3>Orders by status</h3>
        <div class="status-bars">${Object.entries(s.byStatus).map(([k, v]) => `<div><span>${k}</span><span class="track"><span class="fill" style="display:block;width:${(v / totalStatus) * 100}%;background:${STATUS_COLORS[k]}"></span></span><strong>${v}</strong></div>`).join('')}</div>
        <a href="#/admin/orders?status=pending" class="btn btn-ghost btn-block" style="margin-top:18px">Process pending orders →</a>
      </div>
    </div>
    <div class="admin-grid" style="grid-template-columns:1fr 1fr 1fr">
      <div class="panel"><h3>Top sellers</h3><div class="mini-list">${s.topProducts.map((p) => `<div><img src="${esc(p.imageUrl || '')}" alt=""><span class="grow"><strong>${esc(p.productName)}</strong><span>${p.units} sold · ${money(p.revenue)}</span></span></div>`).join('') || '<p class="muted">No sales yet.</p>'}</div></div>
      <div class="panel"><h3>Low stock</h3><div class="mini-list">${s.lowStock.map((p) => `<div><img src="${esc(p.imageUrl || '')}" alt=""><span class="grow"><strong>${esc(p.name)}</strong><span class="${p.stock === 0 ? 'stock-out' : 'stock-low'}">${p.stock} left</span></span><button class="btn btn-sm btn-ghost" data-restock="${p.id}">+25</button></div>`).join('') || '<p class="muted">All products are well stocked 👍</p>'}</div></div>
      <div class="panel"><h3>Recent orders</h3><div class="mini-list">${s.recentOrders.map((o) => `<div><span class="grow"><strong><a href="#/orders/${o.id}">#${o.id}</a> · ${esc(o.User?.name || '')}</strong><span>${timeAgo(o.createdAt)} · ${money(o.totalCents)}</span></span><span class="status s-${o.status}">${o.status}</span></div>`).join('')}</div></div>
    </div>`;
  $$('[data-restock]', body).forEach((b) => (b.onclick = async () => {
    const p = s.lowStock.find((x) => x.id === +b.dataset.restock);
    try { await api(`/products/${p.id}`, { method: 'PATCH', body: { stock: p.stock + 25 } }); toast(`Restocked ${p.name}`); overview(body); }
    catch (e) { toast(errText(e), { type: 'error' }); }
  }));
}

// ---------- Products ----------
async function products(body, params) {
  const st = { search: '', category: '', page: 1 };
  body.innerHTML = `
    ${head('Products', 'Add, edit and organise your catalog.', '<button class="btn btn-accent" id="new-prod">+ New product</button>')}
    <div class="table-tools">
      <input class="input" id="p-search" placeholder="Search products…">
      <select class="select" id="p-cat"><option value="">All departments</option>${state.categories.map((c) => `<option value="${c.slug}">${esc(c.name)}</option>`).join('')}</select>
      <span class="muted" id="p-count" style="margin-left:auto;font-size:14px"></span>
    </div>
    <div class="table-wrap"><table class="tbl"><thead><tr><th>Product</th><th>Department</th><th>Price</th><th>Stock</th><th>Rating</th><th>Sold</th><th>Featured</th><th></th></tr></thead><tbody id="p-rows"></tbody></table></div>
    <div class="pager" id="p-pager"></div>`;
  let rows = [];
  const load = async () => {
    const qs = new URLSearchParams({ sort: 'newest', limit: 20, page: st.page });
    if (st.search) qs.set('search', st.search);
    if (st.category) qs.set('category', st.category);
    const { data, meta } = await api(`/products?${qs}`);
    rows = data;
    $('#p-count').textContent = `${meta.total} products`;
    $('#p-rows').innerHTML = data.map((p) => `
      <tr>
        <td><div class="cell-prod"><img src="${esc(p.imageUrl || '')}" alt=""><span><strong><a href="#/product/${p.id}">${esc(p.name)}</a></strong><span>${esc(p.brand || '—')}</span></span></div></td>
        <td class="muted">${esc(p.Category?.name || '—')}</td>
        <td>${money(p.priceCents)}${pct(p) ? `<br><span class="pill sale">−${pct(p)}%</span>` : ''}</td>
        <td><span class="stock-line ${p.stock === 0 ? 'stock-out' : p.stock <= 10 ? 'stock-low' : 'stock-ok'}">${p.stock}</span></td>
        <td>${stars(p.ratingAvg, 12)} <span class="muted" style="font-size:12px">(${p.ratingCount})</span></td>
        <td>${p.soldCount}</td>
        <td><label class="switch"><input type="checkbox" data-feat="${p.id}" ${p.isFeatured ? 'checked' : ''}><span></span></label></td>
        <td><div class="actions"><button class="btn btn-sm btn-ghost" data-edit="${p.id}">Edit</button><button class="btn btn-sm btn-danger" data-del="${p.id}">Remove</button></div></td>
      </tr>`).join('') || '<tr><td colspan="8" class="muted" style="text-align:center;padding:40px">No products found</td></tr>';
    $('#p-pager').innerHTML = meta.totalPages > 1 ? `<button ${st.page <= 1 ? 'disabled' : ''} data-pg="-1">← Prev</button><button disabled>${st.page} / ${meta.totalPages}</button><button ${st.page >= meta.totalPages ? 'disabled' : ''} data-pg="1">Next →</button>` : '';
    $$('[data-pg]').forEach((b) => (b.onclick = () => { st.page += +b.dataset.pg; load(); }));
    $$('[data-edit]').forEach((b) => (b.onclick = () => productForm(rows.find((p) => p.id === +b.dataset.edit), load)));
    $$('[data-del]').forEach((b) => (b.onclick = async () => {
      if (!confirmInline(b, 'Confirm')) return;
      try { await api(`/products/${b.dataset.del}`, { method: 'DELETE' }); toast('Product removed from store'); load(); } catch (e) { toast(errText(e), { type: 'error' }); }
    }));
    $$('[data-feat]').forEach((cb) => (cb.onchange = async () => {
      try { await api(`/products/${cb.dataset.feat}`, { method: 'PATCH', body: { isFeatured: cb.checked } }); toast(cb.checked ? 'Marked as featured ★' : 'Removed from featured'); }
      catch (e) { cb.checked = !cb.checked; toast(errText(e), { type: 'error' }); }
    }));
  };
  $('#p-search').oninput = debounce((e) => { st.search = e.target.value.trim(); st.page = 1; load(); }, 250);
  $('#p-cat').onchange = (e) => { st.category = e.target.value; st.page = 1; load(); };
  $('#new-prod').onclick = () => productForm(null, load);
  await load();
  if (params.get('new')) productForm(null, load);
}

function productForm(p, done) {
  const m = openModal(`
    <h2>${p ? 'Edit product' : 'New product'}</h2>
    <p class="sub">${p ? 'Update details, pricing, images and stock.' : 'Add a new item to your store.'}</p>
    <form id="prod-form">
      <div id="prod-error"></div>
      <div class="row2">
        <div class="field"><label>Name</label><input class="input" name="name" required value="${esc(p?.name || '')}"></div>
        <div class="field"><label>Brand</label><input class="input" name="brand" value="${esc(p?.brand || '')}"></div>
      </div>
      <div class="field"><label>Description</label><textarea class="textarea" name="description">${esc(p?.description || '')}</textarea></div>
      <div class="row3">
        <div class="field"><label>Price (USD)</label><input class="input" name="price" type="number" min="0" step="0.01" required value="${p ? (p.priceCents / 100).toFixed(2) : ''}"></div>
        <div class="field"><label>Compare-at price</label><input class="input" name="compare" type="number" min="0" step="0.01" placeholder="Optional" value="${p?.compareAtPriceCents ? (p.compareAtPriceCents / 100).toFixed(2) : ''}"><span class="hint">Higher than price = on sale</span></div>
        <div class="field"><label>Stock</label><input class="input" name="stock" type="number" min="0" step="1" required value="${p?.stock ?? 10}"></div>
      </div>
      <div class="row2">
        <div class="field"><label>Department</label><select class="select" name="categoryId"><option value="">None</option>${state.categories.map((c) => `<option value="${c.id}" ${p?.CategoryId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
        <div class="field"><label>Subcategory</label><input class="input" name="subcategory" value="${esc(p?.subcategory || '')}" placeholder="e.g. Smartphones"></div>
      </div>
      <div class="field"><label>Image URLs <span class="muted">(one per line — the first is the main image)</span></label><textarea class="textarea" name="images" style="min-height:90px;font-size:13px" placeholder="https://…">${esc((p?.images || []).join('\n'))}</textarea></div>
      <div class="field"><label>Tags <span class="muted">(comma separated)</span></label><input class="input" name="tags" value="${esc((p?.tags || []).join(', '))}"></div>
      <label class="check"><input type="checkbox" name="featured" ${p?.isFeatured ? 'checked' : ''}> Feature on the home page</label>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px">
        <button type="button" class="btn btn-ghost" data-close-modal>Cancel</button>
        <button type="submit" class="btn btn-primary">${p ? 'Save changes' : 'Create product'}</button>
      </div>
    </form>`, 'wide');
  $('#prod-form', m).onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target.elements;
    const images = f.images.value.split('\n').map((s) => s.trim()).filter(Boolean);
    const body = {
      name: f.name.value.trim(),
      brand: f.brand.value.trim() || null,
      subcategory: f.subcategory.value.trim() || null,
      description: f.description.value,
      priceCents: Math.round(parseFloat(f.price.value) * 100),
      compareAtPriceCents: f.compare.value ? Math.round(parseFloat(f.compare.value) * 100) : null,
      stock: parseInt(f.stock.value, 10),
      categoryId: f.categoryId.value ? +f.categoryId.value : null,
      images,
      imageUrl: images[0] || null,
      tags: f.tags.value.split(',').map((s) => s.trim()).filter(Boolean),
      isFeatured: f.featured.checked,
    };
    const btn = e.target.querySelector('[type=submit]'); busy(btn);
    try {
      await api(p ? `/products/${p.id}` : '/products', { method: p ? 'PATCH' : 'POST', body });
      closeModal(); toast(p ? 'Product updated' : 'Product created 🎉'); done?.();
    } catch (err) { $('#prod-error').innerHTML = `<div class="form-error">${esc(errText(err))}</div>`; busy(btn, false); }
  };
}

// ---------- Orders ----------
async function orders(body, params) {
  const st = { status: params.get('status') || '', search: '', page: 1 };
  body.innerHTML = `
    ${head('Orders', 'Fulfil orders and keep customers updated.')}
    <div class="table-tools">
      <input class="input" id="o-search" placeholder="Search by #id, name or email">
      <select class="select" id="o-status"><option value="">All statuses</option>${Object.keys(NEXT).map((s) => `<option value="${s}" ${st.status === s ? 'selected' : ''}>${s[0].toUpperCase() + s.slice(1)}</option>`).join('')}</select>
      <span class="muted" id="o-count" style="margin-left:auto;font-size:14px"></span>
    </div>
    <div class="table-wrap"><table class="tbl"><thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Total</th><th>Status</th><th></th></tr></thead><tbody id="o-rows"></tbody></table></div>
    <div class="pager" id="o-pager"></div>`;
  const load = async () => {
    const qs = new URLSearchParams({ limit: 20, page: st.page });
    if (st.status) qs.set('status', st.status);
    if (st.search) qs.set('search', st.search);
    const { data, meta } = await api(`/orders?${qs}`);
    $('#o-count').textContent = `${meta.total} orders`;
    $('#o-rows').innerHTML = data.map((o) => `
      <tr>
        <td><a href="#/orders/${o.id}" class="link">#${o.id}</a><br><span class="muted" style="font-size:12.5px">${fmtDate(o.createdAt)}</span></td>
        <td><strong>${esc(o.User?.name || '—')}</strong><br><span class="muted" style="font-size:12.5px">${esc(o.User?.email || '')}</span></td>
        <td><div class="order-thumbs" style="margin:0">${o.items.slice(0, 3).map((i) => `<img src="${esc(i.imageUrl || '')}" alt="" title="${esc(i.productName)}" style="width:40px;height:40px">`).join('')}${o.items.length > 3 ? `<span class="muted">+${o.items.length - 3}</span>` : ''}</div></td>
        <td><strong>${money(o.totalCents)}</strong>${o.couponCode ? `<br><span class="pill ok">${esc(o.couponCode)}</span>` : ''}</td>
        <td><span class="status s-${o.status}">${o.status}</span></td>
        <td><div class="actions">${NEXT[o.status].map((n) => `<button class="btn btn-sm ${n === 'cancelled' ? 'btn-danger' : 'btn-ghost'}" data-status="${n}" data-id="${o.id}">${n === 'cancelled' ? 'Cancel' : `Mark ${n}`}</button>`).join('') || '<span class="muted" style="font-size:13px">—</span>'}</div></td>
      </tr>`).join('') || '<tr><td colspan="6" class="muted" style="text-align:center;padding:40px">No orders found</td></tr>';
    $('#o-pager').innerHTML = meta.totalPages > 1 ? `<button ${st.page <= 1 ? 'disabled' : ''} data-pg="-1">← Prev</button><button disabled>${st.page} / ${meta.totalPages}</button><button ${st.page >= meta.totalPages ? 'disabled' : ''} data-pg="1">Next →</button>` : '';
    $$('[data-pg]').forEach((b) => (b.onclick = () => { st.page += +b.dataset.pg; load(); }));
    $$('[data-status]').forEach((b) => (b.onclick = async () => {
      if (b.dataset.status === 'cancelled' && !confirmInline(b, 'Confirm')) return;
      try { await api(`/orders/${b.dataset.id}/status`, { method: 'PATCH', body: { status: b.dataset.status } }); toast(`Order #${b.dataset.id} → ${b.dataset.status}`); load(); }
      catch (e) { toast(errText(e), { type: 'error' }); }
    }));
  };
  $('#o-search').oninput = debounce((e) => { st.search = e.target.value.trim().replace(/^#/, ''); st.page = 1; load(); }, 300);
  $('#o-status').onchange = (e) => { st.status = e.target.value; st.page = 1; load(); };
  await load();
}

// ---------- Reviews ----------
async function reviews(body) {
  const st = { rating: '', page: 1 };
  body.innerHTML = `
    ${head('Reviews', 'Moderate what customers are saying.')}
    <div class="table-tools"><select class="select" id="r-rating"><option value="">All ratings</option>${[5, 4, 3, 2, 1].map((n) => `<option value="${n}">${n} stars</option>`).join('')}</select><span class="muted" id="r-count" style="margin-left:auto;font-size:14px"></span></div>
    <div class="panel" id="r-list"></div><div class="pager" id="r-pager"></div>`;
  const load = async () => {
    const qs = new URLSearchParams({ limit: 15, page: st.page }); if (st.rating) qs.set('rating', st.rating);
    const { data, meta } = await api(`/reviews?${qs}`);
    $('#r-count').textContent = `${meta.total} reviews`;
    $('#r-list').innerHTML = data.map((r) => `
      <div class="fb-item">
        <div class="fb-head">
          <div class="cell-prod"><img src="${esc(r.Product?.imageUrl || '')}" alt=""><span><strong>${esc(r.title || 'Untitled review')}</strong><span>on <a class="link" href="#/product/${r.ProductId}">${esc(r.Product?.name || '')}</a> · ${esc(r.authorName)} · ${timeAgo(r.createdAt)}</span></span></div>
          <span style="display:flex;gap:10px;align-items:center">${stars(r.rating, 14)}<button class="btn btn-sm btn-danger" data-del="${r.id}">Delete</button></span>
        </div>
        <p>${esc(r.comment)}</p>
        <span class="muted" style="font-size:12.5px">${r.verifiedPurchase ? '✔ Verified purchase · ' : ''}👍 ${r.helpfulCount} found helpful</span>
      </div>`).join('') || '<p class="muted">No reviews.</p>';
    $('#r-pager').innerHTML = meta.totalPages > 1 ? `<button ${st.page <= 1 ? 'disabled' : ''} data-pg="-1">← Prev</button><button disabled>${st.page} / ${meta.totalPages}</button><button ${st.page >= meta.totalPages ? 'disabled' : ''} data-pg="1">Next →</button>` : '';
    $$('[data-pg]').forEach((b) => (b.onclick = () => { st.page += +b.dataset.pg; load(); }));
    $$('[data-del]', $('#r-list')).forEach((b) => (b.onclick = async () => {
      if (!confirmInline(b, 'Confirm')) return;
      try { await api(`/reviews/${b.dataset.del}`, { method: 'DELETE' }); toast('Review deleted'); load(); } catch (e) { toast(errText(e), { type: 'error' }); }
    }));
  };
  $('#r-rating').onchange = (e) => { st.rating = e.target.value; st.page = 1; load(); };
  await load();
}

// ---------- Feedback inbox ----------
async function feedback(body) {
  let status = '';
  body.innerHTML = `${head('Feedback inbox', 'Messages and suggestions from customers.')}<div class="active-filters" id="f-tabs"></div><div class="panel" id="f-list"></div>`;
  const TYPE_ICON = { general: '💬', suggestion: '💡', bug: '🐞', order: '📦', compliment: '💖' };
  const load = async () => {
    $('#f-tabs').innerHTML = [['', 'All'], ['new', 'New'], ['read', 'Read'], ['resolved', 'Resolved']].map(([v, l]) => `<button class="chip ${status === v ? 'active' : ''}" data-f="${v}">${l}</button>`).join('');
    $$('[data-f]').forEach((b) => (b.onclick = () => { status = b.dataset.f; load(); }));
    const { data } = await api(`/feedback${status ? `?status=${status}` : ''}`);
    $('#f-list').innerHTML = data.map((f) => `
      <div class="fb-item">
        <div class="fb-head">
          <span><strong>${TYPE_ICON[f.type] || '💬'} ${esc(f.name)}</strong> <span class="muted">· <a href="mailto:${esc(f.email)}" class="link">${esc(f.email)}</a> · ${timeAgo(f.createdAt)}</span></span>
          <span style="display:flex;gap:8px;align-items:center">${f.rating ? stars(f.rating, 13) : ''}<span class="status s-${f.status}">${f.status}</span></span>
        </div>
        <p style="white-space:pre-line">${esc(f.message)}</p>
        <div class="actions" style="justify-content:flex-start">${['read', 'resolved'].filter((s) => s !== f.status).map((s) => `<button class="btn btn-sm btn-ghost" data-mark="${s}" data-id="${f.id}">Mark ${s}</button>`).join('')}</div>
      </div>`).join('') || emptyState('📭', 'Inbox zero', 'No messages here.');
    $$('[data-mark]').forEach((b) => (b.onclick = async () => {
      try { await api(`/feedback/${b.dataset.id}`, { method: 'PATCH', body: { status: b.dataset.mark } }); toast(`Marked ${b.dataset.mark}`); load(); }
      catch (e) { toast(errText(e), { type: 'error' }); }
    }));
  };
  await load();
}

// ---------- Coupons ----------
async function coupons(body) {
  body.innerHTML = `
    ${head('Coupons', 'Create promo codes for your customers.', '<button class="btn btn-accent" id="new-coupon">+ New coupon</button>')}
    <div class="table-wrap"><table class="tbl"><thead><tr><th>Code</th><th>Discount</th><th>Minimum</th><th>Used</th><th>Expires</th><th>Active</th><th></th></tr></thead><tbody id="c-rows"></tbody></table></div>`;
  const load = async () => {
    const { data } = await api('/coupons');
    $('#c-rows').innerHTML = data.map((c) => `
      <tr>
        <td><span class="code">${esc(c.code)}</span><br><span class="muted" style="font-size:12.5px">${esc(c.description || '')}</span></td>
        <td><strong>${c.type === 'percent' ? `${c.value}%` : money(c.value)}</strong> off</td>
        <td>${c.minSubtotalCents ? money(c.minSubtotalCents) : '—'}</td>
        <td>${c.usedCount}×</td>
        <td>${c.expiresAt ? fmtDate(c.expiresAt) : 'Never'}</td>
        <td><label class="switch"><input type="checkbox" data-toggle="${c.id}" ${c.isActive ? 'checked' : ''}><span></span></label></td>
        <td><div class="actions"><button class="btn btn-sm btn-danger" data-del="${c.id}">Delete</button></div></td>
      </tr>`).join('') || '<tr><td colspan="7" class="muted" style="text-align:center;padding:40px">No coupons yet</td></tr>';
    $$('[data-toggle]').forEach((cb) => (cb.onchange = async () => {
      try { await api(`/coupons/${cb.dataset.toggle}`, { method: 'PATCH', body: { isActive: cb.checked } }); toast(cb.checked ? 'Coupon activated' : 'Coupon paused'); }
      catch (e) { cb.checked = !cb.checked; toast(errText(e), { type: 'error' }); }
    }));
    $$('[data-del]', $('#c-rows')).forEach((b) => (b.onclick = async () => {
      if (!confirmInline(b, 'Confirm')) return;
      try { await api(`/coupons/${b.dataset.del}`, { method: 'DELETE' }); toast('Coupon deleted'); load(); } catch (e) { toast(errText(e), { type: 'error' }); }
    }));
  };
  $('#new-coupon').onclick = () => {
    const m = openModal(`
      <h2>New coupon</h2><p class="sub">Customers enter this code at checkout.</p>
      <form id="cp-form"><div id="cp-error"></div>
        <div class="field"><label>Code</label><input class="input" name="code" required placeholder="SUMMER15" style="text-transform:uppercase"></div>
        <div class="field"><label>Description</label><input class="input" name="description" placeholder="15% off summer styles"></div>
        <div class="row2">
          <div class="field"><label>Type</label><select class="select" name="type"><option value="percent">Percent off</option><option value="fixed">Fixed amount off</option></select></div>
          <div class="field"><label>Value</label><input class="input" name="value" type="number" min="1" step="0.01" required placeholder="15"><span class="hint">% or $</span></div>
        </div>
        <div class="row2">
          <div class="field"><label>Minimum order ($)</label><input class="input" name="min" type="number" min="0" step="0.01" placeholder="0"></div>
          <div class="field"><label>Expires (optional)</label><input class="input" name="expires" type="date"></div>
        </div>
        <button class="btn btn-primary btn-block" type="submit">Create coupon</button>
      </form>`);
    $('#cp-form', m).onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target.elements;
      const type = f.type.value;
      const body = {
        code: f.code.value.trim(), description: f.description.value.trim() || undefined, type,
        value: type === 'percent' ? Math.round(+f.value.value) : Math.round(+f.value.value * 100),
        minSubtotalCents: Math.round((+f.min.value || 0) * 100),
        expiresAt: f.expires.value ? new Date(f.expires.value + 'T23:59:59').toISOString() : null,
      };
      try { await api('/coupons', { method: 'POST', body }); closeModal(); toast(`Coupon ${body.code.toUpperCase()} created`); load(); }
      catch (err) { $('#cp-error').innerHTML = `<div class="form-error">${esc(errText(err))}</div>`; }
    };
  };
  await load();
}

// ---------- Subscribers ----------
async function subscribers(body) {
  const { data } = await api('/newsletter');
  body.innerHTML = `
    ${head('Newsletter subscribers', `${data.length} people want to hear from you.`, data.length ? '<button class="btn btn-ghost" id="copy-emails">Copy all emails</button>' : '')}
    <div class="table-wrap"><table class="tbl"><thead><tr><th>Email</th><th>Subscribed</th></tr></thead><tbody>
      ${data.map((s) => `<tr><td>${esc(s.email)}</td><td class="muted">${fmtDate(s.createdAt)}</td></tr>`).join('') || '<tr><td colspan="2" class="muted" style="text-align:center;padding:40px">No subscribers yet</td></tr>'}
    </tbody></table></div>`;
  $('#copy-emails')?.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(data.map((s) => s.email).join(', ')); toast('Emails copied'); } catch { toast('Could not access the clipboard', { type: 'error' }); }
  });
}
