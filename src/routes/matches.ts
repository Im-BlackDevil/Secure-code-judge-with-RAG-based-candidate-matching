import express, { Request, Response } from 'express';
import pool from '../db/pool';
import requireAuth from '../middleware/auth';
import { rankResumesForJob, requirementsForJob } from '../services/matching';
import { RankedCandidate } from '../services/ranking';
import { generateWithRetry } from '../services/llm';
import { logger } from '../logger';

const router = express.Router();
const TOP_N = 5;
const EXPLAIN_CONCURRENCY = Number(process.env.EXPLAIN_CONCURRENCY ?? 2);

router.get('/:jobId', requireAuth, async (req: Request, res: Response) => {
  if (req.user!.role !== 'recruiter') return res.status(403).json({ error: 'Only recruiters can view matches' });

  const jobId = Number(req.params.jobId);
  if (!Number.isInteger(jobId)) return res.status(400).json({ error: 'Invalid job id' });

  const jobResult = await pool.query('SELECT * FROM jobs WHERE id=$1', [jobId]);
  const job = jobResult.rows[0];
  if (!job || job.recruiter_id !== req.user!.id) return res.status(404).json({ error: 'Job not found' });

  const t0 = Date.now();
  const ranked = await rankResumesForJob(job);
  const retrievalMs = Date.now() - t0;
  const requirements = requirementsForJob(job);

  const explain = async (candidate: RankedCandidate) => {
    const evidence = candidate.matches
      .map(m => `- Requirement "${m.requirement}": closest evidence is (${m.matchedType}) ${m.matchedText}`)
      .join('\n');

    const prompt = `A recruiter is hiring for: "${job.title} — ${job.description}".
Required skills: ${requirements.join(', ')}.

For each requirement, here is the closest evidence found in one candidate's resume:
${evidence}

In 2 sentences, assess how well this candidate fits, citing specific evidence. If any requirement has only weak or unrelated evidence, say so plainly instead of overstating the fit.`;

    let explanation: string | null = null;
    try {
      explanation = await generateWithRetry(prompt);
    } catch (err) {
      logger.warn({ resumeId: candidate.resumeId, err: (err as Error).message }, 'explanation failed');
    }

    return {
      resumeId: candidate.resumeId,
      score: Number(candidate.score.toFixed(3)),
      explanation,
      explanationAvailable: explanation !== null,
      requirementMatches: candidate.matches
    };
  };

  // Run explanations in small batches so we stay under the free-tier rate limit
  const top = ranked.slice(0, TOP_N);
  const results = [];
  for (let i = 0; i < top.length; i += EXPLAIN_CONCURRENCY) {
    const batch = top.slice(i, i + EXPLAIN_CONCURRENCY);
    results.push(...(await Promise.all(batch.map(explain))));
  }

  logger.info({ event: 'matches_served', jobId, candidates: ranked.length, retrievalMs, totalMs: Date.now() - t0 });
  res.json(results);
});

export default router;