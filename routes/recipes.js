const express = require('express');
const pool    = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const router  = express.Router();

// ── LIST / SEARCH ─────────────────────────────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  const { q, category, mine, limit=20, offset=0 } = req.query;
  let sql = `
    SELECT r.*,
      u.name AS author_name, u.avatar AS author_avatar, u.avatar_url AS author_avatar_url,
      EXISTS(SELECT 1 FROM recipe_likes  WHERE user_id=$1 AND recipe_id=r.id) AS liked,
      EXISTS(SELECT 1 FROM recipe_saves  WHERE user_id=$1 AND recipe_id=r.id) AS saved
    FROM recipes r JOIN users u ON r.user_id=u.id
    WHERE `;
  const params = [req.userId];
  let i = 2;
  if (mine === '1') { sql += `r.user_id=$${i++}`; params.push(req.userId); }
  else              { sql += `r.is_public=TRUE`; }
  if (q)        { sql += ` AND (r.title ILIKE $${i} OR r.category ILIKE $${i++})`; params.push(`%${q}%`); }
  if (category) { sql += ` AND r.category=$${i++}`; params.push(category); }
  sql += ` ORDER BY r.created_at DESC LIMIT $${i++} OFFSET $${i}`;
  params.push(Number(limit), Number(offset));
  const r = await pool.query(sql, params);
  res.json(r.rows);
});

// ── TRENDING ──────────────────────────────────────────────────────────────────
router.get('/trending/top', requireAuth, async (req, res) => {
  const r = await pool.query(`
    SELECT r.*, u.name AS author_name, u.avatar AS author_avatar
    FROM recipes r JOIN users u ON r.user_id=u.id
    WHERE r.is_public=TRUE
    ORDER BY r.likes DESC, r.created_at DESC LIMIT 10
  `);
  res.json(r.rows);
});

// ── GET ONE ───────────────────────────────────────────────────────────────────
router.get('/:id', requireAuth, async (req, res) => {
  const r = await pool.query(`
    SELECT r.*, u.name AS author_name, u.avatar AS author_avatar,
      EXISTS(SELECT 1 FROM recipe_likes WHERE user_id=$1 AND recipe_id=r.id) AS liked,
      EXISTS(SELECT 1 FROM recipe_saves WHERE user_id=$1 AND recipe_id=r.id) AS saved
    FROM recipes r JOIN users u ON r.user_id=u.id WHERE r.id=$2
  `, [req.userId, req.params.id]);
  if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(r.rows[0]);
});

// ── CREATE ────────────────────────────────────────────────────────────────────
router.post('/', requireAuth, async (req, res) => {
  const { title, category='Dinner', time='30', kcal='400', difficulty='Easy',
          emoji='🍽', ingredients=[], steps=[], image_url='', is_public=true } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });
  const r = await pool.query(`
    INSERT INTO recipes (user_id,title,category,time,kcal,difficulty,emoji,ingredients,steps,image_url,is_public)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *
  `, [req.userId,title,category,time,kcal,difficulty,emoji,
      JSON.stringify(ingredients),JSON.stringify(steps),image_url,is_public]);
  await pool.query('UPDATE users SET recipes_count=recipes_count+1 WHERE id=$1',[req.userId]);
  res.status(201).json(r.rows[0]);
});

// ── UPDATE ────────────────────────────────────────────────────────────────────
router.patch('/:id', requireAuth, async (req, res) => {
  const check = await pool.query('SELECT user_id FROM recipes WHERE id=$1',[req.params.id]);
  if (!check.rows.length) return res.status(404).json({ error: 'Not found' });
  if (check.rows[0].user_id !== req.userId) return res.status(403).json({ error: 'Not yours' });
  const fields=[]; const vals=[]; let i=1;
  const allowed=['title','category','time','kcal','difficulty','emoji','image_url','is_public'];
  for (const k of allowed) {
    if (req.body[k]!==undefined) { fields.push(`${k}=$${i++}`); vals.push(req.body[k]); }
  }
  if (req.body.ingredients) { fields.push(`ingredients=$${i++}`); vals.push(JSON.stringify(req.body.ingredients)); }
  if (req.body.steps)       { fields.push(`steps=$${i++}`);       vals.push(JSON.stringify(req.body.steps)); }
  if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });
  fields.push(`updated_at=NOW()`);
  vals.push(req.params.id);
  const r = await pool.query(`UPDATE recipes SET ${fields.join(',')} WHERE id=$${i} RETURNING *`, vals);
  res.json(r.rows[0]);
});

// ── DELETE ────────────────────────────────────────────────────────────────────
router.delete('/:id', requireAuth, async (req, res) => {
  const r = await pool.query('SELECT user_id FROM recipes WHERE id=$1',[req.params.id]);
  if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
  if (r.rows[0].user_id !== req.userId) return res.status(403).json({ error: 'Not yours' });
  await pool.query('DELETE FROM recipes WHERE id=$1',[req.params.id]);
  await pool.query('UPDATE users SET recipes_count=GREATEST(0,recipes_count-1) WHERE id=$1',[req.userId]);
  res.json({ deleted: true });
});

// ── LIKE / UNLIKE ─────────────────────────────────────────────────────────────
router.post('/:id/like', requireAuth, async (req, res) => {
  const e = await pool.query('SELECT 1 FROM recipe_likes WHERE user_id=$1 AND recipe_id=$2',[req.userId,req.params.id]);
  if (e.rows.length) {
    await pool.query('DELETE FROM recipe_likes WHERE user_id=$1 AND recipe_id=$2',[req.userId,req.params.id]);
    await pool.query('UPDATE recipes SET likes=GREATEST(0,likes-1) WHERE id=$1',[req.params.id]);
    res.json({ liked: false });
  } else {
    await pool.query('INSERT INTO recipe_likes(user_id,recipe_id) VALUES($1,$2)',[req.userId,req.params.id]);
    await pool.query('UPDATE recipes SET likes=likes+1 WHERE id=$1',[req.params.id]);
    res.json({ liked: true });
  }
});

// ── SAVE / UNSAVE ─────────────────────────────────────────────────────────────
router.post('/:id/save', requireAuth, async (req, res) => {
  const e = await pool.query('SELECT 1 FROM recipe_saves WHERE user_id=$1 AND recipe_id=$2',[req.userId,req.params.id]);
  if (e.rows.length) {
    await pool.query('DELETE FROM recipe_saves WHERE user_id=$1 AND recipe_id=$2',[req.userId,req.params.id]);
    res.json({ saved: false });
  } else {
    await pool.query('INSERT INTO recipe_saves(user_id,recipe_id) VALUES($1,$2)',[req.userId,req.params.id]);
    res.json({ saved: true });
  }
});

module.exports = router;
