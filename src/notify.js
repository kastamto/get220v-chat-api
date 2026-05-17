const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');

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

// Token registry - simpan FCM tokens
const tokenRegistry = new Set();

// Register token
router.post('/register', (req, res) => {
  const { token } = req.body;
  if (token) {
    tokenRegistry.add(token);
    console.log('Token registered:', token.substring(0, 20) + '...');
    res.json({ success: true, totalTokens: tokenRegistry.size });
  } else {
    res.status(400).json({ error: 'Token required' });
  }
});

// Send to specific token
router.post('/send', async (req, res) => {
  try {
    initFirebase();
    const { token, title, body, data } = req.body;
    if (!token) return res.status(400).json({ error: 'FCM token required' });

    const message = {
      notification: { title: title || 'Get220v Alert', body: body || 'New alert' },
      data: data || {},
      token: token
    };

    const response = await admin.messaging().send(message);
    res.json({ success: true, messageId: response });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Webhook from ThingsBoard alarm
router.post('/alarm', async (req, res) => {
  try {
    initFirebase();
    const alarm = req.body;
    console.log('Alarm received:', alarm.type || alarm.name, '| Device:', alarm.originatorName);

    const title = `🚨 ${alarm.type || alarm.name || 'Alert'}`;
    const body = `Device: ${alarm.originatorName || 'Unknown'} | Severity: ${alarm.severity || 'CRITICAL'}`;

    const tokens = Array.from(tokenRegistry);
    
    if (tokens.length === 0) {
      console.log('No registered tokens!');
      return res.json({ success: false, message: 'No tokens registered' });
    }

    const results = await Promise.all(tokens.map(token =>
      admin.messaging().send({
        notification: { title, body },
        data: {
          alarmType: String(alarm.type || alarm.name || ''),
          entityName: String(alarm.originatorName || ''),
          severity: String(alarm.severity || '')
        },
        token
      }).catch(err => ({ error: err.message, token }))
    ));

    console.log('FCM sent to', tokens.length, 'devices');
    res.json({ success: true, results });
  } catch (err) {
    console.error('Alarm FCM error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
