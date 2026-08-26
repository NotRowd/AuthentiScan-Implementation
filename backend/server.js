require('dotenv').config();

const app = require('./src/app');

const port = Number(process.env.PORT || 5000);

app.listen(port, () => {
  console.log(`AuthentiScan API is running at http://localhost:${port}`);
});
