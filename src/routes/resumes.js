const express = require('express');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const pool = require('../db/pool');
const requireAuth = require('../middleware/auth');
const router = express.Router();

const upload = multer({ storage: multer.memoryStorage() });

router.post('/', requireAuth, upload.single('resume'), async (req, res) => {

  if (!req.file) {
  return res.status(400).json({ error: 'No resume file uploaded' });
}

  const data = await pdfParse(req.file.buffer);
  const result = await pool.query(
    'INSERT INTO resume_profiles (student_id, raw_text) VALUES ($1,$2) RETURNING id, student_id, created_at',
    [req.user.id, data.text]
  );
  res.status(201).json(result.rows[0]);
});

module.exports = router;