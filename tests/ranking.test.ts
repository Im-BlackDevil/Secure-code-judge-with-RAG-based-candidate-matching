
import { describe, it, expect } from 'vitest';
import {
  rankCandidates,
  RequirementMatch
} from '../src/services/ranking';

const m = (
  requirement: string,
  similarity: number
): RequirementMatch => ({
  requirement,
  matchedText: requirement,
  matchedType: 'skill',
  similarity
});

describe('rankCandidates', () => {

  it('ranks full coverage above a candidate who only ties on one generic skill', () => {

    const perResume = new Map<number, RequirementMatch[]>([
      [10, [
        m('REST APIs', 0.71),
        m('Docker', 0.35),
        m('TypeScript', 0.6)
      ]],

      [9, [
        m('REST APIs', 0.71),
        m('Docker', 0.8),
        m('TypeScript', 0.78)
      ]]
    ]);

    expect(rankCandidates(perResume, 3)[0].resumeId).toBe(9);
  });


  it('penalises a missing requirement by dividing by the total requirement count', () => {

    const perResume = new Map<number, RequirementMatch[]>([
      [1, [m('A', 0.9)]],

      [2, [
        m('A', 0.6),
        m('B', 0.6)
      ]]
    ]);

    expect(rankCandidates(perResume, 2)[0].resumeId).toBe(2);
  });


  it('is deterministic on exact ties', () => {

    const perResume = new Map<number, RequirementMatch[]>([
      [7, [m('A', 0.5)]],
      [3, [m('A', 0.5)]]
    ]);

    expect(
      rankCandidates(perResume, 1).map(c => c.resumeId)
    ).toEqual([3, 7]);
  });

});
