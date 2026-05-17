const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const { saveToken, getAllTokens, deleteToken } = require('./db');

let firebaseInitialized = false;

function initFirebase() {
  if (!firebaseInitialized) {
    const serviceAccount = require('/Users/mm/Desktop/get220v-firebase-service-account.json');
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    firebaseInitialized = true;
  }
}

// Register token ke PostgreSQL
router.post('/register', async (req, res) => {
  try {
    const { token, userId, deviceInfo } = req.body;
    if (!token) return res.status(400).json({ error: 'Token required' });
    const result = await saveToken(token, userId, deviceInfo);
    console.log('Token saved to DB:', token.substring(0, 20) + '...');
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Send ke specific token
router.post('/send', async (req, res) => {
  try {
    initFirebase();
    const { token, title, body, data } = req.body;
    if (!token) return res.status(400).json({ error: 'FCM token required' });

    const message = {
      notification: { title: title || 'Get220v Alert', body: body || 'New alert' },
      data: data || {},
      token
    };

    const response = await admin.messaging().send(message);
    res.json({ success: true, messageId: response });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Webhook dari ThingsBoard alarm
router.post('/alarm', async (req, res) => {
  try {
    initFirebase();
    const alarm = req.body;
    console.log("Full alarm data:", JSON.stringify(alarm, null, 2));

    const title = `🚨 ${alarm.type || alarm.name || "Alert"} - Get220v`;
    const body = `📍 ${alarm.originatorName || "Unknown"} | ⚠️ ${alarm.severity || "CRITICAL"} | 🕐 ${new Date().toLocaleTimeString("id-ID")}`;

    // Ambil semua token dari PostgreSQL
    const tokens = await getAllTokens();

    if (tokens.length === 0) {
      console.log('No registered tokens in DB!');
      return res.json({ success: false, message: 'No tokens registered' });
    }

    const results = await Promise.all(tokens.map(async token => {
      try {
        const response = await admin.messaging().send({
          notification: { title, body },
          data: {
            alarmType: String(alarm.type || alarm.name || ''),
            entityName: String(alarm.originatorName || ''),
            severity: String(alarm.severity || '')
          },
          token
        });
        return { success: true, messageId: response };
      } catch (err) {
        // Token invalid - hapus dari DB
        if (err.code === 'messaging/registration-token-not-registered') {
          await deleteToken(token);
          console.log('Deleted invalid token from DB');
        }
        return { error: err.message };
      }
    }));

    console.log('FCM sent to', tokens.length, 'devices');
    res.json({ success: true, results });
  } catch (err) {
    console.error('Alarm FCM error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
