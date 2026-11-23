const router = require('express').Router();
const { z } = require('zod');
const { sequelize, Review, ReviewVote, Product, refreshProductRating } = require('../models');
const validate = require('../middleware/validate');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { AppError, asyncHandler } = require('../utils/errors');

const idParams = z.object({ id: z.coerce.number().int().positive() });

// Admin: latest reviews across the store.
router.get(
  '/',
  requireAuth,
  requireAdmin,
  validate({
    query: z.object({
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(30),
      rating: z.coerce.number().int().min(1).max(5).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { page, limit, rating } = req.valid.query;
    const { rows, count } = await Review.findAndCountAll({
      where: rating ? { rating } : {},
      include: [{ model: Product, attributes: ['id', 'name', 'imageUrl'] }],
      order: [['createdAt', 'DESC']],
      limit,
      offset: (page - 1) * limit,
    });
    res.json({ data: rows, meta: { page, limit, total: count, totalPages: Math.ceil(count / limit) } });
  })
);

// Mark a review as helpful (once per user). Calling again removes the vote.
router.post(
  '/:id/helpful',
  requireAuth,
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const review = await Review.findByPk(req.valid.params.id);
    if (!review) throw new AppError(404, 'Review not found');
    if (review.UserId === req.user.id) throw new AppError(400, "You can't vote on your own review");
    const result = await sequelize.transaction(async (t) => {
      const existing = await ReviewVote.findOne({ where: { ReviewId: review.id, UserId: req.user.id }, transaction: t });
      if (existing) {
        await existing.destroy({ transaction: t });
        await review.decrement('helpfulCount', { transaction: t });
        return { voted: false };
      }
      await ReviewVote.create({ ReviewId: review.id, UserId: req.user.id }, { transaction: t });
      await review.increment('helpfulCount', { transaction: t });
      return { voted: true };
    });
    await review.reload();
    res.json({ data: { ...result, helpfulCount: review.helpfulCount } });
  })
);

// Delete your own review (or any review as admin).
router.delete(
  '/:id',
  requireAuth,
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const review = await Review.findByPk(req.valid.params.id);
    if (!review || (review.UserId !== req.user.id && req.user.role !== 'admin')) throw new AppError(404, 'Review not found');
    await sequelize.transaction(async (t) => {
      await review.destroy({ transaction: t });
      await refreshProductRating(review.ProductId, t);
    });
    res.status(204).end();
  })
);

module.exports = router;
