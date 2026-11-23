const router = require('express').Router();
const { z } = require('zod');
const { Coupon, CartItem, Product } = require('../models');
const validate = require('../middleware/validate');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { AppError, asyncHandler } = require('../utils/errors');
const { findUsableCoupon, totals } = require('../utils/pricing');

const idParams = z.object({ id: z.coerce.number().int().positive() });
const couponBody = z.object({
  code: z.string().trim().min(3).max(30).regex(/^[A-Za-z0-9_-]+$/, 'Letters, numbers, - and _ only').transform((s) => s.toUpperCase()),
  description: z.string().trim().max(200).optional(),
  type: z.enum(['percent', 'fixed']),
  value: z.number().int().min(1),
  minSubtotalCents: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
  expiresAt: z.coerce.date().nullable().optional(),
});

// Customer: check a code against the current cart and preview the totals.
router.post(
  '/validate',
  requireAuth,
  validate({ body: z.object({ code: z.string().trim().min(1).max(30) }) }),
  asyncHandler(async (req, res) => {
    const cart = await CartItem.findAll({ where: { UserId: req.user.id }, include: [Product] });
    const subtotal = cart.reduce((n, i) => n + i.Product.priceCents * i.quantity, 0);
    if (!subtotal) throw new AppError(400, 'Your bag is empty');
    const coupon = await findUsableCoupon(req.valid.body.code, subtotal);
    res.json({ data: { coupon: { code: coupon.code, description: coupon.description, type: coupon.type, value: coupon.value }, totals: totals(subtotal, coupon) } });
  })
);

// Public list of active promo codes (shown in the promo banner).
router.get(
  '/public',
  asyncHandler(async (req, res) => {
    const rows = await Coupon.findAll({ where: { isActive: true }, attributes: ['code', 'description', 'type', 'value', 'minSubtotalCents', 'expiresAt'], order: [['value', 'DESC']] });
    res.json({ data: rows.filter((c) => !c.expiresAt || new Date(c.expiresAt) > new Date()) });
  })
);

// ---------- Admin ----------
router.get(
  '/',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => res.json({ data: await Coupon.findAll({ order: [['createdAt', 'DESC']] }) }))
);

router.post(
  '/',
  requireAuth,
  requireAdmin,
  validate({ body: couponBody }),
  asyncHandler(async (req, res) => {
    const b = req.valid.body;
    if (b.type === 'percent' && b.value > 100) throw new AppError(400, 'A percent coupon cannot exceed 100');
    res.status(201).json({ data: await Coupon.create(b) });
  })
);

router.patch(
  '/:id',
  requireAuth,
  requireAdmin,
  validate({ params: idParams, body: couponBody.partial() }),
  asyncHandler(async (req, res) => {
    const coupon = await Coupon.findByPk(req.valid.params.id);
    if (!coupon) throw new AppError(404, 'Coupon not found');
    const updates = {};
    for (const key of Object.keys(req.body || {})) if (key in req.valid.body) updates[key] = req.valid.body[key];
    await coupon.update(updates);
    res.json({ data: coupon });
  })
);

router.delete(
  '/:id',
  requireAuth,
  requireAdmin,
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const n = await Coupon.destroy({ where: { id: req.valid.params.id } });
    if (!n) throw new AppError(404, 'Coupon not found');
    res.status(204).end();
  })
);

module.exports = router;
