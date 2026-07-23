import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { streamAnswer, extractCitations } from "@/lib/rag";
import { z } from "zod";

const bodySchema = z.object({ question: z.string().min(1).max(2000) });

// Sentinel the client splits on to separate the streamed prose from the
// trailing citations payload, without needing a second round-trip.
const CITATIONS_MARKER = "\n\u0000CITATIONS\u0000";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: notebookId } = await params;

  const notebook = await db.notebook.findUnique({ where: { id: notebookId } });
  if (!notebook || notebook.ownerId !== userId) {
    return NextResponse.json({ error: "Notebook not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { question } = parsed.data;

  const priorMessages = await db.message.findMany({
    where: { notebookId },
    orderBy: { createdAt: "asc" },
    take: 20,
  });
  const history = priorMessages.map((m: { role: string; content: string }) => ({
    role: m.role === "USER" ? ("user" as const) : ("assistant" as const),
    content: m.content,
  }));

  await db.message.create({ data: { notebookId, role: "USER", content: question } });

  const { chunks, stream, noContext } = await streamAnswer(notebookId, question, history);

  if (noContext || !stream) {
    const fallback =
      "This notebook doesn't have any indexed sources yet — or none of them relate closely enough to answer that. Add a source, or wait for indexing to finish, then try again.";
    await db.message.create({ data: { notebookId, role: "ASSISTANT", content: fallback, citations: [] } });
    return NextResponse.json({ answer: fallback, citations: [] });
  }

  const encoder = new TextEncoder();
  let full = "";

  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const part of stream) {
          const delta = part.choices[0]?.delta?.content ?? "";
          if (delta) {
            full += delta;
            controller.enqueue(encoder.encode(delta));
          }
        }
        const citations = extractCitations(full, chunks);
        await db.message.create({
          data: { notebookId, role: "ASSISTANT", content: full, citations },
        });
        controller.enqueue(encoder.encode(CITATIONS_MARKER + JSON.stringify(citations)));
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });

  return new Response(readable, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" },
  });
}
