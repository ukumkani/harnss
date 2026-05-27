import { memo, useMemo, useCallback, useEffect, useState } from "react";
import { FileDiff, Pencil, Plus, ChevronRight, ChevronDown, Loader2 } from "lucide-react";
import { DiffViewer } from "./DiffViewer";
import { OpenFileButton } from "./OpenFileButton";
import { UnifiedPatchViewer } from "./UnifiedPatchViewer";
import type { TurnSummary, FileChange } from "@/lib/chat/turn-changes";
import { useChatPersistedState } from "@/components/chat-ui-state";
import { CHAT_ROW_CLASS, CHAT_ROW_WIDTH_CLASS } from "@/components/lib/chat-layout";
import { getLanguageFromPath } from "@/lib/languages";
import { ToolCodeBlock } from "@/components/tool-renderers/ToolCodeBlock";

// ── Color/icon mapping (matches FilesPanel conventions) ──

const CHANGE_ICON = { modified: Pencil, created: Plus } as const;
const CHANGE_COLOR = { modified: "text-amber-400", created: "text-emerald-400" } as const;

// ── Inline file change viewer ──

const CurrentFilePreview = memo(function CurrentFilePreview({ filePath }: { filePath: string }) {
  const [state, setState] = useState<{
    content: string;
    loading: boolean;
    error: string | null;
  }>({ content: "", loading: true, error: null });
  const language = useMemo(() => getLanguageFromPath(filePath), [filePath]);

  useEffect(() => {
    let cancelled = false;
    setState({ content: "", loading: true, error: null });
    window.claude
      .readFile(filePath)
      .then((result) => {
        if (cancelled) return;
        setState({
          content: result.content ?? "",
          loading: false,
          error: result.error ?? null,
        });
      })
      .catch((error) => {
        if (cancelled) return;
        setState({
          content: "",
          loading: false,
          error: error instanceof Error ? error.message : "Unable to load file",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [filePath]);

  if (state.loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-xs text-foreground/35">
        <Loader2 className="h-3 w-3 animate-spin" />
        Loading current file content
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="px-3 py-2 text-xs italic text-muted-foreground/50">
        No diff content was provided, and the current file could not be loaded.
      </div>
    );
  }

  if (!state.content) {
    return (
      <div className="px-3 py-2 text-xs italic text-muted-foreground/50">
        No diff content was provided, and the current file is empty.
      </div>
    );
  }

  return (
    <ToolCodeBlock code={state.content} language={language} maxHeightClassName="max-h-[28rem]" />
  );
});

/** Renders a single file change inline — diff for Edit, content preview for Write/NotebookEdit. */
const InlineFileChange = memo(function InlineFileChange({
  change,
  isExpanded,
  onToggle,
  onOpenFile,
}: {
  change: FileChange;
  isExpanded: boolean;
  onToggle: () => void;
  onOpenFile?: (filePath: string) => void;
}) {
  const Icon = CHANGE_ICON[change.changeType];
  const color = CHANGE_COLOR[change.changeType];
  // Show directory path for context
  const dirParts = change.filePath.split("/");
  const dir = dirParts.length > 1 ? dirParts.slice(0, -1).join("/") + "/" : "";

  return (
    <div className="overflow-hidden">
      {/* File row — clickable to expand/collapse */}
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-start text-xs transition-colors cursor-pointer group"
      >
        {isExpanded ? (
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground/50" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/50" />
        )}
        <Icon className={`h-3.5 w-3.5 shrink-0 ${color}`} strokeWidth={2} />
        <span className="flex-1 min-w-0 truncate">
          <span className="font-medium text-foreground/80">{change.fileName}</span>
          {dir && (
            <span className="ms-1 text-muted-foreground/40 text-[10px]">{dir}</span>
          )}
        </span>
        <span className="text-muted-foreground/40 capitalize text-[10px] shrink-0">
          {change.changeType === "created" ? "new" : "modified"}
        </span>
        <OpenFileButton
          filePath={change.filePath}
          onOpenFile={onOpenFile}
          className="opacity-0 group-hover:opacity-100 transition-opacity"
        />
      </button>

      {/* Expanded: show diff or content */}
      {isExpanded && (
        <div>
          {change.unifiedDiff ? (
            <UnifiedPatchViewer
              diffText={change.unifiedDiff}
              filePath={change.filePath}
              borderless
              onOpenFile={onOpenFile}
            />
          ) : change.toolName === "Edit" && (change.oldString || change.newString) ? (
            <DiffViewer
              oldString={change.oldString ?? ""}
              newString={change.newString ?? ""}
              filePath={change.filePath}
              borderless
              onOpenFile={onOpenFile}
            />
          ) : (
            /* Write / NotebookEdit — show content as added text */
            change.content ? (
              <DiffViewer
                oldString=""
                newString={change.content ?? ""}
                filePath={change.filePath}
                borderless
                onOpenFile={onOpenFile}
              />
            ) : <CurrentFilePreview filePath={change.filePath} />
          )}
        </div>
      )}
    </div>
  );
});

// ── Main component ──

interface TurnChangesSummaryProps {
  summary: TurnSummary;
  onOpenFile?: (filePath: string) => void;
}

export const TurnChangesSummary = memo(function TurnChangesSummary({
  summary,
  onOpenFile,
}: TurnChangesSummaryProps) {
  const [isOpen, setIsOpen] = useChatPersistedState(
    `turn-summary:${summary.userMessageId}`,
    false,
  );
  const [expandedFiles, setExpandedFiles] = useChatPersistedState<Set<string>>(
    `turn-summary-files:${summary.userMessageId}`,
    () => new Set(),
  );

  // Deduplicate files: keep highest-priority change type per path (created > modified),
  // but preserve the full FileChange data for rendering diffs
  const uniqueFiles = useMemo(() => {
    const map = new Map<string, FileChange>();
    for (const c of summary.changes) {
      const existing = map.get(c.filePath);
      if (!existing || (c.changeType === "created" && existing.changeType === "modified")) {
        map.set(c.filePath, c);
      }
    }
    return [...map.values()];
  }, [summary.changes]);

  // Compact file name list for collapsed view (truncate if > 3 files)
  const compactFileList = useMemo(() => {
    const names = uniqueFiles.map((f) => f.fileName);
    if (names.length <= 3) return names.join(", ");
    return `${names.slice(0, 3).join(", ")} +${names.length - 3} more`;
  }, [uniqueFiles]);

  // Stats text: "2 modified · 1 new"
  const statsText = useMemo(() => {
    const parts: string[] = [];
    if (summary.modifiedCount > 0) parts.push(`${summary.modifiedCount} modified`);
    if (summary.createdCount > 0) parts.push(`${summary.createdCount} new`);
    return parts.join(" · ");
  }, [summary.modifiedCount, summary.createdCount]);

  const toggleFile = useCallback((filePath: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(filePath)) next.delete(filePath);
      else next.add(filePath);
      return next;
    });
  }, []);

  return (
    <div className={`flow-root ${CHAT_ROW_CLASS} animate-in fade-in slide-in-from-bottom-1 duration-300`}>
      <div className={`${CHAT_ROW_WIDTH_CLASS} w-full`}>
        <div className="rounded-lg border border-foreground/[0.09] animate-in fade-in slide-in-from-top-1 duration-200">
          {/* Collapsed header bar */}
          <button
            type="button"
            onClick={() => setIsOpen((prev) => !prev)}
            className="flex w-full items-center gap-2 px-3 py-2 text-start text-sm text-muted-foreground transition-colors cursor-pointer"
          >
            <FileDiff className="h-4 w-4 shrink-0 text-muted-foreground/70" />

            <span className="flex-1 min-w-0 truncate">
              <span className="font-medium text-foreground/80">
                {summary.fileCount} file{summary.fileCount !== 1 ? "s" : ""} changed
              </span>
              <span className="ms-1.5 text-xs text-muted-foreground/60">
                {compactFileList}
              </span>
            </span>

            {/* Stats pill */}
            <span className="shrink-0 text-xs text-muted-foreground/50">
              {statsText}
            </span>

            <ChevronRight
              className={`h-4 w-4 shrink-0 transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`}
            />
          </button>

          {/* Expanded: file list with inline diffs */}
          {isOpen && (
            <div className="px-2 pb-2 flex flex-col gap-1.5">
              {uniqueFiles.map((change) => (
                <InlineFileChange
                  key={`${change.filePath}::${change.messageId}`}
                  change={change}
                  isExpanded={expandedFiles.has(change.filePath)}
                  onToggle={() => toggleFile(change.filePath)}
                  onOpenFile={onOpenFile}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
