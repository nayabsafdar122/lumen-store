import { state, store, api, esc, money, stars, productCard, skeletonCards, emptyState, $, $$, SVG_GRID, SVG_LIST } from '../core.js';

const SORTS = [['popular', 'Most popular'], ['rating', 'Top rated'], ['newest', 'Newest'], ['price_asc', 'Price: low to high'], ['price_desc', 'Price: high to low'], ['discount', 'Biggest discount'], ['name', 'Name A–Z']];
const PER_PAGE = 24;

export default async function shop({ app, params }) {
  const q = {
    q: params.get('q') || '',
    category: params.get('category') || '',
    brand: (params.get('brand') || '').split(',').filter(Boolean),
    min: params.get('min') || '',
    max: params.get('max') || '',
    rating: params.get('rating') || '',
    sale: params.get('sale') === '1',
    stock: params.get('stock') === '1',
    sort: params.get('sort') || 'popular',
    page: Math.max(1, +params.get('page') || 1),
  };
  const view = store.get('view', 'grid');

  // Build a hash for the shop with some values changed.
  const link = (changes = {}) => {
    const n = { ...q, page: 1, ...changes };
    const p = new URLSearchParams();
    if (n.q) p.set('q', n.q);
    if (n.category) p.set('category', n.category);
    if (n.brand.length) p.set('brand', n.brand.join(','));
    if (n.min) p.set('min', n.min);
    if (n.max) p.set('max', n.max);
    if (n.rating) p.set('rating', n.rating);
    if (n.sale) p.set('sale', '1');
    if (n.stock) p.set('stock', '1');
    if (n.sort && n.sort !== 'popular') p.set('sort', n.sort);
    if (n.page > 1) p.set('page', n.page);
    const s = p.toString();
    return `#/shop${s ? `?${s}` : ''}`;
  };

  const cat = state.categories.find((c) => c.slug === q.category);
  const title = q.q ? `Results for “${esc(q.q)}”` : q.sale ? 'Deals & discounts' : cat ? esc(cat.name) : q.brand.length === 1 ? esc(q.brand[0]) : 'All products';
  const subtitle = q.q ? 'Showing the best matches from our catalog.' : q.sale ? 'Our biggest price drops — while stocks last.' : cat ? esc(cat.description || '') : 'Explore the full Lumen collection.';

  app.innerHTML = `
    <nav class="crumbs"><a href="#/">Home</a> / <a href="#/shop">Shop</a>${cat ? ` / <span>${esc(cat.name)}</span>` : ''}</nav>
    <div class="page-head"><div><h1>${title}</h1><p>${subtitle}</p></div></div>
    <div class="shop">
      <aside class="filters" id="filters" aria-label="Filters">
        <button class="btn btn-ghost btn-sm only-mobile" data-close-sheet style="margin-bottom:14px">✕ Close filters</button>
        <div class="filter-group">
          <h4>Department</h4>
          <div class="filter-list">
            <a href="${link({ category: '' })}" class="${!q.category ? 'active' : ''}"><span>All departments</span></a>
            ${state.categories.map((c) => `<a href="${link({ category: c.slug, brand: [] })}" class="${q.category === c.slug ? 'active' : ''}"><span>${esc(c.name)}</span><span>${c.productCount}</span></a>`).join('')}
          </div>
        </div>
        <div class="filter-group"><h4>Price</h4>
          <form class="price-inputs" id="price-form">
            <input class="input" name="min" type="number" min="0" placeholder="$ Min" value="${esc(q.min)}" aria-label="Minimum price">
            <span class="muted">–</span>
            <input class="input" name="max" type="number" min="0" placeholder="$ Max" value="${esc(q.max)}" aria-label="Maximum price">
            <button class="btn btn-soft btn-sm" style="grid-column:1/-1;margin-top:6px">Apply price</button>
          </form>
          <div id="price-hint" class="hint" style="margin-top:8px"></div>
        </div>
        <div class="filter-group"><h4>Customer rating</h4>
          <div class="rating-opts">${[4.5, 4, 3, 2].map((r) => `<button data-rating="${r}" class="${+q.rating === r ? 'active' : ''}">${stars(r, 13)} <span>${r} & up</span></button>`).join('')}</div>
        </div>
        <div class="filter-group"><h4>Availability</h4>
          <label class="check"><input type="checkbox" id="f-sale" ${q.sale ? 'checked' : ''}><span>On sale</span></label>
          <label class="check"><input type="checkbox" id="f-stock" ${q.stock ? 'checked' : ''}><span>In stock only</span></label>
        </div>
        <div class="filter-group" id="brand-group"><h4>Brand <span id="brand-count" class="muted" style="text-transform:none;letter-spacing:0"></span></h4>
          <input class="input" id="brand-search" placeholder="Search brands" style="padding:8px 12px;font-size:13.5px;margin-bottom:8px">
          <div class="filter-list" id="brand-list"><div class="skel" style="height:120px"></div></div>
        </div>
        <a href="#/shop" class="btn btn-ghost btn-block" style="margin-top:16px">Clear all filters</a>
      </aside>

      <section>
        <div class="shop-bar">
          <div style="display:flex;gap:10px;align-items:center">
            <button class="btn btn-ghost btn-sm mobile-filter-btn" id="open-filters">⚙ Filters</button>
            <span class="count" id="count">Loading…</span>
          </div>
          <div class="shop-tools">
            <select class="select" id="sort" aria-label="Sort by">${SORTS.map(([v, l]) => `<option value="${v}" ${q.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
            <div class="view-toggle" role="group" aria-label="View">
              <button data-view="grid" class="${view === 'grid' ? 'active' : ''}" aria-label="Grid view">${SVG_GRID}</button>
              <button data-view="list" class="${view === 'list' ? 'active' : ''}" aria-label="List view">${SVG_LIST}</button>
            </div>
          </div>
        </div>
        <div class="active-filters" id="active"></div>
        <div class="grid ${view === 'list' ? 'list' : ''}" id="results">${skeletonCards(12)}</div>
        <div class="pager" id="pager"></div>
      </section>
    </div>`;

  // Active filter chips
  const chips = [];
  if (q.q) chips.push([`Search: ${q.q}`, link({ q: '' })]);
  if (cat) chips.push([cat.name, link({ category: '', brand: [] })]);
  q.brand.forEach((b) => chips.push([b, link({ brand: q.brand.filter((x) => x !== b) })]));
  if (q.min || q.max) chips.push([`${q.min ? '$' + q.min : '$0'} – ${q.max ? '$' + q.max : 'any'}`, link({ min: '', max: '' })]);
  if (q.rating) chips.push([`${q.rating}★ & up`, link({ rating: '' })]);
  if (q.sale) chips.push(['On sale', link({ sale: false })]);
  if (q.stock) chips.push(['In stock', link({ stock: false })]);
  $('#active').innerHTML = chips.length ? chips.map(([l, h]) => `<a href="${h}" class="chip">${esc(l)} <b>✕</b></a>`).join('') + `<a href="#/shop" class="chip">Clear all</a>` : '';

  // Controls
  $('#sort').onchange = (e) => (location.hash = link({ sort: e.target.value }));
  $('#f-sale').onchange = (e) => (location.hash = link({ sale: e.target.checked }));
  $('#f-stock').onchange = (e) => (location.hash = link({ stock: e.target.checked }));
  $$('[data-rating]').forEach((b) => (b.onclick = () => (location.hash = link({ rating: +q.rating === +b.dataset.rating ? '' : b.dataset.rating }))));
  $('#price-form').onsubmit = (e) => { e.preventDefault(); location.hash = link({ min: e.target.min.value, max: e.target.max.value }); };
  $$('[data-view]').forEach((b) => (b.onclick = () => {
    store.set('view', b.dataset.view);
    $$('[data-view]').forEach((x) => x.classList.toggle('active', x === b));
    $('#results').classList.toggle('list', b.dataset.view === 'list');
  }));
  $('#open-filters').onclick = () => { $('#filters').classList.add('open'); $('#scrim').hidden = false; };

  // Query the API
  const apiQ = new URLSearchParams({ sort: q.sort, page: q.page, limit: PER_PAGE });
  if (q.q) apiQ.set('search', q.q);
  if (q.category) apiQ.set('category', q.category);
  if (q.brand.length) apiQ.set('brand', q.brand.join(','));
  if (q.min) apiQ.set('minPrice', Math.round(+q.min * 100));
  if (q.max) apiQ.set('maxPrice', Math.round(+q.max * 100));
  if (q.rating) apiQ.set('minRating', q.rating);
  if (q.sale) apiQ.set('onSale', 'true');
  if (q.stock) apiQ.set('inStock', 'true');
  const facetQ = new URLSearchParams(apiQ); ['sort', 'page', 'limit', 'brand', 'minPrice', 'maxPrice'].forEach((k) => facetQ.delete(k));

  const [{ data, meta }, facets] = await Promise.all([api(`/products?${apiQ}`), api(`/products/facets?${facetQ}`)]);
  if (!document.body.contains($('#results'))) return;

  $('#count').innerHTML = `<strong>${meta.total}</strong> product${meta.total === 1 ? '' : 's'}`;
  $('#results').innerHTML = data.length
    ? data.map(productCard).join('')
    : `<div style="grid-column:1/-1">${emptyState('🔍', 'No products match', 'Try removing a filter or searching for something else.', '<a href="#/shop" class="btn btn-primary">Clear filters</a>')}</div>`;

  // Brands facet
  const brands = facets.data.brands;
  $('#brand-count').textContent = brands.length ? `(${brands.length})` : '';
  const renderBrands = (filter = '') => {
    const list = brands.filter((b) => b.name.toLowerCase().includes(filter.toLowerCase()));
    $('#brand-list').innerHTML = list.length
      ? list.map((b) => `<label class="check"><input type="checkbox" data-brand="${esc(b.name)}" ${q.brand.includes(b.name) ? 'checked' : ''}><span>${esc(b.name)}</span><span>${b.count}</span></label>`).join('')
      : '<span class="hint">No brands</span>';
    $$('[data-brand]').forEach((cb) => (cb.onchange = () => {
      const next = cb.checked ? [...q.brand, cb.dataset.brand] : q.brand.filter((x) => x !== cb.dataset.brand);
      location.hash = link({ brand: next });
    }));
  };
  if (!brands.length) $('#brand-group').hidden = true;
  else { renderBrands(); $('#brand-search').oninput = (e) => renderBrands(e.target.value); }
  if (facets.data.total) $('#price-hint').textContent = `Prices range from ${money(facets.data.price.min)} to ${money(facets.data.price.max)}`;

  // Pagination
  const pages = meta.totalPages;
  if (pages > 1) {
    const nums = [];
    for (let i = 1; i <= pages; i++) if (i === 1 || i === pages || Math.abs(i - q.page) <= 1) nums.push(i); else if (nums[nums.length - 1] !== '…') nums.push('…');
    $('#pager').innerHTML = `<button data-page="${q.page - 1}" ${q.page <= 1 ? 'disabled' : ''} aria-label="Previous page">←</button>`
      + nums.map((n) => (n === '…' ? '<button disabled>…</button>' : `<button data-page="${n}" class="${n === q.page ? 'active' : ''}">${n}</button>`)).join('')
      + `<button data-page="${q.page + 1}" ${q.page >= pages ? 'disabled' : ''} aria-label="Next page">→</button>`;
    $$('[data-page]').forEach((b) => (b.onclick = () => { location.hash = link({ page: +b.dataset.page }); window.scrollTo({ top: 0, behavior: 'smooth' }); }));
  }
}
