import ai from './gemini';

export async function generateWithRetry(prompt: string, maxAttempts = 3): Promise<string> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt
      });
      return response.text ?? '';
    } catch (err) {
      console.error(`Gemini attempt ${attempt}/${maxAttempts} failed:`, (err as Error).message);
      if (attempt === maxAttempts) throw err;
      await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
    }
  }
  throw new Error('Unreachable');
}