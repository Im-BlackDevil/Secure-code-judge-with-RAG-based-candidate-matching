import ai from './gemini';
import { logger } from '../logger';

export async function generateWithRetry(prompt: string, maxAttempts = 3): Promise<string> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: prompt
      });
      return response.text ?? '';
    } catch (err) {
      logger.warn({ attempt, maxAttempts, err: (err as Error).message }, 'gemini call failed');
      if (attempt === maxAttempts) throw err;
      await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
    }
  }
  throw new Error('Unreachable');
}