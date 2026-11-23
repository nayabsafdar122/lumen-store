const router = require('express').Router();
const { z } = require('zod');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { Feedback, Subscriber } = require('../models');
const validate = require('../middleware/validate');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { AppError, asyncHandler } = require('../utils/errors');

const idParams = z.object({ id: z.coerce.number().int().positive() });
const feedbackBody = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().email(),
  type: z.enum(['general', 'suggestion', 'bug', 'order', 'compliment']).default('general'),
  rating: z.number().int().min(1).max(5).optional(),
  message: z.string().trim().min(10, 'Please write at least 10 characters').max(3000),
});

// Links the feedback to the signed-in user if a valid token is present (optional).
const optionalUserId = (req) => {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  try {
    return jwt.verify(token, config.jwtSecret).sub;
  } catch {
    return null;
  }
};

// Public: send feedback / contact the store.
router.post(
  '/feedback',
  validate({ body: feedbackBody }),
  asyncHandler(async (req, res) => {
    const fb = await Feedback.create({ ...req.valid.body, UserId: optionalUserId(req) });
    res.status(201).json({ data: { id: fb.id, message: 'Thanks! Your feedback has been received.' } });
  })
);

// Public: newsletter sign-up (idempotent).
router.post(
  '/newsletter',
  validate({ body: z.object({ email: z.string().trim().toLowerCase().email() }) }),
  asyncHandler(async (req, res) => {
    const [, created] = await Subscriber.findOrCreate({ where: { email: req.valid.body.email } });
    res.status(created ? 201 : 200).json({ data: { subscribed: true, alreadySubscribed: !created } });
  })
);

// ---------- Admin ----------
router.get(
  '/feedback',
  requireAuth,
  requireAdmin,
  validate({ query: z.object({ status: z.enum(['new', 'read', 'resolved']).optional() }) }),
  asyncHandler(async (req, res) => {
    const where = req.valid.query.status ? { status: req.valid.query.status } : {};
    res.json({ data: await Feedback.findAll({ where, order: [['createdAt', 'DESC']], limit: 200 }) });
  })
);

router.patch(
  '/feedback/:id',
  requireAuth,
  requireAdmin,
  validate({ params: idParams, body: z.object({ status: z.enum(['new', 'read', 'resolved']) }) }),
  asyncHandler(async (req, res) => {
    const fb = await Feedback.findByPk(req.valid.params.id);
    if (!fb) throw new AppError(404, 'Feedback not found');
    await fb.update({ status: req.valid.body.status });
    res.json({ data: fb });
  })
);

router.get(
  '/newsletter',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => res.json({ data: await Subscriber.findAll({ order: [['createdAt', 'DESC']] }) }))
);

module.exports = router;
