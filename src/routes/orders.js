const router = require('express').Router();
const { z } = require('zod');
const { Op } = require('sequelize');
const { sequelize, Order, OrderItem, CartItem, Product, User, Coupon } = require('../models');
const validate = require('../middleware/validate');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { AppError, asyncHandler } = require('../utils/errors');
const { findUsableCoupon, totals } = require('../utils/pricing');

router.use(requireAuth);

const STATUSES = ['pending', 'paid', 'shipped', 'delivered', 'cancelled'];
const idParams = z.object({ id: z.coerce.number().int().positive() });
const checkoutBody = z.object({
  shippingAddress: z.object({
    fullName: z.string().trim().min(1).max(100),
    phone: z.string().trim().max(30).optional(),
    line1: z.string().trim().min(1).max(200),
    line2: z.string().trim().max(200).optional(),
    city: z.string().trim().min(1).max(100),
    state: z.string().trim().max(100).optional(),
    postalCode: z.string().trim().min(1).max(20),
    country: z.string().trim().min(2).max(56),
  }),
  couponCode: z.string().trim().max(30).optional(),
  note: z.string().trim().max(500).optional(),
});
const statusBody = z.object({ status: z.enum(STATUSES) });
const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(STATUSES).optional(),
  search: z.string().trim().max(100).optional(), // admin: order id, name or email
});

const orderInclude = [{ model: OrderItem, as: 'items', attributes: { exclude: ['OrderId'] } }];

// Checkout: turns the cart into an order. Runs in a transaction so stock and
// the order are always consistent, even if two people buy the last item at once.
router.post(
  '/',
  validate({ body: checkoutBody }),
  asyncHandler(async (req, res) => {
    const order = await sequelize.transaction(async (t) => {
      const cart = await CartItem.findAll({ where: { UserId: req.user.id }, transaction: t });
      if (cart.length === 0) throw new AppError(400, 'Your cart is empty');

      let subtotal = 0;
      const lines = [];
      for (const item of cart) {
        const product = await Product.findByPk(item.ProductId, { transaction: t });
        if (!product || !product.isActive) throw new AppError(400, `A product in your cart is no longer available`);
        // Atomic conditional decrement: fails if stock dropped below the requested quantity.
        const [affected] = await Product.update(
          {
            stock: sequelize.literal(`"stock" - ${Number(item.quantity)}`),
            soldCount: sequelize.literal(`"soldCount" + ${Number(item.quantity)}`),
          },
          { where: { id: product.id, stock: { [Op.gte]: item.quantity } }, transaction: t }
        );
        if (!affected) throw new AppError(409, `Not enough stock for "${product.name}"`);
        subtotal += product.priceCents * item.quantity;
        lines.push({
          ProductId: product.id,
          productName: product.name,
          imageUrl: product.imageUrl,
          unitPriceCents: product.priceCents,
          quantity: item.quantity,
        });
      }

      const coupon = await findUsableCoupon(req.valid.body.couponCode, subtotal, t);
      const sums = totals(subtotal, coupon);
      if (coupon) await coupon.increment('usedCount', { transaction: t });

      const created = await Order.create(
        {
          UserId: req.user.id,
          subtotalCents: sums.subtotalCents,
          discountCents: sums.discountCents,
          shippingCents: sums.shippingCents,
          totalCents: sums.totalCents,
          couponCode: sums.couponCode,
          note: req.valid.body.note || null,
          shippingAddress: req.valid.body.shippingAddress,
          items: lines,
        },
        { include: [{ model: OrderItem, as: 'items' }], transaction: t }
      );
      await CartItem.destroy({ where: { UserId: req.user.id }, transaction: t });
      return created;
    });

    const full = await Order.findByPk(order.id, { include: orderInclude });
    res.status(201).json({ data: full });
  })
);

