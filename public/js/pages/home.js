import { state, store, api, esc, money, stars, productCard, skeletonCards, toast, errText, $, $$, hooks } from '../core.js';

let heroTimer;

const rail = (id, title, sub, link) => `
  <section class="section">
    <div class="section-head">
      <div><h2>${title}</h2><p>${sub}</p></div>
      <div style="display:flex;gap:12px;align-items:center">
        ${link ? `<a href="${link}" class="link">View all →</a>` : ''}
        <div class="rail-nav"><button data-rail="${id}" data-dir="-1" aria-label="Scroll left">←</button><button data-rail="${id}" data-dir="1" aria-label="Scroll right">→</button></div>
      </div>
    </div>
    <div class="rail" id="${id}">${skeletonCards(4)}</div>
  </section>`;

export default async function home({ app }) {
  clearInterval(heroTimer);
  const viewed = store.get('viewed', []);
  app.innerHTML = `
    <section class="hero" id="hero">
      <div class="skel" style="position:absolute;inset:0;border-radius:28px"></div>
    </section>
    <div class="trust">
      <div><i>🚚</i><span><strong>Free shipping</strong><span>On orders over $50</span></span></div>
      <div><i>↺</i><span><strong>Easy cancellations</strong><span>Any pending order</span></span></div>
      <div><i>⭐</i><span><strong>Real reviews</strong><span>From verified buyers</span></span></div>
      <div><i>🔒</i><span><strong>Secure checkout</strong><span>Encrypted accounts</span></span></div>
    </div>

    <section class="section">
      <div class="section-head"><div><h2>Shop by department</h2><p>Everything you need, beautifully organised.</p></div><a href="#/shop" class="link">Browse all →</a></div>
      <div class="cat-grid" id="cats">${state.categories.map((c) => `
        <a href="#/shop?category=${c.slug}" class="cat-tile">
          <div class="cat-img"><img src="${esc(c.imageUrl || '')}" alt="" loading="lazy"></div>
          <strong>${esc(c.name)}</strong><span>${c.productCount} products</span>
        </a>`).join('')}</div>
    </section>

    ${rail('deals', 'Today’s deals', 'Limited-time prices on customer favourites.', '#/shop?sale=1&sort=discount')}

    <section class="section">
      <div class="banners" id="banners"></div>
    </section>

    ${rail('best', 'Best sellers', 'What everyone’s adding to their bag right now.', '#/shop?sort=popular')}

    <section class="section">
      <div class="section-head"><div><h2>Top rated</h2><p>Loved by our customers — 4.5★ and up.</p></div><a href="#/shop?sort=rating&rating=4" class="link">See more →</a></div>
      <div class="grid cols-4" id="top">${skeletonCards(8)}</div>
    </section>

    ${rail('new', 'New arrivals', 'Fresh additions to the collection.', '#/shop?sort=newest')}

    <section class="section">
      <div class="section-head"><div><h2>What customers say</h2><p>Real reviews from real shoppers.</p></div></div>
      <div class="testimonials" id="quotes"></div>
    </section>

    <section class="section">
      <div class="section-head" style="justify-content:center;text-align:center"><div><h2>Brands we love</h2></div></div>
      <div class="brand-strip" id="brands"></div>
    </section>

    ${viewed.length ? `<section class="section"><div class="section-head"><div><h2>Recently viewed</h2><p>Pick up where you left off.</p></div><button class="link" id="clear-viewed">Clear</button></div><div class="rail" id="viewed">${viewed.map(productCard).join('')}</div></section>` : ''}

    <section class="news-band">
      <div><h2>Get 10% off your first order</h2><p>Join our newsletter for early access to deals, new arrivals and members-only codes.</p></div>
      <form id="band-news"><input class="input" type="email" placeholder="you@example.com" required aria-label="Email"><button class="btn btn-accent" type="submit">Subscribe</button></form>
    </section>`;

  $$('[data-rail]').forEach((b) => (b.onclick = () => {
    const r = document.getElementById(b.dataset.rail);
    r.scrollBy({ left: r.clientWidth * 0.8 * +b.dataset.dir, behavior: 'smooth' });
  }));
  $('#clear-viewed')?.addEventListener('click', (e) => { store.set('viewed', []); e.target.closest('.section').remove(); });
  $('#band-news').onsubmit = async (e) => {
    e.preventDefault();
    const input = e.target.querySelector('input');
    try {
      const { data } = await api('/newsletter', { method: 'POST', body: { email: input.value } });
      toast(data.alreadySubscribed ? 'You’re already on the list 💌' : 'Welcome aboard! Use code WELCOME10 at checkout 🎉');
      input.value = '';
    } catch (err) { toast(errText(err), { type: 'error' }); }
  };

  const [featured, deals, best, top, fresh, facets, coupons] = await Promise.all([
    api('/products?featured=true&sort=rating&limit=12'),
    api('/products?onSale=true&sort=discount&limit=12'),
    api('/products?sort=popular&limit=12'),
    api('/products?sort=rating&minRating=4.5&limit=8'),
    api('/products?sort=newest&limit=12'),
    api('/products/facets'),
    api('/coupons/public').catch(() => ({ data: [] })),
  ]);
  if (!document.body.contains($('#hero'))) return; // user navigated away

  renderHero(featured.data);
  $('#deals').innerHTML = deals.data.map(productCard).join('');
  $('#best').innerHTML = best.data.map(productCard).join('');
  $('#top').innerHTML = top.data.map(productCard).join('') || '<p class="muted">No top-rated products yet.</p>';
  $('#new').innerHTML = fresh.data.map(productCard).join('');
  $('#brands').innerHTML = facets.data.brands.slice(0, 14).map((b) => `<a href="#/shop?brand=${encodeURIComponent(b.name)}">${esc(b.name)}</a>`).join('');

  const c1 = coupons.data.find((c) => c.code === 'WELCOME10') || coupons.data[0];
  const c2 = coupons.data.find((c) => c.code === 'SAVE20') || coupons.data[1];
  const pick = (i) => featured.data[i % Math.max(featured.data.length, 1)]?.imageUrl || '';
  $('#banners').innerHTML = `
    <a href="#/shop?sale=1&sort=discount" class="banner b1">
      <span class="eyebrow">Members offer</span>
      <h3>${c1 ? esc(c1.description) : 'Seasonal savings'}</h3>
      <p>${c1 ? `Use code <span class="code">${esc(c1.code)}</span> at checkout.` : 'Discover our best prices.'}</p>
      <span class="btn btn-accent" style="align-self:flex-start">Shop deals</span>
      <img src="${esc(deals.data[0]?.imageUrl || pick(0))}" alt="">
    </a>
    <a href="#/shop?sort=popular" class="banner b2">
      <span class="eyebrow">Bigger bag, bigger savings</span>
      <h3>${c2 ? esc(c2.description) : 'Free shipping over $50'}</h3>
      <p>${c2 ? `Code <span class="code">${esc(c2.code)}</span> · applied at checkout.` : 'On every order.'}</p>
      <span class="btn btn-primary" style="align-self:flex-start">Shop best sellers</span>
      <img src="${esc(best.data[1]?.imageUrl || pick(1))}" alt="">
    </a>`;

  // Testimonials: best review from three top-rated products
  const sources = top.data.slice(0, 3);
  const reviews = await Promise.all(sources.map((p) => api(`/products/${p.id}/reviews?sort=highest&limit=1`).then((r) => ({ p, r: r.data[0] })).catch(() => null)));
  const quotes = $('#quotes');
  if (quotes) quotes.innerHTML = reviews.filter((x) => x?.r).map(({ p, r }) => `
    <figure class="quote" style="margin:0">
      ${stars(r.rating, 15)}
      <p>“${esc(r.title ? r.title + '. ' : '')}${esc(r.comment)}”</p>
      <footer><img src="${esc(p.imageUrl)}" alt=""><span><strong style="color:var(--ink)">${esc(r.authorName)}</strong><br>on <a href="#/product/${p.id}" class="link">${esc(p.name)}</a></span></footer>
    </figure>`).join('');
}

