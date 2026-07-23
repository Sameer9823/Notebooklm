"use client";

import { useState } from "react";
import { Plus, Library } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AddSourceDialog } from "@/components/source/AddSourceDialog";
import { SourceListItem } from "@/components/source/SourceListItem";
import type { SourceDTO } from "@/types";

export function SourcesRail({
  notebookId,
  sources,
  activeSourceId,
  onSelectSource,
  onRefresh,
}: {
  notebookId: string;
  sources: SourceDTO[];
  activeSourceId: string | null;
  onSelectSource: (id: string) => void;
  onRefresh: () => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const readyCount = sources.filter((s) => s.status === "READY").length;

  return (
    <aside className="flex h-full w-full flex-col border-r border-border bg-card/40">
      <div className="flex items-center justify-between gap-2 border-b border-border p-3">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Library className="h-3.5 w-3.5" />
          Sources
          {sources.length > 0 && (
            <span className="font-mono text-[10px] text-muted-foreground/70">
              {readyCount}/{sources.length}
            </span>
          )}
        </div>
      </div>

      <div className="p-3">
        <Button onClick={() => setAddOpen(true)} variant="secondary" size="sm" className="w-full justify-start gap-2 border-dashed">
          <Plus className="h-3.5 w-3.5" /> Add source
        </Button>
      </div>

      <ScrollArea className="flex-1 px-3 pb-3">
        {sources.length === 0 ? (
          <div className="mt-6 flex flex-col items-center gap-2 px-2 text-center text-xs text-muted-foreground">
            <Library className="h-6 w-6 opacity-40" />
            <p>No sources yet. Add a PDF, link, video, or transcript to start building this notebook&apos;s knowledge base.</p>
          </div>
        ) : (
          <div className="space-y-1">
            {sources.map((s) => (
              <SourceListItem key={s.id} source={s} active={s.id === activeSourceId} onSelect={() => onSelectSource(s.id)} onRemoved={onRefresh} />
            ))}
          </div>
        )}
      </ScrollArea>

      <AddSourceDialog notebookId={notebookId} open={addOpen} onOpenChange={setAddOpen} onAdded={onRefresh} />
    </aside>
  );
}
