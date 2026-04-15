const express = require('express');
const path    = require('path');
const { Pool } = require('pg');

const app  = express();
const PORT = process.env.PORT || 47291;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS directory (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  const existing = await pool.query("SELECT key FROM directory WHERE key = 'data'");
  if (existing.rows.length === 0) {
    const fs   = require('fs');
    const file = path.join(__dirname, 'data.json');
    let seed   = { contacts: [], departments: [], subdepartments: [], password: '' };
    try { seed = JSON.parse(fs.readFileSync(file, 'utf8')); } catch(e) {}
    await pool.query(
      "INSERT INTO directory (key, value) VALUES ('data', $1)",
      [JSON.stringify(seed)]
    );
    console.log('Database seeded from data.json — ' + (seed.contacts.length) + ' contacts loaded.');
  }
}

async function readData() {
  const result = await pool.query("SELECT value FROM directory WHERE key = 'data'");
  if (result.rows.length === 0) return { contacts: [], departments: [], subdepartments: [], password: '' };
  return JSON.parse(result.rows[0].value);
}

async function writeData(data) {
  await pool.query(
    "INSERT INTO directory (key, value) VALUES ('data', $1) ON CONFLICT (key) DO UPDATE SET value = $1",
    [JSON.stringify(data)]
  );
}

app.get('/api/data', async function(req, res) {
  try {
    res.json(await readData());
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/save', async function(req, res) {
  try {
    const incoming = req.body;
    if (!Array.isArray(incoming.contacts)) {
      return res.status(400).json({ ok: false, error: 'contacts must be an array' });
    }
    const current = await readData();
    await writeData({
      contacts:       incoming.contacts,
      departments:    Array.isArray(incoming.departments)    ? incoming.departments    : current.departments,
      subdepartments: Array.isArray(incoming.subdepartments) ? incoming.subdepartments : current.subdepartments,
      password:       typeof incoming.password === 'string'  ? incoming.password       : current.password
    });
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('*', function(req, res) {
  res.sendFile(path.join(__dirname, 'index.html'));
});

initDB().then(function() {
  app.listen(PORT, '0.0.0.0', function() {
    console.log('Raffles Directory running on port ' + PORT);
  });
}).catch(function(e) {
  console.error('Database init failed:', e.message);
  process.exit(1);
});
