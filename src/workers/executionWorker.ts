import { Worker, Job } from 'bullmq';
import connection from '../queues/connection';
import pool from '../db/pool';
import { runInSandbox, cleanupOrphans } from './dockerSandbox';
import { logger } from '../logger';
import { TestCase } from '../types';

interface SubmissionJobData {
  submissionId: number;
  problemId: number;
  code: string;
}

const worker = new Worker<SubmissionJobData>('code-execution', async (job: Job<SubmissionJobData>) => {
  const started = Date.now();
  const { submissionId, problemId, code } = job.data;

  const testCases = await pool.query<TestCase>('SELECT * FROM test_cases WHERE problem_id=$1 ORDER BY id', [problemId]);
  if (testCases.rows.length === 0) {
    await pool.query("UPDATE submissions SET status='System Error' WHERE id=$1", [submissionId]); // never "Accepted" on zero tests
    logger.error({ event: 'no_test_cases', submissionId, problemId });
    return;
  }

  let status = 'Accepted';
  let totalMs = 0;

  for (const test of testCases.rows) {
    const result = await runInSandbox(code, test.input);
    totalMs += result.durationMs;

    if (result.verdict === 'timeout') { status = 'Time Limit Exceeded'; break; }
    if (result.verdict === 'memory_limit') { status = 'Memory Limit Exceeded'; break; }
    if (result.verdict === 'runtime_error') { status = 'Runtime Error'; break; }
    if (result.output !== test.expected_output.replace(/\r\n/g, '\n').trim()) { status = 'Wrong Answer'; break; }
  }

  await pool.query('UPDATE submissions SET status=$1, execution_ms=$2 WHERE id=$3', [status, totalMs, submissionId]);
  logger.info({
    event: 'submission_judged', submissionId, status, totalMs,
    queueWaitMs: started - job.timestamp, attempt: job.attemptsMade + 1
  });
}, {
  connection,
  concurrency: Number(process.env.WORKER_CONCURRENCY ?? 2),
  maxStalledCount: 2
});

worker.on('error', err => logger.error({ err }, 'worker error'));
worker.on('failed', async (job, err) => {
  if (!job) return;
  const final = job.attemptsMade >= (job.opts.attempts ?? 1) || /stalled/i.test(err.message);
  logger.error({ event: 'submission_job_failed', submissionId: job.data.submissionId, attempt: job.attemptsMade, final, err: err.message });
  if (final) await pool.query("UPDATE submissions SET status='System Error' WHERE id=$1", [job.data.submissionId]);
});

cleanupOrphans().then(n => logger.info({ event: 'orphans_reaped', count: n }));

async function shutdown(signal: string) {
  logger.info({ event: 'shutdown', signal });
  await worker.close();   // waits for in-flight jobs to finish
  await pool.end();
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

logger.info({ event: 'execution_worker_started', concurrency: worker.opts.concurrency });