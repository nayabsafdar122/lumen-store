const router = require('express').Router();
const { z } = require('zod');
const { WishlistItem, Product, Category } = require('../models');
const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { AppError, asyncHandler } = require('../utils/errors');

router.use(requireAuth);
const productIdParams = z.object({ productId: z.coerce.number().int().positive() });

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const items = await WishlistItem.findAll({
      where: { UserId: req.user.id },
      include: [{ model: Product, where: { isActive: true }, include: [{ model: Category, attributes: ['id', 'name', 'slug'] }] }],
      order: [['createdAt', 'DESC']],
    });
    res.json({ data: items.map((i) => i.Product) });
  })
);

router.post(
  '/:productId',
  validate({ params: productIdParams }),
  asyncHandler(async (req, res) => {
    const { productId } = req.valid.params;
    const product = await Product.findByPk(productId);
    if (!product || !product.isActive) throw new AppError(404, 'Product not found');
    await WishlistItem.findOrCreate({ where: { UserId: req.user.id, ProductId: productId } });
    res.status(201).json({ data: { productId, saved: true } });
  })
);

router.delete(
  '/:productId',
  validate({ params: productIdParams }),
  asyncHandler(async (req, res) => {
    await WishlistItem.destroy({ where: { UserId: req.user.id, ProductId: req.valid.params.productId } });
    res.json({ data: { productId: req.valid.params.productId, saved: false } });
  })
);

module.exports = router;
