const router = require('express').Router();
const { Op } = require('sequelize');
const { sequelize, Order, OrderItem, Product, User, Review, Feedback, Subscriber, localImg } = require('../models');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { asyncHandler } = require('../utils/errors');

router.use(requireAuth, requireAdmin);

// Dashboard numbers in one request.
router.get(
  '/stats',
  asyncHandler(async (req, res) => {
    const since = new Date(Date.now() - 13 * 24 * 3600 * 1000);
    since.setHours(0, 0, 0, 0);

    const [orders, recentOrders, customers, reviews, newFeedback, subscribers, lowStock, topItems] = await Promise.all([
      Order.findAll({ attributes: ['status', 'totalCents', 'createdAt'], raw: true }),
      Order.findAll({
        include: [{ model: User, attributes: ['name', 'email'] }, { model: OrderItem, as: 'items', attributes: ['quantity'] }],
        order: [['createdAt', 'DESC']],
        limit: 6,
      }),
      User.count({ where: { role: 'customer' } }),
      Review.count(),
      Feedback.count({ where: { status: 'new' } }),
      Subscriber.count(),
      Product.findAll({
        where: { isActive: true, stock: { [Op.lte]: 10 } },
        attributes: ['id', 'name', 'stock', 'imageUrl'],
        order: [['stock', 'ASC']],
        limit: 8,
      }),
      OrderItem.findAll({
        attributes: ['ProductId', 'productName', 'imageUrl', [sequelize.fn('SUM', sequelize.col('quantity')), 'units'], [sequelize.literal('SUM("quantity" * "unitPriceCents")'), 'revenue']],
        include: [{ model: Order, attributes: [], where: { status: { [Op.ne]: 'cancelled' } }, required: true }],
        group: ['ProductId', 'productName', 'imageUrl'],
        order: [[sequelize.literal('units'), 'DESC']],
        limit: 5,
        raw: true,
      }),
    ]);

    const live = orders.filter((o) => o.status !== 'cancelled');
    const byStatus = { pending: 0, paid: 0, shipped: 0, delivered: 0, cancelled: 0 };
    orders.forEach((o) => (byStatus[o.status] += 1));

    // Revenue per day for the last 14 days
    const days = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(since.getTime() + i * 24 * 3600 * 1000);
      days.push({ date: d.toISOString().slice(0, 10), revenueCents: 0, orders: 0 });
    }
    const index = Object.fromEntries(days.map((d, i) => [d.date, i]));
    live.forEach((o) => {
      const key = new Date(o.createdAt).toISOString().slice(0, 10);
      if (key in index) {
        days[index[key]].revenueCents += o.totalCents;
        days[index[key]].orders += 1;
      }
    });

    res.json({
      data: {
        revenueCents: live.reduce((n, o) => n + o.totalCents, 0),
        orderCount: orders.length,
        avgOrderCents: live.length ? Math.round(live.reduce((n, o) => n + o.totalCents, 0) / live.length) : 0,
        byStatus,
        customers,
        reviews,
        newFeedback,
        subscribers,
        salesByDay: days,
        lowStock,
        topProducts: topItems.map((r) => ({ ...r, imageUrl: localImg(r.imageUrl), units: Number(r.units), revenue: Number(r.revenue) })),
        recentOrders,
      },
    });
  })
);

module.exports = router;
