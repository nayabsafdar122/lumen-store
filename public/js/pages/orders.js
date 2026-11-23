import { state, hooks, api, errText, esc, money, fmtDate, emptyState, toast, confirmInline, refreshCart, $, $$ } from '../core.js';

const STEPS = ['pending', 'paid', 'shipped', 'delivered'];
const LABEL = { pending: 'Order placed', paid: 'Payment confirmed', shipped: 'Shipped', delivered: 'Delivered' };

export default async function orders({ app, args }) {
  if (!state.user) {
    app.innerHTML = emptyState('🔐', 'Please sign in', 'Sign in to see your orders.', '<button class="btn btn-primary" id="o-login">Sign in</button>');
    $('#o-login').onclick = () => hooks.openAuth('login', () => hooks.route());
    return;
  }
  if (args[0]) return detail(app, +args[0]);

  const filter = new URLSearchParams(location.hash.split('?')[1] || '').get('status') || '';
  app.innerHTML = `
    <div class="page-head"><div><h1>${state.user.role === 'admin' ? 'All orders' : 'My orders'}</h1><p>Track, cancel or buy again.</p></div></div>
    <div class="active-filters">${['', ...STEPS, 'cancelled'].map((s) => `<a class="chip ${filter === s ? 'active' : ''}" href="#/orders${s ? `?status=${s}` : ''}">${s ? s[0].toUpperCase() + s.slice(1) : 'All'}</a>`).join('')}</div>
    <div id="orders">${'<div class="skel" style="height:170px;margin-bottom:16px"></div>'.repeat(3)}</div>`;
  const { data } = await api(`/orders?limit=50${filter ? `&status=${filter}` : ''}`);
  const box = $('#orders');
  if (!data.length) {
    box.innerHTML = emptyState('📦', filter ? `No ${filter} orders` : 'No orders yet', 'When you place an order it will show up here.', '<a class="btn btn-primary" href="#/shop">Start shopping</a>');
    return;
  }
  box.innerHTML = data.map((o) => `
    <article class="order">
      <div class="order-head">
        <div><strong>Order #${o.id}</strong> <span class="muted">· ${fmtDate(o.createdAt)} · ${o.items.reduce((n, i) => n + i.quantity, 0)} items</span></div>
        <span class="status s-${o.status}">${o.status}</span>
      </div>
      <div class="order-thumbs">${o.items.map((i) => `<img src="${esc(i.imageUrl || '')}" alt="${esc(i.productName)}" title="${esc(i.productName)}">`).join('')}</div>
      <div class="order-foot">
        <span class="price" style="font-size:20px">${money(o.totalCents)}</span>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${o.status === 'pending' ? `<button class="btn btn-sm btn-danger" data-cancel="${o.id}">Cancel</button>` : ''}
          ${o.UserId === state.user.id ? `<button class="btn btn-sm btn-ghost" data-reorder="${o.id}">↻ Buy again</button>` : ''}
          <a class="btn btn-sm btn-primary" href="#/orders/${o.id}">View details</a>
        </div>
      </div>
    </article>`).join('');
  bindActions(box);
}

function bindActions(root) {
  $$('[data-cancel]', root).forEach((b) => (b.onclick = async () => {
    if (!confirmInline(b, 'Click again to cancel')) return;
    try { await api(`/orders/${b.dataset.cancel}/cancel`, { method: 'POST' }); toast('Order cancelled — stock released'); hooks.route(); }
    catch (e) { toast(errText(e), { type: 'error' }); }
  }));
  $$('[data-reorder]', root).forEach((b) => (b.onclick = async () => {
    try {
      const { data } = await api(`/orders/${b.dataset.reorder}/reorder`, { method: 'POST' });
      await refreshCart();
      toast(data.added ? `Added ${data.added} item${data.added > 1 ? 's' : ''} to your bag${data.skipped ? ` (${data.skipped} unavailable)` : ''}` : 'Those items are no longer available', { type: data.added ? '' : 'error' });
      if (data.added) hooks.openCart();
    } catch (e) { toast(errText(e), { type: 'error' }); }
  }));
}

