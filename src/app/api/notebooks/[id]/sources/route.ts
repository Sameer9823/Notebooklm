import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { after } from "next/server";
import { db } from "@/lib/db";
import { setProgress } from "@/lib/redis";
import { runIngestPipeline } from "@/lib/ingest";
import { z } from "zod";

const MAX_PDF_BYTES = 25 * 1024 * 1024;

async function ownedNotebook(id: string, userId: string) {
  const notebook = await db.notebook.findUnique({ where: { id } });
  if (!notebook || notebook.ownerId !== userId) return null;
  return notebook;
}

const jsonSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("TEXT"), title: z.string().min(1).max(160), content: z.string().min(1) }),
  z.object({ type: z.literal("URL"), url: z.string().url() }),
  z.object({ type: z.literal("YOUTUBE"), url: z.string().url() }),
]);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: notebookId } = await params;

  if (!(await ownedNotebook(notebookId, userId))) {
    return NextResponse.json({ error: "Notebook not found" }, { status: 404 });
  }

  const contentType = req.headers.get("content-type") || "";
  let source;

  if (contentType.includes("multipart/form-data")) {
    // PDF or VTT file upload
    const form = await req.formData();
    const file = form.get("file") as File | null;
    const type = form.get("type") as string | null;

    if (!file || (type !== "PDF" && type !== "VTT")) {
      return NextResponse.json({ error: "A PDF or VTT file is required" }, { status: 400 });
    }
    if (type === "PDF" && file.size > MAX_PDF_BYTES) {
      return NextResponse.json({ error: "PDF exceeds 25MB limit" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const rawText = type === "PDF" ? buffer.toString("base64") : buffer.toString("utf-8");

    source = await db.source.create({
      data: {
        notebookId,
        type,
        title: file.name,
        status: "QUEUED",
        rawText,
        fileSizeBytes: file.size,
      },
    });
  } else {
    const body = await req.json().catch(() => null);
    const parsed = jsonSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const data = parsed.data;

    if (data.type === "TEXT") {
      source = await db.source.create({
        data: { notebookId, type: "TEXT", title: data.title, status: "QUEUED", rawText: data.content },
      });
    } else {
      source = await db.source.create({
        data: {
          notebookId,
          type: data.type,
          title: data.url,
          status: "QUEUED",
          originUrl: data.url,
        },
      });
    }
  }

  await setProgress(source.id, { status: "QUEUED", percent: 0, updatedAt: Date.now() });
  await db.notebook.update({ where: { id: notebookId }, data: { updatedAt: new Date() } });

  // Run indexing after the response is sent so upload feels instant while
  // extraction/embedding happens in the background (visible via polling).
  after(() => runIngestPipeline(source.id));

  return NextResponse.json({ source }, { status: 201 });
}
