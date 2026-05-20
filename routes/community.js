const express = require('express');
const pool    = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const router  = express.Router();

// ── FEED ──────────────────────────────────────────────────────────────────────
router.get('/feed', requireAuth, async (req, res) => {
  const { limit=20, offset=0 } = req.query;
  const r = await pool.query(`
    SELECT p.*, u.name, u.username, u.avatar, u.avatar_url,
      EXISTS(SELECT 1 FROM post_likes WHERE user_id=$1 AND post_id=p.id) AS liked
    FROM posts p JOIN users u ON p.user_id=u.id
    ORDER BY p.created_at DESC LIMIT $2 OFFSET $3
  `, [req.userId, Number(limit), Number(offset)]);
  res.json(r.rows);
});

// ── MY POSTS ──────────────────────────────────────────────────────────────────
router.get('/mine', requireAuth, async (req, res) => {
  const r = await pool.query(`
    SELECT p.*, u.name, u.username, u.avatar,
      EXISTS(SELECT 1 FROM post_likes WHERE user_id=$1 AND post_id=p.id) AS liked
    FROM posts p JOIN users u ON p.user_id=u.id
    WHERE p.user_id=$1 ORDER BY p.created_at DESC
  `, [req.userId]);
  res.json(r.rows);
});

// ── CREATE POST ───────────────────────────────────────────────────────────────
router.post('/', requireAuth, async (req, res) => {
  const { recipe_name='', recipe_id, text='', emoji='🍽',
          color='#FF5722', cook_time=0, kcal=0, image_url='' } = req.body;
  if (!text && !recipe_name) return res.status(400).json({ error: 'Text or recipe required' });
  const r = await pool.query(`
    INSERT INTO posts (user_id,recipe_name,recipe_id,text,emoji,color,cook_time,kcal,image_url)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    RETURNING *,
      (SELECT name FROM users WHERE id=$1) AS name,
      (SELECT username FROM users WHERE id=$1) AS username,
      (SELECT avatar FROM users WHERE id=$1) AS avatar
  `, [req.userId,recipe_name,recipe_id||null,text,emoji,color,cook_time,kcal,image_url]);
  res.status(201).json({ ...r.rows[0], liked: false });
});

// ── DELETE POST ───────────────────────────────────────────────────────────────
router.delete('/:id', requireAuth, async (req, res) => {
  const r = await pool.query('SELECT user_id FROM posts WHERE id=$1',[req.params.id]);
  if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
  if (r.rows[0].user_id !== req.userId) return res.status(403).json({ error: 'Not yours' });
  await pool.query('DELETE FROM posts WHERE id=$1',[req.params.id]);
  res.json({ deleted: true });
});

// ── LIKE / UNLIKE POST ────────────────────────────────────────────────────────
router.post('/:id/like', requireAuth, async (req, res) => {
  const e = await pool.query('SELECT 1 FROM post_likes WHERE user_id=$1 AND post_id=$2',[req.userId,req.params.id]);
  if (e.rows.length) {
    await pool.query('DELETE FROM post_likes WHERE user_id=$1 AND post_id=$2',[req.userId,req.params.id]);
    await pool.query('UPDATE posts SET likes=GREATEST(0,likes-1) WHERE id=$1',[req.params.id]);
    res.json({ liked: false });
  } else {
    await pool.query('INSERT INTO post_likes(user_id,post_id) VALUES($1,$2)',[req.userId,req.params.id]);
    await pool.query('UPDATE posts SET likes=likes+1 WHERE id=$1',[req.params.id]);
    const post = await pool.query('SELECT user_id FROM posts WHERE id=$1',[req.params.id]);
    if (post.rows[0]?.user_id !== req.userId) {
      await pool.query('UPDATE users SET kudos=kudos+1 WHERE id=$1',[post.rows[0].user_id]);
    }
    res.json({ liked: true });
  }
});

// ── COMMENTS ─────────────────────────────────────────────────────────────────
router.get('/:id/comments', requireAuth, async (req, res) => {
  const r = await pool.query(`
    SELECT c.*, u.name, u.username, u.avatar
    FROM comments c JOIN users u ON c.user_id=u.id
    WHERE c.post_id=$1 ORDER BY c.created_at ASC
  `, [req.params.id]);
  res.json(r.rows);
});

router.post('/:id/comments', requireAuth, async (req, res) => {
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'Text required' });
  const r = await pool.query(`
    INSERT INTO comments(post_id,user_id,text) VALUES($1,$2,$3)
    RETURNING *, (SELECT name FROM users WHERE id=$2) AS name,
      (SELECT username FROM users WHERE id=$2) AS username,
      (SELECT avatar FROM users WHERE id=$2) AS avatar
  `, [req.params.id, req.userId, text.trim()]);
  await pool.query('UPDATE posts SET comments=comments+1 WHERE id=$1',[req.params.id]);
  res.status(201).json(r.rows[0]);
});

module.exports = router;
