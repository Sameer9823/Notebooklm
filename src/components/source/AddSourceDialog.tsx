"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { File as FileIcon, Youtube, FileText, Captions, Globe, Loader2, Upload, ArrowLeft } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useAddSource } from "@/hooks/use-add-source";
import type { SourceType } from "@/types";

type Tile = { type: SourceType; label: string; hint: string; icon: typeof FileIcon };

const TILES: Tile[] = [
  { type: "PDF", label: "PDF", hint: "Upload a .pdf file", icon: FileIcon },
  { type: "YOUTUBE", label: "YT Link", hint: "Paste a YouTube URL", icon: Youtube },
  { type: "TEXT", label: "Text", hint: "Paste or type plain text", icon: FileText },
  { type: "VTT", label: "VTT", hint: "Upload a transcript file", icon: Captions },
  { type: "URL", label: "Web Link", hint: "Paste any article URL", icon: Globe },
];

export function AddSourceDialog({
  notebookId,
  open,
  onOpenChange,
  onAdded,
}: {
  notebookId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onAdded: () => void;
}) {
  const [selected, setSelected] = useState<SourceType | null>(null);
  const { submitting, submitJson: submitJsonBase, submitFile: submitFileBase } = useAddSource(notebookId, onAdded);

  function reset() {
    setSelected(null);
  }

  async function submitJson(body: object) {
    const ok = await submitJsonBase(body);
    if (ok) {
      onOpenChange(false);
      reset();
    }
  }

  async function submitFile(file: File, type: "PDF" | "VTT") {
    const ok = await submitFileBase(file, type);
    if (ok) {
      onOpenChange(false);
      reset();
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <DialogContent className="max-w-xl">
        <DialogHeader>
          {selected && (
            <button
              onClick={() => setSelected(null)}
              className="mb-1 flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3 w-3" /> Back
            </button>
          )}
          <DialogTitle>{selected ? TILES.find((t) => t.type === selected)?.label : "Add source"}</DialogTitle>
          <DialogDescription>
            {selected
              ? TILES.find((t) => t.type === selected)?.hint
              : "Choose a source type. Each source is extracted, chunked, embedded, and indexed for this notebook only."}
          </DialogDescription>
        </DialogHeader>

        {!selected && (
          <div className="grid grid-cols-3 gap-3">
            {TILES.map((tile, i) => (
              <motion.button
                key={tile.type}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                onClick={() => setSelected(tile.type)}
                className={cn(
                  "flex flex-col items-center justify-center gap-2 rounded-lg border border-border bg-secondary/40 p-5 text-sm font-medium transition-colors hover:border-primary/50 hover:bg-primary/10",
                  tile.type === "URL" && "col-span-1"
                )}
              >
                <tile.icon className="h-5 w-5 text-muted-foreground" />
                {tile.label}
              </motion.button>
            ))}
          </div>
        )}

        {selected === "PDF" && <FileDrop accept=".pdf" busy={submitting} onFile={(f) => submitFile(f, "PDF")} label="Drop a PDF or click to browse" />}
        {selected === "VTT" && <FileDrop accept=".vtt,.srt,.txt" busy={submitting} onFile={(f) => submitFile(f, "VTT")} label="Drop a .vtt transcript or click to browse" />}

        {selected === "YOUTUBE" && (
          <UrlForm
            placeholder="https://www.youtube.com/watch?v=..."
            busy={submitting}
            onSubmit={(url) => submitJson({ type: "YOUTUBE", url })}
          />
        )}

        {selected === "URL" && (
          <UrlForm
            placeholder="https://example.com/article"
            busy={submitting}
            onSubmit={(url) => submitJson({ type: "URL", url })}
          />
        )}

        {selected === "TEXT" && <TextForm busy={submitting} onSubmit={(title, content) => submitJson({ type: "TEXT", title, content })} />}
      </DialogContent>
    </Dialog>
  );
}

function FileDrop({ accept, busy, onFile, label }: { accept: string; busy: boolean; onFile: (f: File) => void; label: string }) {
  const [dragOver, setDragOver] = useState(false);
  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file) onFile(file);
      }}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border p-10 text-center text-sm text-muted-foreground transition-colors hover:border-primary/50",
        dragOver && "border-primary bg-primary/5"
      )}
    >
      {busy ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : <Upload className="h-6 w-6" />}
      <span>{busy ? "Uploading…" : label}</span>
      <input
        type="file"
        accept={accept}
        className="hidden"
        disabled={busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
        }}
      />
    </label>
  );
}

function UrlForm({ placeholder, busy, onSubmit }: { placeholder: string; busy: boolean; onSubmit: (url: string) => void }) {
  const [url, setUrl] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (url.trim()) onSubmit(url.trim());
      }}
      className="space-y-3"
    >
      <div className="space-y-1.5">
        <Label htmlFor="url">URL</Label>
        <Input id="url" autoFocus placeholder={placeholder} value={url} onChange={(e) => setUrl(e.target.value)} disabled={busy} />
      </div>
      <Button type="submit" disabled={busy || !url.trim()} className="w-full">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add source"}
      </Button>
    </form>
  );
}

function TextForm({ busy, onSubmit }: { busy: boolean; onSubmit: (title: string, content: string) => void }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (title.trim() && content.trim()) onSubmit(title.trim(), content.trim());
      }}
      className="space-y-3"
    >
      <div className="space-y-1.5">
        <Label htmlFor="title">Title</Label>
        <Input id="title" autoFocus placeholder="e.g. Meeting notes — Q3 planning" value={title} onChange={(e) => setTitle(e.target.value)} disabled={busy} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="content">Content</Label>
        <Textarea id="content" rows={8} placeholder="Paste your text here…" value={content} onChange={(e) => setContent(e.target.value)} disabled={busy} />
      </div>
      <Button type="submit" disabled={busy || !title.trim() || !content.trim()} className="w-full">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add source"}
      </Button>
    </form>
  );
}