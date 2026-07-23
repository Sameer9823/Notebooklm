"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { RefreshCw, Trash2, MoreVertical } from "lucide-react";
import { StatusDot, statusLabel } from "@/components/source/StatusDot";
import { sourceTypeIcon } from "@/lib/source-meta";
import { useSourceStatus } from "@/hooks/use-source-status";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn, truncate } from "@/lib/utils";
import { toast } from "sonner";
import type { SourceDTO } from "@/types";

export function SourceListItem({
  source,
  active,
  onSelect,
  onRemoved,
}: {
  source: SourceDTO;
  active: boolean;
  onSelect: () => void;
  onRemoved: () => void;
}) {
  const { status, step, errorMessage } = useSourceStatus(source.id, source.status);
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const Icon = sourceTypeIcon[source.type];
  const isWorking = status === "INDEXING" || status === "QUEUED" || status === "UPLOADING";

  async function remove() {
    setBusy(true);
    try {
      const res = await fetch(`/api/sources/${source.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Source removed");
      onRemoved();
    } catch {
      toast.error("Couldn't remove source");
    } finally {
      setBusy(false);
    }
  }

  async function reindex() {
    setBusy(true);
    try {
      const res = await fetch(`/api/sources/${source.id}/reindex`, { method: "POST" });
      if (!res.ok) throw new Error();
      toast.success("Re-indexing started");
    } catch {
      toast.error("Couldn't start re-indexing");
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "flex items-center gap-1.5 rounded-lg border px-2 py-2 text-sm transition-colors",
        active ? "border-primary/40 bg-primary/10" : "border-transparent hover:bg-secondary/60"
      )}
    >
      {/* Only this inner area selects the source — the menu button is a
          fully separate sibling, so there's no bubbling/overlap between them. */}
      <button
        type="button"
        onClick={onSelect}
        title={status === "FAILED" ? errorMessage ?? "Indexing failed" : source.title}
        className="flex min-w-0 flex-1 items-center gap-2.5 overflow-hidden text-left"
      >
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1 overflow-hidden">
          <div className="truncate font-medium leading-tight">{truncate(source.title, 26)}</div>
          <div className="flex items-center gap-1.5 truncate text-[11px] text-muted-foreground">
            <StatusDot status={status} size="sm" />
            <span className="truncate">
              {status === "FAILED" ? (errorMessage ? truncate(errorMessage, 30) : "Failed") : isWorking && step ? step : statusLabel(status)}
            </span>
            {status === "READY" && source.chunkCount > 0 && <span className="shrink-0">· {source.chunkCount} chunks</span>}
          </div>
        </div>
      </button>

      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={busy}
            aria-label="Source actions"
            className={cn(
              "flex shrink-0 items-center justify-center rounded-md border p-1.5 transition-colors",
              menuOpen ? "border-border bg-secondary text-foreground" : "border-transparent bg-secondary/40 text-muted-foreground hover:bg-secondary hover:text-foreground"
            )}
          >
            <MoreVertical className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={reindex} disabled={busy || isWorking}>
            <RefreshCw className="h-3.5 w-3.5" /> Re-index
          </DropdownMenuItem>
          <DropdownMenuItem onClick={remove} disabled={busy} className="text-destructive focus:text-destructive">
            <Trash2 className="h-3.5 w-3.5" /> Remove
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </motion.div>
  );
}