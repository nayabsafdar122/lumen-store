process.env.NODE_ENV = 'test';
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const { sequelize, User, Product, Coupon } = require('../src/models');

let adminToken;
let customerToken;
let categoryId;
let productId;

const address = {
  fullName: 'Jane Doe',
  line1: '1 Main St',
  city: 'Springfield',
  postalCode: '12345',
  country: 'US',
};

beforeAll(async () => {
  await sequelize.sync({ force: true });
  await User.create({
    name: 'Admin',
    email: 'admin@test.com',
    role: 'admin',
    passwordHash: await bcrypt.hash('adminpass1', 10),
  });
  const res = await request(app).post('/api/auth/login').send({ email: 'admin@test.com', password: 'adminpass1' });
  adminToken = res.body.token;
});

afterAll(() => sequelize.close());

describe('health', () => {
  test('GET /health', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });
  test('unknown route returns 404 JSON', async () => {
    const res = await request(app).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.message).toMatch(/not found/i);
  });
});

describe('auth', () => {
  test('register, then me', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Cust', email: 'Cust@Test.com', password: 'password123' });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('customer');
    expect(res.body.user.passwordHash).toBeUndefined();
    customerToken = res.body.token;

    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${customerToken}`);
    expect(me.body.user.email).toBe('cust@test.com');
  });
  test('duplicate email -> 409', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'X', email: 'cust@test.com', password: 'password123' });
    expect(res.status).toBe(409);
  });
  test('bad password -> 401', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'cust@test.com', password: 'wrongwrong' });
    expect(res.status).toBe(401);
  });
  test('validation errors -> 400', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'bad', password: '1' });
    expect(res.status).toBe(400);
    expect(res.body.error.details.length).toBeGreaterThan(0);
  });
  test('cannot self-register as admin', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Sneaky', email: 'sneaky@test.com', password: 'password123', role: 'admin' });
    expect(res.body.user.role).toBe('customer');
  });
});

describe('catalog', () => {
  test('customer cannot create products', async () => {
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ name: 'X', priceCents: 100 });
    expect(res.status).toBe(403);
  });
  test('admin creates category + product', async () => {
    const cat = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Gadgets & Toys' });
    expect(cat.status).toBe(201);
    expect(cat.body.data.slug).toBe('gadgets-toys');
    categoryId = cat.body.data.id;

    const prod = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Widget', description: 'A widget', priceCents: 1500, stock: 3, categoryId });
    expect(prod.status).toBe(201);
    productId = prod.body.data.id;
  });
  test('public list with filters', async () => {
    const res = await request(app).get('/api/products?category=gadgets-toys&search=wid&sort=price_asc');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.total).toBe(1);
  });
  test('admin partial update', async () => {
    const res = await request(app)
      .patch(`/api/products/${productId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ priceCents: 2000 });
    expect(res.status).toBe(200);
    expect(res.body.data.priceCents).toBe(2000);
    expect(res.body.data.stock).toBe(3);
  });
});

