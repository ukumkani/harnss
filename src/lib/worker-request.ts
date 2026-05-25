export interface WorkerRequest<T> {
  id: number;
  payload: T;
}

export interface WorkerResponse<T> {
  id: number;
  result?: T;
  error?: string;
}

interface WorkerRef {
  current: Worker | null;
}

const pendingByWorker = new WeakMap<Worker, Map<number, {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
}>>();

let nextWorkerRequestId = 1;

export function terminateWorker(workerRef: WorkerRef): void {
  workerRef.current?.terminate();
  workerRef.current = null;
}

export function runWorkerTask<TPayload, TResult>(
  workerRef: WorkerRef,
  createWorker: () => Worker,
  payload: TPayload,
): Promise<TResult> {
  if (typeof Worker === "undefined") {
    return Promise.reject(new Error("Worker is not available"));
  }

  const worker = workerRef.current ?? createWorker();
  workerRef.current = worker;

  let pending = pendingByWorker.get(worker);
  if (!pending) {
    pending = new Map();
    pendingByWorker.set(worker, pending);
    worker.onmessage = (event: MessageEvent<WorkerResponse<TResult>>) => {
      const { id, result, error } = event.data;
      const request = pending?.get(id);
      if (!request) return;
      pending?.delete(id);
      if (error) {
        request.reject(new Error(error));
        return;
      }
      request.resolve(result as TResult);
    };
    worker.onerror = (event) => {
      pending?.forEach(({ reject }) => reject(event.error ?? new Error(event.message)));
      pending?.clear();
    };
  }

  const id = nextWorkerRequestId++;
  return new Promise<TResult>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
    worker.postMessage({ id, payload } satisfies WorkerRequest<TPayload>);
  });
}
