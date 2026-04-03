require('dotenv').config();

const { app } = require('./app');
const { connectMongo } = require('./lib/db');

const PORT = Number.parseInt(process.env.PORT ?? '3000', 10);

function hasRoute(path) {
  const stack = app.router?.stack || app._router?.stack || [];
  for (const layer of stack) {
    if (!layer.route || !layer.route.path) continue;
    if (layer.route.path === path) return true;
  }
  return false;
}

(async () => {
  await connectMongo();

  // eslint-disable-next-line no-console
  console.log(`[env] NODE_ENV=${process.env.NODE_ENV || ''} LOG_HTTP=${process.env.LOG_HTTP || ''}`);

  // eslint-disable-next-line no-console
  console.log(`[routes] /admin/logs registered = ${hasRoute('/admin/logs')}`);

  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Surat app running at http://localhost:${PORT}`);
  });
})().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start server:', error);
  process.exit(1);
});
