import express, { Request, Response } from 'express';
import pool from '../db/pool';
import requireAuth from '../middleware/auth';
import { embedText, toVectorLiteral } from '../services/embeddings';
import { generateWithRetry } from '../services/llm';

const router = express.Router();

interface RequirementMatch {
  requirement: string;
  matchedText: string;
  matchedType: string;
  similarity: number;
}

router.get('/:jobId', requireAuth, async (req: Request, res: Response) => {
  if (req.user?.role !== 'recruiter') {
    return res.status(403).json({ error: 'Only recruiters can view matches' });
  }

  const jobResult = await pool.query('SELECT * FROM jobs WHERE id=$1', [req.params.jobId]);
  const job = jobResult.rows[0];
  if (!job) return res.status(404).json({ error: 'Job not found' });

  const requirements: string[] =
    job.required_skills && job.required_skills.length > 0
      ? job.required_skills
      : [`${job.title}. ${job.description}`];

  // For each requirement, the single closest entity in every resume
  const perResume = new Map<number, RequirementMatch[]>();

  for (const requirement of requirements) {
    const vector = await embedText(requirement);
    const rows = await pool.query(
      `SELECT DISTINCT ON (resume_id)
              resume_id, text, entity_type, 1 - (embedding <=> $1) AS similarity
       FROM resume_entities
       ORDER BY resume_id, embedding <=> $1`,
      [toVectorLiteral(vector)]
    );
    for (const row of rows.rows) {
      if (!perResume.has(row.resume_id)) perResume.set(row.resume_id, []);
      perResume.get(row.resume_id)!.push({
        requirement,
        matchedText: row.text,
        matchedType: row.entity_type,
        similarity: Number(row.similarity)
      });
    }
  }

  const ranked = [...perResume.entries()]
    .map(([resumeId, matches]) => ({
      resumeId,
      score: matches.reduce((sum, m) => sum + m.similarity, 0) / requirements.length,
      matches
    }))
    .sort((a, b) => b.score - a.score);

  const TOP_N = 5; // only explain the best candidates
  const results = [];

  for (const candidate of ranked.slice(0, TOP_N)) {
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
    } catch {
      explanation = null;
    }

    results.push({
      resumeId: candidate.resumeId,
      score: Number(candidate.score.toFixed(3)),
      explanation,
      explanationAvailable: explanation !== null,
      requirementMatches: candidate.matches
    });
  }

  res.json(results);
});

export default router;