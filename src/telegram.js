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


// Telegram Bot Command Handler
const TB_URL = process.env.TB_URL || 'http://localhost:8080';
const BOT_TOKEN_VAL = process.env.TELEGRAM_BOT_TOKEN;

let tbCommandToken = null;

async function getTbCommandToken() {
  if (tbCommandToken) return tbCommandToken;
  const res = await axios.post(TB_URL + '/api/auth/login', {
    username: process.env.TB_USER || 'tenant@thingsboard.org',
    password: process.env.TB_PASS || 'tenant'
  });
  tbCommandToken = res.data.token;
  return tbCommandToken;
}

// Handle incoming Telegram message (webhook)
router.post('/webhook', async (req, res) => {
  try {
    const update = req.body;
    const msg = update.message || update.edited_message;
    if (!msg || !msg.text) return res.json({ ok: true });

    const chatId = msg.chat.id;
    const text = msg.text.trim();
    const parts = text.split(' ');
    const command = parts[0].toLowerCase();
    const arg = parts.slice(1).join(' ');

    console.log('Telegram command:', command, 'from:', chatId);

    let reply = '';

    if (command === '/start' || command === '/help') {
      reply = `🤖 *Get220v Bot Commands*

/status [device name] — Status & telemetry device
/alarms — List alarm aktif
/devices — List semua device
/report — Generate report harian
/summary — Ringkasan platform
/help — Tampilkan perintah ini`;

    } else if (command === '/devices') {
      const token = await getTbCommandToken();
      const res2 = await axios.get(TB_URL + '/api/tenant/devices?pageSize=20&page=0', {
        headers: { 'X-Authorization': 'Bearer ' + token }
      });
      const devices = res2.data.data || [];
      reply = '📱 *Daftar Device (' + devices.length + ')*\n\n';
      devices.forEach((d, i) => {
        reply += (i+1) + '. ' + d.name + ' (' + (d.type || 'Default') + ')\n';
      });

    } else if (command === '/alarms') {
      const token = await getTbCommandToken();
      const res2 = await axios.get(TB_URL + '/api/alarms?pageSize=10&page=0&searchStatus=ACTIVE', {
        headers: { 'X-Authorization': 'Bearer ' + token }
      });
      const alarms = res2.data.data || [];
      if (!alarms.length) {
        reply = '✅ Tidak ada alarm aktif saat ini';
      } else {
        reply = '🚨 *Alarm Aktif (' + alarms.length + ')*\n\n';
        alarms.forEach((a, i) => {
          const emoji = a.severity === 'CRITICAL' ? '🔴' : a.severity === 'MAJOR' ? '🟠' : '🟡';
          reply += emoji + ' ' + a.type + '\n';
          reply += '   Device: ' + a.originatorName + '\n';
          reply += '   ' + new Date(a.createdTime).toLocaleString('id-ID') + '\n\n';
        });
      }

    } else if (command === '/status') {
      const token = await getTbCommandToken();
      const res2 = await axios.get(TB_URL + '/api/tenant/devices?pageSize=100&page=0', {
        headers: { 'X-Authorization': 'Bearer ' + token }
      });
      const devices = res2.data.data || [];
      
      let device = null;
      if (arg) {
        device = devices.find(d => d.name.toLowerCase().includes(arg.toLowerCase()));
      } else {
        device = devices[0];
      }

      if (!device) {
        reply = '❌ Device tidak ditemukan: ' + arg;
      } else {
        const telRes = await axios.get(
          TB_URL + '/api/plugins/telemetry/DEVICE/' + device.id.id + '/values/timeseries',
          { headers: { 'X-Authorization': 'Bearer ' + token } }
        );
        const telemetry = telRes.data;
        reply = '📊 *Status: ' + device.name + '*\n\n';
        Object.entries(telemetry).forEach(([key, values]) => {
          if (values[0]) {
            reply += '• ' + key + ': *' + values[0].value + '*\n';
          }
        });
        if (Object.keys(telemetry).length === 0) {
          reply += '_Belum ada data telemetry_';
        }
        reply += '\n🕐 ' + new Date().toLocaleString('id-ID');
      }

    } else if (command === '/summary') {
      const token = await getTbCommandToken();
      const [devRes, alarmRes] = await Promise.all([
        axios.get(TB_URL + '/api/tenant/devices?pageSize=1&page=0', { headers: { 'X-Authorization': 'Bearer ' + token }}),
        axios.get(TB_URL + '/api/alarms?pageSize=1&page=0&searchStatus=ACTIVE', { headers: { 'X-Authorization': 'Bearer ' + token }})
      ]);
      reply = '📈 *Get220v Platform Summary*\n\n';
      reply += '📱 Total devices: *' + (devRes.data.totalElements || 0) + '*\n';
      reply += '🚨 Active alarms: *' + (alarmRes.data.totalElements || 0) + '*\n';
      reply += '🕐 ' + new Date().toLocaleString('id-ID');

    } else if (command === '/report') {
      reply = '📊 Generating report...';
      await sendMessage(chatId, reply);
      try {
        await axios.post(process.env.CHAT_API_URL + '/api/telegram/report', {
          chatId: String(chatId),
          period: 'daily'
        });
        return res.json({ ok: true });
      } catch(e) {
        reply = '❌ Report gagal: ' + e.message;
      }

    } else {
      reply = '❓ Command tidak dikenal. Ketik /help untuk bantuan.';
    }

    if (reply) await sendMessage(chatId, reply, 'Markdown');
    res.json({ ok: true });
  } catch (err) {
    console.error('Webhook error:', err.message);
    res.json({ ok: true });
  }
});

