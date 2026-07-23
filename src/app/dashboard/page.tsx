"use client";

import { useEffect, useState } from "react";
import { useUser, UserButton } from "@clerk/nextjs";
import { motion } from "framer-motion";
import { Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { NotebookCard } from "@/components/notebook/NotebookCard";
import { NotebookFormDialog } from "@/components/notebook/NotebookFormDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import type { NotebookDTO } from "@/types";

export default function DashboardPage() {
  const { user } = useUser();
  const [notebooks, setNotebooks] = useState<NotebookDTO[] | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<NotebookDTO | null>(null);
  const [deleting, setDeleting] = useState<NotebookDTO | null>(null);

  async function load() {
    const res = await fetch("/api/notebooks");
    const data = await res.json();
    setNotebooks(data.notebooks);
  }

  useEffect(() => {
    load();
  }, []);

  async function confirmDelete() {
    if (!deleting) return;
    try {
      const res = await fetch(`/api/notebooks/${deleting.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Notebook deleted");
      setDeleting(null);
      load();
    } catch {
      toast.error("Couldn't delete notebook");
    }
  }

  return (
    <div className="min-h-screen bg-grid">
      <header className="border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-2 font-display text-lg font-semibold">
            <Sparkles className="h-5 w-5 text-primary" />
            Index
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">{user?.firstName ? `Welcome, ${user.firstName}` : ""}</span>
            <UserButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-display text-xl font-semibold sm:text-2xl">Your notebooks</h1>
            <p className="mt-1 text-sm text-muted-foreground">Each notebook is an isolated knowledge base — its own sources, its own answers.</p>
          </div>
          <Button
            className="w-full sm:w-auto"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> New notebook
          </Button>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {notebooks === null &&
            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-xl" />)}

          {notebooks?.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="col-span-full flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center"
            >
              <Sparkles className="h-8 w-8 text-muted-foreground/50" />
              <div>
                <h3 className="font-display text-base font-semibold">No notebooks yet</h3>
                <p className="mt-1 text-sm text-muted-foreground">Create one to start uploading sources and asking grounded questions.</p>
              </div>
              <Button onClick={() => setFormOpen(true)}>
                <Plus className="h-4 w-4" /> Create your first notebook
              </Button>
            </motion.div>
          )}

          {notebooks?.map((nb) => (
            <NotebookCard
              key={nb.id}
              notebook={nb}
              onRename={() => {
                setEditing(nb);
                setFormOpen(true);
              }}
              onDelete={() => setDeleting(nb)}
            />
          ))}
        </div>
      </main>

      <NotebookFormDialog open={formOpen} onOpenChange={setFormOpen} notebook={editing} onSaved={load} />

      <Dialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete &ldquo;{deleting?.title}&rdquo;?</DialogTitle>
            <DialogDescription>This permanently removes all sources, chunks, and chat history in this notebook. This can&apos;t be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              Delete notebook
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}