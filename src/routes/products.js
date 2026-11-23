const router = require('express').Router();
const { z } = require('zod');
const { Op } = require('sequelize');
const { sequelize, Product, Category, Review, Order, OrderItem, refreshProductRating } = require('../models');
const validate = require('../middleware/validate');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { AppError, asyncHandler } = require('../utils/errors');

const LIKE = sequelize.getDialect() === 'postgres' ? Op.iLike : Op.like;
const idParams = z.object({ id: z.coerce.number().int().positive() });
const csv = z
  .string()
  .trim()
  .optional()
  .transform((s) => (s ? s.split(',').map((x) => x.trim()).filter(Boolean) : []));

const listQuery = z.object({
  search: z.string().trim().max(100).optional(),
  category: z.string().trim().optional(), // category slug
  brand: csv, // comma-separated list
  minPrice: z.coerce.number().int().min(0).optional(), // cents
  maxPrice: z.coerce.number().int().min(0).optional(), // cents
  minRating: z.coerce.number().min(0).max(5).optional(),
  inStock: z.enum(['true', 'false']).optional(),
  onSale: z.enum(['true', 'false']).optional(),
  featured: z.enum(['true', 'false']).optional(),
  sort: z.enum(['newest', 'price_asc', 'price_desc', 'name', 'rating', 'popular', 'discount']).default('popular'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(24),
});

const imageRef = z.string().trim().max(500).refine((s) => /^https?:\/\//.test(s) || s.startsWith('/api/img/'), 'Must be an image URL');
const productBody = z.object({
  name: z.string().trim().min(1).max(200),
  brand: z.string().trim().max(100).nullable().optional(),
  subcategory: z.string().trim().max(100).nullable().optional(),
  description: z.string().max(5000).default(''),
  priceCents: z.number().int().min(0),
  compareAtPriceCents: z.number().int().min(0).nullable().optional(),
  stock: z.number().int().min(0).default(0),
  imageUrl: imageRef.nullable().optional(),
  images: z.array(imageRef).max(10).optional(),
  tags: z.array(z.string().trim().max(40)).max(20).optional(),
  isFeatured: z.boolean().optional(),
  isActive: z.boolean().default(true),
  categoryId: z.number().int().positive().nullable().optional(),
});

const DISCOUNT_SQL = `CASE WHEN "compareAtPriceCents" > "priceCents" THEN ("compareAtPriceCents" - "priceCents") * 1.0 / "compareAtPriceCents" ELSE 0 END`;
const SORTS = {
  newest: [['createdAt', 'DESC'], ['id', 'DESC']],
  price_asc: [['priceCents', 'ASC']],
  price_desc: [['priceCents', 'DESC']],
  name: [['name', 'ASC']],
  rating: [['ratingAvg', 'DESC'], ['ratingCount', 'DESC']],
  popular: [['soldCount', 'DESC'], ['ratingCount', 'DESC'], ['id', 'ASC']],
  discount: [[sequelize.literal(DISCOUNT_SQL), 'DESC']],
};
const categoryInclude = (slug) => ({
  model: Category,
  attributes: ['id', 'name', 'slug'],
  ...(slug ? { where: { slug }, required: true } : {}),
});

function buildWhere(q, { skipBrand = false, skipPrice = false } = {}) {
  const and = [{ isActive: true }];
  if (q.search) {
    const s = `%${q.search}%`;
    and.push({ [Op.or]: [{ name: { [LIKE]: s } }, { brand: { [LIKE]: s } }, { subcategory: { [LIKE]: s } }] });
  }
  if (!skipBrand && q.brand?.length) and.push({ brand: { [Op.in]: q.brand } });
  if (!skipPrice && q.minPrice != null) and.push({ priceCents: { [Op.gte]: q.minPrice } });
  if (!skipPrice && q.maxPrice != null) and.push({ priceCents: { [Op.lte]: q.maxPrice } });
  if (q.minRating != null) and.push({ ratingAvg: { [Op.gte]: q.minRating } });
  if (q.inStock === 'true') and.push({ stock: { [Op.gt]: 0 } });
  if (q.featured === 'true') and.push({ isFeatured: true });
  if (q.onSale === 'true') and.push(sequelize.where(sequelize.col('compareAtPriceCents'), Op.gt, sequelize.col('priceCents')));
  return { [Op.and]: and };
}

const ensureCategory = async (categoryId) => {
  if (categoryId == null) return;
  if (!(await Category.findByPk(categoryId))) throw new AppError(400, 'categoryId does not exist');
};

// Public: list active products with search, filters, sorting and pagination.
router.get(
  '/',
  validate({ query: listQuery }),
  asyncHandler(async (req, res) => {
    const q = req.valid.query;
    const { rows, count } = await Product.findAndCountAll({
      where: buildWhere(q),
      include: [categoryInclude(q.category)],
      order: SORTS[q.sort],
      limit: q.limit,
      offset: (q.page - 1) * q.limit,
      distinct: true,
    });
    res.json({
      data: rows,
      meta: { page: q.page, limit: q.limit, total: count, totalPages: Math.ceil(count / q.limit) },
    });
  })
);

// Filter options for the current search/category: brands with counts and the price range.
router.get(
  '/facets',
  validate({ query: listQuery }),
  asyncHandler(async (req, res) => {
    const q = req.valid.query;
    const products = await Product.findAll({
      where: buildWhere(q, { skipBrand: true, skipPrice: true }),
      include: [categoryInclude(q.category)],
      attributes: ['brand', 'priceCents'],
    });
    const brands = {};
    let min = Infinity;
    let max = 0;
    for (const p of products) {
      if (p.brand) brands[p.brand] = (brands[p.brand] || 0) + 1;
      min = Math.min(min, p.priceCents);
      max = Math.max(max, p.priceCents);
    }
    res.json({
      data: {
        brands: Object.entries(brands)
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
        price: { min: products.length ? min : 0, max },
        total: products.length,
      },
    });
  })
);

// Search-as-you-type suggestions.
router.get(
  '/suggest',
  validate({ query: z.object({ q: z.string().trim().min(1).max(60) }) }),
  asyncHandler(async (req, res) => {
    const s = `%${req.valid.query.q}%`;
    const rows = await Product.findAll({
      where: { isActive: true, [Op.or]: [{ name: { [LIKE]: s } }, { brand: { [LIKE]: s } }] },
      attributes: ['id', 'name', 'brand', 'priceCents', 'imageUrl'],
      order: [['soldCount', 'DESC'], ['ratingCount', 'DESC']],
      limit: 6,
    });
    res.json({ data: rows });
  })
);

router.get(
  '/:id',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const product = await Product.findOne({
      where: { id: req.valid.params.id, isActive: true },
      include: [{ model: Category, attributes: ['id', 'name', 'slug'] }],
    });
    if (!product) throw new AppError(404, 'Product not found');
    res.json({ data: product });
  })
);

