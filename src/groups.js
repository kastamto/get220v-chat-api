const express = require('express');
const router = express.Router();
const { pool } = require('./db');

// Get all groups
router.get('/', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] || 'default';
    const result = await pool.query(
      `SELECT g.*, COUNT(m.id) as device_count 
       FROM device_groups g 
       LEFT JOIN device_group_members m ON g.id = m.group_id
       WHERE g.tenant_id = $1
       GROUP BY g.id ORDER BY g.created_at DESC`,
      [tenantId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create group
router.post('/', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] || 'default';
    const { name, description, color, icon } = req.body;
    const result = await pool.query(
      `INSERT INTO device_groups (tenant_id, name, description, color, icon)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [tenantId, name, description, color||'#6F42C1', icon||'folder']
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update group
router.put('/:id', async (req, res) => {
  try {
    const { name, description, color, icon } = req.body;
    const result = await pool.query(
      `UPDATE device_groups SET name=$1, description=$2, color=$3, icon=$4, updated_at=NOW()
       WHERE id=$5 RETURNING *`,
      [name, description, color, icon, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete group
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM device_groups WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get group members
router.get('/:id/devices', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM device_group_members WHERE group_id = $1 ORDER BY added_at DESC',
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add device to group
router.post('/:id/devices', async (req, res) => {
  try {
    const { deviceId, deviceName } = req.body;
    const result = await pool.query(
      `INSERT INTO device_group_members (group_id, device_id, device_name)
       VALUES ($1,$2,$3) ON CONFLICT (group_id, device_id) DO UPDATE SET device_name=$3
       RETURNING *`,
      [req.params.id, deviceId, deviceName]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Remove device from group
router.delete('/:id/devices/:deviceId', async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM device_group_members WHERE group_id=$1 AND device_id=$2',
      [req.params.id, req.params.deviceId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all devices in group with telemetry summary
router.get('/:id/summary', async (req, res) => {
  try {
    const members = await pool.query(
      'SELECT * FROM device_group_members WHERE group_id = $1',
      [req.params.id]
    );
    const group = await pool.query(
      'SELECT * FROM device_groups WHERE id = $1',
      [req.params.id]
    );
    res.json({
      group: group.rows[0],
      devices: members.rows,
      device_count: members.rows.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
