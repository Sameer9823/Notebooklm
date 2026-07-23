import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

export type UrlExtractResult = {
  title: string;
  text: string;
  siteName?: string;
  byline?: string;
};

// A realistic desktop Chrome UA + the headers a real browser sends alongside
// it. Many sites (Hashnode, Medium, Cloudflare-fronted blogs, etc.) 403
// requests that identify as a bot via User-Agent, even for public articles —
// this is the single most common cause of "Failed to fetch URL (403)".
const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

/**
 * Fetches the page and runs Mozilla's Readability (the same engine behind
 * Firefox Reader View) to strip nav/ads/boilerplate down to article text.
 */
export async function extractUrl(url: string): Promise<UrlExtractResult> {
  let res: Response;
  try {
    res = await fetch(url, { headers: BROWSER_HEADERS, redirect: "follow" });
  } catch (err) {
    const cause = err instanceof Error && err.cause ? ` — ${String(err.cause)}` : "";
    throw new Error(`Could not reach that URL${cause}`);
  }

  if (res.status === 403 || res.status === 401) {
    throw new Error(
      `This site is blocking automated access (${res.status}). Some sites reject any non-browser request even for public pages — try a different article, or paste the text in directly using the "Text" source type instead.`
    );
  }
  if (!res.ok) throw new Error(`Failed to fetch URL (${res.status})`);

  const html = await res.text();
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  if (!article || !article.textContent.trim()) {
    throw new Error("Could not extract readable content from this page — it may not be a standard article layout");
  }

  return {
    title: article.title || url,
    text: article.textContent.trim(),
    siteName: article.siteName ?? undefined,
    byline: article.byline ?? undefined,
  };
}