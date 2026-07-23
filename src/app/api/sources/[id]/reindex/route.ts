import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { after } from "next/server";
import { db } from "@/lib/db";
import { setProgress } from "@/lib/redis";
import { runIngestPipeline } from "@/lib/ingest";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const source = await db.source.findUnique({ where: { id }, include: { notebook: true } });
  if (!source || source.notebook.ownerId !== userId) {
    return NextResponse.json({ error: "Source not found" }, { status: 404 });
  }

  await db.source.update({ where: { id }, data: { status: "QUEUED", errorMessage: null } });
  await setProgress(id, { status: "QUEUED", percent: 0, updatedAt: Date.now() });

  after(() => runIngestPipeline(id));

  return NextResponse.json({ success: true });
}
