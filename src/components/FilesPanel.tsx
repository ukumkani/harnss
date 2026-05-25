import { memo, startTransition, useMemo, useCallback, useEffect, useState } from "react";
import { FileText, Loader2, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { oneDark, oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PanelHeader } from "@/components/PanelHeader";
import { OpenInEditorButton } from "./OpenInEditorButton";
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
import { highlightToLines } from "@/lib/syntax-highlight";
import type { ResolvedTheme } from "@/hooks/useTheme";
import type { EngineId, UIMessage } from "@/types";

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
  const fullPath = filePath.startsWith("/")
    ? filePath
    : cwd
      ? `${cwd.replace(/\/+$/, "")}/${filePath}`
      : filePath;
  const normalized = fullPath.replace(/\/+/g, "/");
  const isAbsolute = normalized.startsWith("/");
  const parts = normalized.split("/").filter(Boolean);

  if (parts.length <= 5) return `${isAbsolute ? "/" : ""}${parts.join("/")}`;

  return `${isAbsolute ? "/" : ""}${parts.slice(0, 3).join("/")}/.../${parts.slice(-2).join("/")}`;
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
      const next = computeFilePanelData(
        cacheSessionId,
        cacheKey,
        messages,
        cwd,
        activeEngine === "claude" && hasClaudeMd,
      );
      if (cancelled) return;
      startTransition(() => setData(next));
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

  const latestManualFile = manualFiles[0];
  useEffect(() => {
    if (latestManualFile) setSelectedPath(latestManualFile);
  }, [latestManualFile]);

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

  const selectedLanguage = selectedPath ? getLanguageFromPath(selectedPath) : "text";
  const highlightedLines = useMemo(() => {
    if (!reviewFile?.content || reviewFile.loading || reviewFile.error) return [];
    const syntaxStyle = resolvedTheme === "dark" ? oneDark : oneLight;
    return highlightToLines(reviewFile.content, selectedLanguage, syntaxStyle);
  }, [resolvedTheme, reviewFile, selectedLanguage]);
  const selectedDisplayPath = selectedPath ? compactDisplayPath(selectedPath, cwd) : "";

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
          <div className="shrink-0 overflow-x-auto overflow-y-hidden border-b border-border/50 [scrollbar-width:thin]">
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

          <div className="flex min-w-0 flex-1 flex-col">
            {selectedPath ? (
              <>
                <div className="flex h-8 shrink-0 items-center gap-2 border-b border-border/50 px-3">
                  <div className="min-w-0 flex-1">
                    <div
                      className="truncate text-xs font-medium text-muted-foreground/50"
                      title={selectedPath}
                    >
                      {selectedDisplayPath}
                    </div>
                  </div>
                  <OpenInEditorButton filePath={selectedPath} />
                </div>
                {reviewFile?.loading ? (
                  <div className="flex flex-1 flex-col items-center justify-center gap-1 p-4">
                    <Loader2 className="h-3 w-3 animate-spin text-foreground/25" />
                    <p className="text-center text-[10px] text-muted-foreground/40">
                      Loading file…
                    </p>
                  </div>
                ) : reviewFile?.error ? (
                  <div className="flex flex-1 flex-col items-center justify-center gap-1.5 p-6">
                    <FileText className="h-4 w-4 text-foreground/15" />
                    <p className="text-center text-[10px] leading-relaxed text-muted-foreground/40">
                      Unable to load file
                    </p>
                  </div>
                ) : (
                  <ScrollArea className="min-h-0 flex-1">
                    {selectedLanguage === "markdown" ? (
                      <div className="prose dark:prose-invert prose-sm max-w-none p-4 text-foreground/80 wrap-break-word">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {reviewFile?.content ?? ""}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <pre className="m-0 min-w-max p-3 font-mono text-[11px] leading-5 text-foreground/85">
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
                  </ScrollArea>
                )}
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
});
