import ai from './gemini';
import { ParsedResume } from '../types';

export async function extractResumeData(rawText: string): Promise<ParsedResume> {
  const prompt = `Extract structured data from this resume text. Return ONLY valid JSON, no markdown formatting, no explanation, matching this exact shape:
{"skills": ["string"], "projects": ["string"], "experience": ["string"]}

Each project and experience entry should be a short one or two sentence summary. Resume text:
${rawText}`;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt
      });
      const cleaned = (response.text ?? '').replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleaned);

      if (!Array.isArray(parsed.skills) || !Array.isArray(parsed.projects) || !Array.isArray(parsed.experience)) {
        throw new Error('Malformed shape');
      }
      return parsed as ParsedResume;
    } catch (err) {
      if (attempt === 1) throw new Error('Failed to extract structured resume data after retry');
    }
  }
  throw new Error('Unreachable');
}