// Set webhook ke Telegram
router.get('/set-webhook', async (req, res) => {
  try {
    const webhookUrl = (process.env.PUBLIC_URL || 'http://localhost:3001') + '/api/telegram/webhook';
    const response = await axios.post(
      'https://api.telegram.org/bot' + BOT_TOKEN_VAL + '/setWebhook',
      { url: webhookUrl }
    );
    res.json({ success: true, result: response.data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get webhook info
router.get('/webhook-info', async (req, res) => {
  try {
    const response = await axios.get('https://api.telegram.org/bot' + BOT_TOKEN_VAL + '/getWebhookInfo');
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// Telegram polling (untuk development tanpa webhook)
let lastUpdateId = 0;

async function startPolling() {
  console.log('Starting Telegram polling...');
  setInterval(async () => {
    try {
      const res = await require('axios').get(
        'https://api.telegram.org/bot' + BOT_TOKEN_VAL + '/getUpdates?offset=' + (lastUpdateId + 1) + '&timeout=1'
      );
      const updates = res.data.result || [];
      for (const update of updates) {
        lastUpdateId = update.update_id;
        if (update.message?.text) {
          await handleTelegramUpdate(update);
        }
      }
    } catch(e) {}
  }, 2000);
}

async function handleTelegramUpdate(update) {
  const msg = update.message;
  const chatId = msg.chat.id;
  const text = msg.text.trim();
  const parts = text.split(' ');
  const command = parts[0].toLowerCase().replace('@get220vbot', '');
  const arg = parts.slice(1).join(' ');

  console.log('Telegram command:', command, 'from chat:', chatId);

  let reply = '';
  const TB_URL_CMD = process.env.TB_URL || 'http://localhost:8080';

  try {
    if (command === '/start' || command === '/help') {
      reply = `🤖 *Get220v Bot Commands*

/status [nama device] — Status & telemetry device
/alarms — List alarm aktif  
/devices — List semua device
/report — Generate report harian
/summary — Ringkasan platform
/help — Tampilkan perintah ini`;

    } else if (command === '/devices') {
      const token = await getTbCommandToken();
      const r = await require('axios').get(TB_URL_CMD + '/api/tenant/devices?pageSize=20&page=0', {
        headers: { 'X-Authorization': 'Bearer ' + token }
      });
      const devices = r.data.data || [];
      reply = '📱 *Daftar Device (' + devices.length + ')*\n\n';
      devices.forEach((d, i) => {
        reply += (i+1) + '. ' + d.name + '\n';
      });

    } else if (command === '/alarms') {
      const token = await getTbCommandToken();
      const r = await require('axios').get(TB_URL_CMD + '/api/alarms?pageSize=10&page=0&searchStatus=ACTIVE', {
        headers: { 'X-Authorization': 'Bearer ' + token }
      });
      const alarms = r.data.data || [];
      if (!alarms.length) {
        reply = '✅ Tidak ada alarm aktif saat ini';
      } else {
        reply = '🚨 *Alarm Aktif (' + alarms.length + ')*\n\n';
        alarms.forEach(a => {
          const emoji = a.severity === 'CRITICAL' ? '🔴' : '🟠';
          reply += emoji + ' *' + a.type + '*\n   Device: ' + a.originatorName + '\n\n';
        });
      }

    } else if (command === '/status') {
      const token = await getTbCommandToken();
      const r = await require('axios').get(TB_URL_CMD + '/api/tenant/devices?pageSize=100&page=0', {
        headers: { 'X-Authorization': 'Bearer ' + token }
      });
      const devices = r.data.data || [];
      let device = arg ? devices.find(d => d.name.toLowerCase().includes(arg.toLowerCase())) : devices[0];

      if (!device) {
        reply = '❌ Device tidak ditemukan: ' + arg + '\nGunakan /devices untuk lihat daftar';
      } else {
        const telRes = await require('axios').get(
          TB_URL_CMD + '/api/plugins/telemetry/DEVICE/' + device.id.id + '/values/timeseries',
          { headers: { 'X-Authorization': 'Bearer ' + token } }
        );
        const telemetry = telRes.data;
        reply = '📊 *' + device.name + '*\n\n';
        Object.entries(telemetry).forEach(([key, values]) => {
          if (values[0]) reply += '• ' + key + ': *' + values[0].value + '*\n';
        });
        if (!Object.keys(telemetry).length) reply += '_Belum ada data telemetry_';
        reply += '\n🕐 ' + new Date().toLocaleString('id-ID');
      }

    } else if (command === '/summary') {
      const token = await getTbCommandToken();
      const [devRes, alarmRes] = await Promise.all([
        require('axios').get(TB_URL_CMD + '/api/tenant/devices?pageSize=1&page=0', { headers: { 'X-Authorization': 'Bearer ' + token }}),
        require('axios').get(TB_URL_CMD + '/api/alarms?pageSize=1&page=0&searchStatus=ACTIVE', { headers: { 'X-Authorization': 'Bearer ' + token }})
      ]);
      reply = '📈 *Get220v Summary*\n\n';
      reply += '📱 Total devices: *' + (devRes.data.totalElements || 0) + '*\n';
      reply += '🚨 Active alarms: *' + (alarmRes.data.totalElements || 0) + '*\n';
      reply += '🕐 ' + new Date().toLocaleString('id-ID');

    } else if (command === '/report') {
      await sendMessage(chatId, '📊 Generating report...');
      await require('axios').post('http://localhost:3001/api/telegram/report', {
        chatId: String(chatId), period: 'daily'
      });
      return;

    } else {
      reply = '❓ Command tidak dikenal. Ketik /help';
    }

    if (reply) await sendMessage(chatId, reply, 'Markdown');
  } catch(e) {
    console.error('Command error:', e.message);
    await sendMessage(chatId, '❌ Error: ' + e.message);
  }
}




module.exports = router;
module.exports.sendMessage = sendMessage;
module.exports.sendDocument = sendDocument;
module.exports.startPolling = startPolling;