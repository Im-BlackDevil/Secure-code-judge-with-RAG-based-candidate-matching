const express = require('express');
const fs = require('fs');
const { execSync } = require('child_process');
const pool = require('../db/pool');
const requireAuth = require('../middleware/auth');
const router = express.Router();

router.post('/', requireAuth, async (req, res) => {
  const { problem_id, code } = req.body;
  const testCases = await pool.query('SELECT * FROM test_cases WHERE problem_id=$1', [problem_id]);

  fs.writeFileSync('temp_solution.py', code);

  let status = 'Accepted';
  for (const test of testCases.rows) {
    try {
      const output = execSync('python temp_solution.py', { input: test.input, timeout: 5000 }).toString().trim();
      if (output !== test.expected_output.trim()) {
        status = 'Wrong Answer';
        break;
      }
    } catch (err) {
      status = 'Runtime Error';
      break;
    }
  }

  fs.unlinkSync('temp_solution.py');

  const result = await pool.query(
    'INSERT INTO submissions (student_id, problem_id, code, status) VALUES ($1,$2,$3,$4) RETURNING *',
    [req.user.id, problem_id, code, status]
  );
  res.status(201).json(result.rows[0]);
});

module.exports = router;