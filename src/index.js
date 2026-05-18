const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const chatRouter = require('./chat');
const notifyRouter = require('./notify');
const telegramRouter = require('./telegram');
const { initDb } = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/chat', chatRouter);
app.use('/api/notify', notifyRouter);
app.use('/api/telegram', telegramRouter);

app.get('/health', (req, res) => {
  res.json({ status: 'Get220v Chat API running' });
});

app.post('/api/proxy/tb', async (req, res) => {
  try {
    const { url, method, headers, data } = req.body;
    const response = await axios({ url, method: method||'GET', headers: headers||{}, data });
    res.json(response.data);
  } catch (err) {
    res.status(err.response?.status||500).json(err.response?.data||{error: err.message});
  }
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
