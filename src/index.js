const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const cors = require('cors');
const chatRouter = require('./chat');
const notifyRouter = require('./notify');
const { initDb } = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/chat', chatRouter);
app.use('/api/notify', notifyRouter);

app.get('/health', (req, res) => {
  res.json({ status: 'Get220v Chat API running' });
});

const PORT = process.env.PORT || 3001;

initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`Get220v Chat API running on port ${PORT}`);
  });
}).catch(err => {
  console.error('DB init failed:', err.message);
  process.exit(1);
});
