import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark, oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import type { CSSProperties } from "react";
import { useResolvedTheme } from "@/hooks/useTheme";
import { INLINE_CODE_TAG_STYLE } from "@/lib/languages";

interface ToolCodeBlockProps {
  code: string;
  language: string;
  maxHeightClassName?: string;
}

const TOOL_CODE_STYLE: CSSProperties = {
  margin: 0,
  padding: "8px 12px",
  background: "transparent",
  textShadow: "none",
  fontSize: "11px",
  lineHeight: "1.55",
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
};

const CODE_TAG_STYLE = {
  ...INLINE_CODE_TAG_STYLE,
  color: "var(--foreground)",
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
};

export function ToolCodeBlock({
  code,
  language,
  maxHeightClassName = "max-h-48",
}: ToolCodeBlockProps) {
  const resolvedTheme = useResolvedTheme();
  const syntaxStyle = resolvedTheme === "dark" ? oneDark : oneLight;

  return (
    <div className={`${maxHeightClassName} overflow-auto rounded-md bg-foreground/[0.05]`}>
      <SyntaxHighlighter
        language={language}
        style={syntaxStyle}
        customStyle={TOOL_CODE_STYLE}
        codeTagProps={{ style: CODE_TAG_STYLE }}
        PreTag="div"
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}
