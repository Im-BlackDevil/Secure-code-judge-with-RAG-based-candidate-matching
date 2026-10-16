import express, { Request, Response } from 'express';
import { z } from 'zod';
import pool from '../db/pool';
import requireAuth from '../middleware/auth';
import { submissionLimiter } from '../middleware/rateLimit';
import { submissionQueue } from '../queues/submissionQueue';
import { logger } from '../logger';
import { Submission } from '../types';

const router = express.Router();

const submitSchema = z.object({
  problem_id: z.number().int().positive(),
  code: z.string().min(1).max(10_000)
});

router.post('/', requireAuth, submissionLimiter, async (req: Request, res: Response) => {
  if (req.user!.role !== 'student') return res.status(403).json({ error: 'Only students can submit code' });

  const parsed = submitSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });
  const { problem_id, code } = parsed.data;

  const problem = await pool.query('SELECT 1 FROM problems WHERE id=$1', [problem_id]);
  if (problem.rowCount === 0) return res.status(404).json({ error: 'Problem not found' });

  const result = await pool.query<Submission>(
    'INSERT INTO submissions (student_id, problem_id, code, status) VALUES ($1,$2,$3,$4) RETURNING *',
    [req.user!.id, problem_id, code, 'pending']
  );
  const submission = result.rows[0];

  try {
    await submissionQueue.add(
      'run-submission',
      { submissionId: submission.id, problemId: problem_id, code },
      {
        jobId: `submission-${submission.id}`,          // idempotency: the same id can't be enqueued twice
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 }
      }
    );
  } catch (err) {
    // The row exists but the job doesn't (Redis down). Don't leave it 'pending' forever.
    logger.error({ err, submissionId: submission.id }, 'failed to enqueue submission');
    await pool.query("UPDATE submissions SET status='System Error' WHERE id=$1", [submission.id]);
    return res.status(503).json({ error: 'Queue unavailable, please retry' });
  }

  res.status(202).json(submission);
});

router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });

  const result = await pool.query<Submission>('SELECT * FROM submissions WHERE id=$1', [id]);
  const submission = result.rows[0];
  // 404 (not 403) for other people's rows, so ids can't be probed
  if (!submission || (req.user!.role !== 'recruiter' && submission.student_id !== req.user!.id)) {
    return res.status(404).json({ error: 'Submission not found' });
  }
  res.json(submission);
});

export default router;