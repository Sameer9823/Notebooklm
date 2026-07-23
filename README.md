# Index — AI Research Notebooks (RAG, from scratch)

An AI-powered research assistant inspired by Gemini/NotebookLM: create isolated notebooks, add sources
(PDF, plain text, website URL, YouTube video, VTT transcript), and ask questions that are answered
**only** from what you gave it — every claim cited back to the exact page, timestamp, or passage.

Built with Next.js 16, Clerk, Neon (Postgres) + Prisma, Qdrant, Redis, OpenAI, shadcn/ui-style
components, and Framer Motion.

---

## 1. Stack & why

| Concern | Choice | Why |
|---|---|---|
| Framework | Next.js 16 (App Router) | Server components for data loading, route handlers for the API, `after()` for non-blocking background work — no separate backend service needed. |
| Auth | Clerk | Notebook isolation is enforced by `ownerId`, sourced from Clerk's `userId`, at the data layer (every query filters by it), not just hidden in the UI. |
| Relational DB | Neon Postgres + Prisma | Source of truth for notebooks, sources, chunks (with citation metadata), and chat history. |
| Vector DB | Qdrant | Stores chunk embeddings with `notebookId`/`sourceId` payload indexes so retrieval is always scoped to one notebook. |
| Cache / job status | Redis (ioredis) | Fast, ephemeral indexing-progress layer so the UI can poll without hammering Postgres; mirrors status that Postgres also persists durably. |
| LLM | OpenAI (`gpt-4o-mini` + `text-embedding-3-small`) | Configurable via env vars. |
| UI | Tailwind + Radix primitives (shadcn pattern) + Framer Motion | Dark "ink" theme with an amber→teal status motif taken directly from the brief's own indexing/indexed legend. |

---

## 2. Architecture

```
src/
  app/
    page.tsx                     marketing landing (redirects signed-in users to /dashboard)
    (auth)/sign-in, sign-up       Clerk-hosted auth screens
    dashboard/page.tsx            notebook grid — create / rename / delete
    notebook/[id]/page.tsx        3-pane workspace: sources rail | chat | source viewer
    api/
      notebooks/                  CRUD
      notebooks/[id]/sources/     add a source (upload flow)
      notebooks/[id]/query/       streaming RAG endpoint
      sources/[id]/               delete
      sources/[id]/reindex/       re-run the pipeline
      sources/[id]/status/        fast polling endpoint (Redis-backed)
      sources/[id]/content/       full chunk list for the source viewer
  components/
    notebook/                     NotebookCard, SourcesRail, NotebookFormDialog
    source/                       AddSourceDialog, SourceListItem, StatusDot (signature motif)
    chat/                         ChatPanel (streaming), MessageBubble, CitationChip
    studio/                       StudioPanel — the citation-driven source viewer
    ui/                           shadcn-style primitives (button, dialog, tabs, etc.)
  lib/
    extractors/                   pdf.ts, url.ts, youtube.ts, vtt.ts (+ inline text handling)
    chunking.ts                   sentence-aware sliding window / per-page / per-cue chunkers
    ingest.ts                     orchestrates extract -> chunk -> embed -> index -> persist
    rag.ts                        retrieval + prompt construction + streaming + citation extraction
    db.ts / redis.ts / qdrant.ts / openai.ts   infra clients
  worker/index.ts                 optional BullMQ worker for scaling ingestion off the request path
```

### Data model (`prisma/schema.prisma`)

- **Notebook** — `ownerId` (Clerk user id) enforces isolation; every API route re-checks ownership server-side.
- **Source** — one row per uploaded/linked source, with `status` (`UPLOADING → QUEUED → INDEXING → READY | FAILED`),
  `chunkCount`, and type-specific metadata (`pageCount`, `durationSec`, `originUrl`).
- **Chunk** — one row per indexed chunk, carrying whatever citation metadata its source type supports:
  `page` (PDF), `startSec`/`endSec` (YouTube/VTT), `startChar`/`endChar` (text/URL). `vectorId` maps 1:1
  to the point id in Qdrant, so a citation can always be resolved back to both the Postgres row (for
  display) and the original vector (for debugging/re-embedding).
- **Message** — chat history per notebook, with a `citations` JSON blob so past answers keep their sourcing.

---

## 3. Ingestion pipeline

1. **Upload** (`POST /api/notebooks/[id]/sources`) — accepts either `multipart/form-data` (PDF/VTT file)
   or JSON (`TEXT`/`URL`/`YOUTUBE`). Creates a `Source` row with `status: QUEUED` and returns immediately.
2. **Extract** (`lib/extractors/*`) — type-specific:
   - **PDF**: `pdf-parse` with a per-page callback, so every page keeps its own text and page number.
   - **URL**: fetch + Mozilla Readability (the engine behind Firefox Reader View) strips nav/ads down to
     article text.
   - **YouTube**: `youtube-transcript` pulls the caption track with per-cue timestamps.
   - **VTT**: `node-webvtt` parses uploaded transcript files into the same cue shape.
   - **Text**: used as-is.
3. **Chunk** (`lib/chunking.ts`) — not a single one-size-fits-all splitter:
   - Plain text/URL: sentence-aware sliding window (~450 tokens, ~80 token overlap), tracking character
     offsets for citation highlighting.
   - PDF: chunked *within* each page, so a chunk never spans two pages and can always cite one page number.
   - YouTube/VTT: consecutive caption cues are grouped up to the token budget, keeping a precise
     `[startSec, endSec]` range per chunk for "jump to timestamp" citations.
