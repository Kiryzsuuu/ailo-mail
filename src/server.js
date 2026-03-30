const { app } = require('./app');

const PORT = Number.parseInt(process.env.PORT ?? '3000', 10);

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Surat app running at http://localhost:${PORT}`);
});
