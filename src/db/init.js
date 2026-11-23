// Creates tables on first use and, if the store is empty, fills it with the catalog.
// Runs once per server process (or once per Vercel function instance).
const { sequelize, Product } = require('../models');

let ready = null;

function ensureDatabase() {
  if (!ready) {
    ready = (async () => {
      await sequelize.authenticate();
      if (sequelize.getDialect() === 'sqlite') await sequelize.query('PRAGMA journal_mode = WAL').catch(() => {});
      await sequelize.sync();
      if ((await Product.count()) === 0 && process.env.AUTO_SEED !== 'false') {
        const { seedDatabase } = require('../scripts/seed');
        await seedDatabase({ log: (m) => console.log('[seed]', m) });
      }
    })().catch((err) => {
      ready = null; // retry on the next request
      throw err;
    });
  }
  return ready;
}

module.exports = { ensureDatabase };
