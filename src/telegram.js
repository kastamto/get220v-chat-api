const express = require('express');
const router = express.Router();
const axios = require('axios');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const DEFAULT_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const BASE_URL = `https://api.telegram.org/bot${BOT_TOKEN}`;

async function sendMessage(chatId, text, parseMode = 'HTML') {
  const res = await axios.post(`${BASE_URL}/sendMessage`, {
    chat_id: chatId || DEFAULT_CHAT_ID,
    text,
    parse_mode: parseMode
  });
  return res.data;
}

async function sendDocument(chatId, document, filename, caption) {
  const FormData = require('form-data');
  const form = new FormData();
  form.append('chat_id', chatId || DEFAULT_CHAT_ID);
  form.append('document', document, { filename, contentType: 'application/pdf' });
  if (caption) form.append('caption', caption);

  const res = await axios.post(`${BASE_URL}/sendDocument`, form, {
    headers: form.getHeaders()
  });
  return res.data;
}

// Send alert to Telegram
router.post('/alert', async (req, res) => {
  try {
    const { chatId, alarm } = req.body;
    const severity = alarm.severity || 'CRITICAL';
    const emoji = severity === 'CRITICAL' ? '🚨' : severity === 'MAJOR' ? '⚠️' : 'ℹ️';

    const text = `${emoji} <b>Get220v Alert</b>

<b>Type:</b> ${alarm.type || alarm.name || 'Alert'}
<b>Device:</b> ${alarm.originatorName || 'Unknown'}
<b>Severity:</b> ${severity}
<b>Status:</b> ${alarm.status || 'ACTIVE'}
<b>Time:</b> ${new Date().toLocaleString('id-ID')}`;

    const result = await sendMessage(chatId, text);
    res.json({ success: true, result });
  } catch (err) {
    console.error('Telegram alert error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Send report PDF to Telegram
router.post('/report', async (req, res) => {
  try {
    const { chatId, period } = req.body;

    // Generate PDF via scheduler service
    const schedRes = await axios.get(`http://localhost:3002/report/${period || 'daily'}`, {
      responseType: 'arraybuffer'
    });

    const pdf = Buffer.from(schedRes.data);
    const filename = `get220v-${period || 'daily'}-report-${Date.now()}.pdf`;
    const caption = `📊 Get220v ${period || 'daily'} report\n${new Date().toLocaleString('id-ID')}`;

    const result = await sendDocument(chatId, pdf, filename, caption);
    res.json({ success: true, result });
  } catch (err) {
    console.error('Telegram report error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Webhook dari ThingsBoard alarm → kirim ke Telegram
router.post('/alarm-webhook', async (req, res) => {
  try {
    const alarm = req.body;
    console.log('Telegram alarm webhook received:', alarm.type || alarm.name);

    const severity = alarm.severity || 'CRITICAL';
    const emoji = severity === 'CRITICAL' ? '🚨' : severity === 'MAJOR' ? '⚠️' : 'ℹ️';

    const text = `${emoji} <b>Get220v Alert</b>

<b>Type:</b> ${alarm.type || alarm.name || 'Alert'}
<b>Device:</b> ${alarm.originatorName || 'Unknown'}
<b>Severity:</b> ${severity}
<b>Status:</b> ${alarm.status || 'ACTIVE'}
<b>Time:</b> ${new Date().toLocaleString('id-ID')}`;

    await sendMessage(DEFAULT_CHAT_ID, text);
    res.json({ success: true });
  } catch (err) {
    console.error('Telegram webhook error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
module.exports.sendMessage = sendMessage;
module.exports.sendDocument = sendDocument;
