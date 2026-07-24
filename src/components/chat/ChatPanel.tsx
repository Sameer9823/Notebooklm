"use client";

import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from "react";
import { Mic, MicOff, Send, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { cn } from "@/lib/utils";
import type { Citation, MessageDTO, SourceDTO } from "@/types";

const CITATIONS_MARKER = "\n\u0000CITATIONS\u0000";

export type ChatPanelHandle = {
  focusInput: () => void;
};

export const ChatPanel = forwardRef<ChatPanelHandle, {
  notebookId: string;
  initialMessages: MessageDTO[];
  sources: SourceDTO[];
  onOpenCitation: (c: Citation) => void;
}>(function ChatPanel({ notebookId, initialMessages, sources, onOpenCitation }, ref) {
  const [messages, setMessages] = useState<(MessageDTO & { streaming?: boolean })[]>(initialMessages);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useImperativeHandle(ref, () => ({
    focusInput: () => textareaRef.current?.focus(),
  }));

  const { isSupported: micSupported, isListening, toggle: toggleMic } = useSpeechRecognition(setInput);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const readySources = sources.filter((s) => s.status === "READY");

  const runQuery = useCallback(
    async (question: string, assistantId: string) => {
      try {
        const res = await fetch(`/api/notebooks/${notebookId}/query`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question }),
        });

        if (!res.body) throw new Error("No response stream");

        const contentType = res.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          const data = await res.json();
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content: data.answer, citations: data.citations ?? [], streaming: false } : m))
          );
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let full = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          full += decoder.decode(value, { stream: true });

          const markerIdx = full.indexOf(CITATIONS_MARKER);
          const visible = markerIdx === -1 ? full : full.slice(0, markerIdx);

          setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: visible, streaming: true } : m)));
        }

        const markerIdx = full.indexOf(CITATIONS_MARKER);
        const finalText = markerIdx === -1 ? full : full.slice(0, markerIdx);
        let citations: Citation[] = [];
        if (markerIdx !== -1) {
          try {
            citations = JSON.parse(full.slice(markerIdx + CITATIONS_MARKER.length));
          } catch {
            citations = [];
          }
        }

        setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: finalText, citations, streaming: false } : m)));
      } catch {
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content: "Something went wrong answering that — try again.", streaming: false } : m))
        );
      } finally {
        setBusy(false);
      }
    },
    [notebookId]
  );

  async function ask(question: string) {
    if (!question.trim() || busy) return;
    setInput("");
    setBusy(true);

    const userMsg: MessageDTO = { id: `local-${Date.now()}`, role: "USER", content: question, createdAt: new Date().toISOString() };
    const assistantId = `local-${Date.now() + 1}`;
    setMessages((prev) => [
      ...prev,
      userMsg,
      { id: assistantId, role: "ASSISTANT", content: "", citations: [], createdAt: new Date().toISOString(), streaming: true },
    ]);

    runQuery(question, assistantId);
  }

  function regenerateLast() {
    if (busy) return;
    const lastAssistantIdx = [...messages].reverse().findIndex((m) => m.role === "ASSISTANT");
    if (lastAssistantIdx === -1) return;
    const assistantIndex = messages.length - 1 - lastAssistantIdx;
    const assistantMsg = messages[assistantIndex];
    const precedingUser = [...messages.slice(0, assistantIndex)].reverse().find((m) => m.role === "USER");
    if (!precedingUser) return;

    setBusy(true);
    setMessages((prev) =>
      prev.map((m) => (m.id === assistantMsg.id ? { ...m, content: "", citations: [], streaming: true } : m))
    );
    runQuery(precedingUser.content, assistantMsg.id);
  }

  function handleMicToggle() {
    toggleMic(input);
  }

  const lastAssistantId = [...messages].reverse().find((m) => m.role === "ASSISTANT")?.id;

  return (
    <div className="flex h-full flex-col">
      <ScrollArea className="flex-1">
        <div className="mx-auto flex max-w-2xl flex-col gap-5 px-3 py-6 sm:px-5">
          {messages.length === 0 ? (
            <EmptyState hasSources={readySources.length > 0} onAsk={ask} />
          ) : (
            messages.map((m) => (
              <MessageBubble
                key={m.id}
                message={m}
                onOpenCitation={onOpenCitation}
                isLast={m.id === lastAssistantId}
                onRegenerate={m.id === lastAssistantId ? regenerateLast : undefined}
              />
            ))
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      <div className="border-t border-border bg-card/60 p-3 sm:p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(input);
          }}
          className="mx-auto flex max-w-2xl items-end gap-1.5 sm:gap-2"
        >
          {micSupported && (
            <Button
              type="button"
              variant={isListening ? "default" : "outline"}
              size="icon"
              onClick={handleMicToggle}
              title={isListening ? "Stop dictation" : "Dictate your question"}
              className={cn("shrink-0", isListening && "animate-pulse")}
            >
              {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </Button>
          )}
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                ask(input);
              }
            }}
            placeholder={
              isListening
                ? "Listening…"
                : readySources.length > 0
                ? "Ask a question grounded in your sources…"
                : "Type a query here…"
            }
            rows={1}
            className="max-h-40 min-h-[2.5rem] flex-1 resize-none"
          />
          <Button type="submit" size="icon" disabled={busy || !input.trim()} className="shrink-0">
            <Send className="h-4 w-4" />
          </Button>
        </form>
        <p className="mx-auto mt-2 max-w-2xl text-center text-[11px] text-muted-foreground">
          Answers are grounded only in this notebook&apos;s sources, with every claim cited.
        </p>
      </div>
    </div>
  );
});

function EmptyState({ hasSources, onAsk }: { hasSources: boolean; onAsk: (q: string) => void }) {
  const suggestions = ["Summarize the key points across all sources", "What are the main takeaways?", "List anything that seems contradictory"];
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-4 py-12 text-center sm:py-16">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
        <Sparkles className="h-5 w-5 text-primary" />
      </div>
      <div>
        <h3 className="font-display text-lg font-semibold">Ask this notebook anything</h3>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          {hasSources
            ? "Every answer is grounded in your sources and cited — you'll always know where it came from."
            : "Add a source on the left first, then come back and ask a question about it."}
        </p>
      </div>
      {hasSources && (
        <div className="flex flex-wrap justify-center gap-2 px-4">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => onAsk(s)}
              className="rounded-full border border-border bg-secondary/40 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </motion.div>
  );
};