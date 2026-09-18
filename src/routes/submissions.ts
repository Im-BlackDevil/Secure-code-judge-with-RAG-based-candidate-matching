import express, { Request, Response } from 'express';
import pool from '../db/pool';
import requireAuth from '../middleware/auth';
import { submissionQueue } from '../queues/submissionQueue';
import { Submission } from '../types';

const router = express.Router();

router.post('/', requireAuth, async (req: Request, res: Response) => {
  const { problem_id, code } = req.body;

  const result = await pool.query<Submission>(
    'INSERT INTO submissions (student_id, problem_id, code, status) VALUES ($1,$2,$3,$4) RETURNING *',
    [req.user!.id, problem_id, code, 'pending']
  );
  const submission = result.rows[0];

  await submissionQueue.add('run-submission', {
    submissionId: submission.id,
    problemId: problem_id,
    code
  });

  res.status(202).json(submission);
});

router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  const result = await pool.query<Submission>('SELECT * FROM submissions WHERE id=$1', [req.params.id]);
  if (!result.rows[0]) return res.status(404).json({ error: 'Submission not found' });
  res.json(result.rows[0]);
});

export default router;