import {
  state, store, hooks, api, errText, esc, money, fmtDate, timeAgo, stars, starInput, priceHtml, badges, pct, HEART,
  productCard, emptyState, toast, busy, openModal, closeModal, confirmInline, addToCart, trackViewed, avatarColor, initials, $, $$,
} from '../core.js';

export default async function product({ app, args }) {
  const id = +args[0];
  app.innerHTML = `<div class="pdp" style="margin-top:40px"><div class="skel" style="aspect-ratio:1"></div><div><div class="skel" style="height:40px;width:60%;margin-bottom:16px"></div><div class="skel" style="height:300px"></div></div></div>`;
  let p;
  try { p = (await api(`/products/${id}`)).data; } catch {
    app.innerHTML = emptyState('🫥', 'Product not found', 'It may have been removed or is no longer available.', '<a class="btn btn-primary" href="#/shop">Back to shop</a>');
    return;
  }
  trackViewed(p);
  const images = p.images?.length ? p.images : [p.imageUrl].filter(Boolean);
  const fav = state.wishlist.has(p.id);
  const save = pct(p);
  const stock = p.stock === 0 ? ['stock-out', 'Sold out — check back soon'] : p.stock <= 10 ? ['stock-low', `Only ${p.stock} left — order soon`] : ['stock-ok', 'In stock · ships within 24 hours'];
  const delivery = new Date(Date.now() + 3 * 86400000).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  let qty = 1;

  app.innerHTML = `
    <nav class="crumbs"><a href="#/">Home</a> / <a href="#/shop">Shop</a> / ${p.Category ? `<a href="#/shop?category=${p.Category.slug}">${esc(p.Category.name)}</a> / ` : ''}<span>${esc(p.name)}</span></nav>
    <div class="pdp">
      <div class="gallery">
        <div class="gallery-thumbs">${images.map((src, i) => `<button data-img="${i}" class="${i === 0 ? 'active' : ''}" aria-label="Image ${i + 1}"><img src="${esc(src)}" alt=""></button>`).join('')}</div>
        <div class="gallery-main" id="gallery-main">
          ${badges(p)}
          <img id="main-img" src="${esc(images[0] || '')}" alt="${esc(p.name)}">
          ${images.length > 1 ? '<div class="gallery-arrows"><button class="prev" aria-label="Previous image">‹</button><button class="next" aria-label="Next image">›</button></div>' : ''}
        </div>
      </div>

      <div class="pdp-info">
        ${p.brand ? `<a class="brand-link" href="#/shop?brand=${encodeURIComponent(p.brand)}">${esc(p.brand)}</a>` : `<span class="brand-link">${esc(p.subcategory || '')}</span>`}
        <h1>${esc(p.name)}</h1>
        <a href="#/product/${p.id}" class="pdp-rating" id="jump-reviews">${stars(p.ratingAvg, 17)} <strong>${(+p.ratingAvg).toFixed(1)}</strong> <span class="muted">· ${p.ratingCount} review${p.ratingCount === 1 ? '' : 's'}</span>${p.soldCount ? `<span class="muted">· ${p.soldCount}+ sold</span>` : ''}</a>
        <div class="pdp-price">${priceHtml(p)}${save ? `<span class="save">You save ${money(p.compareAtPriceCents - p.priceCents)} (${save}%)</span>` : ''}</div>
        <span class="hint">Prices in USD. ${p.priceCents >= 5000 ? 'Free shipping.' : 'Free shipping on orders over $50.'}</span>
        <p class="pdp-desc">${esc(p.description)}</p>
        <span class="stock-line ${stock[0]}">${stock[1]}</span>
        <div class="buy-row">
          <div class="qty"><button id="minus" aria-label="Decrease">−</button><span id="qty">1</span><button id="plus" aria-label="Increase">+</button></div>
          <button class="btn btn-accent btn-lg" id="add" ${p.stock === 0 ? 'disabled' : ''}>${p.stock === 0 ? 'Sold out' : 'Add to bag'}</button>
          <button class="fav-lg ${fav ? 'on' : ''}" data-fav="${p.id}" aria-label="Save to wishlist" title="Save to wishlist">${HEART}</button>
        </div>
        <button class="btn btn-primary btn-block btn-lg" id="buy-now" style="margin-top:10px" ${p.stock === 0 ? 'disabled' : ''}>Buy now</button>
        <div class="perks-list">
          <div><i>🚚</i><p style="margin:0"><strong>Get it by ${delivery}</strong><span>Free standard shipping on orders over $50</span></p></div>
          <div><i>↺</i><p style="margin:0"><strong>Easy cancellations</strong><span>Cancel any time before your order ships</span></p></div>
          <div><i>🛡️</i><p style="margin:0"><strong>1-year warranty</strong><span>Covered against manufacturing defects</span></p></div>
        </div>
        ${p.tags?.length ? `<div class="tags">${p.tags.map((t) => `<a class="chip" href="#/shop?q=${encodeURIComponent(t)}">#${esc(t)}</a>`).join('')}</div>` : ''}
        <div class="share-row"><button class="btn btn-ghost btn-sm" id="share">🔗 Copy link</button><button class="btn btn-ghost btn-sm" id="ask">💬 Ask a question</button></div>
      </div>
    </div>

    <div class="tabs-bar" role="tablist">
      <button class="active" data-tab="desc" role="tab">Description</button>
      <button data-tab="specs" role="tab">Specifications</button>
      <button data-tab="reviews" role="tab" id="reviews">Reviews (${p.ratingCount})</button>
      <button data-tab="shipping" role="tab">Shipping & returns</button>
    </div>
    <div id="tab-body"></div>

    <section class="section">
      <div class="section-head"><div><h2>You may also like</h2><p>More from ${esc(p.Category?.name || 'the collection')}.</p></div></div>
      <div class="rail" id="related"></div>
    </section>
    <section class="section" id="viewed-wrap" hidden>
      <div class="section-head"><div><h2>Recently viewed</h2></div></div>
      <div class="rail" id="viewed"></div>
    </section>`;

  // Gallery
  let cur = 0;
  const show = (i) => {
    cur = (i + images.length) % images.length;
    $('#main-img').src = images[cur];
    $$('[data-img]').forEach((b, j) => b.classList.toggle('active', j === cur));
  };
  $$('[data-img]').forEach((b) => (b.onclick = () => show(+b.dataset.img)));
  $('.gallery-arrows .prev')?.addEventListener('click', (e) => { e.stopPropagation(); show(cur - 1); });
  $('.gallery-arrows .next')?.addEventListener('click', (e) => { e.stopPropagation(); show(cur + 1); });
  const main = $('#gallery-main');
  main.onclick = () => main.classList.toggle('zoom');
  main.onmousemove = (e) => {
    const r = main.getBoundingClientRect();
    $('#main-img').style.transformOrigin = `${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`;
  };
  main.onmouseleave = () => main.classList.remove('zoom');

  // Buying
  const upd = () => { $('#qty').textContent = qty; $('#minus').disabled = qty <= 1; $('#plus').disabled = qty >= p.stock; };
  $('#minus').onclick = () => { qty = Math.max(1, qty - 1); upd(); };
  $('#plus').onclick = () => { qty = Math.min(p.stock, qty + 1); upd(); };
  upd();
  $('#add').onclick = async (e) => { busy(e.currentTarget); await addToCart(p.id, qty, p); busy(e.currentTarget, false); };
  $('#buy-now').onclick = async (e) => {
    if (!state.user) return hooks.openAuth('login', () => $('#buy-now')?.click());
    busy(e.currentTarget);
    if (await addToCart(p.id, qty, p)) location.hash = '#/checkout'; else busy(e.currentTarget, false);
  };
  $('#share').onclick = async () => {
    try { await navigator.clipboard.writeText(location.href); toast('Link copied to clipboard'); } catch { toast(location.href); }
  };
  $('#ask').onclick = () => (location.hash = `#/feedback?about=${encodeURIComponent(p.name)}`);
  $('#jump-reviews').onclick = (e) => { e.preventDefault(); openTab('reviews'); $('.tabs-bar').scrollIntoView({ behavior: 'smooth' }); };

  // Tabs
  const openTab = (tab) => {
    $$('[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    const body = $('#tab-body');
    if (tab === 'desc') body.innerHTML = `<div style="max-width:760px;font-size:16px;color:var(--ink-2)"><p style="margin-top:0">${esc(p.description)}</p><p>Every item at Lumen is hand-picked by our team and checked for quality before it ships. If anything isn’t right, our support team is a message away.</p></div>`;
    if (tab === 'specs') body.innerHTML = `<table class="specs">
      <tr><td>Brand</td><td>${esc(p.brand || '—')}</td></tr>
      <tr><td>Category</td><td>${esc(p.Category?.name || '—')}${p.subcategory ? ` › ${esc(p.subcategory)}` : ''}</td></tr>
      <tr><td>SKU</td><td>LMN-${String(p.id).padStart(5, '0')}</td></tr>
      <tr><td>Availability</td><td>${p.stock ? `${p.stock} in stock` : 'Out of stock'}</td></tr>
      <tr><td>Rating</td><td>${(+p.ratingAvg).toFixed(2)} / 5 from ${p.ratingCount} reviews</td></tr>
      ${p.tags?.length ? `<tr><td>Tags</td><td>${p.tags.map(esc).join(', ')}</td></tr>` : ''}
      <tr><td>Warranty</td><td>1 year limited</td></tr></table>`;
    if (tab === 'shipping') body.innerHTML = `<div class="faq" style="max-width:760px">
      <details open><summary>How much is shipping?</summary><p>Standard shipping is free on orders over $50. Below that, a flat $5.99 applies. Most orders arrive within 2–4 business days.</p></details>
      <details><summary>Can I cancel my order?</summary><p>Yes — any order that hasn’t been processed yet (status “pending”) can be cancelled from your Orders page in one click, and the stock is released immediately.</p></details>
      <details><summary>What if something arrives damaged?</summary><p>Send us a message from the <a class="link" href="#/feedback">Contact page</a> with your order number and we’ll make it right.</p></details></div>`;
    if (tab === 'reviews') renderReviews(body, p);
  };
  $$('[data-tab]').forEach((b) => (b.onclick = () => openTab(b.dataset.tab)));
  openTab('desc');

  // Related & recently viewed
  api(`/products/${p.id}/related`).then(({ data }) => {
    const r = $('#related'); if (!r) return;
    r.innerHTML = data.length ? data.map(productCard).join('') : '<p class="muted">No related products yet.</p>';
  });
  const viewed = store.get('viewed', []).filter((x) => x.id !== p.id);
  if (viewed.length) { $('#viewed-wrap').hidden = false; $('#viewed').innerHTML = viewed.map(productCard).join(''); }
}

// ---------- Reviews ----------
async function renderReviews(body, p) {
  const st = { sort: 'helpful', rating: null, page: 1 };
  body.innerHTML = `<div class="reviews"><aside class="rv-summary" id="rv-summary"><div class="skel" style="height:260px"></div></aside><div><div class="rv-tools" id="rv-tools"></div><div id="rv-list"></div><div class="pager" id="rv-more"></div></div></div>`;

  const load = async (append = false) => {
    const qs = new URLSearchParams({ sort: st.sort, page: st.page, limit: 6 });
    if (st.rating) qs.set('rating', st.rating);
    const { data, summary, meta } = await api(`/products/${p.id}/reviews?${qs}`);
    const mine = state.user && data.find((r) => r.UserId === state.user.id);

    $('#rv-summary').innerHTML = `
      <div class="rv-big"><strong>${summary.average.toFixed(1)}</strong><div>${stars(summary.average, 20)}<div class="muted" style="font-size:13px;margin-top:4px">Based on ${summary.total} review${summary.total === 1 ? '' : 's'}</div></div></div>
      <div class="rv-bars">${[5, 4, 3, 2, 1].map((n) => {
        const c = summary.breakdown[n] || 0; const w = summary.total ? (c / summary.total) * 100 : 0;
        return `<button class="rv-bar ${st.rating === n ? 'active' : ''}" data-filter="${n}"><span>${n} star</span><span class="track"><span class="fill" style="display:block;width:${w}%"></span></span><span>${c}</span></button>`;
      }).join('')}</div>
      <h4 style="margin:0 0 6px">Share your thoughts</h4>
      <p class="muted" style="margin:0 0 14px;font-size:14px">Help other shoppers by writing a review.</p>
      <button class="btn btn-primary btn-block" id="write-review">✍️ Write a review</button>`;
    $$('[data-filter]').forEach((b) => (b.onclick = () => { st.rating = st.rating === +b.dataset.filter ? null : +b.dataset.filter; st.page = 1; load(); }));
    $('#write-review').onclick = () => (state.user ? reviewForm(p, () => { st.page = 1; st.sort = 'newest'; load(); }) : hooks.openAuth('login', () => reviewForm(p, () => load())));

    $('#rv-tools').innerHTML = `
      <span class="muted" style="font-size:14px">${meta.total} review${meta.total === 1 ? '' : 's'}${st.rating ? ` with ${st.rating} stars · <button class="link" id="clear-rf">show all</button>` : ''}</span>
      <select class="select" id="rv-sort" style="width:auto;border-radius:999px;padding-top:8px;padding-bottom:8px;font-size:14px">
        ${[['helpful', 'Most helpful'], ['newest', 'Newest'], ['highest', 'Highest rating'], ['lowest', 'Lowest rating']].map(([v, l]) => `<option value="${v}" ${st.sort === v ? 'selected' : ''}>${l}</option>`).join('')}
      </select>`;
    $('#rv-sort').onchange = (e) => { st.sort = e.target.value; st.page = 1; load(); };
    $('#clear-rf')?.addEventListener('click', () => { st.rating = null; load(); });

    const html = data.map((r) => `
      <article class="review">
        <div class="review-head">
          <div class="review-author">
            <span class="review-avatar" style="background:${avatarColor(r.authorName)}">${esc(initials(r.authorName))}</span>
            <div><strong>${esc(r.authorName)}${state.user && r.UserId === state.user.id ? ' <span class="pill ok">You</span>' : ''}</strong><span>${timeAgo(r.createdAt)} · ${fmtDate(r.createdAt)}</span></div>
          </div>
          ${stars(r.rating, 15)}
        </div>
        ${r.title ? `<h5>${esc(r.title)}</h5>` : '<div style="height:10px"></div>'}
        <p>${esc(r.comment)}</p>
        <div class="review-actions">
          ${r.verifiedPurchase ? '<span class="verified">✔ Verified purchase</span>' : ''}
          <button data-helpful="${r.id}">👍 Helpful (<span>${r.helpfulCount}</span>)</button>
          ${state.user && (r.UserId === state.user.id || state.user.role === 'admin') ? `<button data-del-review="${r.id}">Delete</button>` : ''}
        </div>
      </article>`).join('');
    const list = $('#rv-list');
    if (append) list.insertAdjacentHTML('beforeend', html);
    else list.innerHTML = html || emptyState('💬', st.rating ? `No ${st.rating}-star reviews` : 'No reviews yet', 'Be the first to share your experience.');
    $('#rv-more').innerHTML = meta.page < meta.totalPages ? '<button class="btn btn-ghost" id="rv-load">Load more reviews</button>' : '';
    $('#rv-load')?.addEventListener('click', () => { st.page += 1; load(true); });

    $$('[data-helpful]', list).forEach((b) => (b.onclick = async () => {
      if (!state.user) return hooks.openAuth('login');
      try {
        const { data: d } = await api(`/reviews/${b.dataset.helpful}/helpful`, { method: 'POST' });
        b.querySelector('span').textContent = d.helpfulCount;
        b.classList.toggle('on', d.voted);
      } catch (e) { toast(errText(e), { type: 'error' }); }
    }));
    $$('[data-del-review]', list).forEach((b) => (b.onclick = async () => {
      if (!confirmInline(b, 'Confirm delete')) return;
      try { await api(`/reviews/${b.dataset.delReview}`, { method: 'DELETE' }); toast('Review deleted'); st.page = 1; load(); }
      catch (e) { toast(errText(e), { type: 'error' }); }
    }));
    if (mine) $('#write-review').outerHTML = '<p class="pill ok" style="padding:8px 14px">✔ Thanks — you’ve reviewed this product</p>';
  };
  load();
}

function reviewForm(p, done) {
  {
    const m = openModal(`
      <h2>Write a review</h2>
      <p class="sub">${esc(p.name)}</p>
      <form id="rv-form">
        <div id="rv-error"></div>
        <div class="field"><span class="label">Your rating</span>${starInput('rv-rating', 0)}</div>
        <div class="field"><label for="rv-title">Headline</label><input class="input" id="rv-title" name="title" maxlength="120" placeholder="Sum it up in a few words"></div>
        <div class="field"><label for="rv-comment">Your review</label><textarea class="textarea" id="rv-comment" name="comment" required maxlength="2000" placeholder="What did you like or dislike? How did you use it?"></textarea></div>
        <button class="btn btn-accent btn-block btn-lg" type="submit">Post review</button>
      </form>`, 'wide');
    $('#rv-form', m).onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target;
      const rating = +(f.querySelector('input[name="rv-rating"]:checked')?.value || 0);
      if (!rating) { $('#rv-error').innerHTML = '<div class="form-error">Please choose a star rating.</div>'; return; }
      const btn = f.querySelector('[type=submit]'); busy(btn);
      try {
        await api(`/products/${p.id}/reviews`, { method: 'POST', body: { rating, title: f.elements['title'].value.trim() || undefined, comment: f.comment.value.trim() } });
        closeModal(); toast('Thanks for your review! ⭐'); done?.();
      } catch (err) { $('#rv-error').innerHTML = `<div class="form-error">${esc(errText(err))}</div>`; busy(btn, false); }
    };
  }
}