describe('cart and orders', () => {
  const auth = () => ({ Authorization: `Bearer ${customerToken}` });

  test('cart requires login', async () => {
    expect((await request(app).get('/api/cart')).status).toBe(401);
  });
  test('cannot add more than stock', async () => {
    const res = await request(app).post('/api/cart/items').set(auth()).send({ productId, quantity: 4 });
    expect(res.status).toBe(400);
  });
  test('add, update, view cart', async () => {
    await request(app).post('/api/cart/items').set(auth()).send({ productId, quantity: 1 });
    const res = await request(app).patch(`/api/cart/items/${productId}`).set(auth()).send({ quantity: 2 });
    expect(res.body.data.items[0].quantity).toBe(2);
    expect(res.body.data.subtotalCents).toBe(4000);
  });
  test('checkout creates order, decrements stock, empties cart', async () => {
    const res = await request(app).post('/api/orders').set(auth()).send({ shippingAddress: address });
    expect(res.status).toBe(201);
    expect(res.body.data.subtotalCents).toBe(4000);
    expect(res.body.data.shippingCents).toBe(599); // under $50 → flat shipping
    expect(res.body.data.totalCents).toBe(4599);
    expect(res.body.data.items[0].productName).toBe('Widget');
    expect((await Product.findByPk(productId)).stock).toBe(1);
    const cart = await request(app).get('/api/cart').set(auth());
    expect(cart.body.data.items).toHaveLength(0);
  });
  test('empty cart checkout -> 400', async () => {
    const res = await request(app).post('/api/orders').set(auth()).send({ shippingAddress: address });
    expect(res.status).toBe(400);
  });
  test('customer cancels pending order and stock is restored', async () => {
    const list = await request(app).get('/api/orders').set(auth());
    const orderId = list.body.data[0].id;
    const res = await request(app).post(`/api/orders/${orderId}/cancel`).set(auth());
    expect(res.body.data.status).toBe('cancelled');
    expect((await Product.findByPk(productId)).stock).toBe(3);
  });
  test('admin status transitions', async () => {
    await request(app).post('/api/cart/items').set(auth()).send({ productId, quantity: 1 });
    const order = await request(app).post('/api/orders').set(auth()).send({ shippingAddress: address });
    const id = order.body.data.id;
    const admin = { Authorization: `Bearer ${adminToken}` };

    expect((await request(app).patch(`/api/orders/${id}/status`).set(auth()).send({ status: 'paid' })).status).toBe(403);
    expect((await request(app).patch(`/api/orders/${id}/status`).set(admin).send({ status: 'delivered' })).status).toBe(400);
    expect((await request(app).patch(`/api/orders/${id}/status`).set(admin).send({ status: 'paid' })).body.data.status).toBe('paid');
    expect((await request(app).patch(`/api/orders/${id}/status`).set(admin).send({ status: 'shipped' })).body.data.status).toBe('shipped');
  });
  test("customers can't see other users' orders", async () => {
    const other = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Other', email: 'other@test.com', password: 'password123' });
    const res = await request(app).get('/api/orders/1').set('Authorization', `Bearer ${other.body.token}`);
    expect(res.status).toBe(404);
  });
});

