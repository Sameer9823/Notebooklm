import { Innertube } from "youtubei.js";
import { YoutubeTranscript } from "youtube-transcript";
import type { Cue } from "@/lib/chunking";

export type YoutubeExtractResult = {
  videoId: string;
  title: string;
  cues: Cue[];
  durationSec: number;
};

export function parseYoutubeId(url: string): string {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  throw new Error("Could not parse a YouTube video id from that URL");
}

let innertube: Innertube | null = null;
async function getInnertube() {
  if (!innertube) innertube = await Innertube.create({ retrieve_player: false });
  return innertube;
}

/**
 * Primary path: youtubei.js talks to YouTube's actual internal API (the
 * same one the web client uses), so it's far more resilient than scraping
 * the watch page's HTML for a caption track URL. Falls back to the
 * `youtube-transcript` package, which does scrape HTML, in case a specific
 * video/caption shape trips up the primary path.
 */
export async function extractYoutube(url: string): Promise<YoutubeExtractResult> {
  const videoId = parseYoutubeId(url);

  try {
    return await extractViaInnertube(videoId);
  } catch (primaryErr) {
    try {
      return await extractViaScraper(videoId, url);
    } catch {
      const reason = primaryErr instanceof Error ? primaryErr.message : "unknown error";
      throw new Error(
        `Couldn't fetch captions for this video (${reason}). It may have captions disabled, be age-restricted/private, or region-locked.`
      );
    }
  }
}

async function extractViaInnertube(videoId: string): Promise<YoutubeExtractResult> {
  const yt = await getInnertube();
  const info = await yt.getInfo(videoId);

  const transcriptData = await info.getTranscript();
  const segments = transcriptData?.transcript?.content?.body?.initial_segments;

  if (!segments || !segments.length) {
    throw new Error("No caption track is available for this video");
  }

  const cues: Cue[] = segments
    .filter((s: { snippet?: { text?: string; toString?: () => string } }) => "snippet" in s && s.snippet)
    .map((s: { start_ms: string | number; end_ms: string | number; snippet: { text?: string; toString: () => string } }) => ({
      start: Math.round(Number(s.start_ms) / 1000),
      end: Math.round(Number(s.end_ms) / 1000),
      text: (s.snippet.text ?? s.snippet.toString()).trim(),
    }))
    .filter((c: Cue) => c.text.length > 0);

  if (!cues.length) throw new Error("No caption text could be parsed for this video");

  const title = info.basic_info.title || videoId;
  const durationSec = info.basic_info.duration ?? cues[cues.length - 1].end;

  return { videoId, title, cues, durationSec };
}

async function extractViaScraper(videoId: string, url: string): Promise<YoutubeExtractResult> {
  const transcript = await YoutubeTranscript.fetchTranscript(videoId);
  if (!transcript.length) throw new Error("This video has no captions available to index");

  const cues: Cue[] = transcript.map((t) => ({
    start: Math.round(t.offset / 1000),
    end: Math.round((t.offset + t.duration) / 1000),
    text: t.text,
  }));

  let title = videoId;
  try {
    const oembed = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
    if (oembed.ok) title = (await oembed.json()).title ?? title;
  } catch {
    // title is cosmetic
  }

  return { videoId, title, cues, durationSec: cues[cues.length - 1].end };
}