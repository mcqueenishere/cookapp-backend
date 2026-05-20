const express  = require('express');
const bcrypt   = require('bcryptjs');
const pool     = require('../db/pool');
const { signToken, requireAuth } = require('../middleware/auth');
const router   = express.Router();

// ── REGISTER ─────────────────────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  const { email, password, name, phone } = req.body;
  if (!email && !phone) return res.status(400).json({ error: 'Email or phone required' });
  try {
    const check = await pool.query(
      'SELECT id FROM users WHERE email=$1 OR phone=$2', [email||null, phone||null]
    );
    if (check.rows.length) return res.status(409).json({ error: 'Account already exists' });

    const hash = password ? await bcrypt.hash(password, 10) : null;
    const base = name || (email ? email.split('@')[0] : 'chef');
    const username = '@' + base.toLowerCase().replace(/[^a-z0-9]/g,'') + Math.random().toString(36).slice(2,6);

    const r = await pool.query(
      `INSERT INTO users (email, phone, name, username, password, provider)
       VALUES ($1,$2,$3,$4,$5,'email') RETURNING *`,
      [email||null, phone||null, name||'Chef', username, hash]
    );
    res.status(201).json({ token: signToken(r.rows[0].id), user: safe(r.rows[0]) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── LOGIN ─────────────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { email, phone, password } = req.body;
  try {
    const r = await pool.query(
      'SELECT * FROM users WHERE email=$1 OR phone=$2', [email||null, phone||null]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Account not found' });
    const user = r.rows[0];
    if (user.password && password) {
      if (!(await bcrypt.compare(password, user.password)))
        return res.status(401).json({ error: 'Wrong password' });
    }
    res.json({ token: signToken(user.id), user: safe(user) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── SOCIAL (Apple / Google / Facebook) ───────────────────────────────────────
router.post('/social', async (req, res) => {
  const { provider, provider_id, email, name, avatar } = req.body;
  if (!provider || !provider_id) return res.status(400).json({ error: 'Provider info required' });
  try {
    let r = await pool.query(
      'SELECT * FROM users WHERE provider=$1 AND provider_id=$2', [provider, provider_id]
    );
    if (!r.rows.length && email) {
      r = await pool.query('SELECT * FROM users WHERE email=$1', [email]);
    }
    if (r.rows.length) {
      if (!r.rows[0].provider_id) {
        await pool.query('UPDATE users SET provider=$1, provider_id=$2 WHERE id=$3',
                         [provider, provider_id, r.rows[0].id]);
      }
      return res.json({ token: signToken(r.rows[0].id), user: safe(r.rows[0]) });
    }
    const username = '@' + (name||'chef').toLowerCase().replace(/[^a-z0-9]/g,'') + Math.random().toString(36).slice(2,6);
    const ins = await pool.query(
      `INSERT INTO users (email, name, username, avatar_url, provider, provider_id)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [email||null, name||'Chef', username, avatar||null, provider, provider_id]
    );
    res.status(201).json({ token: signToken(ins.rows[0].id), user: safe(ins.rows[0]) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── SEND SMS CODE ─────────────────────────────────────────────────────────────
router.post('/send-code', async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone required' });
  const code = Math.floor(100000 + Math.random()*900000).toString();
  // Production: send via Twilio. Dev: log to console.
  console.log(`[SMS] ${phone} → code: ${code}`);
  res.json({ sent: true, dev_code: process.env.NODE_ENV==='development' ? code : undefined });
});

// ── VERIFY SMS CODE ───────────────────────────────────────────────────────────
router.post('/verify-code', async (req, res) => {
  const { phone, code } = req.body;
  if (!phone || code?.length !== 6) return res.status(400).json({ error: 'Invalid' });
  try {
    let r = await pool.query('SELECT * FROM users WHERE phone=$1', [phone]);
    if (!r.rows.length) {
      const username = '@chef' + Math.random().toString(36).slice(2,8);
      const ins = await pool.query(
        `INSERT INTO users (phone, name, username, provider) VALUES ($1,'Chef',$2,'phone') RETURNING *`,
        [phone, username]
      );
      r = ins;
    }
    res.json({ token: signToken(r.rows[0].id), user: safe(r.rows[0]) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── ME ────────────────────────────────────────────────────────────────────────
router.get('/me', requireAuth, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM users WHERE id=$1', [req.userId]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(safe(r.rows[0]));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

function safe(u) { const { password, ...rest } = u; return rest; }
module.exports = router;
