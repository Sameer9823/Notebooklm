"use client";

import { useEffect, useRef, useState } from "react";
import type { SourceStatus } from "@/types";

type StatusResponse = {
  status: SourceStatus;
  errorMessage?: string | null;
  chunkCount: number;
  progress?: { step?: string; percent?: number } | null;
};

/** Polls a source's indexing status every 1.5s while it's in-flight, and
 *  stops automatically once it reaches a terminal state (READY/FAILED). */
export function useSourceStatus(sourceId: string, initialStatus: SourceStatus) {
  const [status, setStatus] = useState<SourceStatus>(initialStatus);
  const [step, setStep] = useState<string | undefined>();
  const [percent, setPercent] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    setStatus(initialStatus);
  }, [initialStatus]);

  useEffect(() => {
    let cancelled = false;
    const isTerminal = (s: SourceStatus) => s === "READY" || s === "FAILED";

    async function poll() {
      if (cancelled) return;
      try {
        const res = await fetch(`/api/sources/${sourceId}/status`, { cache: "no-store" });
        if (res.ok) {
          const data: StatusResponse = await res.json();
          if (cancelled) return;
          setStatus(data.status);
          setStep(data.progress?.step);
          setPercent(data.progress?.percent ?? 0);
          setErrorMessage(data.errorMessage ?? null);
          if (!isTerminal(data.status)) {
            timer.current = setTimeout(poll, 1500);
          }
        } else {
          timer.current = setTimeout(poll, 3000);
        }
      } catch {
        timer.current = setTimeout(poll, 3000);
      }
    }

    if (!isTerminal(initialStatus)) poll();

    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceId]);

  return { status, step, percent, errorMessage };
}
