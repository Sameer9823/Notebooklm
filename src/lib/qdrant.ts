import { QdrantClient } from "@qdrant/js-client-rest";

export const COLLECTION = process.env.QDRANT_COLLECTION || "notebook_chunks";
const EMBEDDING_DIM = 1536; // text-embedding-3-small

const globalForQdrant = globalThis as unknown as { qdrant?: QdrantClient };

export const qdrant =
  globalForQdrant.qdrant ??
  new QdrantClient({
    url: process.env.QDRANT_URL as string,
    apiKey: process.env.QDRANT_API_KEY,
  });

if (process.env.NODE_ENV !== "production") globalForQdrant.qdrant = qdrant;

let ensured = false;

/** Idempotently ensures the shared collection exists, with payload indexes
 *  for the fields we filter on (notebook isolation + source scoping). */
export async function ensureCollection() {
  if (ensured) return;
  const collections = await qdrant.getCollections();
  const exists = collections.collections.some((c) => c.name === COLLECTION);

  if (!exists) {
    await qdrant.createCollection(COLLECTION, {
      vectors: { size: EMBEDDING_DIM, distance: "Cosine" },
      optimizers_config: { default_segment_number: 2 },
    });
    await qdrant.createPayloadIndex(COLLECTION, { field_name: "notebookId", field_schema: "keyword" });
    await qdrant.createPayloadIndex(COLLECTION, { field_name: "sourceId", field_schema: "keyword" });
  }
  ensured = true;
}

export type ChunkPayload = {
  notebookId: string;
  sourceId: string;
  sourceTitle: string;
  sourceType: string;
  chunkId: string;
  index: number;
  content: string;
  page?: number;
  startSec?: number;
  endSec?: number;
  startChar?: number;
  endChar?: number;
};

export async function upsertChunks(points: { id: string; vector: number[]; payload: ChunkPayload }[]) {
  await ensureCollection();
  await qdrant.upsert(COLLECTION, { wait: true, points });
}

export async function deleteBySource(sourceId: string) {
  await ensureCollection();
  await qdrant.delete(COLLECTION, {
    wait: true,
    filter: { must: [{ key: "sourceId", match: { value: sourceId } }] },
  });
}

export async function searchNotebook(notebookId: string, vector: number[], limit = 8) {
  await ensureCollection();
  const res = await qdrant.search(COLLECTION, {
    vector,
    limit,
    filter: { must: [{ key: "notebookId", match: { value: notebookId } }] },
    with_payload: true,
  });
  return res as unknown as { id: string; score: number; payload: ChunkPayload }[];
}
