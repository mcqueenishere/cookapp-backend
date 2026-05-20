const express = require('express');
const fs      = require('fs');
const path    = require('path');
const { v4: uuid } = require('uuid');
const { requireAuth } = require('../middleware/auth');
const router  = express.Router();

const UPLOAD_DIR = path.join(__dirname, '../uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

router.post('/', requireAuth, (req, res) => {
  const { image, contentType='image/jpeg' } = req.body;
  if (!image) return res.status(400).json({ error: 'No image' });
  const ext = contentType.includes('png') ? 'png' : 'jpg';
  const filename = `${uuid()}.${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), Buffer.from(image,'base64'));
  const base = process.env.BASE_URL || `http://localhost:${process.env.PORT||3000}`;
  res.json({ url: `${base}/uploads/${filename}` });
});

router.get('/:filename', (req, res) => {
  const p = path.join(UPLOAD_DIR, req.params.filename);
  if (!fs.existsSync(p)) return res.status(404).end();
  res.sendFile(p);
});

module.exports = router;
