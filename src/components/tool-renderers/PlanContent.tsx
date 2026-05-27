import { Map } from "lucide-react";
import { createContext, useContext, type HTMLAttributes } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import type { UIMessage } from "@/types";
import { extractResultText } from "@/components/lib/tool-formatting";
import { guessLanguage } from "@/lib/languages";
import { GenericContent } from "./GenericContent";
import { ToolCodeBlock } from "./ToolCodeBlock";

const REMARK_PLUGINS = [remarkGfm];
const IsPlanBlockCodeContext = createContext(false);

function PlanCodeBlock(props: HTMLAttributes<HTMLElement>) {
  const { className, children } = props;
  const isBlock = useContext(IsPlanBlockCodeContext);
  const match = /language-(\w+)/.exec(String(className ?? ""));
  const code = String(children).replace(/\n$/, "");

  if (!isBlock) {
    return <code className="not-prose rounded px-1.5 py-0.5 text-xs font-mono text-foreground">{children}</code>;
  }

  return (
    <div className="not-prose my-2">
      <ToolCodeBlock code={code} language={match?.[1] ?? guessLanguage(code) ?? "text"} />
    </div>
  );
}

const PLAN_MARKDOWN_COMPONENTS: Components = {
  code: PlanCodeBlock,
  pre({ children }) {
    return (
      <IsPlanBlockCodeContext.Provider value={true}>
        {children}
      </IsPlanBlockCodeContext.Provider>
    );
  },
};

// ── EnterPlanMode: subtle mode-transition indicator ──

export function EnterPlanModeContent({ message }: { message: UIMessage }) {
  const resultText = message.toolResult ? extractResultText(message.toolResult) : "";

  return (
    <div className="rounded-md bg-foreground/[0.017] px-3 py-2 text-xs text-foreground/50">
      {resultText || "Exploring codebase and designing implementation approach."}
    </div>
  );
}

// ── ExitPlanMode: rendered plan markdown ──

export function ExitPlanModeContent({ message }: { message: UIMessage }) {
  const plan = String(message.toolInput?.plan ?? "");
  const filePath = String(message.toolInput?.filePath ?? "");
  const fileName = filePath ? filePath.split("/").pop() : null;

  if (!plan) return <GenericContent message={message} />;

  return (
    <div className="rounded-lg border border-border/50 overflow-hidden">
      {/* Header bar with plan file name */}
      {fileName && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-foreground/[0.025] border-b border-border/40">
          <Map className="h-3 w-3 text-foreground/40" />
          <span className="text-[11px] text-foreground/50 font-mono truncate">{fileName}</span>
        </div>
      )}

      {/* Plans should always render fully expanded. */}
      <div className="relative">
        <div className="px-4 py-3 prose dark:prose-invert prose-sm max-w-none text-foreground/80 text-[12.5px]">
          <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={PLAN_MARKDOWN_COMPONENTS}>{plan}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
