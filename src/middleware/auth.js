const jwt = require('jsonwebtoken');
const config = require('../config');
const { User } = require('../models');
const { AppError, asyncHandler } = require('../utils/errors');

const requireAuth = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) throw new AppError(401, 'Missing or invalid Authorization header');

  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    throw new AppError(401, 'Invalid or expired token');
  }

  const user = await User.findByPk(payload.sub);
  if (!user) throw new AppError(401, 'User no longer exists');
  req.user = user;
  next();
});

const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') return next(new AppError(403, 'Admin access required'));
  next();
};

const signToken = (user) =>
  jwt.sign({ sub: user.id, role: user.role }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });

module.exports = { requireAuth, requireAdmin, signToken };
