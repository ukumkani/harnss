import { memo, startTransition, useMemo, useCallback, useEffect, useRef, useState } from "react";
import { FileText, Loader2, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { oneDark, oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import { PanelHeader } from "@/components/PanelHeader";
import { RegionSearchOverlay } from "@/components/RegionSearchOverlay";
import { OpenInEditorButton } from "./OpenInEditorButton";
import { isEditableSearchTarget, useRegionSearch } from "@/hooks/useRegionSearch";
import {
  getRelativePath,
} from "@/lib/file-access";
import { getLanguageFromPath } from "@/lib/languages";
import {
  buildSessionCacheKey,
  computeFilePanelData,
  getCachedFilePanelData,
  type FilePanelData,
} from "@/lib/session/derived-data";
import { renderHighlightedLines } from "@/lib/syntax-highlight";
import { highlightToLineTokens, type HighlightLine } from "@/lib/syntax-highlight-core";
import { runWorkerTask, terminateWorker } from "@/lib/worker-request";
import type { ResolvedTheme } from "@/hooks/useTheme";
import type { EngineId, UIMessage } from "@/types";
import type { FileAccess } from "@/lib/file-access";

interface FilesPanelProps {
  sessionId?: string | null;
  messages: UIMessage[];
  cwd?: string;
  activeEngine?: EngineId;
  manualFiles?: string[];
  onCloseManualFile?: (filePath: string) => void;
  onScrollToToolCall?: (messageId: string) => void;
  enabled?: boolean;
  resolvedTheme?: ResolvedTheme;
  headerControls?: React.ReactNode;
}

function compactDisplayPath(filePath: string, cwd?: string): string {
  const normalized = filePath.replace(/\/+/g, "/");
  const normalizedCwd = cwd?.replace(/\/+$/, "").replace(/\/+/g, "/");
  const relativePath = normalizedCwd && normalized.startsWith(`${normalizedCwd}/`)
    ? normalized.slice(normalizedCwd.length + 1)
    : normalized;
  const parts = normalized.split("/").filter(Boolean);
  const relativeParts = relativePath.split("/").filter(Boolean);
  const displayParts = relativeParts.length > 0 ? relativeParts : parts;

  if (displayParts.length <= 5) return displayParts.join("/");

  return `${displayParts.slice(0, 3).join("/")}/.../${displayParts.slice(-2).join("/")}`;
}

export const FilesPanel = memo(function FilesPanel({
  sessionId,
  messages,
  cwd,
  activeEngine,
  manualFiles = [],
  onCloseManualFile,
  onScrollToToolCall,
  enabled = true,
  resolvedTheme = "dark",
  headerControls,
}: FilesPanelProps) {
  const [hasClaudeMd, setHasClaudeMd] = useState(false);
  const [data, setData] = useState<FilePanelData | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [reviewFile, setReviewFile] = useState<{
    path: string;
    content: string;
    error: string | null;
    loading: boolean;
  } | null>(null);
  const [closedPaths, setClosedPaths] = useState<Set<string>>(() => new Set());
  const [highlightedLineTokens, setHighlightedLineTokens] = useState<HighlightLine[]>([]);
  const previewScopeRef = useRef<HTMLDivElement>(null);
  const previewSearchRootRef = useRef<HTMLDivElement>(null);
  const filePanelWorkerRef = useRef<Worker | null>(null);
  const syntaxWorkerRef = useRef<Worker | null>(null);

  useEffect(() => {
    if (!enabled || activeEngine !== "claude" || !cwd) {
      setHasClaudeMd(false);
      return;
    }

    let cancelled = false;
    window.claude
      .readFile(`${cwd}/CLAUDE.md`)
      .then((result) => {
        if (cancelled) return;
        setHasClaudeMd(Boolean(!result.error && result.content != null));
      })
      .catch(() => {
        if (!cancelled) setHasClaudeMd(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeEngine, cwd, enabled]);

  const cacheSessionId = sessionId ?? "no-session";
  // Optimization: depend on messages.length and last message identity instead of
  // the full messages array reference, which changes on every streaming flush.
  // buildSessionCacheKey only reads messages.length, last id, and last timestamp.
  const lastMsg = messages[messages.length - 1];
  const msgLen = messages.length;
  const lastMsgId = lastMsg?.id;
  const lastMsgTs = lastMsg?.timestamp;
  const cacheKey = useMemo(
    () => buildSessionCacheKey(cacheSessionId, messages, `${cwd ?? ""}:${activeEngine ?? ""}:${hasClaudeMd ? "claude-md" : "no-claude-md"}`),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeEngine, cacheSessionId, cwd, hasClaudeMd, msgLen, lastMsgId, lastMsgTs],
  );

  useEffect(() => {
    if (!enabled) return;

    const cached = getCachedFilePanelData(cacheSessionId, cacheKey);
    if (cached) {
      setData(cached);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      const includeClaudeMd = activeEngine === "claude" && hasClaudeMd;
      runWorkerTask<{
        sessionId: string;
        cacheKey: string;
        messages: UIMessage[];
        cwd?: string;
        includeClaudeMd: boolean;
      }, {
        files: FileAccess[];
        lastToolCallIdByFile: Array<[string, string]>;
      }>(
        filePanelWorkerRef,
        () => new Worker(new URL("../workers/file-panel-data.worker.ts", import.meta.url), { type: "module" }),
        { sessionId: cacheSessionId, cacheKey, messages, cwd, includeClaudeMd },
      ).then((result) => ({
        files: result.files,
        lastToolCallIdByFile: new Map(result.lastToolCallIdByFile),
      })).catch(() => computeFilePanelData(
        cacheSessionId,
        cacheKey,
        messages,
        cwd,
        includeClaudeMd,
      )).then((next) => {
        if (cancelled) return;
        startTransition(() => setData(next));
      });
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeEngine, cacheKey, cacheSessionId, cwd, enabled, hasClaudeMd, messages]);

  useEffect(() => {
    if (manualFiles.length === 0) return;
    setClosedPaths((current) => {
      let changed = false;
      const next = new Set(current);
      for (const path of manualFiles) {
        if (next.delete(path)) changed = true;
      }
      return changed ? next : current;
    });
  }, [manualFiles]);

  useEffect(() => {
    if (manualFiles[0]) setSelectedPath(manualFiles[0]);
  }, [manualFiles]);

  const files = useMemo(() => {
    const derivedFiles = data?.files ?? [];
    if (manualFiles.length === 0) {
      return derivedFiles.filter((file) => !closedPaths.has(file.path));
    }

    const derivedPaths = new Set(derivedFiles.map((file) => file.path));
    const manualAccesses = manualFiles
      .filter((path) => !derivedPaths.has(path))
      .map((path, index) => ({
        path,
        accessType: "read" as const,
        lastAccessed: Date.now() - index,
        ranges: [],
      }));
    return [...manualAccesses, ...derivedFiles].filter((file) => !closedPaths.has(file.path));
  }, [closedPaths, data?.files, manualFiles]);

  useEffect(() => {
    if (files.length === 0) {
      setSelectedPath(null);
      return;
    }
    setSelectedPath((current) => (
      current && files.some((file) => file.path === current)
        ? current
        : files[0].path
    ));
  }, [files]);

  useEffect(() => {
    if (!selectedPath) {
      setReviewFile(null);
      return;
    }

    let cancelled = false;
    setReviewFile({ path: selectedPath, content: "", error: null, loading: true });
    window.claude
      .readFile(selectedPath)
      .then((result) => {
        if (cancelled) return;
        setReviewFile({
          path: selectedPath,
          content: result.content ?? "",
          error: result.error ?? null,
          loading: false,
        });
      })
      .catch((error) => {
        if (cancelled) return;
        setReviewFile({
          path: selectedPath,
          content: "",
          error: error instanceof Error ? error.message : "Unable to load file",
          loading: false,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [selectedPath]);

  useEffect(() => {
    return () => {
      terminateWorker(filePanelWorkerRef);
      terminateWorker(syntaxWorkerRef);
    };
  }, []);

  const selectedLanguage = selectedPath ? getLanguageFromPath(selectedPath) : "text";
  useEffect(() => {
    if (!reviewFile?.content || reviewFile.loading || reviewFile.error || selectedLanguage === "markdown") {
      setHighlightedLineTokens([]);
      return;
    }

    let cancelled = false;
    const syntaxStyle = resolvedTheme === "dark" ? oneDark : oneLight;
    setHighlightedLineTokens([]);
    runWorkerTask<{
      code: string;
      language: string;
      style: typeof syntaxStyle;
    }, HighlightLine[]>(
      syntaxWorkerRef,
      () => new Worker(new URL("../workers/syntax-highlight.worker.ts", import.meta.url), { type: "module" }),
      { code: reviewFile.content, language: selectedLanguage, style: syntaxStyle },
    ).catch(() => highlightToLineTokens(reviewFile.content, selectedLanguage, syntaxStyle))
      .then((lines) => {
        if (!cancelled) setHighlightedLineTokens(lines);
      });

    return () => {
      cancelled = true;
    };
  }, [resolvedTheme, reviewFile, selectedLanguage]);
  const highlightedLines = useMemo(() => renderHighlightedLines(highlightedLineTokens), [highlightedLineTokens]);
  const selectedDisplayPath = selectedPath ? compactDisplayPath(selectedPath, cwd) : "";
  const previewSearchKey = `${selectedPath ?? ""}:${reviewFile?.loading ? "loading" : "ready"}:${reviewFile?.content.length ?? 0}:${reviewFile?.error ?? ""}`;
  const previewSearch = useRegionSearch(previewSearchRootRef, previewSearchKey);

  const handleClick = useCallback((filePath: string) => {
    setSelectedPath(filePath);
    if (!onScrollToToolCall) return;
    const messageId = data?.lastToolCallIdByFile.get(filePath);
    if (messageId) onScrollToToolCall(messageId);
  }, [data, onScrollToToolCall]);

  const handleCloseFile = useCallback((filePath: string) => {
    setClosedPaths((current) => {
      const next = new Set(current);
      next.add(filePath);
      return next;
    });
    onCloseManualFile?.(filePath);
  }, [onCloseManualFile]);

  return (
    <div className="flex h-full flex-col">
      <PanelHeader icon={FileText} label="Open Files" iconClass="text-amber-600/70 dark:text-amber-200/50">
        {files.length > 0 && (
          <span className="text-[10px] tabular-nums text-foreground/35">{files.length}</span>
        )}
        {headerControls}
      </PanelHeader>

      {enabled && !data ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 p-4">
          <Loader2 className="h-3 w-3 animate-spin text-foreground/25" />
          <p className="text-center text-[10px] text-muted-foreground/40">
            Indexing…
          </p>
        </div>
      ) : files.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1.5 p-6">
          <FileText className="h-4 w-4 text-foreground/15" />
          <p className="text-center text-[10px] leading-relaxed text-muted-foreground/40">
            Accessed files will appear here
          </p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="scrollbar-none shrink-0 overflow-x-auto overflow-y-hidden border-b border-border/50">
            <div className="flex w-max items-center gap-1 px-2 py-1">
              {files.map((file) => {
                const { fileName } = getRelativePath(file.path, cwd);
                const isSelected = file.path === selectedPath;

                return (
                  <div
                    key={file.path}
                    className={`group flex h-7 max-w-44 shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2 text-start transition-colors hover:bg-foreground/[0.04] ${
                      isSelected ? "bg-foreground/[0.08] text-foreground" : "text-foreground/65"
                    }`}
                    onClick={() => handleClick(file.path)}
                  >
                    <span className="min-w-0 truncate text-xs font-medium">
                      {fileName}
                    </span>
                    <button
                      type="button"
                      title="Close file"
                      className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm text-foreground/30 opacity-0 transition hover:bg-foreground/[0.08] hover:text-foreground/70 group-hover:opacity-100"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleCloseFile(file.path);
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        event.stopPropagation();
                        handleCloseFile(file.path);
                      }}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div
            ref={previewScopeRef}
            tabIndex={-1}
            className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden outline-none"
            onKeyDownCapture={previewSearch.handleKeyDownCapture}
            onPointerDownCapture={(event) => {
              if (!isEditableSearchTarget(event.target)) {
                previewScopeRef.current?.focus({ preventScroll: true });
              }
            }}
          >
            {previewSearch.open && (
              <RegionSearchOverlay
                query={previewSearch.query}
                currentIndex={previewSearch.currentIndex}
                matchCount={previewSearch.matchCount}
                onQueryChange={previewSearch.setQuery}
                onClose={previewSearch.closeSearch}
                onNext={previewSearch.goNext}
                onPrev={previewSearch.goPrev}
              />
            )}
            {selectedPath ? (
              <>
                <div className="flex h-8 shrink-0 items-center gap-2 border-b border-border/50 px-3">
                  <div className="min-w-0 flex-1">
                    <div
                      className="truncate text-xs font-medium text-muted-foreground/50"
                      title={selectedDisplayPath}
                    >
                      {selectedDisplayPath}
                    </div>
                  </div>
                  <OpenInEditorButton filePath={selectedPath} />
                </div>
                <div ref={previewSearchRootRef} className="min-h-0 flex-1 overflow-hidden">
                  {reviewFile?.loading ? (
                    <div className="flex h-full flex-col items-center justify-center gap-1 p-4">
                      <Loader2 className="h-3 w-3 animate-spin text-foreground/25" />
                      <p className="text-center text-[10px] text-muted-foreground/40">
                        Loading file…
                      </p>
                    </div>
                  ) : reviewFile?.error ? (
                    <div className="flex h-full flex-col items-center justify-center gap-1.5 p-6">
                      <FileText className="h-4 w-4 text-foreground/15" />
                      <p className="text-center text-[10px] leading-relaxed text-muted-foreground/40">
                        Unable to load file
                      </p>
                    </div>
                  ) : (
                    <div className="h-full overflow-auto">
                      {selectedLanguage === "markdown" ? (
                        <div className="prose dark:prose-invert prose-sm max-w-none p-4 text-foreground/80 wrap-break-word">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {reviewFile?.content ?? ""}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        <pre className="m-0 min-w-max p-3 font-mono text-sm leading-5 text-foreground/85">
                          {highlightedLines.map((line, index) => (
                            <div key={index} className="flex min-h-5">
                              <span className="w-10 shrink-0 select-none pr-3 text-right tabular-nums text-muted-foreground/35">
                                {index + 1}
                              </span>
                              <code className="whitespace-pre">{line}</code>
                            </div>
                          ))}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
});
