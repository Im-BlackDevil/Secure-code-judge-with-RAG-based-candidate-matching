import { Queue } from 'bullmq';
import IORedis from 'ioredis';

async function main() {
  const connection = new IORedis({ host: 'localhost', port: 6379, maxRetriesPerRequest: null });
  const queue = new Queue('dedupe-test', { connection }); // scratch queue, no worker listening
  const opts = { jobId: 'submission-999999' };

  const first = await queue.add('run-submission', { attempt: 'first' }, opts);
  const second = await queue.add('run-submission', { attempt: 'second' }, opts);

  const counts = await queue.getJobCounts('waiting', 'delayed', 'active');
  const stored = await queue.getJob('submission-999999');

  console.log({ firstId: first.id, secondId: second.id, counts, payloadKept: stored?.data });

  await queue.obliterate({ force: true }); // remove the scratch queue
  await queue.close();
  await connection.quit();
}

main();