describe('reviews, wishlist, coupons, feedback, admin', () => {
  const auth = () => ({ Authorization: `Bearer ${customerToken}` });
  const admin = () => ({ Authorization: `Bearer ${adminToken}` });

  test('customer writes a verified review; rating is aggregated', async () => {
    const res = await request(app).post(`/api/products/${productId}/reviews`).set(auth())
      .send({ rating: 4, title: 'Nice', comment: 'Works as expected' });
    expect(res.status).toBe(201);
    expect(res.body.data.verifiedPurchase).toBe(true); // they bought it above
    const p = await request(app).get(`/api/products/${productId}`);
    expect(p.body.data.ratingAvg).toBe(4);
    expect(p.body.data.ratingCount).toBe(1);
    const dup = await request(app).post(`/api/products/${productId}/reviews`).set(auth()).send({ rating: 5, comment: 'again!' });
    expect(dup.status).toBe(409);
  });

  test('reviews list has a summary; helpful voting toggles', async () => {
    const list = await request(app).get(`/api/products/${productId}/reviews`);
    expect(list.body.summary.total).toBe(1);
    expect(list.body.summary.breakdown['4']).toBe(1);
    const id = list.body.data[0].id;
    const v1 = await request(app).post(`/api/reviews/${id}/helpful`).set(admin());
    expect(v1.body.data).toMatchObject({ voted: true, helpfulCount: 1 });
    const v2 = await request(app).post(`/api/reviews/${id}/helpful`).set(admin());
    expect(v2.body.data).toMatchObject({ voted: false, helpfulCount: 0 });
  });

  test('wishlist add, list, remove', async () => {
    expect((await request(app).post(`/api/wishlist/${productId}`).set(auth())).status).toBe(201);
    const list = await request(app).get('/api/wishlist').set(auth());
    expect(list.body.data.map((p) => p.id)).toContain(productId);
    await request(app).delete(`/api/wishlist/${productId}`).set(auth());
    expect((await request(app).get('/api/wishlist').set(auth())).body.data).toHaveLength(0);
  });

  test('coupons: admin creates, customer validates and checks out with it', async () => {
    const c = await request(app).post('/api/coupons').set(admin()).send({ code: 'test50', type: 'percent', value: 50 });
    expect(c.status).toBe(201);
    expect(c.body.data.code).toBe('TEST50');
    await request(app).post('/api/cart/items').set(auth()).send({ productId, quantity: 1 });
    const v = await request(app).post('/api/coupons/validate').set(auth()).send({ code: 'test50' });
    expect(v.body.data.totals).toMatchObject({ subtotalCents: 2000, discountCents: 1000, shippingCents: 599, totalCents: 1599 });
    const bad = await request(app).post('/api/coupons/validate').set(auth()).send({ code: 'NOPE' });
    expect(bad.status).toBe(400);
    const order = await request(app).post('/api/orders').set(auth()).send({ shippingAddress: address, couponCode: 'TEST50' });
    expect(order.status).toBe(201);
    expect(order.body.data).toMatchObject({ discountCents: 1000, totalCents: 1599, couponCode: 'TEST50' });
    expect((await Coupon.findOne({ where: { code: 'TEST50' } })).usedCount).toBe(1);
  });

  test('facets, suggest and related', async () => {
    await request(app).post('/api/products').set(admin())
      .send({ name: 'Gizmo', brand: 'Acme', priceCents: 999, compareAtPriceCents: 1499, stock: 5, categoryId });
    const f = await request(app).get('/api/products/facets?category=gadgets-toys');
    expect(f.body.data.brands).toEqual([{ name: 'Acme', count: 1 }]);
    const sale = await request(app).get('/api/products?onSale=true');
    expect(sale.body.data.map((p) => p.name)).toEqual(['Gizmo']);
    const s = await request(app).get('/api/products/suggest?q=giz');
    expect(s.body.data[0].name).toBe('Gizmo');
    const r = await request(app).get(`/api/products/${productId}/related`);
    expect(r.body.data.map((p) => p.name)).toContain('Gizmo');
    const disc = await request(app).get('/api/products?sort=discount');
    expect(disc.body.data[0].name).toBe('Gizmo');
  });

  test('feedback + newsletter; admin can read them', async () => {
    const fb = await request(app).post('/api/feedback').send({ name: 'Jo', email: 'jo@x.com', type: 'suggestion', rating: 5, message: 'Please add gift cards!' });
    expect(fb.status).toBe(201);
    expect((await request(app).post('/api/newsletter').send({ email: 'jo@x.com' })).status).toBe(201);
    expect((await request(app).post('/api/newsletter').send({ email: 'jo@x.com' })).body.data.alreadySubscribed).toBe(true);
    expect((await request(app).get('/api/feedback').set(auth())).status).toBe(403);
    const list = await request(app).get('/api/feedback').set(admin());
    expect(list.body.data[0].message).toMatch(/gift cards/);
  });

  test('admin stats', async () => {
    const res = await request(app).get('/api/admin/stats').set(admin());
    expect(res.status).toBe(200);
    expect(res.body.data.salesByDay).toHaveLength(14);
    expect(res.body.data.orderCount).toBeGreaterThan(0);
    expect(res.body.data.topProducts[0].ProductId).toBe(productId);
  });

  test('profile update and password change', async () => {
    const u = await request(app).patch('/api/auth/me').set(auth()).send({ name: 'Cust Renamed' });
    expect(u.body.user.name).toBe('Cust Renamed');
    const bad = await request(app).post('/api/auth/password').set(auth()).send({ currentPassword: 'wrong', newPassword: 'newpassword1' });
    expect(bad.status).toBe(400);
    const ok = await request(app).post('/api/auth/password').set(auth()).send({ currentPassword: 'password123', newPassword: 'newpassword1' });
    expect(ok.status).toBe(200);
    expect((await request(app).post('/api/auth/login').send({ email: 'cust@test.com', password: 'newpassword1' })).status).toBe(200);
  });
});
