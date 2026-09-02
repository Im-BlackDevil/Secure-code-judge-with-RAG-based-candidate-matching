const express = require('express');
const pool = require('../db/pool');
const requireAuth = require('../middleware/auth');
const router = express.Router();

router.post('/', requireAuth, async (req, res) => {
  if (req.user.role !== 'recruiter') return res.status(403).json({ error: 'Only recruiters can post jobs' });
  const { title, description, required_skills } = req.body;
  const result = await pool.query(
    'INSERT INTO jobs (recruiter_id, title, description, required_skills) VALUES ($1,$2,$3,$4) RETURNING *',
    [req.user.id, title, description, required_skills]
  );
  res.status(201).json(result.rows[0]);
});

router.get('/', async (req, res) => {
  const result = await pool.query('SELECT * FROM jobs ORDER BY created_at DESC');
  res.json(result.rows);
});

module.exports = router;