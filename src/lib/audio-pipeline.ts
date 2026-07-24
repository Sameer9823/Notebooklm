import { db } from "@/lib/db";
import { setAudioProgress } from "@/lib/redis";
import { generateAudioScript, synthesizeAudioScript } from "@/lib/openai";
import { describeError } from "@/lib/utils";

const MAX_CONTEXT_CHARS = 14000; // keep the script-generation prompt bounded

/**
 * Runs the full audio-overview pipeline for a notebook: assemble context
 * from ready sources -> generate a two-host dialogue script -> synthesize
 * each line with a distinct voice -> concatenate -> persist.
 *
 * Called via Next's `after()` so it runs post-response without blocking the
 * request, and reports live progress through Redis for polling, same as
 * the source ingest pipeline.
 */
export async function runAudioPipeline(audioId: string) {
  const overview = await db.audioOverview.findUnique({ where: { id: audioId } });
  if (!overview) return;

  try {
    await mark(overview.id, "SCRIPTING", "Reading through your sources", 10);

    const sources = await db.source.findMany({
      where: { notebookId: overview.notebookId, status: "READY" },
      select: { title: true, rawText: true, type: true },
    });

    if (!sources.length) {
      throw new Error("No indexed sources are available to summarize yet");
    }

    const context = sources
      .map((s: { title: string; rawText: string | null; type: string }) => `Source: "${s.title}" (${s.type})\n${(s.rawText ?? "").slice(0, 3000)}`)
      .join("\n\n---\n\n")
      .slice(0, MAX_CONTEXT_CHARS);

    await mark(overview.id, "SCRIPTING", "Writing the podcast script", 25);
    const lines = await generateAudioScript(context);

    await db.audioOverview.update({ where: { id: overview.id }, data: { script: lines } });

    await mark(overview.id, "SYNTHESIZING", `Recording ${lines.length} lines`, 45);
    const audioData = await synthesizeAudioScript(lines, { A: overview.voiceA, B: overview.voiceB });

    // Rough duration estimate: ~150 words/minute spoken, used for display
    // only (not exact — swap for real MP3 duration parsing if needed).
    const wordCount = lines.reduce((n, l) => n + l.text.split(/\s+/).length, 0);
    const durationSec = Math.round((wordCount / 150) * 60);

    await mark(overview.id, "SYNTHESIZING", "Finalizing audio", 90);
    await db.audioOverview.update({
      where: { id: overview.id },
      data: { status: "READY", audioData, durationSec, errorMessage: null },
    });
    await setAudioProgress(overview.id, { status: "READY", percent: 100, updatedAt: Date.now() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Audio generation failed";
    // eslint-disable-next-line no-console
    console.error(`[audio] overview ${overview.id} (notebook ${overview.notebookId}) failed:`, describeError(err));
    await db.audioOverview.update({
      where: { id: overview.id },
      data: { status: "FAILED", errorMessage: message },
    });
    await setAudioProgress(overview.id, { status: "FAILED", errorMessage: message, updatedAt: Date.now() });
  }
}

async function mark(audioId: string, status: "SCRIPTING" | "SYNTHESIZING", step: string, percent: number) {
  await db.audioOverview.update({ where: { id: audioId }, data: { status } });
  await setAudioProgress(audioId, { status, step, percent, updatedAt: Date.now() });
}