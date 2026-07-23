import Redis from "ioredis";

const globalForRedis = globalThis as unknown as { redis?: Redis };

export const redis =
  globalForRedis.redis ??
  new Redis(process.env.REDIS_URL as string, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  });

if (process.env.NODE_ENV !== "production") globalForRedis.redis = redis;

/**
 * Redis is used as a fast, ephemeral status/progress layer so the UI can
 * poll indexing state without round-tripping Postgres on every tick.
 * Postgres remains the source of truth; Redis just mirrors the latest
 * status with a short TTL so it self-heals if a write is ever missed.
 */
export type IndexingProgress = {
  status: "UPLOADING" | "QUEUED" | "INDEXING" | "READY" | "FAILED";
  step?: string; // e.g. "Extracting text", "Chunking", "Embedding 12/40"
  percent?: number;
  errorMessage?: string;
  updatedAt: number;
};

const key = (sourceId: string) => `source:${sourceId}:progress`;

export async function setProgress(sourceId: string, progress: IndexingProgress) {
  try {
    await redis.set(key(sourceId), JSON.stringify(progress), "EX", 60 * 30);
  } catch {
    // Redis is a cache, not the source of truth — swallow and rely on Postgres.
  }
}

export async function getProgress(sourceId: string): Promise<IndexingProgress | null> {
  try {
    const raw = await redis.get(key(sourceId));
    return raw ? (JSON.parse(raw) as IndexingProgress) : null;
  } catch {
    return null;
  }
}
