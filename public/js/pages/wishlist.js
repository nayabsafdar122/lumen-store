import { state, hooks, api, productCard, skeletonCards, emptyState, refreshCart, toast, $ } from '../core.js';

export default async function wishlist({ app }) {
  if (!state.user) {
    app.innerHTML = emptyState('♡', 'Save your favourites', 'Sign in to build a wishlist you can come back to anytime.', '<button class="btn btn-primary" id="w-login">Sign in</button>');
    $('#w-login').onclick = () => hooks.openAuth('login', () => hooks.route());
    return;
  }
  app.innerHTML = `<div class="page-head"><div><h1>Wishlist</h1><p>Things you love, all in one place.</p></div><div id="w-actions"></div></div><div class="grid" id="w-grid">${skeletonCards(4)}</div>`;
  const { data } = await api('/wishlist');
  if (!data.length) {
    $('#w-grid').outerHTML = emptyState('♡', 'Your wishlist is empty', 'Tap the heart on any product to save it here.', '<a class="btn btn-primary" href="#/shop">Discover products</a>');
    return;
  }
  $('#w-grid').innerHTML = data.map(productCard).join('');
  const inStock = data.filter((p) => p.stock > 0);
  if (inStock.length) {
    $('#w-actions').innerHTML = `<button class="btn btn-accent" id="add-all">Add all to bag (${inStock.length})</button>`;
    $('#add-all').onclick = async () => {
      let n = 0;
      for (const p of inStock) {
        try { await api('/cart/items', { method: 'POST', body: { productId: p.id, quantity: 1 } }); n++; } catch { /* skip */ }
      }
      await refreshCart();
      toast(`Added ${n} item${n === 1 ? '' : 's'} to your bag`);
      hooks.openCart();
    };
  }
  // Remove the card from the grid when un-hearted on this page.
  $('#w-grid').addEventListener('click', (e) => {
    const b = e.target.closest('[data-fav]');
    if (b && state.wishlist.has(+b.dataset.fav)) setTimeout(() => { if (!state.wishlist.has(+b.dataset.fav)) b.closest('.card')?.remove(); }, 400);
  });
}
