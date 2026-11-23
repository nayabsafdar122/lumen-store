const router = require('express').Router();
const { z } = require('zod');
const { sequelize, Category, Product } = require('../models');
const validate = require('../middleware/validate');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { AppError, asyncHandler } = require('../utils/errors');

const slugify = (s) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const idParams = z.object({ id: z.coerce.number().int().positive() });
const bodySchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(200).optional(),
  imageUrl: z.string().url().nullable().optional(),
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const [cats, counts] = await Promise.all([
      Category.findAll({ order: [['position', 'ASC'], ['name', 'ASC']] }),
      Product.findAll({
        where: { isActive: true },
        attributes: ['CategoryId', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
        group: ['CategoryId'],
        raw: true,
      }),
    ]);
    const byId = Object.fromEntries(counts.map((c) => [c.CategoryId, Number(c.count)]));
    res.json({ data: cats.map((c) => ({ ...c.toJSON(), productCount: byId[c.id] || 0 })) });
  })
);

router.post(
  '/',
  requireAuth,
  requireAdmin,
  validate({ body: bodySchema }),
  asyncHandler(async (req, res) => {
    const category = await Category.create({ ...req.valid.body, slug: slugify(req.valid.body.name) });
    res.status(201).json({ data: category });
  })
);

router.patch(
  '/:id',
  requireAuth,
  requireAdmin,
  validate({ params: idParams, body: bodySchema }),
  asyncHandler(async (req, res) => {
    const category = await Category.findByPk(req.valid.params.id);
    if (!category) throw new AppError(404, 'Category not found');
    await category.update({ ...req.valid.body, slug: slugify(req.valid.body.name) });
    res.json({ data: category });
  })
);

router.delete(
  '/:id',
  requireAuth,
  requireAdmin,
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const category = await Category.findByPk(req.valid.params.id);
    if (!category) throw new AppError(404, 'Category not found');
    await category.destroy();
    res.status(204).end();
  })
);

module.exports = router;
