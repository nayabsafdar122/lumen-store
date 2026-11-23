// Fills the database with a realistic catalog, reviews, demo users, sample orders and coupons.
//
//   npm run seed          adds anything that's missing
//   npm run seed:reset    wipes all tables first (use this after upgrading)
//
// Products and photos come from the free DummyJSON catalog (https://dummyjson.com).
// If your computer is offline, a smaller built-in catalog is used instead.
const bcrypt = require('bcryptjs');
const {
  sequelize, User, Category, Product, Review, Coupon, Order, OrderItem, Feedback, Subscriber,
} = require('../models');

const CATALOG_URL = 'https://dummyjson.com/products?limit=0';
const IMG_BASE = 'https://cdn.dummyjson.com/product-images/';

// Store departments, built from the source categories.
const DEPARTMENTS = [
  { name: 'Electronics', slug: 'electronics', description: 'Phones, laptops, tablets & accessories', from: ['smartphones', 'laptops', 'tablets', 'mobile-accessories'] },
  { name: 'Fashion', slug: 'fashion', description: 'Clothing, shoes, bags & sunglasses', from: ['mens-shirts', 'mens-shoes', 'tops', 'womens-dresses', 'womens-shoes', 'womens-bags', 'sunglasses'] },
  { name: 'Watches & Jewelry', slug: 'watches-jewelry', description: 'Timepieces and fine jewelry', from: ['mens-watches', 'womens-watches', 'womens-jewellery'] },
  { name: 'Beauty', slug: 'beauty', description: 'Makeup, fragrance & skin care', from: ['beauty', 'fragrances', 'skin-care'] },
  { name: 'Home & Living', slug: 'home-living', description: 'Furniture, decor & kitchen', from: ['furniture', 'home-decoration', 'kitchen-accessories'] },
  { name: 'Sports & Outdoors', slug: 'sports-outdoors', description: 'Gear for every game', from: ['sports-accessories'] },
];
const deptFor = (cat) => DEPARTMENTS.find((d) => d.from.includes(cat));
const titleCase = (s) => s.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ').replace('Womens', "Women's").replace('Mens', "Men's");

