const express = require('express');
const router = express.Router();
const QRCode = require('qrcode');
const axios = require('axios');

const TB_URL = process.env.TB_URL || 'http://localhost:8080';
const PUBLIC_URL = process.env.PUBLIC_URL || 'http://localhost:3001';

async function getTbToken() {
  const res = await axios.post(`${TB_URL}/api/auth/login`, {
    username: process.env.TB_USER || 'tenant@thingsboard.org',
    password: process.env.TB_PASS || 'tenant'
  });
  return res.data.token;
}

// Generate QR code untuk device
router.get('/device/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const format = req.query.format || 'png';

    // URL yang akan di-encode di QR
    const deviceUrl = `${PUBLIC_URL}/api/qr/scan/${deviceId}`;

    if (format === 'svg') {
      const svg = await QRCode.toString(deviceUrl, { type: 'svg', width: 200 });
      res.setHeader('Content-Type', 'image/svg+xml');
      res.send(svg);
    } else {
      const qrBuffer = await QRCode.toBuffer(deviceUrl, { width: 300, margin: 2 });
      res.setHeader('Content-Type', 'image/png');
      res.send(qrBuffer);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Scan QR — redirect ke TB dashboard device
router.get('/scan/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const token = await getTbToken();

    // Ambil info device dari TB
    const devRes = await axios.get(`${TB_URL}/api/device/${deviceId}`, {
      headers: { 'X-Authorization': `Bearer ${token}` }
    });
    const device = devRes.data;

    // Ambil telemetry terbaru
    let telemetry = {};
    try {
      const telRes = await axios.get(
        `${TB_URL}/api/plugins/telemetry/DEVICE/${deviceId}/values/timeseries`,
        { headers: { 'X-Authorization': `Bearer ${token}` } }
      );
      telemetry = telRes.data;
    } catch (e) {}

    // Ambil alarms aktif
    let alarms = [];
    try {
      const alarmRes = await axios.get(
        `${TB_URL}/api/alarm/DEVICE/${deviceId}?pageSize=5&page=0&searchStatus=ACTIVE`,
        { headers: { 'X-Authorization': `Bearer ${token}` } }
      );
      alarms = alarmRes.data.data || [];
    } catch (e) {}

    // Generate halaman info device
    const telemetryRows = Object.entries(telemetry).map(([key, values]) => {
      const latest = values[0];
      return `<tr>
        <td style="padding:8px;border-bottom:1px solid #f0f0f0;font-weight:500">${key}</td>
        <td style="padding:8px;border-bottom:1px solid #f0f0f0">${latest?.value ?? '-'}</td>
        <td style="padding:8px;border-bottom:1px solid #f0f0f0;color:#999;font-size:11px">${latest ? new Date(latest.ts).toLocaleString('id-ID') : '-'}</td>
      </tr>`;
    }).join('');

    const alarmRows = alarms.map(a => `
      <div style="background:#FFEBEE;border-radius:6px;padding:10px;margin-bottom:8px">
        <div style="font-weight:600;color:#C62828">${a.type}</div>
        <div style="font-size:12px;color:#666;margin-top:2px">Severity: ${a.severity} | ${new Date(a.createdTime).toLocaleString('id-ID')}</div>
      </div>`).join('');

    const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${device.name} - Get220v</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; background: #f5f5f5; }
    .header { background: #6F42C1; color: white; padding: 20px 16px; }
    .header h1 { font-size: 20px; margin-bottom: 4px; }
    .header p { font-size: 13px; opacity: 0.8; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; background: rgba(255,255,255,0.2); margin-top: 6px; }
    .card { background: white; border-radius: 8px; margin: 12px; padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .card-title { font-size: 13px; font-weight: 700; color: #6F42C1; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .btn { display: block; background: #6F42C1; color: white; text-align: center; padding: 12px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 12px; }
    .no-data { color: #999; font-size: 13px; text-align: center; padding: 16px; }
    .alarm-count { background: #FFEBEE; color: #C62828; padding: 2px 8px; border-radius: 12px; font-size: 12px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>${device.name}</h1>
    <p>ID: ${deviceId}</p>
    <span class="badge">${device.type || 'Device'}</span>
    ${alarms.length > 0 ? `<span class="badge" style="background:#FFEBEE;color:#C62828;margin-left:6px">🚨 ${alarms.length} Active Alarm</span>` : '<span class="badge" style="background:#E8F5E9;color:#2E7D32;margin-left:6px">✅ Normal</span>'}
  </div>

  ${alarms.length > 0 ? `
  <div class="card">
    <div class="card-title">🚨 Active Alarms</div>
    ${alarmRows}
  </div>` : ''}

  <div class="card">
    <div class="card-title">📊 Latest Telemetry</div>
    ${telemetryRows ? `<table>${telemetryRows}</table>` : '<div class="no-data">No telemetry data</div>'}
  </div>

  <a href="${TB_URL}/entities/devices/${deviceId}/latest-telemetry" class="btn">Open in Dashboard →</a>

  <div style="text-align:center;padding:16px;color:#999;font-size:11px">
    Get220v IoT Platform | Scanned: ${new Date().toLocaleString('id-ID')}
  </div>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (err) {
    res.status(500).send(`<h2>Error</h2><p>${err.message}</p>`);
  }
});

// Generate QR label untuk print (multiple devices)
router.post('/label', async (req, res) => {
  try {
    const { devices } = req.body; // [{id, name}]
    if (!devices?.length) return res.status(400).json({ error: 'devices required' });

    const qrPromises = devices.map(async (d) => {
      const url = `${PUBLIC_URL}/api/qr/scan/${d.id}`;
      const svg = await QRCode.toString(url, { type: 'svg', width: 150, margin: 1 });
      return { ...d, svg, url };
    });

    const results = await Promise.all(qrPromises);

    const labels = results.map(d => `
      <div class="label">
        <div class="qr">${d.svg}</div>
        <div class="name">${d.name}</div>
        <div class="id">${d.id.slice(0, 8)}...</div>
        <div class="brand">Get220v</div>
      </div>`).join('');

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>QR Labels - Get220v</title>
  <style>
    body { font-family: Arial, sans-serif; }
    .container { display: flex; flex-wrap: wrap; gap: 10px; padding: 20px; }
    .label { border: 1px dashed #ccc; border-radius: 6px; padding: 12px; text-align: center; width: 180px; }
    .qr svg { width: 150px; height: 150px; }
    .name { font-weight: 700; font-size: 13px; margin-top: 6px; color: #333; }
    .id { font-size: 10px; color: #999; margin-top: 2px; }
    .brand { font-size: 10px; color: #6F42C1; font-weight: 600; margin-top: 4px; }
    @media print { .no-print { display: none; } }
  </style>
</head>
<body>
  <div class="no-print" style="padding:16px;background:#6F42C1;color:white;display:flex;justify-content:space-between;align-items:center">
    <span style="font-weight:600">QR Labels - Get220v (${results.length} devices)</span>
    <button onclick="window.print()" style="padding:8px 16px;background:white;color:#6F42C1;border:none;border-radius:6px;cursor:pointer;font-weight:600">🖨 Print</button>
  </div>
  <div class="container">${labels}</div>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
