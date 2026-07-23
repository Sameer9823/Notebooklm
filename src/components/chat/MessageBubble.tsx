"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { motion } from "framer-motion";
import { Sparkles, User } from "lucide-react";
import { CitationChip } from "@/components/chat/CitationChip";
import { cn } from "@/lib/utils";
import type { Citation, MessageDTO } from "@/types";

export function MessageBubble({
  message,
  onOpenCitation,
}: {
  message: MessageDTO & { streaming?: boolean };
  onOpenCitation: (c: Citation) => void;
}) {
  const isUser = message.role === "USER";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("flex gap-3", isUser && "flex-row-reverse")}
    >
      <div
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
          isUser ? "bg-secondary text-foreground" : "bg-primary/15 text-primary"
        )}
      >
        {isUser ? <User className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
      </div>

      <div className={cn("flex max-w-[80%] flex-col gap-2", isUser && "items-end")}>
        <div
          className={cn(
            "rounded-xl px-3.5 py-2.5 text-sm leading-relaxed",
            isUser ? "bg-secondary text-foreground" : "bg-card border border-border"
          )}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : (
            <div className="prose prose-sm prose-invert max-w-none prose-p:my-2 prose-ul:my-2 prose-headings:font-display">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content || (message.streaming ? "…" : "")}</ReactMarkdown>
            </div>
          )}
        </div>

        {!isUser && message.citations && message.citations.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {message.citations.map((c) => (
              <CitationChip key={`${c.chunkId}-${c.marker}`} citation={c} onOpen={onOpenCitation} />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
