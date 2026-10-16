import { Router } from 'express';
import pool from '../db/pool';
import { submissionQueue } from '../queues/submissionQueue';
import { resumeQueue } from '../queues/resumeQueue';

const router = Router();

router.get('/deep', async (req, res) => {
  const checks: Record<string, unknown> = {};
  try { await pool.query('SELECT 1'); checks.db = 'ok'; } catch { checks.db = 'down'; }
  try {
    checks.executionQueue = await submissionQueue.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed');
    checks.resumeQueue = await resumeQueue.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed');
  } catch { checks.redis = 'down'; }

  const healthy = checks.db === 'ok' && !checks.redis;
  res.status(healthy ? 200 : 503).json(checks);
});

export default router;