// "You may also like": same category, best rated first.
router.get(
  '/:id/related',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const product = await Product.findByPk(req.valid.params.id);
    if (!product) throw new AppError(404, 'Product not found');
    const rows = await Product.findAll({
      where: { isActive: true, id: { [Op.ne]: product.id }, CategoryId: product.CategoryId },
      include: [{ model: Category, attributes: ['id', 'name', 'slug'] }],
      order: [
        [sequelize.literal(`CASE WHEN "subcategory" = ${sequelize.escape(product.subcategory || '')} THEN 0 ELSE 1 END`), 'ASC'],
        ['ratingAvg', 'DESC'],
      ],
      limit: 8,
    });
    res.json({ data: rows });
  })
);

// ---------- Reviews ----------
const reviewQuery = z.object({
  sort: z.enum(['newest', 'highest', 'lowest', 'helpful']).default('newest'),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});
const REVIEW_SORTS = {
  newest: [['createdAt', 'DESC']],
  highest: [['rating', 'DESC'], ['createdAt', 'DESC']],
  lowest: [['rating', 'ASC'], ['createdAt', 'DESC']],
  helpful: [['helpfulCount', 'DESC'], ['createdAt', 'DESC']],
};
const reviewBody = z.object({
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().max(120).optional(),
  comment: z.string().trim().min(3, 'Please write at least a few words').max(2000),
});

