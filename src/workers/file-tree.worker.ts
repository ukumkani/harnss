import { buildFileTree, type FileTreeNode } from "@/lib/file-tree";
import type { WorkerRequest, WorkerResponse } from "@/lib/worker-request";

interface FileTreePayload {
  files: string[];
}

globalThis.onmessage = (event: MessageEvent<WorkerRequest<FileTreePayload>>) => {
  const { id, payload } = event.data;
  try {
    const result = buildFileTree(payload.files);
    globalThis.postMessage({ id, result } satisfies WorkerResponse<FileTreeNode[]>);
  } catch (err) {
    globalThis.postMessage({
      id,
      error: err instanceof Error ? err.message : String(err),
    } satisfies WorkerResponse<FileTreeNode[]>);
  }
};

export {};
