require('dotenv').config();
const pool = require('./pool');

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

      -- ── USERS ──────────────────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS users (
        id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        email           TEXT UNIQUE,
        phone           TEXT UNIQUE,
        name            TEXT NOT NULL DEFAULT 'Chef',
        username        TEXT UNIQUE,
        avatar          TEXT NOT NULL DEFAULT '👨‍🍳',
        avatar_url      TEXT,
        bio             TEXT DEFAULT '',
        location        TEXT DEFAULT '',
        website         TEXT DEFAULT '',
        password        TEXT,
        provider        TEXT NOT NULL DEFAULT 'email',
        provider_id     TEXT,
        push_token      TEXT,
        cook_time       INTEGER DEFAULT 0,
        recipes_count   INTEGER DEFAULT 0,
        kudos           INTEGER DEFAULT 0,
        followers_count INTEGER DEFAULT 0,
        following_count INTEGER DEFAULT 0,
        is_verified     BOOLEAN DEFAULT FALSE,
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
      );

      -- ── RECIPES ─────────────────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS recipes (
        id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title       TEXT NOT NULL,
        category    TEXT DEFAULT 'Dinner',
        time        TEXT DEFAULT '30',
        kcal        TEXT DEFAULT '400',
        difficulty  TEXT DEFAULT 'Easy',
        emoji       TEXT DEFAULT '🍽',
        ingredients JSONB DEFAULT '[]',
        steps       JSONB DEFAULT '[]',
        image_url   TEXT DEFAULT '',
        likes       INTEGER DEFAULT 0,
        saves       INTEGER DEFAULT 0,
        is_public   BOOLEAN DEFAULT TRUE,
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        updated_at  TIMESTAMPTZ DEFAULT NOW()
      );

      -- ── RECIPE LIKES ────────────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS recipe_likes (
        user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
        recipe_id  UUID REFERENCES recipes(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (user_id, recipe_id)
      );

      -- ── RECIPE SAVES ────────────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS recipe_saves (
        user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
        recipe_id  UUID REFERENCES recipes(id) ON DELETE CASCADE,
        PRIMARY KEY (user_id, recipe_id)
      );

      -- ── POSTS ───────────────────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS posts (
        id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        recipe_name TEXT DEFAULT '',
        recipe_id   UUID REFERENCES recipes(id) ON DELETE SET NULL,
        text        TEXT DEFAULT '',
        emoji       TEXT DEFAULT '🍽',
        color       TEXT DEFAULT '#FF5722',
        cook_time   INTEGER DEFAULT 0,
        kcal        INTEGER DEFAULT 0,
        image_url   TEXT DEFAULT '',
        likes       INTEGER DEFAULT 0,
        comments    INTEGER DEFAULT 0,
        created_at  TIMESTAMPTZ DEFAULT NOW()
      );

      -- ── POST LIKES ──────────────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS post_likes (
        user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
        post_id    UUID REFERENCES posts(id) ON DELETE CASCADE,
        PRIMARY KEY (user_id, post_id)
      );

      -- ── COMMENTS ────────────────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS comments (
        id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        post_id    UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
        user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        text       TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- ── FOLLOWS ─────────────────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS follows (
        follower_id  UUID REFERENCES users(id) ON DELETE CASCADE,
        following_id UUID REFERENCES users(id) ON DELETE CASCADE,
        created_at   TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (follower_id, following_id)
      );

      -- ── FOOD LOGS ───────────────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS food_logs (
        id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        food_name  TEXT NOT NULL,
        food_emoji TEXT DEFAULT '🍽',
        grams      INTEGER DEFAULT 0,
        kcal       INTEGER DEFAULT 0,
        protein    NUMERIC DEFAULT 0,
        carbs      NUMERIC DEFAULT 0,
        fat        NUMERIC DEFAULT 0,
        meal_type  TEXT DEFAULT 'snack',
        logged_at  TIMESTAMPTZ DEFAULT NOW()
      );

      -- ── COOK SESSIONS ───────────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS cook_sessions (
        id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        recipe_id  UUID REFERENCES recipes(id) ON DELETE SET NULL,
        duration   INTEGER DEFAULT 0,
        completed  BOOLEAN DEFAULT FALSE,
        cooked_at  TIMESTAMPTZ DEFAULT NOW()
      );

      -- ── INDICES ─────────────────────────────────────────────────────────────
      CREATE INDEX IF NOT EXISTS idx_recipes_user    ON recipes(user_id);
      CREATE INDEX IF NOT EXISTS idx_recipes_public  ON recipes(is_public) WHERE is_public = TRUE;
      CREATE INDEX IF NOT EXISTS idx_posts_user      ON posts(user_id);
      CREATE INDEX IF NOT EXISTS idx_posts_created   ON posts(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_food_logs_user  ON food_logs(user_id);
      CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id);
      CREATE INDEX IF NOT EXISTS idx_users_email     ON users(email);
    `);

    await client.query('COMMIT');
    console.log('✅ All tables created successfully');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(() => process.exit(1));
