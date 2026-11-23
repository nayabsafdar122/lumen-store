require('dotenv').config({ quiet: true });

const env = process.env.NODE_ENV || 'development';

const config = {
  env,
  port: parseInt(process.env.PORT, 10) || 4000,
  // If DATABASE_URL is set (e.g. a Postgres URL from Render/Railway/Neon), it is used.
  // Otherwise a local SQLite file is used so the project runs with zero setup.
  databaseUrl: process.env.DATABASE_URL || null,
  sqliteStorage:
    env === 'test'
      ? ':memory:'
      : process.env.SQLITE_STORAGE || (process.env.VERCEL ? '/tmp/lumen.sqlite' : './data/dev.sqlite'),
  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  corsOrigin: process.env.CORS_ORIGIN || '*',
};

if (env === 'production' && config.jwtSecret === 'dev-only-secret-change-me') {
  throw new Error('JWT_SECRET must be set in production');
}

module.exports = config;
