require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('PostgreSQL pool error:', err.message);
});

// Test connection on startup
pool.query('SELECT NOW()').then(() => {
  console.log('✅ PostgreSQL connected');
}).catch(err => {
  console.error('❌ PostgreSQL connection failed:', err.message);
  console.error('   Check DATABASE_URL in your .env file');
});

module.exports = pool;
