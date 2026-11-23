const { DataTypes } = require('sequelize');
const sequelize = require('../db');

// Product photos from the DummyJSON CDN are served through our own /api/img proxy, so browsers
// only ever load images from this site (avoids tracking-prevention / third-party blocking).
const CDN = 'https://cdn.dummyjson.com/product-images/';
const localImg = (u) => (typeof u === 'string' && u.startsWith(CDN) ? `/api/img/${u.slice(CDN.length)}` : u);
const imgAttr = (name, extra = {}) => ({
  type: DataTypes.STRING(500),
  allowNull: true,
  ...extra,
  get() { return localImg(this.getDataValue(name)); },
});

// All money values are stored as integer cents to avoid floating-point errors.

const User = sequelize.define(
  'User',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING, allowNull: false },
    email: { type: DataTypes.STRING, allowNull: false, unique: true },
    passwordHash: { type: DataTypes.STRING, allowNull: false },
    role: { type: DataTypes.ENUM('customer', 'admin'), allowNull: false, defaultValue: 'customer' },
  },
  {
    defaultScope: { attributes: { exclude: ['passwordHash'] } },
    scopes: { withPassword: { attributes: { include: ['passwordHash'] } } },
  }
);

const Category = sequelize.define('Category', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING, allowNull: false, unique: true },
  slug: { type: DataTypes.STRING, allowNull: false, unique: true },
  description: { type: DataTypes.STRING, allowNull: true },
  imageUrl: imgAttr('imageUrl'),
  position: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
});

const Product = sequelize.define('Product', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING, allowNull: false },
  brand: { type: DataTypes.STRING, allowNull: true },
  subcategory: { type: DataTypes.STRING, allowNull: true },
  description: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
  priceCents: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 0 } },
  // Original price before discount. When set and higher than priceCents, the product is "on sale".
  compareAtPriceCents: { type: DataTypes.INTEGER, allowNull: true, validate: { min: 0 } },
  stock: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, validate: { min: 0 } },
  imageUrl: imgAttr('imageUrl'), // main image
  images: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: [],
    get() { return (this.getDataValue('images') || []).map(localImg); },
  }, // gallery
  tags: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
  ratingAvg: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
  ratingCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  soldCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  isFeatured: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
});

const CartItem = sequelize.define(
  'CartItem',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    quantity: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1 } },
  },
  { indexes: [{ unique: true, fields: ['UserId', 'ProductId'] }] }
);

const WishlistItem = sequelize.define(
  'WishlistItem',
  { id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true } },
  { indexes: [{ unique: true, fields: ['UserId', 'ProductId'] }] }
);

const Order = sequelize.define('Order', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  status: {
    type: DataTypes.ENUM('pending', 'paid', 'shipped', 'delivered', 'cancelled'),
    allowNull: false,
    defaultValue: 'pending',
  },
  subtotalCents: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  discountCents: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  shippingCents: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  totalCents: { type: DataTypes.INTEGER, allowNull: false },
  couponCode: { type: DataTypes.STRING, allowNull: true },
  shippingAddress: { type: DataTypes.JSON, allowNull: false },
  note: { type: DataTypes.STRING(500), allowNull: true },
});

const OrderItem = sequelize.define('OrderItem', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  // Snapshot of the product at purchase time, so later edits don't change old orders.
  productName: { type: DataTypes.STRING, allowNull: false },
  imageUrl: imgAttr('imageUrl'),
  unitPriceCents: { type: DataTypes.INTEGER, allowNull: false },
  quantity: { type: DataTypes.INTEGER, allowNull: false },
});

const Review = sequelize.define(
  'Review',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    authorName: { type: DataTypes.STRING, allowNull: false },
    rating: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1, max: 5 } },
    title: { type: DataTypes.STRING(120), allowNull: true },
    comment: { type: DataTypes.TEXT, allowNull: false },
    verifiedPurchase: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    helpfulCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  },
  { indexes: [{ fields: ['ProductId'] }] }
);

const ReviewVote = sequelize.define(
  'ReviewVote',
  { id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true } },
  { indexes: [{ unique: true, fields: ['UserId', 'ReviewId'] }] }
);

const Coupon = sequelize.define('Coupon', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  code: { type: DataTypes.STRING, allowNull: false, unique: true },
  description: { type: DataTypes.STRING, allowNull: true },
  type: { type: DataTypes.ENUM('percent', 'fixed'), allowNull: false },
  value: { type: DataTypes.INTEGER, allowNull: false }, // percent (1-100) or cents
  minSubtotalCents: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  expiresAt: { type: DataTypes.DATE, allowNull: true },
  usedCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
});

const Feedback = sequelize.define('Feedback', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING, allowNull: false },
  email: { type: DataTypes.STRING, allowNull: false },
  type: { type: DataTypes.ENUM('general', 'suggestion', 'bug', 'order', 'compliment'), allowNull: false, defaultValue: 'general' },
  rating: { type: DataTypes.INTEGER, allowNull: true, validate: { min: 1, max: 5 } },
  message: { type: DataTypes.TEXT, allowNull: false },
  status: { type: DataTypes.ENUM('new', 'read', 'resolved'), allowNull: false, defaultValue: 'new' },
});

const Subscriber = sequelize.define('Subscriber', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  email: { type: DataTypes.STRING, allowNull: false, unique: true },
});

// Associations
Category.hasMany(Product, { onDelete: 'SET NULL' });
Product.belongsTo(Category);

User.hasMany(CartItem, { onDelete: 'CASCADE' });
CartItem.belongsTo(User);
Product.hasMany(CartItem, { onDelete: 'CASCADE' });
CartItem.belongsTo(Product);

User.hasMany(WishlistItem, { onDelete: 'CASCADE' });
WishlistItem.belongsTo(User);
Product.hasMany(WishlistItem, { onDelete: 'CASCADE' });
WishlistItem.belongsTo(Product);

User.hasMany(Order);
Order.belongsTo(User);
Order.hasMany(OrderItem, { as: 'items', onDelete: 'CASCADE' });
OrderItem.belongsTo(Order);
Product.hasMany(OrderItem, { onDelete: 'SET NULL' });
OrderItem.belongsTo(Product);

Product.hasMany(Review, { onDelete: 'CASCADE' });
Review.belongsTo(Product);
User.hasMany(Review, { onDelete: 'SET NULL' });
Review.belongsTo(User);
Review.hasMany(ReviewVote, { onDelete: 'CASCADE' });
ReviewVote.belongsTo(Review);
User.hasMany(ReviewVote, { onDelete: 'CASCADE' });
ReviewVote.belongsTo(User);

User.hasMany(Feedback, { onDelete: 'SET NULL' });
Feedback.belongsTo(User);

// Recalculate a product's average rating and review count.
async function refreshProductRating(productId, transaction) {
  const [row] = await Review.findAll({
    where: { ProductId: productId },
    attributes: [
      [sequelize.fn('AVG', sequelize.col('rating')), 'avg'],
      [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
    ],
    raw: true,
    transaction,
  });
  await Product.update(
    { ratingAvg: Math.round((Number(row.avg) || 0) * 100) / 100, ratingCount: Number(row.count) || 0 },
    { where: { id: productId }, transaction }
  );
}

module.exports = {
  localImg,
  sequelize,
  User,
  Category,
  Product,
  CartItem,
  WishlistItem,
  Order,
  OrderItem,
  Review,
  ReviewVote,
  Coupon,
  Feedback,
  Subscriber,
  refreshProductRating,
};
