const { Coupon } = require('../models');
const { AppError } = require('./errors');

const FREE_SHIPPING_THRESHOLD_CENTS = 5000; // $50
const FLAT_SHIPPING_CENTS = 599; // $5.99

const shippingFor = (subtotalAfterDiscount) =>
  subtotalAfterDiscount === 0 || subtotalAfterDiscount >= FREE_SHIPPING_THRESHOLD_CENTS ? 0 : FLAT_SHIPPING_CENTS;

// Looks up a coupon and checks it can be used for this subtotal. Throws a friendly 400 if not.
async function findUsableCoupon(code, subtotalCents, transaction) {
  if (!code) return null;
  const coupon = await Coupon.findOne({ where: { code: code.trim().toUpperCase() }, transaction });
  if (!coupon || !coupon.isActive) throw new AppError(400, 'That coupon code is not valid');
  if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) throw new AppError(400, 'That coupon has expired');
  if (subtotalCents < coupon.minSubtotalCents) {
    throw new AppError(400, `This coupon needs a subtotal of at least $${(coupon.minSubtotalCents / 100).toFixed(2)}`);
  }
  return coupon;
}

const discountFor = (coupon, subtotalCents) => {
  if (!coupon) return 0;
  const raw = coupon.type === 'percent' ? Math.round((subtotalCents * coupon.value) / 100) : coupon.value;
  return Math.min(raw, subtotalCents);
};

function totals(subtotalCents, coupon) {
  const discountCents = discountFor(coupon, subtotalCents);
  const shippingCents = shippingFor(subtotalCents - discountCents);
  return {
    subtotalCents,
    discountCents,
    shippingCents,
    totalCents: subtotalCents - discountCents + shippingCents,
    couponCode: coupon ? coupon.code : null,
    freeShippingThresholdCents: FREE_SHIPPING_THRESHOLD_CENTS,
  };
}

module.exports = { findUsableCoupon, totals, FREE_SHIPPING_THRESHOLD_CENTS, FLAT_SHIPPING_CENTS };