4. **Embed** (`lib/openai.ts`) — `text-embedding-3-small`, batched.
5. **Index** (`lib/qdrant.ts`) — upserted into a single shared Qdrant collection with `notebookId` and
   `sourceId` as indexed payload fields, so every search is filtered to one notebook (and re-index/delete
   can target one source) without needing a collection per notebook.
6. **Persist** — chunk rows written to Postgres in the same pass; `Source.status` flips to `READY`.

Progress is written to Redis at each stage (`lib/redis.ts::setProgress`) and polled by the UI every 1.5s
via `useSourceStatus`, which is what drives the amber "indexing" pulse → teal "indexed" pop in the sources
rail. Postgres is still the durable source of truth — Redis is a cache that self-heals on the next write.

Indexing itself runs via Next's `after()` API so the upload request returns instantly and extraction/
embedding happens after the response is sent, without needing a separate worker process for this scale.
`src/worker/index.ts` shows the drop-in BullMQ path for scaling that off the request lifecycle entirely.

---

## 4. Retrieval / RAG flow (`lib/rag.ts`)

1. Embed the user's question.
2. `searchNotebook()` — Qdrant cosine search filtered to `notebookId`, top-8, with a similarity floor so
   low-relevance chunks are dropped instead of padding the context.
3. If nothing clears the floor, short-circuit with an honest "not enough information" answer instead of
   asking the model to improvise.
4. Otherwise, build a numbered context block (`[1] Source: "..."\n<content>`) and send it with a system
   prompt that requires every factual sentence to end in a bracket citation (`[1]`, `[1][3]`, …) and
   explicitly forbids fabricating a citation number.
5. Stream the completion back to the client as plain text; once the stream ends, `extractCitations()`
   parses the `[n]` markers out of the finished answer and maps them back to the actual retrieved chunks
   (deduped, in first-seen order) — so displayed citations are always ones the model actually used, not
   just everything that was retrieved.
6. The stream is terminated with a null-byte-delimited sentinel followed by the citations JSON, which the
   client splits off before rendering — one round trip, no second fetch for citations.
7. Clicking a citation chip opens the **Studio panel**, which fetches the full source content and scrolls/
   highlights the exact cited chunk (page for PDFs, timestamp range for video/transcript, offset for text).

---

## 5. Setup

### Prerequisites
- Node 20+
- A [Neon](https://neon.tech) Postgres database
- A [Qdrant](https://qdrant.tech) instance (Qdrant Cloud free tier works)
- A Redis instance (Upstash free tier works)
- An [OpenAI](https://platform.openai.com) API key
- A [Clerk](https://clerk.com) application

### Steps

```bash
git clone <your-fork-url> index
cd index
npm install
cp .env.example .env.local   # fill in every value — see table below
npm run db:push              # sync Prisma schema to Neon
npm run dev                  # http://localhost:3000
```

Qdrant's collection is created automatically on first use (`ensureCollection()` in `lib/qdrant.ts`) — no
manual setup needed beyond having a reachable Qdrant URL + key.

### Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Neon Postgres connection string |
| `QDRANT_URL`, `QDRANT_API_KEY`, `QDRANT_COLLECTION` | Vector DB connection + collection name |
| `REDIS_URL` | Redis connection string (status cache; also used by the optional BullMQ worker) |
| `OPENAI_API_KEY`, `OPENAI_CHAT_MODEL`, `OPENAI_EMBEDDING_MODEL` | LLM + embedding config |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | Clerk auth |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` / `SIGN_UP_URL` / `AFTER_SIGN_IN_URL` / `AFTER_SIGN_UP_URL` | Clerk redirect routing |
| `NEXT_PUBLIC_APP_URL` | Used for absolute links where needed |

### Deployment
Deploy the Next.js app to Vercel (or any Node host). Point `DATABASE_URL`/`QDRANT_URL`/`REDIS_URL` at
managed services (Neon, Qdrant Cloud, Upstash) so the app is stateless and horizontally scalable. If
ingestion volume grows past what request-scoped `after()` calls can comfortably absorb, switch the upload
route to enqueue into BullMQ and run `npm run worker` as a separate process/service — `runIngestPipeline`
doesn't change either way.

---

## 6. Notes on scope / production-oriented choices

- **Isolation is enforced server-side**, not just via UI filtering: every route re-fetches the notebook
  and checks `ownerId === auth().userId` before touching anything.
- **Chunking is content-aware** rather than one generic splitter, because citation quality depends on it —
  a PDF chunk that spans two pages can't produce an honest page citation.
- **Redis is treated as disposable**: every write is wrapped so a Redis outage degrades (slower polling,
  falls back to Postgres) rather than breaking ingestion.
- **The model is not allowed to answer past its context**: no chunks clearing the similarity floor means an
  explicit "not enough information," not a hallucinated guess.
- **Single shared Qdrant collection** with payload-indexed `notebookId`/`sourceId`, instead of one
  collection per notebook — keeps operations (backup, schema change) to one place while still giving hard
  query-time isolation via filters.

## 7. Bonus ideas (not implemented, noted for follow-up)
- **Learning roadmap from a YouTube playlist**: cluster chunk embeddings across a set of linked videos,
  label clusters with the LLM, and topologically order them by cross-video keyword progression to produce
  a "concept roadmap."
- **Podcast generation**: script a two-voice conversational summary from the notebook's sources with the
  LLM, then synthesize with a TTS API (e.g. ElevenLabs or OpenAI TTS) into a downloadable audio file.