router.get(
  '/:id/reviews',
  validate({ params: idParams, query: reviewQuery }),
  asyncHandler(async (req, res) => {
    const productId = req.valid.params.id;
    const { sort, rating, page, limit } = req.valid.query;
    const where = { ProductId: productId, ...(rating ? { rating } : {}) };
    const [{ rows, count }, breakdownRows] = await Promise.all([
      Review.findAndCountAll({ where, order: REVIEW_SORTS[sort], limit, offset: (page - 1) * limit }),
      Review.findAll({
        where: { ProductId: productId },
        attributes: ['rating', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
        group: ['rating'],
        raw: true,
      }),
    ]);
    const breakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    breakdownRows.forEach((r) => (breakdown[r.rating] = Number(r.count)));
    const total = Object.values(breakdown).reduce((a, b) => a + b, 0);
    const average = total ? Object.entries(breakdown).reduce((s, [k, v]) => s + k * v, 0) / total : 0;
    res.json({
      data: rows,
      summary: { average: Math.round(average * 10) / 10, total, breakdown },
      meta: { page, limit, total: count, totalPages: Math.ceil(count / limit) },
    });
  })
);

router.post(
  '/:id/reviews',
  requireAuth,
  validate({ params: idParams, body: reviewBody }),
  asyncHandler(async (req, res) => {
    const productId = req.valid.params.id;
    if (!(await Product.findByPk(productId))) throw new AppError(404, 'Product not found');
    if (await Review.findOne({ where: { ProductId: productId, UserId: req.user.id } })) {
      throw new AppError(409, 'You have already reviewed this product');
    }
    // Verified purchase = the user has a non-cancelled order containing this product.
    const bought = await OrderItem.findOne({
      where: { ProductId: productId },
      include: [{ model: Order, where: { UserId: req.user.id, status: { [Op.ne]: 'cancelled' } }, required: true }],
    });
    const review = await sequelize.transaction(async (t) => {
      const r = await Review.create(
        { ...req.valid.body, ProductId: productId, UserId: req.user.id, authorName: req.user.name, verifiedPurchase: !!bought },
        { transaction: t }
      );
      await refreshProductRating(productId, t);
      return r;
    });
    res.status(201).json({ data: review });
  })
);

// ---------- Admin ----------
router.post(
  '/',
  requireAuth,
  requireAdmin,
  validate({ body: productBody }),
  asyncHandler(async (req, res) => {
    const { categoryId, ...rest } = req.valid.body;
    await ensureCategory(categoryId);
    if (!rest.imageUrl && rest.images?.length) rest.imageUrl = rest.images[0];
    if (rest.imageUrl && !rest.images?.length) rest.images = [rest.imageUrl];
    const product = await Product.create({ ...rest, CategoryId: categoryId ?? null });
    res.status(201).json({ data: product });
  })
);

router.patch(
  '/:id',
  requireAuth,
  requireAdmin,
  validate({ params: idParams, body: productBody.partial() }),
  asyncHandler(async (req, res) => {
    const product = await Product.findByPk(req.valid.params.id);
    if (!product) throw new AppError(404, 'Product not found');
    // .partial() keeps defaults, so only apply keys the client actually sent
    const updates = {};
    for (const key of Object.keys(req.body || {})) {
      if (key in req.valid.body) updates[key] = req.valid.body[key];
    }
    if ('categoryId' in updates) {
      await ensureCategory(updates.categoryId);
      updates.CategoryId = updates.categoryId ?? null;
      delete updates.categoryId;
    }
    if ('imageUrl' in updates && updates.imageUrl && !('images' in updates)) {
      const rest = (product.images || []).filter((u) => u !== updates.imageUrl);
      updates.images = [updates.imageUrl, ...rest];
    }
    await product.update(updates);
    res.json({ data: product });
  })
);

// Soft delete: hides the product but keeps it for existing orders.
router.delete(
  '/:id',
  requireAuth,
  requireAdmin,
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const product = await Product.findByPk(req.valid.params.id);
    if (!product) throw new AppError(404, 'Product not found');
    await product.update({ isActive: false });
    res.status(204).end();
  })
);

module.exports = router;
