export interface RequirementMatch {
  requirement: string;
  matchedText: string;
  matchedType: string;
  similarity: number;
}

export interface RankedCandidate {
  resumeId: number;
  score: number;
  matches: RequirementMatch[];
}

export function rankCandidates(perResume: Map<number, RequirementMatch[]>, requirementCount: number): RankedCandidate[] {
  if (requirementCount <= 0) return [];
  return [...perResume.entries()]
    .map(([resumeId, matches]) => ({
      resumeId,
      score: matches.reduce((sum, m) => sum + m.similarity, 0) / requirementCount,
      matches
    }))
    .sort((a, b) => b.score - a.score || a.resumeId - b.resumeId); // deterministic on exact ties
}