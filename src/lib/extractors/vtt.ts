import webvtt from "node-webvtt";
import type { Cue } from "@/lib/chunking";

export type VttExtractResult = {
  cues: Cue[];
  durationSec: number;
};

/** Parses a WebVTT (or plain SRT-like) transcript file into timed cues. */
export function extractVtt(raw: string): VttExtractResult {
  const normalized = raw.trim().startsWith("WEBVTT") ? raw : `WEBVTT\n\n${raw}`;
  const parsed = webvtt.parse(normalized, { strict: false });

  const cues: Cue[] = parsed.cues.map((c: { start: number; end: number; text: string }) => ({
    start: Math.round(c.start),
    end: Math.round(c.end),
    text: c.text.replace(/<[^>]+>/g, "").trim(),
  }));

  if (!cues.length) throw new Error("No cues could be parsed from this transcript file");

  return { cues, durationSec: cues[cues.length - 1].end };
}
