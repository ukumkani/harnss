import { useMemo } from "react";
import { ChevronsUpDown } from "lucide-react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import type { UIMessage } from "@/types";
import { getLanguageFromPath, guessLanguage, INLINE_HIGHLIGHT_STYLE, INLINE_CODE_TAG_STYLE } from "@/lib/languages";
import { useResolvedTheme } from "@/hooks/useTheme";
import { formatBashResult } from "@/components/lib/tool-formatting";
import { useChatPersistedState } from "@/components/chat-ui-state";
import { renderAnsi, stripAnsi } from "@/lib/ansi";
import { ToolCodeBlock } from "./ToolCodeBlock";

const MAX_OUTPUT_LINES = 200;
const COMMAND_CODE_TAG_STYLE = {
  ...INLINE_CODE_TAG_STYLE,
  color: "var(--foreground)",
};

function inferOutputLanguage(command: unknown, output: string): string | null {
  const cleanOutput = stripAnsi(output);
  const commandText = typeof command === "string" ? command : "";
  const fileMatch = commandText.match(/\b(?:cat|sed|awk|nl|head|tail|less|more)\b[\s\S]*?([./~\w-][^\s|;&<>]*\.[A-Za-z0-9]+)\b/);
  if (fileMatch) {
    const language = getLanguageFromPath(fileMatch[1]);
    if (language !== "text") return language;
  }
  return guessLanguage(cleanOutput);
}

export function BashContent({ message }: { message: UIMessage }) {
  const command = message.toolInput?.command;
  const result = message.toolResult;
  const resolvedTheme = useResolvedTheme();
  const syntaxStyle = resolvedTheme === "dark" ? oneDark : oneLight;
  const [expanded, setExpanded] = useChatPersistedState(`bash:${message.id}`, false);

  const formattedResult = useMemo(() => (result ? formatBashResult(result) : ""), [result]);
  const hasOutput = !!formattedResult && formattedResult !== "(no output)";
  const { displayText, totalLines, isTruncated } = useMemo(() => {
    if (!formattedResult) return { displayText: "", totalLines: 0, isTruncated: false };
    const lines = formattedResult.split("\n");
    const total = lines.length;
    if (expanded || total <= MAX_OUTPUT_LINES) {
      return { displayText: formattedResult, totalLines: total, isTruncated: false };
    }
    return {
      displayText: lines.slice(0, MAX_OUTPUT_LINES).join("\n"),
      totalLines: total,
      isTruncated: true,
    };
  }, [formattedResult, expanded]);
  const outputLanguage = useMemo(
    () => (hasOutput ? inferOutputLanguage(command, displayText) : null),
    [command, displayText, hasOutput],
  );
  const cleanDisplayText = useMemo(() => stripAnsi(displayText), [displayText]);

  return (
    <div className="text-xs">
      <div className="rounded-md bg-foreground/[0.05] font-mono text-[11px] text-foreground whitespace-pre-wrap wrap-break-word">
        {/* Command */}
        {!!command && (
          <div className="px-3 py-2">
            <span className="text-foreground/65 select-none">$ </span>
            <SyntaxHighlighter
              language="bash"
              style={syntaxStyle}
              customStyle={INLINE_HIGHLIGHT_STYLE}
              codeTagProps={{ style: COMMAND_CODE_TAG_STYLE }}
              PreTag="span"
              CodeTag="span"
            >
              {String(command)}
            </SyntaxHighlighter>
          </div>
        )}

        {/* Output */}
        {hasOutput && (
          <>
            <div className="mx-3 h-px bg-foreground/[0.05]" />
            {outputLanguage ? (
              <ToolCodeBlock code={cleanDisplayText} language={outputLanguage} />
            ) : (
              <div className="max-h-48 overflow-auto px-3 py-2 text-foreground">
                {renderAnsi(displayText)}
              </div>
            )}
          </>
        )}
      </div>

      {isTruncated && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 flex items-center gap-1 text-[10px] font-medium text-foreground/35 hover:text-foreground/60 transition-colors"
        >
          <ChevronsUpDown className="h-3 w-3" />
          Show full output ({totalLines} lines)
        </button>
      )}
      {expanded && totalLines > MAX_OUTPUT_LINES && (
        <button
          onClick={() => setExpanded(false)}
          className="mt-1 flex items-center gap-1 text-[10px] font-medium text-foreground/35 hover:text-foreground/60 transition-colors"
        >
          <ChevronsUpDown className="h-3 w-3" />
          Collapse
        </button>
      )}
    </div>
  );
}
