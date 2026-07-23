import OpenAI from "openai";

export const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini";
export const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";

/** Batches embedding requests (OpenAI allows arrays natively, but we chunk
 *  defensively so one oversized notebook can't blow past request limits). */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const BATCH = 96;
  const vectors: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH);
    const res = await openai.embeddings.create({ model: EMBEDDING_MODEL, input: batch });
    vectors.push(...res.data.map((d) => d.embedding));
  }
  return vectors;
}

export async function embedQuery(text: string): Promise<number[]> {
  const res = await openai.embeddings.create({ model: EMBEDDING_MODEL, input: text });
  return res.data[0].embedding;
}
