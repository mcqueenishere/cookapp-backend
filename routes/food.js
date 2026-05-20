const express = require('express');
const pool    = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const router  = express.Router();

router.post('/log', requireAuth, async (req, res) => {
  const { food_name, food_emoji='🍽', grams, kcal=0, protein=0, carbs=0, fat=0, meal_type='snack' } = req.body;
  if (!food_name || !grams) return res.status(400).json({ error: 'food_name and grams required' });
  const r = await pool.query(
    `INSERT INTO food_logs(user_id,food_name,food_emoji,grams,kcal,protein,carbs,fat,meal_type)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [req.userId,food_name,food_emoji,grams,kcal,protein,carbs,fat,meal_type]
  );
  res.status(201).json(r.rows[0]);
});

router.get('/logs', requireAuth, async (req, res) => {
  const { date, limit=50 } = req.query;
  let sql = 'SELECT * FROM food_logs WHERE user_id=$1';
  const params = [req.userId];
  if (date) { sql += ' AND DATE(logged_at)=$2'; params.push(date); }
  sql += ` ORDER BY logged_at DESC LIMIT $${params.length+1}`;
  params.push(Number(limit));
  const r = await pool.query(sql, params);
  res.json(r.rows);
});

router.delete('/logs/:id', requireAuth, async (req, res) => {
  const r = await pool.query('SELECT user_id FROM food_logs WHERE id=$1',[req.params.id]);
  if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
  if (r.rows[0].user_id !== req.userId) return res.status(403).json({ error: 'Not yours' });
  await pool.query('DELETE FROM food_logs WHERE id=$1',[req.params.id]);
  res.json({ deleted: true });
});

router.post('/cook-session', requireAuth, async (req, res) => {
  const { recipe_id, duration=0, completed=false } = req.body;
  await pool.query(
    'INSERT INTO cook_sessions(user_id,recipe_id,duration,completed) VALUES($1,$2,$3,$4)',
    [req.userId, recipe_id||null, duration, completed]
  );
  if (completed && duration > 0) {
    await pool.query('UPDATE users SET cook_time=cook_time+$1 WHERE id=$2',[Math.round(duration/60), req.userId]);
  }
  res.status(201).json({ logged: true });
});

router.get('/stats', requireAuth, async (req, res) => {
  const user = await pool.query(
    'SELECT cook_time,recipes_count,kudos,followers_count FROM users WHERE id=$1',[req.userId]
  );
  const today = await pool.query(
    `SELECT COUNT(*) AS count, SUM(grams) AS total_grams, SUM(kcal) AS total_kcal
     FROM food_logs WHERE user_id=$1 AND DATE(logged_at)=CURRENT_DATE`, [req.userId]
  );
  const week = await pool.query(
    `SELECT COUNT(*) AS count FROM cook_sessions
     WHERE user_id=$1 AND completed=TRUE AND cooked_at >= NOW()-INTERVAL '7 days'`, [req.userId]
  );
  res.json({ ...user.rows[0], today: today.rows[0], this_week: week.rows[0] });
});

module.exports = router;
