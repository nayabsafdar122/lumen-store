import { state, api, errText, esc, starInput, toast, busy, $ } from '../core.js';

const TYPES = [['general', '💬 General'], ['suggestion', '💡 Suggestion'], ['compliment', '💖 Compliment'], ['order', '📦 Order issue'], ['bug', '🐞 Report a bug']];
const FAQ = [
  ['How long does shipping take?', 'Most orders arrive within 2–4 business days. Shipping is free on orders over $50; below that a flat $5.99 applies.'],
  ['Can I cancel or change my order?', 'You can cancel any order that is still “pending” from your Orders page — stock is released instantly. Once an order is paid or shipped, contact us and we’ll help.'],
  ['How do promo codes work?', 'Enter your code in the “Promo code” box at checkout. Some codes need a minimum order value. Only one code can be used per order.'],
  ['What does “Verified purchase” mean on reviews?', 'It means the reviewer actually bought the product from Lumen. We show it so you can trust what you read.'],
  ['Is my account secure?', 'Passwords are hashed with bcrypt and never stored in plain text. Your session uses a signed token that expires automatically.'],
  ['Do you take real payments?', 'No — this is a demo store. Orders are created so you can explore the full flow, but nothing is ever charged.'],
];

export default function feedback({ app, params }) {
  const about = params.get('about') || '';
  app.innerHTML = `
    <div class="page-head"><div><h1>Contact & feedback</h1><p>Questions, ideas or problems — we read every message.</p></div></div>
    <div class="contact-grid">
      <form class="panel" id="fb-form" novalidate>
        <h3>Send us a message</h3>
        <div id="fb-error"></div>
        <div class="field"><span class="label">What’s it about?</span>
          <div class="type-opts">${TYPES.map(([v, l], i) => `<label><input type="radio" name="type" value="${v}" ${(about.startsWith('Order') ? v === 'order' : i === 0) ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>
        </div>
        <div class="row2">
          <div class="field"><label for="fb-name">Name</label><input class="input" id="fb-name" name="name" required value="${esc(state.user?.name || '')}" autocomplete="name"></div>
          <div class="field"><label for="fb-email">Email</label><input class="input" id="fb-email" name="email" type="email" required value="${esc(state.user?.email || '')}" autocomplete="email"></div>
        </div>
        <div class="field"><span class="label">How would you rate your experience with Lumen? <span class="muted">(optional)</span></span>${starInput('fb-rating')}</div>
        <div class="field"><label for="fb-msg">Message</label><textarea class="textarea" id="fb-msg" name="message" required maxlength="3000" placeholder="Tell us what’s on your mind…">${about ? esc(`About: ${about}\n\n`) : ''}</textarea><span class="hint" id="fb-count">0 / 3000</span></div>
        <button class="btn btn-accent btn-lg" type="submit">Send message</button>
      </form>
      <aside style="display:flex;flex-direction:column;gap:18px">
        <div class="panel">
          <h3>Other ways to reach us</h3>
          <div class="contact-card"><i>✉️</i><div><strong>Email</strong><span>support@lumen.example · replies within 24h</span></div></div>
          <div class="contact-card"><i>💬</i><div><strong>Live chat</strong><span>Mon–Fri, 9am–6pm</span></div></div>
          <div class="contact-card"><i>📍</i><div><strong>Studio</strong><span>123 Market Street, San Francisco, CA</span></div></div>
        </div>
        <div class="panel" style="background:var(--accent-soft);border-color:transparent">
          <h3 style="margin-bottom:8px">We ❤️ feedback</h3>
          <p style="margin:0;color:var(--ink-2)">Many of our features — like the wishlist and quick view — started as customer suggestions.</p>
        </div>
      </aside>
    </div>
    <section class="section" id="faq">
      <div class="section-head"><div><h2>Frequently asked questions</h2><p>Quick answers to common questions.</p></div></div>
      <div class="faq">${FAQ.map(([q, a], i) => `<details ${i === 0 ? 'open' : ''}><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</div>
    </section>`;

  if (params.get('faq')) setTimeout(() => $('#faq').scrollIntoView({ behavior: 'smooth' }), 50);
  const msg = $('#fb-msg');
  const count = () => ($('#fb-count').textContent = `${msg.value.length} / 3000`);
  msg.oninput = count; count();

  $('#fb-form').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    const rating = +(f.querySelector('input[name="fb-rating"]:checked')?.value || 0) || undefined;
    const body = { name: f.elements['name'].value.trim(), email: f.email.value.trim(), type: f.elements['type'].value, message: f.message.value.trim(), rating };
    const btn = f.querySelector('[type=submit]'); busy(btn);
    try {
      await api('/feedback', { method: 'POST', body });
      f.outerHTML = `<div class="panel success" style="margin:0;text-align:center"><div class="success-icon">✓</div><h3 style="font-size:28px">Message sent!</h3><p class="muted">Thanks, ${esc(body.name.split(' ')[0])}. We’ll get back to you at ${esc(body.email)} soon.</p><a class="btn btn-primary" href="#/shop">Back to shopping</a></div>`;
      toast('Thanks for your feedback! 💌');
    } catch (err) { $('#fb-error').innerHTML = `<div class="form-error">${esc(errText(err))}</div>`; busy(btn, false); }
  };
}
