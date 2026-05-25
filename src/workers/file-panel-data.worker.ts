import {
  computeFilePanelData,
  type FilePanelData,
} from "@/lib/session/derived-data";
import type { UIMessage } from "@/types";
import type { FileAccess } from "@/lib/file-access";
import type { WorkerRequest, WorkerResponse } from "@/lib/worker-request";

interface FilePanelPayload {
  sessionId: string;
  cacheKey: string;
  messages: UIMessage[];
  cwd?: string;
  includeClaudeMd: boolean;
}

interface FilePanelResult {
  files: FileAccess[];
  lastToolCallIdByFile: Array<[string, string]>;
}

function serializeFilePanelData(data: FilePanelData): FilePanelResult {
  return {
    files: data.files,
    lastToolCallIdByFile: Array.from(data.lastToolCallIdByFile.entries()),
  };
}

globalThis.onmessage = (event: MessageEvent<WorkerRequest<FilePanelPayload>>) => {
  const { id, payload } = event.data;
  try {
    const result = computeFilePanelData(
      payload.sessionId,
      payload.cacheKey,
      payload.messages,
      payload.cwd,
      payload.includeClaudeMd,
    );
    globalThis.postMessage({
      id,
      result: serializeFilePanelData(result),
    } satisfies WorkerResponse<FilePanelResult>);
  } catch (err) {
    globalThis.postMessage({
      id,
      error: err instanceof Error ? err.message : String(err),
    } satisfies WorkerResponse<FilePanelResult>);
  }
};

export type { FilePanelPayload, FilePanelResult };
