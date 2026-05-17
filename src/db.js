const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'thingsboard',
  user: 'postgres',
  password: 'postgres'
});

async function initDb() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS fcm_tokens (
        id SERIAL PRIMARY KEY,
        token TEXT UNIQUE NOT NULL,
        user_id TEXT,
        device_info TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ FCM tokens table ready');
  } finally {
    client.release();
  }
}

async function saveToken(token, userId = null, deviceInfo = null) {
  const result = await pool.query(
    `INSERT INTO fcm_tokens (token, user_id, device_info, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (token) DO UPDATE SET updated_at = NOW()
     RETURNING *`,
    [token, userId, deviceInfo]
  );
  return result.rows[0];
}

async function getAllTokens() {
  const result = await pool.query('SELECT token FROM fcm_tokens');
  return result.rows.map(r => r.token);
}

async function deleteToken(token) {
  await pool.query('DELETE FROM fcm_tokens WHERE token = $1', [token]);
}

module.exports = { initDb, saveToken, getAllTokens, deleteToken };
