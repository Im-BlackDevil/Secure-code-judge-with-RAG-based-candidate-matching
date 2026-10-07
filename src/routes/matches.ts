import express, { Request, Response } from 'express';
import pool from '../db/pool';
import requireAuth from '../middleware/auth';
import { embedText, toVectorLiteral } from '../services/embeddings';
import ai from '../services/gemini';

const router = express.Router();

router.get('/:jobId', requireAuth, async (req: Request, res: Response) => {
  if (req.user?.role !== 'recruiter') return res.status(403).json({ error: 'Only recruiters can view matches' });

  const jobResult = await pool.query('SELECT * FROM jobs WHERE id=$1', [req.params.jobId]);
  const job = jobResult.rows[0];
  if (!job) return res.status(404).json({ error: 'Job not found' });

  const jobText = `${job.title}. ${job.description}. Required skills: ${(job.required_skills || []).join(', ')}`;
  const jobVector = await embedText(jobText);

  const topMatches = await pool.query(
    `SELECT resume_id, text, entity_type, 1 - (embedding <=> $1) AS similarity
     FROM resume_entities
     ORDER BY embedding <=> $1
     LIMIT 10`,
    [toVectorLiteral(jobVector)]
  );

  const byResume = new Map<number, { text: string; type: string; similarity: number }[]>();
  for (const row of topMatches.rows) {
    if (!byResume.has(row.resume_id)) byResume.set(row.resume_id, []);
    byResume.get(row.resume_id)!.push({ text: row.text, type: row.entity_type, similarity: row.similarity });
  }

  const results = [];
  for (const [resumeId, matchedEntities] of byResume) {
    const context = matchedEntities.map(e => `- (${e.type}) ${e.text}`).join('\n');
    const prompt = `A recruiter is hiring for: "${job.title} — ${job.description}".
A candidate's resume has these matching highlights:
${context}

In 1-2 sentences, explain why this candidate is a good match, citing specific overlaps. Be concise and factual.`;

    const explanation = await ai.models.generateContent({ model: 'gemini-3.8-flash', contents: prompt });
    results.push({ resumeId, explanation: explanation.text, topMatches: matchedEntities });
  }

  res.json(results);
});

export default router;