const fs = require('fs');
const path = require('path');
const { Sequelize } = require('sequelize');
const config = require('../config');

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
    dialectModule: require('sqlite3'),
    storage: config.sqliteStorage,
    logging: false,
  });
}

module.exports = sequelize;
