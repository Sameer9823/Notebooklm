"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Library, Menu, Sparkles, X } from "lucide-react";
import { SourcesRail } from "@/components/notebook/SourcesRail";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { StudioPanel } from "@/components/studio/StudioPanel";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import type { Citation, MessageDTO, NotebookDTO, SourceDTO } from "@/types";

type NotebookFull = NotebookDTO & { sources: SourceDTO[]; messages: MessageDTO[] };

export default function NotebookPage() {
  const { id } = useParams<{ id: string }>();
  const [notebook, setNotebook] = useState<NotebookFull | null>(null);
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  const [citation, setCitation] = useState<Citation | null>(null);
  const [mobileSourcesOpen, setMobileSourcesOpen] = useState(false);

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
      <header className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2.5 sm:px-4">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <Link href="/dashboard" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="hidden items-center gap-1.5 font-display text-sm font-semibold text-muted-foreground sm:flex">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <span className="truncate font-display text-sm font-semibold">{notebook.title}</span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Mobile-only: opens the sources drawer. On desktop the rail is
              always visible so this button is hidden. */}
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setMobileSourcesOpen(true)}
            title="Sources"
          >
            <Library className="h-4 w-4" />
          </Button>
          <UserButton />
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        {/* Desktop sources rail — always visible at lg+ */}
        <div className="hidden lg:block lg:w-[280px] lg:shrink-0">
          <SourcesRail
            notebookId={notebook.id}
            sources={notebook.sources}
            activeSourceId={activeSourceId}
            onSelectSource={setActiveSourceId}
            onRefresh={load}
          />
        </div>

        {/* Mobile/tablet sources drawer */}
        <AnimatePresence>
          {mobileSourcesOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setMobileSourcesOpen(false)}
                className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm lg:hidden"
              />
              <motion.div
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className="fixed inset-y-0 left-0 z-50 w-[85vw] max-w-[320px] lg:hidden"
              >
                <div className="relative h-full">
                  <button
                    onClick={() => setMobileSourcesOpen(false)}
                    className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-md bg-secondary/80 text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                  <SourcesRail
                    notebookId={notebook.id}
                    sources={notebook.sources}
                    activeSourceId={activeSourceId}
                    onSelectSource={(sid) => {
                      setActiveSourceId(sid);
                      setMobileSourcesOpen(false);
                    }}
                    onRefresh={load}
                  />
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        <div className="min-w-0 flex-1">
          <ChatPanel notebookId={notebook.id} initialMessages={notebook.messages} sources={notebook.sources} onOpenCitation={setCitation} />
        </div>

        <StudioPanel citation={citation} onClose={() => setCitation(null)} />
      </div>
    </div>
  );
}