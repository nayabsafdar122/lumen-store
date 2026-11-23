const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const { notFound, errorHandler } = require('./middleware/error');

const app = express();

app.set('trust proxy', 1); // needed behind Render/Railway/Heroku load balancers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: { ...helmet.contentSecurityPolicy.getDefaultDirectives(), 'img-src': ["'self'", 'data:', 'https:'] },
    },
  })
);
app.use(cors({ origin: config.corsOrigin === '*' ? '*' : config.corsOrigin.split(',') }));
app.use(express.json({ limit: '100kb' }));
if (config.env !== 'test') app.use(morgan(config.env === 'production' ? 'combined' : 'dev'));

// Stricter rate limit on auth endpoints to slow down password guessing.
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 50, standardHeaders: true, legacyHeaders: false });
const apiLimiter = rateLimit({ windowMs: 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false });

// The storefront (public/index.html, styles.css, app.js) is served at /
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

const api = express.Router();
api.get('/', (req, res) =>
  res.json({ name: 'E-commerce API', status: 'ok', docs: 'See README.md for all endpoints', health: '/health' })
);
if (config.env !== 'test') {
  api.use(apiLimiter);
  api.use('/auth', authLimiter);
}
// Make sure the database exists (and is filled with the catalog on first run, e.g. on Vercel).
if (config.env !== 'test') api.use((req, res, next) => require('./db/init').ensureDatabase().then(() => next(), next));
api.use('/img', require('./routes/images'));
api.use('/auth', require('./routes/auth'));
api.use('/categories', require('./routes/categories'));
api.use('/products', require('./routes/products'));
api.use('/cart', require('./routes/cart'));
api.use('/orders', require('./routes/orders'));
api.use('/reviews', require('./routes/reviews'));
api.use('/wishlist', require('./routes/wishlist'));
api.use('/coupons', require('./routes/coupons'));
api.use('/admin', require('./routes/admin'));
api.use('/', require('./routes/feedback')); // /feedback and /newsletter
app.use('/api', api);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
