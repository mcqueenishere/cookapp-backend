const express = require('express');
const pool    = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const router  = express.Router();

// ── GET MY PROFILE ────────────────────────────────────────────────────────────
router.get('/me', requireAuth, async (req, res) => {
  const r = await pool.query('SELECT * FROM users WHERE id=$1', [req.userId]);
  if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
  const { password, ...u } = r.rows[0];
  res.json(u);
});

// ── UPDATE PROFILE ────────────────────────────────────────────────────────────
router.patch('/me', requireAuth, async (req, res) => {
  const fields = [];
  const vals   = [];
  let idx = 1;
  const allowed = ['name','username','bio','location','website','avatar','avatar_url','cook_time','push_token'];
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      fields.push(`${key}=$${idx++}`);
      vals.push(req.body[key]);
    }
  }
  if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });
  fields.push(`updated_at=NOW()`);
  vals.push(req.userId);
  try {
    const r = await pool.query(
      `UPDATE users SET ${fields.join(',')} WHERE id=$${idx} RETURNING *`, vals
    );
    const { password, ...u } = r.rows[0];
    res.json(u);
  } catch(e) {
    res.status(e.code==='23505' ? 409 : 500).json({ error: e.message });
  }
});

// ── GET USER BY ID ────────────────────────────────────────────────────────────
router.get('/:id', requireAuth, async (req, res) => {
  const r = await pool.query('SELECT * FROM users WHERE id=$1', [req.params.id]);
  if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
  const f = await pool.query(
    'SELECT 1 FROM follows WHERE follower_id=$1 AND following_id=$2',
    [req.userId, req.params.id]
  );
  const { password, ...u } = r.rows[0];
  res.json({ ...u, isFollowing: f.rows.length > 0 });
});

// ── SEARCH USERS ──────────────────────────────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  const { q, limit=20, offset=0 } = req.query;
  if (!q) return res.status(400).json({ error: 'Query required' });
  const r = await pool.query(
    `SELECT id,name,username,avatar,bio,followers_count FROM users
     WHERE (name ILIKE $1 OR username ILIKE $1) AND id!=$2
     LIMIT $3 OFFSET $4`,
    [`%${q}%`, req.userId, Number(limit), Number(offset)]
  );
  res.json(r.rows);
});

// ── FOLLOW / UNFOLLOW ─────────────────────────────────────────────────────────
router.post('/:id/follow', requireAuth, async (req, res) => {
  if (req.params.id === req.userId) return res.status(400).json({ error: "Can't follow yourself" });
  const existing = await pool.query(
    'SELECT 1 FROM follows WHERE follower_id=$1 AND following_id=$2',
    [req.userId, req.params.id]
  );
  if (existing.rows.length) {
    await pool.query('DELETE FROM follows WHERE follower_id=$1 AND following_id=$2', [req.userId, req.params.id]);
    await pool.query('UPDATE users SET followers_count=GREATEST(0,followers_count-1) WHERE id=$1', [req.params.id]);
    await pool.query('UPDATE users SET following_count=GREATEST(0,following_count-1) WHERE id=$1', [req.userId]);
    res.json({ following: false });
  } else {
    await pool.query('INSERT INTO follows (follower_id,following_id) VALUES ($1,$2)', [req.userId, req.params.id]);
    await pool.query('UPDATE users SET followers_count=followers_count+1 WHERE id=$1', [req.params.id]);
    await pool.query('UPDATE users SET following_count=following_count+1 WHERE id=$1', [req.userId]);
    res.json({ following: true });
  }
});

// ── SAVE PUSH TOKEN ───────────────────────────────────────────────────────────
router.post('/push-token', requireAuth, async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token required' });
  await pool.query('UPDATE users SET push_token=$1 WHERE id=$2', [token, req.userId]);
  res.json({ saved: true });
});

module.exports = router;
