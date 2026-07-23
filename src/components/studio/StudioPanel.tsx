"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ExternalLink, FileSearch } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { sourceTypeIcon, formatTimestamp } from "@/lib/source-meta";
import { cn } from "@/lib/utils";
import type { Citation, SourceType } from "@/types";

type ChunkDTO = {
  id: string;
  index: number;
  content: string;
  page?: number | null;
  startSec?: number | null;
  endSec?: number | null;
};

type SourceContent = {
  source: { id: string; type: SourceType; title: string; originUrl?: string | null; pageCount?: number | null; durationSec?: number | null };
  chunks: ChunkDTO[];
};

/**
 * The "you'll never get an answer without knowing where it came from" panel.
 * Clicking a citation opens the originating source here with the exact
 * cited chunk scrolled into view and highlighted — a PDF page, a transcript
 * span with its timestamp, a text passage, or a web article's extract.
 */
export function StudioPanel({ citation, onClose }: { citation: Citation | null; onClose: () => void }) {
  const [data, setData] = useState<SourceContent | null>(null);
  const [loading, setLoading] = useState(false);
  const highlightRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!citation) return;
    setLoading(true);
    setData(null);
    fetch(`/api/sources/${citation.sourceId}/content?chunkId=${citation.chunkId}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, [citation]);

  useEffect(() => {
    if (data && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [data]);

  return (
    <AnimatePresence>
      {citation && (
        <motion.aside
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 380, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 30 }}
          className="h-full shrink-0 overflow-hidden border-l border-border bg-card/40"
        >
          <div className="flex h-full w-[380px] flex-col">
            <div className="flex items-center justify-between gap-2 border-b border-border p-3">
              <div className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <FileSearch className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">Source viewer</span>
              </div>
              <div className="flex items-center gap-1">
                {data?.source.originUrl && (
                  <a href={data.source.originUrl} target="_blank" rel="noreferrer">
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                  </a>
                )}
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            <ScrollArea className="flex-1">
              <div className="p-4">
                {loading && (
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-2/3" />
                  </div>
                )}

                {data && (
                  <>
                    <SourceHeader source={data.source} />
                    <div className="mt-4 space-y-3 font-mono text-[13px] leading-relaxed">
                      {data.chunks.map((c) => {
                        const isHighlighted = c.id === citation.chunkId;
                        return (
                          <div
                            key={c.id}
                            ref={isHighlighted ? highlightRef : undefined}
                            className={cn(
                              "rounded-md border px-2.5 py-2 transition-colors",
                              isHighlighted ? "border-primary/50 bg-primary/10" : "border-transparent"
                            )}
                          >
                            {(c.page != null || c.startSec != null) && (
                              <div className="mb-1 font-sans text-[10px] uppercase tracking-wide text-muted-foreground">
                                {c.page != null ? `Page ${c.page}` : `${formatTimestamp(c.startSec!)} – ${formatTimestamp(c.endSec ?? 0)}`}
                              </div>
                            )}
                            <p className="whitespace-pre-wrap text-foreground/90">{c.content}</p>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </ScrollArea>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

function SourceHeader({ source }: { source: SourceContent["source"] }) {
  const Icon = sourceTypeIcon[source.type];
  return (
    <div className="flex items-start gap-2 border-b border-border pb-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <div className="min-w-0">
        <h4 className="truncate font-display text-sm font-semibold">{source.title}</h4>
        <p className="text-[11px] text-muted-foreground">
          {source.pageCount ? `${source.pageCount} pages` : source.durationSec ? formatTimestamp(source.durationSec) + " total" : "Text source"}
        </p>
      </div>
    </div>
  );
}
