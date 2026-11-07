import pool from '../db/pool';
import { embedText, toVectorLiteral } from './embeddings';
import { RankedCandidate, RequirementMatch, rankCandidates } from './ranking';

export interface JobRow {
  title: string;
  description: string;
  required_skills: string[] | null;
}

export function requirementsForJob(job: JobRow): string[] {
  return job.required_skills && job.required_skills.length > 0
    ? job.required_skills
    : [`${job.title}. ${job.description}`];
}

export async function rankResumesForJob(job: JobRow): Promise<RankedCandidate[]> {
  const requirements = requirementsForJob(job);
  const vectors = await Promise.all(requirements.map(r => embedText(r)));
  const perResume = new Map<number, RequirementMatch[]>();

  for (let i = 0; i < requirements.length; i++) {
    const rows = await pool.query(
      `SELECT DISTINCT ON (resume_id)
              resume_id, text, entity_type, 1 - (embedding <=> $1) AS similarity
       FROM resume_entities
       ORDER BY resume_id, embedding <=> $1`,
      [toVectorLiteral(vectors[i])]
    );
    for (const row of rows.rows) {
      if (!perResume.has(row.resume_id)) perResume.set(row.resume_id, []);
      perResume.get(row.resume_id)!.push({
        requirement: requirements[i],
        matchedText: row.text,
        matchedType: row.entity_type,
        similarity: Number(row.similarity)
      });
    }
  }
  return rankCandidates(perResume, requirements.length);
}