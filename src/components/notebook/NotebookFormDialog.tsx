"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import type { NotebookDTO } from "@/types";

export function NotebookFormDialog({
  open,
  onOpenChange,
  notebook,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  notebook?: NotebookDTO | null;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const isEdit = Boolean(notebook);

  useEffect(() => {
    if (open) {
      setTitle(notebook?.title ?? "");
      setDescription(notebook?.description ?? "");
    }
  }, [open, notebook]);

  async function save() {
    setBusy(true);
    try {
      const res = await fetch(isEdit ? `/api/notebooks/${notebook!.id}` : "/api/notebooks", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim() || "Untitled notebook", description: description.trim() || undefined }),
      });
      if (!res.ok) throw new Error();
      toast.success(isEdit ? "Notebook renamed" : "Notebook created");
      onOpenChange(false);
      onSaved();
    } catch {
      toast.error("Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Rename notebook" : "New notebook"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update the title or description." : "Notebooks keep sources and conversations isolated from each other."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="nb-title">Title</Label>
            <Input id="nb-title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Q3 Market Research" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nb-desc">Description (optional)</Label>
            <Textarea id="nb-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this notebook for?" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {isEdit ? "Save changes" : "Create notebook"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
