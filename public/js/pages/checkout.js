import { state, store, hooks, api, errText, esc, money, emptyState, refreshCart, emit, toast, busy, $, $$ } from '../core.js';

export default async function checkout({ app }) {
  if (!state.user) { app.innerHTML = emptyState('🔐', 'Please sign in', 'Sign in to check out.', '<button class="btn btn-primary" id="ck-login">Sign in</button>'); $('#ck-login').onclick = () => hooks.openAuth('login', () => hooks.route()); return; }
  await refreshCart();
  const c = state.cart;
  if (!c.items.length) {
    app.innerHTML = emptyState('🛍️', 'Your bag is empty', 'Add something you love before checking out.', '<a class="btn btn-primary" href="#/shop">Browse products</a>');
    return;
  }
  const saved = store.get('lastAddress', {});
  let coupon = null; // { code, description }
  let totals = { subtotalCents: c.subtotalCents, discountCents: 0, shippingCents: c.shippingCents, totalCents: c.totalCents };

  app.innerHTML = `
    <div class="page-head"><div><h1>Checkout</h1><p>Almost there — just a few details.</p></div><a href="#/shop" class="link">← Continue shopping</a></div>
    <div class="steps"><span class="done"><i>✓</i>Bag</span><span class="sep"></span><span class="on"><i>2</i>Details</span><span class="sep"></span><span><i>3</i>Confirmation</span></div>
    <form class="checkout" id="ck-form" novalidate>
      <div style="display:flex;flex-direction:column;gap:18px">
        <div class="panel">
          <h3>Contact</h3>
          <div class="row2">
            <div class="field"><label>Email</label><input class="input" value="${esc(state.user.email)}" disabled></div>
            <div class="field"><label for="ck-phone">Phone (optional)</label><input class="input" id="ck-phone" name="phone" type="tel" value="${esc(saved.phone || '')}" autocomplete="tel"></div>
          </div>
        </div>
        <div class="panel">
          <h3>Shipping address</h3>
          <div id="ck-error"></div>
          <div class="field"><label for="ck-name">Full name</label><input class="input" id="ck-name" name="fullName" required value="${esc(saved.fullName || state.user.name)}" autocomplete="name"></div>
          <div class="field"><label for="ck-l1">Address</label><input class="input" id="ck-l1" name="line1" required placeholder="Street and house number" value="${esc(saved.line1 || '')}" autocomplete="address-line1"></div>
          <div class="field"><label for="ck-l2">Apartment, suite, etc. (optional)</label><input class="input" id="ck-l2" name="line2" value="${esc(saved.line2 || '')}" autocomplete="address-line2"></div>
          <div class="row3">
            <div class="field"><label for="ck-city">City</label><input class="input" id="ck-city" name="city" required value="${esc(saved.city || '')}" autocomplete="address-level2"></div>
            <div class="field"><label for="ck-state">State / Region</label><input class="input" id="ck-state" name="state" value="${esc(saved.state || '')}" autocomplete="address-level1"></div>
            <div class="field"><label for="ck-zip">Postal code</label><input class="input" id="ck-zip" name="postalCode" required value="${esc(saved.postalCode || '')}" autocomplete="postal-code"></div>
          </div>
          <div class="field"><label for="ck-country">Country</label><input class="input" id="ck-country" name="country" required value="${esc(saved.country || 'US')}" autocomplete="country"></div>
          <label class="check"><input type="checkbox" id="ck-save" checked> Save this address for next time</label>
        </div>
        <div class="panel">
          <h3>Payment</h3>
          <div class="notice">🧪 This is a demo store — no payment details are collected and nothing is charged.</div>
          <div class="pay-opts">
            <label class="pay-opt"><input type="radio" name="pay" value="cod" checked><span>Pay on delivery<small>Pay in cash or card when your order arrives</small></span>💵</label>
            <label class="pay-opt"><input type="radio" name="pay" value="invoice"><span>Invoice (demo)<small>We’ll email an invoice once the order ships</small></span>🧾</label>
          </div>
          <div class="field" style="margin:16px 0 0"><label for="ck-note">Order note (optional)</label><input class="input" id="ck-note" name="note" maxlength="500" placeholder="E.g. leave at the front door"></div>
        </div>
      </div>

      <aside class="panel sticky">
        <h3>Order summary</h3>
        <div id="ck-lines">${c.items.map((i) => `
          <div class="line" style="grid-template-columns:64px 1fr auto">
            <span class="line-img" style="width:64px;height:64px;position:relative"><img src="${esc(i.imageUrl || '')}" alt=""><span class="badge-count" style="top:-6px;right:-6px">${i.quantity}</span></span>
            <div><div class="line-title">${esc(i.name)}</div><div class="line-sub" style="margin:0">${money(i.unitPriceCents)} each</div></div>
            <strong>${money(i.lineTotalCents)}</strong>
          </div>`).join('')}</div>
        <div id="coupon-box"></div>
        <div id="ck-totals" style="margin-top:14px"></div>
        <button class="btn btn-accent btn-block btn-lg" type="submit" id="place">Place order</button>
        <p class="hint" style="text-align:center;margin:12px 0 0">🔒 Your details are sent over an encrypted connection.</p>
      </aside>
    </form>`;

  const renderTotals = () => {
    $('#ck-totals').innerHTML = `
      <div class="sum"><span>Subtotal</span><span>${money(totals.subtotalCents)}</span></div>
      ${totals.discountCents ? `<div class="sum discount"><span>Discount (${esc(coupon.code)})</span><span>−${money(totals.discountCents)}</span></div>` : ''}
      <div class="sum"><span>Shipping</span><span>${totals.shippingCents ? money(totals.shippingCents) : 'Free'}</span></div>
      <div class="sum total"><span>Total</span><span>${money(totals.totalCents)}</span></div>`;
    $('#place').textContent = `Place order · ${money(totals.totalCents)}`;
  };
  const renderCoupon = () => {
    $('#coupon-box').innerHTML = coupon
      ? `<div class="applied"><span>🏷️ ${esc(coupon.code)} — ${esc(coupon.description || 'applied')}</span><button type="button" class="remove" id="rm-coupon">Remove</button></div>`
      : `<div class="coupon-row"><input class="input" id="coupon-input" placeholder="Promo code" aria-label="Promo code"><button type="button" class="btn btn-ghost" id="apply-coupon">Apply</button></div><div id="coupon-msg" class="hint">Try <button type="button" class="link" data-try="WELCOME10">WELCOME10</button> or <button type="button" class="link" data-try="SAVE20">SAVE20</button></div>`;
    $('#rm-coupon')?.addEventListener('click', () => {
      coupon = null;
      totals = { subtotalCents: c.subtotalCents, discountCents: 0, shippingCents: c.shippingCents, totalCents: c.totalCents };
      renderCoupon(); renderTotals();
    });
    const apply = async () => {
      const code = $('#coupon-input').value.trim();
      if (!code) return;
      const btn = $('#apply-coupon'); busy(btn);
      try {
        const { data } = await api('/coupons/validate', { method: 'POST', body: { code } });
        coupon = data.coupon; totals = data.totals;
        renderCoupon(); renderTotals(); toast(`Code ${coupon.code} applied — you save ${money(totals.discountCents)} 🎉`);
      } catch (e) { $('#coupon-msg').innerHTML = `<span style="color:var(--bad)">${esc(errText(e))}</span>`; busy(btn, false); }
    };
    $('#apply-coupon')?.addEventListener('click', apply);
    $('#coupon-input')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); apply(); } });
    $$('[data-try]').forEach((b) => (b.onclick = () => { $('#coupon-input').value = b.dataset.try; apply(); }));
  };
  renderCoupon(); renderTotals();

  $('#ck-form').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    const missing = ['fullName', 'line1', 'city', 'postalCode', 'country'].filter((k) => !f[k].value.trim());
    if (missing.length) {
      $('#ck-error').innerHTML = '<div class="form-error">Please fill in all required address fields.</div>';
      f[missing[0]].focus();
      return;
    }
    const shippingAddress = Object.fromEntries(['fullName', 'line1', 'line2', 'city', 'state', 'postalCode', 'country', 'phone']
      .map((k) => [k, f[k].value.trim()]).filter(([, v]) => v));
    if ($('#ck-save').checked) store.set('lastAddress', shippingAddress);
    const btn = $('#place'); busy(btn);
    try {
      const order = (await api('/orders', { method: 'POST', body: { shippingAddress, couponCode: coupon?.code, note: f.note.value.trim() || undefined } })).data;
      state.cart = { ...state.cart, items: [], itemCount: 0, subtotalCents: 0, totalCents: 0, shippingCents: 0 };
      emit('cart');
      success(app, order);
    } catch (err) {
      $('#ck-error').innerHTML = `<div class="form-error">${esc(errText(err))}</div>`;
      $('#ck-error').scrollIntoView({ behavior: 'smooth', block: 'center' });
      busy(btn, false);
    }
  };
}

