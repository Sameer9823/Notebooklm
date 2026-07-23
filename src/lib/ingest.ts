import { v4 as uuid } from "uuid";
import { db } from "@/lib/db";
import { setProgress } from "@/lib/redis";
import { embedTexts } from "@/lib/openai";
import { upsertChunks, deleteBySource } from "@/lib/qdrant";
import { chunkPlainText, chunkPages, chunkCues, type TextChunk } from "@/lib/chunking";
import { extractPdf } from "@/lib/extractors/pdf";
import { extractUrl } from "@/lib/extractors/url";
import { extractYoutube } from "@/lib/extractors/youtube";
import { extractVtt } from "@/lib/extractors/vtt";
import type { Source } from "@prisma/client";

/**
 * Runs the full ingest pipeline for a source: extract -> chunk -> embed ->
 * upsert into Qdrant -> persist chunk rows -> flip status to READY.
 * Any failure is caught, recorded on the Source row, and surfaced to the UI.
 *
 * Called via Next's `after()` so it runs post-response without blocking the
 * upload request, and reports live progress through Redis for polling.
 */
export async function runIngestPipeline(sourceId: string) {
  const source = await db.source.findUnique({ where: { id: sourceId } });
  if (!source) return;

  try {
    await mark(source.id, "INDEXING", "Extracting content", 10);
    const { chunks, metadata } = await extractAndChunk(source);

    if (!chunks.length) {
      throw new Error("No extractable content was found in this source");
    }

    await mark(source.id, "INDEXING", `Embedding ${chunks.length} chunks`, 45);
    const vectors = await embedTexts(chunks.map((c) => c.content));

    await mark(source.id, "INDEXING", "Writing to vector index", 80);
    const chunkRows = chunks.map((c, i) => ({
      id: uuid(),
      chunk: c,
      vector: vectors[i],
    }));

    await deleteBySource(source.id); // safe no-op on first index, required on reindex
    await upsertChunks(
      chunkRows.map((r) => ({
        id: r.id,
        vector: r.vector,
        payload: {
          notebookId: source.notebookId,
          sourceId: source.id,
          sourceTitle: source.title,
          sourceType: source.type,
          chunkId: r.id,
          index: r.chunk.index,
          content: r.chunk.content,
          page: r.chunk.page,
          startSec: r.chunk.startSec,
          endSec: r.chunk.endSec,
          startChar: r.chunk.startChar,
          endChar: r.chunk.endChar,
        },
      }))
    );

    await db.chunk.deleteMany({ where: { sourceId: source.id } });
    await db.chunk.createMany({
      data: chunkRows.map((r) => ({
        id: r.id,
        sourceId: source.id,
        notebookId: source.notebookId,
        index: r.chunk.index,
        content: r.chunk.content,
        tokenCount: r.chunk.tokenCount,
        startChar: r.chunk.startChar,
        endChar: r.chunk.endChar,
        page: r.chunk.page,
        startSec: r.chunk.startSec,
        endSec: r.chunk.endSec,
        vectorId: r.id,
      })),
    });

    await db.source.update({
      where: { id: source.id },
      data: {
        status: "READY",
        chunkCount: chunkRows.length,
        indexedAt: new Date(),
        errorMessage: null,
        ...metadata,
      },
    });
    await setProgress(source.id, { status: "READY", percent: 100, updatedAt: Date.now() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Indexing failed";
    // eslint-disable-next-line no-console
    console.error(`[ingest] source ${source.id} (${source.type} "${source.title}") failed:`, err);
    await db.source.update({
      where: { id: source.id },
      data: { status: "FAILED", errorMessage: message },
    });
    await setProgress(source.id, { status: "FAILED", errorMessage: message, updatedAt: Date.now() });
  }
}

async function mark(sourceId: string, status: "INDEXING", step: string, percent: number) {
  await db.source.update({ where: { id: sourceId }, data: { status } });
  await setProgress(sourceId, { status, step, percent, updatedAt: Date.now() });
}

async function extractAndChunk(
  source: Source
): Promise<{ chunks: TextChunk[]; metadata: Record<string, unknown> }> {
  switch (source.type) {
    case "TEXT": {
      const chunks = chunkPlainText(source.rawText ?? "");
      return { chunks, metadata: {} };
    }
    case "URL": {
      const result = await extractUrl(source.originUrl!);
      const chunks = chunkPlainText(result.text);
      return {
        chunks,
        metadata: {
          title: source.title === source.originUrl ? result.title : source.title,
          rawText: result.text.slice(0, 4000),
          metadata: { siteName: result.siteName, byline: result.byline },
        },
      };
    }
    case "PDF": {
      const buffer = Buffer.from(source.rawText ?? "", "base64"); // rawText temporarily holds base64 during UPLOADING
      const result = await extractPdf(buffer);
      const chunks = chunkPages(result.pages);
      return {
        chunks,
        metadata: { pageCount: result.pageCount, rawText: result.fullText.slice(0, 4000) },
      };
    }
    case "YOUTUBE": {
      const result = await extractYoutube(source.originUrl!);
      const chunks = chunkCues(result.cues);
      return {
        chunks,
        metadata: {
          title: source.title === source.originUrl ? result.title : source.title,
          durationSec: result.durationSec,
          metadata: { videoId: result.videoId },
          rawText: result.cues.map((c) => c.text).join(" ").slice(0, 4000),
        },
      };
    }
    case "VTT": {
      const result = extractVtt(source.rawText ?? "");
      const chunks = chunkCues(result.cues);
      return {
        chunks,
        metadata: {
          durationSec: result.durationSec,
          rawText: result.cues.map((c) => c.text).join(" ").slice(0, 4000),
        },
      };
    }
    default:
      throw new Error(`Unsupported source type: ${source.type}`);
  }
}