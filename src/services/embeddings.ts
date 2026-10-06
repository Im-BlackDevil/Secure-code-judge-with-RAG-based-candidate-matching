import ai from './gemini';

export async function embedText(text: string): Promise<number[]> {
  const response = await ai.models.embedContent({
    model: 'gemini-embedding-2',
    contents: text,
    config: { outputDimensionality: 768 }
  });
  return response.embeddings![0].values!;
}

export function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(',')}]`;
}