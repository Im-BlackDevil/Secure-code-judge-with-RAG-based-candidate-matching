import { Worker, Job } from 'bullmq';
import connection from '../queues/connection';
import pool from '../db/pool';
import { runInSandbox } from './dockerSandbox';
import { TestCase } from '../types';

interface SubmissionJobData {
  submissionId: number;
  problemId: number;
  code: string;
}

const worker = new Worker<SubmissionJobData>('code-execution', async (job: Job<SubmissionJobData>) => {
  const { submissionId, problemId, code } = job.data;
  const testCases = await pool.query<TestCase>('SELECT * FROM test_cases WHERE problem_id=$1', [problemId]);

  let status = 'Accepted';

  for (const test of testCases.rows) {
    const result = await runInSandbox(code, test.input);

    if (result.timedOut) { status = 'Time Limit Exceeded'; break; }
    if (result.errored) { status = 'Runtime Error'; break; }
    if (result.output !== test.expected_output.trim()) { status = 'Wrong Answer'; break; }
  }

  await pool.query('UPDATE submissions SET status=$1 WHERE id=$2', [status, submissionId]);
}, { connection });

worker.on('completed', (job) => console.log(`Job ${job.id} finished`));
worker.on('failed', (job, err) => console.error(`Job ${job?.id} failed:`, err));

console.log('Execution worker is listening for jobs...');