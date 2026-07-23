export type SourceType = "PDF" | "TEXT" | "URL" | "YOUTUBE" | "VTT";
export type SourceStatus = "UPLOADING" | "QUEUED" | "INDEXING" | "READY" | "FAILED";

export type SourceDTO = {
  id: string;
  notebookId: string;
  type: SourceType;
  title: string;
  status: SourceStatus;
  errorMessage?: string | null;
  originUrl?: string | null;
  chunkCount: number;
  pageCount?: number | null;
  durationSec?: number | null;
  createdAt: string;
  indexedAt?: string | null;
};

export type NotebookDTO = {
  id: string;
  title: string;
  description?: string | null;
  icon: string;
  color: string;
  createdAt: string;
  updatedAt: string;
  _count?: { sources: number };
};

export type Citation = {
  marker: number;
  chunkId: string;
  sourceId: string;
  sourceTitle: string;
  sourceType: SourceType;
  page?: number | null;
  startSec?: number | null;
  endSec?: number | null;
  snippet: string;
};

export type MessageDTO = {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  citations?: Citation[] | null;
  createdAt: string;
};
