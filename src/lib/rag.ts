import { embedQuery, openai, CHAT_MODEL } from "@/lib/openai";
import { searchNotebook, type ChunkPayload } from "@/lib/qdrant";

export type RetrievedChunk = ChunkPayload & { score: number };

const SIMILARITY_FLOOR = 0.15; // below this, a chunk is noise, not context

export async function retrieve(notebookId: string, question: string, k = 8): Promise<RetrievedChunk[]> {
  const vector = await embedQuery(question);
  const hits = await searchNotebook(notebookId, vector, k);
  return hits
    .filter((h) => h.score >= SIMILARITY_FLOOR)
    .map((h) => ({ ...h.payload, score: h.score }));
}

function buildContext(chunks: RetrievedChunk[]) {
  return chunks
    .map((c, i) => `[${i + 1}] Source: "${c.sourceTitle}"\n${c.content}`)
    .join("\n\n---\n\n");
}

const SYSTEM_PROMPT = `You are the answer engine inside a research notebook app. You must answer ONLY using the numbered context passages provided for this turn — never your own outside knowledge.

Rules:
- Every factual sentence must end with one or more bracket citations referencing the passage number(s) it came from, e.g. [1] or [1][3].
- If the passages don't contain enough information to answer, say so plainly and do not guess.
- Be concise and well-formatted: use short paragraphs, bullet lists for multi-part answers, and bold sparingly for key terms.
- Never fabricate a citation number that wasn't provided.`;

export async function streamAnswer(
  notebookId: string,
  question: string,
  history: { role: "user" | "assistant"; content: string }[]
) {
  const chunks = await retrieve(notebookId, question);

  if (!chunks.length) {
    return {
      chunks,
      stream: null as null,
      noContext: true as const,
    };
  }

  const context = buildContext(chunks);
  const messages = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    ...history.slice(-6),
    {
      role: "user" as const,
      content: `Context passages:\n\n${context}\n\n---\n\nQuestion: ${question}`,
    },
  ];

  const stream = await openai.chat.completions.create({
    model: CHAT_MODEL,
    messages,
    stream: true,
    temperature: 0.2,
  });

  return { chunks, stream, noContext: false as const };
}

/** Maps [1][2] style citation markers found in the answer text back to the
 *  chunks that were actually retrieved, deduped and in first-seen order. */
export function extractCitations(answerText: string, chunks: RetrievedChunk[]) {
  const used = new Set<number>();
  const regex = /\[(\d+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(answerText))) {
    const idx = parseInt(m[1], 10) - 1;
    if (idx >= 0 && idx < chunks.length) used.add(idx);
  }
  return [...used].map((i) => {
    const c = chunks[i];
    return {
      marker: i + 1,
      chunkId: c.chunkId,
      sourceId: c.sourceId,
      sourceTitle: c.sourceTitle,
      sourceType: c.sourceType,
      page: c.page,
      startSec: c.startSec,
      endSec: c.endSec,
      snippet: c.content.slice(0, 220),
    };
  });
}
