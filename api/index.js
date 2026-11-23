// Vercel serverless entry point: every /api/* request is handled by the Express app.
// The storefront files in public/ are served directly by Vercel's CDN.
module.exports = require('../src/app');
