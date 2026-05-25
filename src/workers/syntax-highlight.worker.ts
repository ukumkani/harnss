import {
  highlightToLineTokens,
  type HighlightLine,
  type PrismThemeStyle,
} from "@/lib/syntax-highlight-core";
import type { WorkerRequest, WorkerResponse } from "@/lib/worker-request";

interface SyntaxHighlightPayload {
  code: string;
  language: string;
  style: PrismThemeStyle;
}

globalThis.onmessage = (event: MessageEvent<WorkerRequest<SyntaxHighlightPayload>>) => {
  const { id, payload } = event.data;
  try {
    const result = highlightToLineTokens(payload.code, payload.language, payload.style);
    globalThis.postMessage({ id, result } satisfies WorkerResponse<HighlightLine[]>);
  } catch (err) {
    globalThis.postMessage({
      id,
      error: err instanceof Error ? err.message : String(err),
    } satisfies WorkerResponse<HighlightLine[]>);
  }
};

export type { SyntaxHighlightPayload };
