import { Worker, Job } from 'bullmq';
import connection from '../queues/connection';
import pool from '../db/pool';
import { extractResumeData } from '../services/resumeExtraction';
import { embedText, toVectorLiteral } from '../services/embeddings';

interface ResumeJobData { resumeId: number; }

const worker = new Worker<ResumeJobData>('resume-processing', async (job: Job<ResumeJobData>) => {
  const { resumeId } = job.data;
  const resumeResult = await pool.query('SELECT raw_text FROM resume_profiles WHERE id=$1', [resumeId]);
  const rawText: string = resumeResult.rows[0].raw_text;

  const parsed = await extractResumeData(rawText);
  await pool.query('UPDATE resume_profiles SET parsed=$1, status=$2 WHERE id=$3', [JSON.stringify(parsed), 'ready', resumeId]);

  const entities = [
    ...parsed.skills.map(text => ({ type: 'skill', text })),
    ...parsed.projects.map(text => ({ type: 'project', text })),
    ...parsed.experience.map(text => ({ type: 'experience', text }))
  ];

  for (const entity of entities) {
    const vector = await embedText(entity.text);
    await pool.query(
      'INSERT INTO resume_entities (resume_id, entity_type, text, embedding) VALUES ($1,$2,$3,$4)',
      [resumeId, entity.type, entity.text, toVectorLiteral(vector)]
    );
  }
}, { connection });

worker.on('completed', (job) => console.log(`Resume ${job.data.resumeId} processed`));
worker.on('failed', async (job, err) => {
  console.error(`Resume ${job?.data.resumeId} failed (attempt ${job?.attemptsMade}):`, err.message);
  if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
    await pool.query('UPDATE resume_profiles SET status=$1 WHERE id=$2', ['failed', job.data.resumeId]);
  }
});

console.log('Resume worker is listening for jobs...');