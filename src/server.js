const app = require('./app');
const config = require('./config');
const { sequelize } = require('./models');
const { ensureDatabase } = require('./db/init');

async function start() {
  // Creates missing tables (and fills an empty store with the catalog).
  await ensureDatabase();
  const server = app.listen(config.port, () => {
    console.log(`🚀 E-commerce API running on http://localhost:${config.port} (${config.env})`);
  });

  const shutdown = () => {
    console.log('Shutting down...');
    server.close(() => sequelize.close().then(() => process.exit(0)));
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
