import { FileText, Globe, Youtube, Captions, File } from "lucide-react";
import type { SourceType } from "@/types";

export const sourceTypeIcon: Record<SourceType, typeof FileText> = {
  PDF: File,
  TEXT: FileText,
  URL: Globe,
  YOUTUBE: Youtube,
  VTT: Captions,
};

export const sourceTypeLabel: Record<SourceType, string> = {
  PDF: "PDF",
  TEXT: "Text",
  URL: "Web link",
  YOUTUBE: "YouTube",
  VTT: "Transcript",
};

export function formatTimestamp(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}
