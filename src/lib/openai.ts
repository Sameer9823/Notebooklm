import OpenAI from "openai";

export const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini";
export const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
export const TTS_MODEL = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";

/** Generic retry-with-backoff wrapper for transient OpenAI/network errors
 *  (rate limits, timeouts, DNS blips) so one flaky call doesn't fail an
 *  entire ingest or generation job. Does not retry on 4xx client errors
 *  other than 429, since those won't succeed on retry. */
export async function withRetry<T>(
  fn: () => Promise<T>,
  { attempts = 3, baseDelayMs = 500 }: { attempts?: number; baseDelayMs?: number } = {}
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const status = (err as { status?: number })?.status;
      const retriable = status === 429 || status === undefined || status >= 500;
      if (!retriable || i === attempts - 1) throw err;
      const delay = baseDelayMs * 2 ** i + Math.random() * 100;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

/** Batches embedding requests (OpenAI allows arrays natively, but we chunk
 *  defensively so one oversized notebook can't blow past request limits).
 *  Each batch call is retried with backoff so a single transient network
 *  blip doesn't fail the whole source's ingest. */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const BATCH = 96;
  const vectors: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH);
    const res = await withRetry(() => openai.embeddings.create({ model: EMBEDDING_MODEL, input: batch }));
    vectors.push(...res.data.map((d) => d.embedding));
  }
  return vectors;
}

export async function embedQuery(text: string): Promise<number[]> {
  const res = await withRetry(() => openai.embeddings.create({ model: EMBEDDING_MODEL, input: text }));
  return res.data[0].embedding;
}

export type AudioScriptLine = { speaker: "A" | "B"; text: string };

const SCRIPT_SYSTEM_PROMPT = `You write scripts for a two-host podcast that gives a spoken-word overview of a set of research/document sources. Host A drives the conversation and introduces topics; Host B reacts, asks clarifying questions, and adds color. The tone is engaging and conversational, like a good explainer podcast — never a dry summary read aloud.

Rules:
- Base everything ONLY on the provided source material. Do not invent facts.
- 10-18 exchanges total (a short-form overview, roughly 3-5 minutes spoken).
- Each line should be natural spoken language: short sentences, no bullet points, no markdown.
- Alternate speakers naturally; a host can occasionally speak two lines in a row when reacting.
- Open with a brief, punchy intro from Host A naming what this notebook covers. Close with a short wrap-up.
- Respond with ONLY a JSON object: { "lines": [{ "speaker": "A" | "B", "text": "..." }, ...] }. No prose, no markdown fences.`;

/** Generates a two-host dialogue script summarizing the notebook's sources. */
export async function generateAudioScript(sourcesContext: string): Promise<AudioScriptLine[]> {
  const res = await withRetry(() =>
    openai.chat.completions.create({
      model: CHAT_MODEL,
      temperature: 0.6,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SCRIPT_SYSTEM_PROMPT },
        { role: "user", content: `Source material for this notebook:\n\n${sourcesContext}` },
      ],
    })
  );

  const raw = res.choices[0]?.message?.content ?? "{}";
  let parsed: { lines?: AudioScriptLine[] };
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Model returned invalid JSON for the audio script");
  }

  const lines = (parsed.lines ?? []).filter(
    (l): l is AudioScriptLine => (l.speaker === "A" || l.speaker === "B") && typeof l.text === "string" && l.text.trim().length > 0
  );
  if (!lines.length) throw new Error("No usable dialogue lines were generated");
  return lines;
}

/** Synthesizes a script into a single MP3 buffer using two distinct voices,
 *  one per speaker, concatenating each line's audio in order. MP3 frames
 *  concatenate cleanly enough for this use case without needing an audio
 *  processing library. */
export async function synthesizeAudioScript(
  lines: AudioScriptLine[],
  voices: { A: string; B: string }
): Promise<Buffer> {
  const buffers: Buffer[] = [];
  for (const line of lines) {
    const voice = line.speaker === "A" ? voices.A : voices.B;
    const res = await withRetry(() =>
      openai.audio.speech.create({
        model: TTS_MODEL,
        voice: voice as "alloy",
        input: line.text,
        response_format: "mp3",
      })
    );
    const arrayBuffer = await res.arrayBuffer();
    buffers.push(Buffer.from(arrayBuffer));
  }
  return Buffer.concat(buffers);
}