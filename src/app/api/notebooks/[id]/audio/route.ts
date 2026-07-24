import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { after } from "next/server";
import { db } from "@/lib/db";
import { getAudioProgress, setAudioProgress } from "@/lib/redis";
import { runAudioPipeline } from "@/lib/audio-pipeline";
import { z } from "zod";

async function ownedNotebook(id: string, userId: string) {
  const notebook = await db.notebook.findUnique({ where: { id } });
  if (!notebook || notebook.ownerId !== userId) return null;
  return notebook;
}

// GET returns the latest audio overview for this notebook (metadata + script
// + live progress), if one exists. The binary MP3 itself is served
// separately from /audio/file to keep this response small and pollable.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: notebookId } = await params;

  if (!(await ownedNotebook(notebookId, userId))) {
    return NextResponse.json({ error: "Notebook not found" }, { status: 404 });
  }

  const overview = await db.audioOverview.findFirst({
    where: { notebookId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      errorMessage: true,
      script: true,
      durationSec: true,
      createdAt: true,
      audioData: true, // only used to compute a boolean below, not sent to client
    },
  });

  if (!overview) return NextResponse.json({ overview: null });

  const progress = await getAudioProgress(overview.id);

  return NextResponse.json({
    overview: {
      id: overview.id,
      status: overview.status,
      errorMessage: overview.errorMessage,
      script: overview.script,
      durationSec: overview.durationSec,
      createdAt: overview.createdAt,
      hasAudio: overview.audioData != null,
    },
    progress,
  });
}

const bodySchema = z.object({
  voiceA: z.string().max(30).optional(),
  voiceB: z.string().max(30).optional(),
});

// POST kicks off a new generation run. Any prior overview for this notebook
// is left in place in history but the client should treat the newest as
// current — simplest correct behavior without adding a "regenerate" verb.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: notebookId } = await params;

  if (!(await ownedNotebook(notebookId, userId))) {
    return NextResponse.json({ error: "Notebook not found" }, { status: 404 });
  }

  const readyCount = await db.source.count({ where: { notebookId, status: "READY" } });
  if (readyCount === 0) {
    return NextResponse.json({ error: "Add and index at least one source before generating an audio overview" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const overview = await db.audioOverview.create({
    data: {
      notebookId,
      status: "QUEUED",
      voiceA: parsed.data.voiceA || "alloy",
      voiceB: parsed.data.voiceB || "onyx",
    },
  });

  await setAudioProgress(overview.id, { status: "QUEUED", percent: 0, updatedAt: Date.now() });

  // Run generation after the response is sent so the request returns
  // instantly while scripting/TTS happens in the background (visible via
  // polling), same pattern as source ingestion.
  after(() => runAudioPipeline(overview.id));

  return NextResponse.json({ overview: { id: overview.id, status: overview.status } }, { status: 201 });
}