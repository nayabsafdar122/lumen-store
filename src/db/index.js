const fs = require('fs');
const path = require('path');
const { Sequelize } = require('sequelize');
const config = require('../config');

// Prefer the native sqlite3 driver; fall back to Node's built-in SQLite where it can't load (e.g. Vercel).
function sqliteDriver() {
  if (process.env.VERCEL || process.env.SQLITE_DRIVER === 'node') return require('./node-sqlite3');
  try {
    return require('sqlite3');
  } catch {
    return require('./node-sqlite3');
  }
}

let sequelize;

if (config.databaseUrl) {
  const useSsl = process.env.DB_SSL !== 'false';
  sequelize = new Sequelize(config.databaseUrl, {
    dialect: 'postgres',
    dialectModule: require('pg'),
    logging: false,
    pool: { max: 3, min: 0, idle: 10000 },
    dialectOptions: useSsl ? { ssl: { require: true, rejectUnauthorized: false } } : {},
  });
} else {
  if (config.sqliteStorage !== ':memory:') {
    fs.mkdirSync(path.dirname(path.resolve(config.sqliteStorage)), { recursive: true });
  }
  sequelize = new Sequelize({
    dialect: 'sqlite',
    dialectModule: sqliteDriver(),
    storage: config.sqliteStorage,
    logging: false,
  });
}

module.exports = sequelize;