function renderHero(featured) {
  const hero = $('#hero');
  const img = (i) => esc(featured[i % Math.max(featured.length, 1)]?.imageUrl || '');
  const f = (i) => featured[i % Math.max(featured.length, 1)] || {};
  const cat = (slug) => state.categories.find((c) => c.slug === slug);
  const slides = [
    { cls: 's1', eyebrow: '✦ New season', title: 'Everyday things, <em>beautifully</em> made.', text: 'Thoughtfully chosen tech, fashion, beauty and home goods — delivered free over $50.', cta: ['Shop the collection', '#/shop'], imgs: [0, 1, 2] },
    { cls: 's2', eyebrow: '⚡ Tech week', title: 'Upgrade your <em>setup</em>.', text: 'Phones, laptops and accessories from the brands you trust, at prices you’ll love.', cta: ['Shop electronics', cat('electronics') ? '#/shop?category=electronics' : '#/shop'], imgs: [3, 4, 5] },
    { cls: 's3', eyebrow: '🔥 Up to 25% off', title: 'Deals worth <em>getting</em> excited about.', text: 'Limited-time savings across every department. Stack them with code LUMEN25.', cta: ['See all deals', '#/shop?sale=1&sort=discount'], imgs: [6, 7, 8] },
  ];
  hero.innerHTML = slides.map((s, i) => `
    <div class="slide ${s.cls} ${i === 0 ? 'active' : ''}" aria-hidden="${i !== 0}">
      <div>
        <span class="eyebrow">${s.eyebrow}</span>
        <h1>${s.title}</h1>
        <p>${s.text}</p>
        <div class="slide-actions"><a href="${s.cta[1]}" class="btn btn-accent btn-lg">${s.cta[0]}</a>${state.user ? '' : '<button class="btn btn-ghost btn-lg" data-join>Create account</button>'}</div>
      </div>
      <div class="slide-art">
        <a href="#/product/${f(s.imgs[0]).id}" class="art a1"><img src="${img(s.imgs[0])}" alt=""></a>
        <a href="#/product/${f(s.imgs[1]).id}" class="art a2"><img src="${img(s.imgs[1])}" alt=""></a>
        <a href="#/product/${f(s.imgs[2]).id}" class="art a3"><img src="${img(s.imgs[2])}" alt=""></a>
        <div class="tag">${stars(f(s.imgs[0]).ratingAvg || 5, 12)}<strong>${esc(f(s.imgs[0]).name || '')}</strong>${f(s.imgs[0]).priceCents ? money(f(s.imgs[0]).priceCents) : ''}</div>
      </div>
    </div>`).join('') + `<div class="hero-dots">${slides.map((_, i) => `<button data-slide="${i}" class="${i === 0 ? 'active' : ''}" aria-label="Slide ${i + 1}"></button>`).join('')}</div>`;

  let cur = 0;
  const go = (n) => {
    cur = (n + slides.length) % slides.length;
    $$('.slide', hero).forEach((s, i) => { s.classList.toggle('active', i === cur); s.setAttribute('aria-hidden', i !== cur); });
    $$('[data-slide]', hero).forEach((d, i) => d.classList.toggle('active', i === cur));
  };
  $$('[data-slide]', hero).forEach((d) => (d.onclick = () => { go(+d.dataset.slide); restart(); }));
  $$('[data-join]', hero).forEach((b) => (b.onclick = () => hooks.openAuth('register')));
  const restart = () => { clearInterval(heroTimer); heroTimer = setInterval(() => (document.body.contains(hero) ? go(cur + 1) : clearInterval(heroTimer)), 6000); };
  restart();
  hero.onmouseenter = () => clearInterval(heroTimer);
  hero.onmouseleave = restart;
}

