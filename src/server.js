require('dotenv').config();

const { app } = require('./app');
const { connectMongo } = require('./lib/db');

const PORT = Number.parseInt(process.env.PORT ?? '3000', 10);

(async () => {
  await connectMongo();

  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Surat app running at http://localhost:${PORT}`);
  });
})().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start server:', error);
  process.exit(1);
});
