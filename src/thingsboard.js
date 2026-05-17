const axios = require('axios');

const TB_URL = process.env.TB_URL || 'http://localhost:8080';
const TB_USER = process.env.TB_USER || 'tenant@thingsboard.org';
const TB_PASS = process.env.TB_PASS || 'tenant';

let token = null;

async function login() {
  const res = await axios.post(`${TB_URL}/api/auth/login`, {
    username: TB_USER,
    password: TB_PASS
  });
  token = res.data.token;
  return token;
}

async function getDevices() {
  if (!token) await login();
  const res = await axios.get(`${TB_URL}/api/tenant/devices?pageSize=20&page=0`, {
    headers: { 'X-Authorization': `Bearer ${token}` }
  });
  return res.data.data;
}

async function getTelemetry(deviceId, keys) {
  if (!token) await login();
  const res = await axios.get(`${TB_URL}/api/plugins/telemetry/DEVICE/${deviceId}/values/timeseries?keys=${keys}`, {
    headers: { 'X-Authorization': `Bearer ${token}` }
  });
  return res.data;
}

module.exports = { login, getDevices, getTelemetry };
