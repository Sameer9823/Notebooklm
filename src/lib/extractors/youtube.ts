import { Innertube } from "youtubei.js";
import { YoutubeTranscript } from "youtube-transcript";
import type { Cue } from "@/lib/chunking";
import { describeError } from "@/lib/utils";

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

// Cached Innertube session. IMPORTANT: previously this was never reset on
// failure, so a single stale/bad session (e.g. after YouTube rotates a
// server-side check) would keep 400'ing on every future request until the
// process restarted. `getInnertube(forceFresh)` lets callers force a
// rebuild.
let innertube: Innertube | null = null;
async function getInnertube(forceFresh = false): Promise<Innertube> {
  if (forceFresh) innertube = null;
  if (!innertube) {
    innertube = await Innertube.create({
      retrieve_player: false,
      // Building the session locally (instead of round-tripping to
      // YouTube for one) is faster and avoids a class of 400s that show
      // up specifically when requests originate from cloud/datacenter
      // IPs, which is the most common cause of "get_transcript failed
      // with status 400" in server environments.
      generate_session_locally: true,
    });
  }
  return innertube;
}

/**
 * Primary path: youtubei.js talks to YouTube's actual internal API (the
 * same one the web client uses), so it's far more resilient than scraping
 * the watch page's HTML for a caption track URL. Falls back to the
 * `youtube-transcript` package, which does scrape HTML, in case a specific
 * video/caption shape trips up the primary path.
 *
 * NOTE: keep the `youtubei.js` dependency current. YouTube changes its
 * internal InnerTube API (client version strings, session/attestation
 * tokens, etc.) often enough that an outdated version of this library will
 * start getting 400s on `get_transcript` for videos that actually do have
 * captions. If this keeps failing after the retry below, `npm install
 * youtubei.js@latest youtube-transcript@latest` first.
 */
export async function extractYoutube(url: string): Promise<YoutubeExtractResult> {
  const videoId = parseYoutubeId(url);

  try {
    return await extractViaInnertube(videoId);
  } catch (primaryErr) {
    // One retry with a completely fresh session before giving up on the
    // primary path — a stale cached session is a common cause of 400s and
    // this recovers from it without needing a process restart.
    try {
      return await extractViaInnertube(videoId, /* forceFresh */ true);
    } catch (retryErr) {
      try {
        return await extractViaScraper(videoId, url);
      } catch (fallbackErr) {
        throw new Error(
          `Couldn't fetch captions for this video. This usually means either ` +
            `(a) the video genuinely has no captions/auto-captions enabled, or ` +
            `(b) the YouTube API client library is out of date and needs updating. ` +
            `Primary method: ${describeError(retryErr ?? primaryErr)}. Fallback method: ${describeError(
              fallbackErr
            )}.`
        );
      }
    }
  }
}

async function extractViaInnertube(videoId: string, forceFresh = false): Promise<YoutubeExtractResult> {
  const yt = await getInnertube(forceFresh);
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