// Customers see their own orders; admins see everyone's.
router.get(
  '/',
  validate({ query: listQuery }),
  asyncHandler(async (req, res) => {
    const { page, limit, status, search } = req.valid.query;
    const isAdmin = req.user.role === 'admin';
    const where = {};
    if (!isAdmin) where.UserId = req.user.id;
    if (status) where.status = status;
    const include = [...orderInclude];
    if (isAdmin) {
      const userInclude = { model: User, attributes: ['id', 'name', 'email'] };
      if (search) {
        const like = sequelize.getDialect() === 'postgres' ? Op.iLike : Op.like;
        if (/^\d+$/.test(search)) where.id = Number(search);
        else {
          userInclude.where = { [Op.or]: [{ name: { [like]: `%${search}%` } }, { email: { [like]: `%${search}%` } }] };
          userInclude.required = true;
        }
      }
      include.push(userInclude);
    }

    const { rows, count } = await Order.findAndCountAll({
      where,
      include,
      order: [['createdAt', 'DESC']],
      limit,
      offset: (page - 1) * limit,
      distinct: true,
    });
    res.json({ data: rows, meta: { page, limit, total: count, totalPages: Math.ceil(count / limit) } });
  })
);

router.get(
  '/:id',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const order = await Order.findByPk(req.valid.params.id, { include: orderInclude });
    if (!order || (req.user.role !== 'admin' && order.UserId !== req.user.id)) {
      throw new AppError(404, 'Order not found');
    }
    res.json({ data: order });
  })
);

// Customer can cancel their own pending order; stock is returned.
router.post(
  '/:id/cancel',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    await sequelize.transaction(async (t) => {
      const order = await Order.findByPk(req.valid.params.id, { include: orderInclude, transaction: t });
      if (!order || (req.user.role !== 'admin' && order.UserId !== req.user.id)) {
        throw new AppError(404, 'Order not found');
      }
      if (order.status !== 'pending') throw new AppError(400, `Cannot cancel an order that is ${order.status}`);
      await restock(order, t);
      await order.update({ status: 'cancelled' }, { transaction: t });
    });
    res.json({ data: await Order.findByPk(req.valid.params.id, { include: orderInclude }) });
  })
);

// Reorder: put the items of a past order back in the cart (as far as stock allows).
router.post(
  '/:id/reorder',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const order = await Order.findByPk(req.valid.params.id, { include: orderInclude });
    if (!order || order.UserId !== req.user.id) throw new AppError(404, 'Order not found');
    let added = 0;
    for (const item of order.items) {
      const product = item.ProductId && (await Product.findByPk(item.ProductId));
      if (!product || !product.isActive || product.stock < 1) continue;
      const existing = await CartItem.findOne({ where: { UserId: req.user.id, ProductId: product.id } });
      const qty = Math.min(product.stock, (existing ? existing.quantity : 0) + item.quantity);
      if (existing) await existing.update({ quantity: qty });
      else await CartItem.create({ UserId: req.user.id, ProductId: product.id, quantity: qty });
      added++;
    }
    res.json({ data: { added, skipped: order.items.length - added } });
  })
);

// Admin: move an order through its lifecycle.
const TRANSITIONS = {
  pending: ['paid', 'cancelled'],
  paid: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};

router.patch(
  '/:id/status',
  requireAdmin,
  validate({ params: idParams, body: statusBody }),
  asyncHandler(async (req, res) => {
    const next = req.valid.body.status;
    await sequelize.transaction(async (t) => {
      const order = await Order.findByPk(req.valid.params.id, { include: orderInclude, transaction: t });
      if (!order) throw new AppError(404, 'Order not found');
      if (!TRANSITIONS[order.status].includes(next)) {
        throw new AppError(400, `Cannot change status from ${order.status} to ${next}`);
      }
      if (next === 'cancelled') await restock(order, t);
      await order.update({ status: next }, { transaction: t });
    });
    res.json({ data: await Order.findByPk(req.valid.params.id, { include: orderInclude }) });
  })
);

async function restock(order, t) {
  for (const item of order.items) {
    if (!item.ProductId) continue;
    await Product.update(
      {
        stock: sequelize.literal(`"stock" + ${Number(item.quantity)}`),
        soldCount: sequelize.literal(`CASE WHEN "soldCount" >= ${Number(item.quantity)} THEN "soldCount" - ${Number(item.quantity)} ELSE 0 END`),
      },
      { where: { id: item.ProductId }, transaction: t }
    );
  }
  if (order.couponCode) {
    await Coupon.decrement('usedCount', { by: 1, where: { code: order.couponCode, usedCount: { [Op.gt]: 0 } }, transaction: t });
  }
}

module.exports = router;