async function detail(app, id) {
  app.innerHTML = '<div class="skel" style="height:420px;margin-top:40px"></div>';
  let o;
  try { o = (await api(`/orders/${id}`)).data; } catch {
    app.innerHTML = emptyState('📦', 'Order not found', 'We couldn’t find that order.', '<a class="btn btn-primary" href="#/orders">Back to orders</a>');
    return;
  }
  const a = o.shippingAddress || {};
  const idx = STEPS.indexOf(o.status);
  app.innerHTML = `
    <nav class="crumbs"><a href="#/orders">Orders</a> / <span>#${o.id}</span></nav>
    <div class="page-head"><div><h1>Order #${o.id}</h1><p>Placed on ${fmtDate(o.createdAt)}</p></div><span class="status s-${o.status}" style="font-size:14px;padding:6px 16px">${o.status}</span></div>
    ${o.status === 'cancelled'
      ? '<div class="notice" style="background:var(--bad-soft);color:var(--bad)">This order was cancelled. Any reserved stock has been released.</div>'
      : `<div class="panel" style="margin-bottom:18px"><div class="timeline">${STEPS.map((s, i) => `<div class="${i <= idx ? 'done' : ''}"><i>${i <= idx ? '✓' : i + 1}</i>${LABEL[s]}</div>`).join('')}</div></div>`}
    <div class="checkout">
      <div class="panel">
        <h3>Items</h3>
        ${o.items.map((i) => `
          <div class="line">
            <a href="#/product/${i.ProductId}" class="line-img"><img src="${esc(i.imageUrl || '')}" alt=""></a>
            <div><a href="#/product/${i.ProductId}" class="line-title">${esc(i.productName)}</a><div class="line-sub">${i.quantity} × ${money(i.unitPriceCents)}</div>
              ${o.status === 'delivered' && i.ProductId ? `<a class="link" style="font-size:13px" href="#/product/${i.ProductId}">★ Write a review</a>` : ''}</div>
            <strong>${money(i.unitPriceCents * i.quantity)}</strong>
          </div>`).join('')}
        ${o.note ? `<p class="muted" style="margin:16px 0 0">📝 ${esc(o.note)}</p>` : ''}
      </div>
      <aside style="display:flex;flex-direction:column;gap:16px">
        <div class="panel">
          <h3>Summary</h3>
          <div class="sum"><span>Subtotal</span><span>${money(o.subtotalCents)}</span></div>
          ${o.discountCents ? `<div class="sum discount"><span>Discount (${esc(o.couponCode)})</span><span>−${money(o.discountCents)}</span></div>` : ''}
          <div class="sum"><span>Shipping</span><span>${o.shippingCents ? money(o.shippingCents) : 'Free'}</span></div>
          <div class="sum total" style="margin-bottom:0"><span>Total</span><span>${money(o.totalCents)}</span></div>
        </div>
        <div class="panel">
          <h3>Ship to</h3>
          <p style="margin:0;color:var(--ink-2);line-height:1.7">${esc(a.fullName)}<br>${esc(a.line1)}${a.line2 ? `<br>${esc(a.line2)}` : ''}<br>${esc([a.city, a.state, a.postalCode].filter(Boolean).join(', '))}<br>${esc(a.country)}${a.phone ? `<br>📞 ${esc(a.phone)}` : ''}</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${o.status === 'pending' ? `<button class="btn btn-danger" data-cancel="${o.id}">Cancel order</button>` : ''}
          ${o.UserId === state.user.id ? `<button class="btn btn-ghost" data-reorder="${o.id}">↻ Buy again</button>` : ''}
          <a class="btn btn-ghost" href="#/feedback?about=${encodeURIComponent('Order #' + o.id)}">Need help?</a>
        </div>
      </aside>
    </div>`;
  bindActions(app);
}
