import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

export type UrlExtractResult = {
  title: string;
  text: string;
  siteName?: string;
  byline?: string;
};

/**
 * Fetches the page and runs Mozilla's Readability (the same engine behind
 * Firefox Reader View) to strip nav/ads/boilerplate down to article text.
 */
export async function extractUrl(url: string): Promise<UrlExtractResult> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; NotebookAI/1.0; +https://index.app)" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`Failed to fetch URL (${res.status})`);

  const html = await res.text();
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  if (!article || !article.textContent.trim()) {
    throw new Error("Could not extract readable content from this page");
  }

  return {
    title: article.title || url,
    text: article.textContent.trim(),
    siteName: article.siteName ?? undefined,
    byline: article.byline ?? undefined,
  };
}
