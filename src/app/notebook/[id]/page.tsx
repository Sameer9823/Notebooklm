"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { ArrowLeft, Sparkles } from "lucide-react";
import { SourcesRail } from "@/components/notebook/SourcesRail";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { StudioPanel } from "@/components/studio/StudioPanel";
import { Skeleton } from "@/components/ui/skeleton";
import type { Citation, MessageDTO, NotebookDTO, SourceDTO } from "@/types";

type NotebookFull = NotebookDTO & { sources: SourceDTO[]; messages: MessageDTO[] };

export default function NotebookPage() {
  const { id } = useParams<{ id: string }>();
  const [notebook, setNotebook] = useState<NotebookFull | null>(null);
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  const [citation, setCitation] = useState<Citation | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/notebooks/${id}`, { cache: "no-store" });
    if (res.ok) setNotebook((await res.json()).notebook);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (!notebook) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="w-full max-w-md space-y-3 px-6">
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/dashboard" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex items-center gap-1.5 font-display text-sm font-semibold text-muted-foreground">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <span className="truncate font-display text-sm font-semibold">{notebook.title}</span>
        </div>
        <UserButton />
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="w-[280px] shrink-0">
          <SourcesRail
            notebookId={notebook.id}
            sources={notebook.sources}
            activeSourceId={activeSourceId}
            onSelectSource={setActiveSourceId}
            onRefresh={load}
          />
        </div>

        <div className="min-w-0 flex-1">
          <ChatPanel notebookId={notebook.id} initialMessages={notebook.messages} sources={notebook.sources} onOpenCitation={setCitation} />
        </div>

        <StudioPanel citation={citation} onClose={() => setCitation(null)} />
      </div>
    </div>
  );
}