function success(app, order) {
  const eta = new Date(Date.now() + 4 * 86400000).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  app.innerHTML = `
    <div class="steps" style="justify-content:center;margin-top:36px"><span class="done"><i>✓</i>Bag</span><span class="sep"></span><span class="done"><i>✓</i>Details</span><span class="sep"></span><span class="on"><i>3</i>Confirmation</span></div>
    <div class="success">
      <div class="success-icon">✓</div>
      <h1>Thank you, ${esc(state.user.name.split(' ')[0])}!</h1>
      <p class="muted" style="font-size:16px">Your order <strong style="color:var(--ink)">#${order.id}</strong> for <strong style="color:var(--ink)">${money(order.totalCents)}</strong> has been placed.${order.discountCents ? ` You saved ${money(order.discountCents)} with ${esc(order.couponCode)}.` : ''}<br>Estimated delivery: <strong style="color:var(--ink)">${eta}</strong></p>
      <div class="order-thumbs" style="justify-content:center">${order.items.map((i) => `<img src="${esc(i.imageUrl || '')}" alt="${esc(i.productName)}" title="${esc(i.productName)}">`).join('')}</div>
      <div class="slide-actions" style="justify-content:center;margin-top:10px">
        <a class="btn btn-primary btn-lg" href="#/orders/${order.id}">Track your order</a>
        <a class="btn btn-ghost btn-lg" href="#/shop">Keep shopping</a>
      </div>
      <p class="muted" style="margin-top:28px">How was your checkout experience? <a href="#/feedback" class="link">Tell us</a></p>
    </div>`;
  window.scrollTo({ top: 0, behavior: 'smooth' });
  confetti();
}

function confetti() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const wrap = document.createElement('div');
  wrap.className = 'confetti';
  const colors = ['#e8643b', '#f2a93b', '#2c8a57', '#2d62b5', '#7347b8', '#ff8fb1'];
  wrap.innerHTML = Array.from({ length: 90 }, () => `<i style="left:${Math.random() * 100}%;background:${colors[Math.floor(Math.random() * colors.length)]};animation-duration:${2 + Math.random() * 2.5}s;animation-delay:${Math.random() * 0.6}s;transform:rotate(${Math.random() * 360}deg)"></i>`).join('');
  document.body.appendChild(wrap);
  setTimeout(() => wrap.remove(), 5500);
}
