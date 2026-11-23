const router = require('express').Router();
const { z } = require('zod');
const { CartItem, Product } = require('../models');
const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { AppError, asyncHandler } = require('../utils/errors');
const { totals } = require('../utils/pricing');

router.use(requireAuth);

const productIdParams = z.object({ productId: z.coerce.number().int().positive() });
const addBody = z.object({
  productId: z.number().int().positive(),
  quantity: z.number().int().min(1).max(100).default(1),
});
const updateBody = z.object({ quantity: z.number().int().min(1).max(100) });

const loadCart = async (userId) => {
  const items = await CartItem.findAll({
    where: { UserId: userId },
    include: [
      {
        model: Product,
        attributes: ['id', 'name', 'brand', 'priceCents', 'compareAtPriceCents', 'stock', 'imageUrl', 'isActive', 'CategoryId'],
      },
    ],
    order: [['createdAt', 'ASC']],
  });
  const lines = items.map((i) => ({
    productId: i.ProductId,
    name: i.Product.name,
    brand: i.Product.brand,
    unitPriceCents: i.Product.priceCents,
    compareAtPriceCents: i.Product.compareAtPriceCents,
    quantity: i.quantity,
    stock: i.Product.stock,
    lineTotalCents: i.Product.priceCents * i.quantity,
    available: i.Product.isActive && i.Product.stock >= i.quantity,
    imageUrl: i.Product.imageUrl,
  }));
  const subtotal = lines.reduce((n, l) => n + l.lineTotalCents, 0);
  return { items: lines, itemCount: lines.reduce((n, l) => n + l.quantity, 0), ...totals(subtotal, null) };
};

const getSellableProduct = async (productId) => {
  const product = await Product.findByPk(productId);
  if (!product || !product.isActive) throw new AppError(404, 'Product not found');
  return product;
};

router.get(
  '/',
  asyncHandler(async (req, res) => res.json({ data: await loadCart(req.user.id) }))
);

// Adds to the existing quantity if the product is already in the cart.
router.post(
  '/items',
  validate({ body: addBody }),
  asyncHandler(async (req, res) => {
    const { productId, quantity } = req.valid.body;
    const product = await getSellableProduct(productId);
    const existing = await CartItem.findOne({ where: { UserId: req.user.id, ProductId: productId } });
    const newQty = (existing ? existing.quantity : 0) + quantity;
    if (newQty > product.stock) throw new AppError(400, product.stock ? `Only ${product.stock} in stock` : 'This item is sold out');
    if (existing) await existing.update({ quantity: newQty });
    else await CartItem.create({ UserId: req.user.id, ProductId: productId, quantity });
    res.status(201).json({ data: await loadCart(req.user.id) });
  })
);

router.patch(
  '/items/:productId',
  validate({ params: productIdParams, body: updateBody }),
  asyncHandler(async (req, res) => {
    const { productId } = req.valid.params;
    const item = await CartItem.findOne({ where: { UserId: req.user.id, ProductId: productId } });
    if (!item) throw new AppError(404, 'Item not in cart');
    const product = await getSellableProduct(productId);
    if (req.valid.body.quantity > product.stock) throw new AppError(400, `Only ${product.stock} in stock`);
    await item.update({ quantity: req.valid.body.quantity });
    res.json({ data: await loadCart(req.user.id) });
  })
);

router.delete(
  '/items/:productId',
  validate({ params: productIdParams }),
  asyncHandler(async (req, res) => {
    const deleted = await CartItem.destroy({
      where: { UserId: req.user.id, ProductId: req.valid.params.productId },
    });
    if (!deleted) throw new AppError(404, 'Item not in cart');
    res.json({ data: await loadCart(req.user.id) });
  })
);

router.delete(
  '/',
  asyncHandler(async (req, res) => {
    await CartItem.destroy({ where: { UserId: req.user.id } });
    res.status(204).end();
  })
);

module.exports = router;
