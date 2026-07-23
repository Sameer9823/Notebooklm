import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { deleteBySource } from "@/lib/qdrant";

async function ownedSource(id: string, userId: string) {
  const source = await db.source.findUnique({ where: { id }, include: { notebook: true } });
  if (!source || source.notebook.ownerId !== userId) return null;
  return source;
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const source = await ownedSource(id, userId);
  if (!source) return NextResponse.json({ error: "Source not found" }, { status: 404 });

  await deleteBySource(id).catch(() => undefined);
  await db.source.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
