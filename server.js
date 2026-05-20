require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();

app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  methods: ['GET','POST','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
}));
app.use(rateLimit({ windowMs:15*60*1000, max:500 }));
app.use(express.json({ limit:'15mb' }));

app.use('/api/auth',      require('./routes/auth'));
app.use('/api/users',     require('./routes/users'));
app.use('/api/recipes',   require('./routes/recipes'));
app.use('/api/community', require('./routes/community'));
app.use('/api/food',      require('./routes/food'));
app.use('/api/uploads',   require('./routes/uploads'));
app.use('/uploads',       require('./routes/uploads'));

app.get('/health', (_, res) => res.json({
  status:'ok', version:'2.0.0', db:'postgresql', time:new Date().toISOString()
}));

app.use((_, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`\n🍳 CookApp API (PostgreSQL) on port ${PORT}\n   http://localhost:${PORT}/health\n`));
