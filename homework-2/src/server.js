const app = require('./app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Ticketing API running on http://localhost:${PORT}`);
  console.log(`UI available at http://localhost:${PORT}`);
});