// Deterministic pseudo-random numbers so every seed gives the same store.
let seedState = 42;
const rand = () => ((seedState = (seedState * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

const REVIEW_TITLES = {
  5: ['Absolutely love it', 'Exceeded expectations', 'Worth every penny', 'Five stars!', 'Fantastic quality'],
  4: ['Really good', 'Very happy overall', 'Great value', 'Solid purchase', 'Would recommend'],
  3: ['It’s okay', 'Decent, not amazing', 'Average', 'Does the job'],
  2: ['Disappointed', 'Not great', 'Expected more'],
  1: ['Would not buy again', 'Poor quality', 'Not as described'],
};
const REVIEW_EXTRA = {
  5: ['Arrived quickly and well packaged.', 'Looks even better in person.', 'I’ve already recommended it to friends.', 'Quality feels premium.'],
  4: ['Shipping was fast.', 'Minor nitpicks, but overall very good.', 'Good quality for the price.'],
  3: ['Some things could be better.', 'It works, but nothing special.'],
  2: ['The quality didn’t match the photos.', 'Took a while to arrive.'],
  1: ['Returned it after a week.', 'Broke after a few uses.'],
};

async function loadCatalog(log = console.log) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    const res = await fetch(CATALOG_URL, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const items = json.products.filter((p) => deptFor(p.category));
    if (items.length < 20) throw new Error('catalog too small');
    log(`🌐 Downloaded ${items.length} products from DummyJSON`);
    return items;
  } catch (err) {
    log(`⚠️  Could not download the online catalog (${err.message}). Using the built-in catalog.`);
    return require('./catalog-fallback.json');
  }
}

const normalizeReview = (r) =>
  Array.isArray(r) ? { name: r[0], rating: r[1], comment: r[2] } : { name: r.reviewerName, rating: r.rating, comment: r.comment };
const absUrl = (u) => (u.startsWith('http') ? u : IMG_BASE + u);

async function seedDatabase({ reset = false, log = console.log } = {}) {
  await sequelize.sync({ force: reset });
  if (sequelize.getDialect() === 'sqlite') await sequelize.query('PRAGMA synchronous = OFF'); // much faster seeding
  const t0 = Date.now();

  // ---------- Users ----------
  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@example.com';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'admin12345';
  const [admin] = await User.findOrCreate({
    where: { email: adminEmail },
    defaults: { name: 'Store Admin', role: 'admin', passwordHash: await bcrypt.hash(adminPassword, 10) },
  });
  const [customer] = await User.findOrCreate({
    where: { email: 'customer@example.com' },
    defaults: { name: 'Demo Customer', passwordHash: await bcrypt.hash('customer123', 10) },
  });
  const shopperHash = await bcrypt.hash('shopper123', 10);
  const shoppers = [customer];
  for (const [name, email] of [
    ['Ava Thompson', 'ava@example.com'], ['Noah Patel', 'noah@example.com'], ['Mia Chen', 'mia@example.com'],
    ['Liam Garcia', 'liam@example.com'], ['Zara Ahmed', 'zara@example.com'],
  ]) {
    const [u] = await User.findOrCreate({ where: { email }, defaults: { name, passwordHash: shopperHash } });
    shoppers.push(u);
  }

  if ((await Product.count()) > 0) {
    log('ℹ️  Products already exist. Run "npm run seed:reset" to rebuild the catalog from scratch.');
    return { skipped: true };
  }

  // ---------- Catalog ----------
  const catalog = await loadCatalog(log);
  const cats = {};
  for (const [i, d] of DEPARTMENTS.entries()) {
    const first = catalog.find((p) => d.from.includes(p.category));
    if (!first) continue; // no products for this department in the catalog
    [cats[d.slug]] = await Category.findOrCreate({
      where: { slug: d.slug },
      defaults: { name: d.name, description: d.description, position: i, imageUrl: first ? absUrl((first.images || [])[0] || first.thumbnail) : null },
    });
  }

  const now = Date.now();
  const products = [];
  for (const raw of catalog) {
    const dept = deptFor(raw.category);
    const images = (raw.images || []).slice(0, 5).map(absUrl);
    if (!images.length && raw.thumbnail) images.push(absUrl(raw.thumbnail));
    const priceCents = Math.round(raw.price * 100);
    const disc = Math.round(raw.discountPercentage || 0);
    const onSale = disc >= 10;
    const product = await Product.create({
      name: raw.title,
      brand: raw.brand || null,
      subcategory: titleCase(raw.category),
      description: raw.description,
      priceCents,
      compareAtPriceCents: onSale ? Math.round(priceCents / (1 - disc / 100) / 100) * 100 - 1 : null,
      stock: raw.stock ?? 25,
      imageUrl: images[0] || null,
      images,
      tags: raw.tags || [],
      soldCount: Math.floor(rand() * 400),
      CategoryId: cats[dept.slug].id,
    });
    // Spread creation dates over the last 90 days so "Newest" means something.
    const created = new Date(now - Math.floor(rand() * 90) * 86400000);
    await Product.update({ createdAt: created }, { where: { id: product.id }, silent: true });

    const reviews = (raw.reviews || []).map(normalizeReview);
    for (const r of reviews) {
      const extra = rand() > 0.4 ? ' ' + pick(REVIEW_EXTRA[r.rating]) : '';
      const review = await Review.create({
        ProductId: product.id,
        authorName: r.name,
        rating: r.rating,
        title: pick(REVIEW_TITLES[r.rating]),
        comment: r.comment + extra,
        verifiedPurchase: rand() > 0.3,
        helpfulCount: Math.floor(rand() * 25),
      });
      await Review.update({ createdAt: new Date(now - Math.floor(rand() * 120) * 86400000) }, { where: { id: review.id }, silent: true });
    }
    const avg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
    await product.update({ ratingAvg: Math.round(avg * 100) / 100, ratingCount: reviews.length });
    products.push(product);
  }

  // Feature the 2 best rated products of each department.
  for (const c of Object.values(cats)) {
    const best = products.filter((p) => p.CategoryId === c.id).sort((a, b) => b.ratingAvg - a.ratingAvg || b.soldCount - a.soldCount).slice(0, 2);
    for (const p of best) await p.update({ isFeatured: true });
  }

  // ---------- Coupons ----------
  for (const c of [
    { code: 'WELCOME10', description: '10% off your order', type: 'percent', value: 10 },
    { code: 'SAVE20', description: '$20 off orders over $100', type: 'fixed', value: 2000, minSubtotalCents: 10000 },
    { code: 'LUMEN25', description: '25% off orders over $250', type: 'percent', value: 25, minSubtotalCents: 25000 },
  ]) await Coupon.findOrCreate({ where: { code: c.code }, defaults: c });

  // ---------- Sample orders (so the admin dashboard has data) ----------
  const statuses = ['delivered', 'delivered', 'delivered', 'shipped', 'shipped', 'paid', 'paid', 'pending', 'pending', 'cancelled'];
  const cities = [['San Francisco', 'CA', '94103'], ['Austin', 'TX', '73301'], ['Seattle', 'WA', '98101'], ['New York', 'NY', '10001'], ['Chicago', 'IL', '60601']];
  for (let i = 0; i < 24; i++) {
    const user = pick(shoppers.slice(1));
    const chosen = [...new Set(Array.from({ length: 1 + Math.floor(rand() * 3) }, () => pick(products.filter((p) => p.priceCents < 50000))))];
    const items = chosen.map((p) => ({ ProductId: p.id, productName: p.name, imageUrl: p.imageUrl, unitPriceCents: p.priceCents, quantity: 1 + Math.floor(rand() * 2) }));
    const subtotal = items.reduce((n, it) => n + it.unitPriceCents * it.quantity, 0);
    const shipping = subtotal >= 5000 ? 0 : 599;
    const [city, state, zip] = pick(cities);
    const order = await Order.create(
      {
        UserId: user.id,
        status: pick(statuses),
        subtotalCents: subtotal,
        discountCents: 0,
        shippingCents: shipping,
        totalCents: subtotal + shipping,
        shippingAddress: { fullName: user.name, line1: `${100 + Math.floor(rand() * 900)} Market St`, city, state, postalCode: zip, country: 'US' },
        items,
      },
      { include: [{ model: OrderItem, as: 'items' }] }
    );
    await Order.update({ createdAt: new Date(now - Math.floor(rand() * 14) * 86400000 - Math.floor(rand() * 86400000)) }, { where: { id: order.id }, silent: true });
  }

  // ---------- Feedback & subscribers ----------
  await Feedback.bulkCreate([
    { name: 'Ava Thompson', email: 'ava@example.com', type: 'compliment', rating: 5, message: 'Love the new design — checkout was super quick and my order arrived early!' },
    { name: 'Noah Patel', email: 'noah@example.com', type: 'suggestion', rating: 4, message: 'Could you add more colour options for the sneakers? Otherwise great store.' },
    { name: 'Guest', email: 'guest@example.com', type: 'bug', rating: 3, message: 'On my phone the filter panel was a bit hard to close. Might be worth a look.', status: 'read' },
  ]);
  await Subscriber.bulkCreate([{ email: 'ava@example.com' }, { email: 'mia@example.com' }], { ignoreDuplicates: true });

  log(`✅ Seed complete in ${((Date.now() - t0) / 1000).toFixed(1)}s — ${products.length} products, ${await Review.count()} reviews, ${await Order.count()} orders`);
  log(`   Admin:    ${admin.email} / ${adminPassword}`);
  log('   Customer: customer@example.com / customer123');
  log('   Coupons:  WELCOME10, SAVE20, LUMEN25');
  return { products: products.length };
}

module.exports = { seedDatabase };

// Run directly: node src/scripts/seed.js [--reset]
if (require.main === module) {
  seedDatabase({ reset: process.argv.includes('--reset') })
    .then(() => sequelize.close())
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
