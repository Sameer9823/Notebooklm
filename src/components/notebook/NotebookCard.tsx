"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { Library, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { NotebookDTO } from "@/types";

const ACCENTS: Record<string, string> = {
  teal: "from-primary/25 via-primary/5 to-transparent",
  amber: "from-accent/25 via-accent/5 to-transparent",
  violet: "from-violet-400/25 via-violet-400/5 to-transparent",
  rose: "from-rose-400/25 via-rose-400/5 to-transparent",
};

export function NotebookCard({
  notebook,
  onRename,
  onDelete,
}: {
  notebook: NotebookDTO;
  onRename: () => void;
  onDelete: () => void;
}) {
  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} whileHover={{ y: -2 }}>
      <Card className="group relative overflow-hidden">
        <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${ACCENTS[notebook.color] ?? ACCENTS.teal}`} />
        <Link href={`/notebook/${notebook.id}`} className="relative block p-5">
          <div className="flex items-center justify-between">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary/70">
              <Library className="h-4 w-4 text-primary" />
            </div>
          </div>
          <h3 className="mt-4 truncate font-display text-base font-semibold">{notebook.title}</h3>
          <p className="mt-1 line-clamp-2 min-h-[2.5rem] text-sm text-muted-foreground">
            {notebook.description || "No description yet."}
          </p>
          <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
            <span>{notebook._count?.sources ?? 0} sources</span>
            <span>Updated {formatDistanceToNow(new Date(notebook.updatedAt), { addSuffix: true })}</span>
          </div>
        </Link>

        <div className="absolute right-3 top-3 opacity-0 transition-opacity group-hover:opacity-100">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="rounded-md bg-card/80 p-1.5 text-muted-foreground backdrop-blur hover:text-foreground">
                <MoreVertical className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onRename}>
                <Pencil className="h-3.5 w-3.5" /> Rename
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </Card>
    </motion.div>
  );
}
