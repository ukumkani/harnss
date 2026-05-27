import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import type { CSSProperties } from "react";
import { useResolvedTheme } from "@/hooks/useTheme";
import {
  CODE_BLOCK_CODE_TAG_STYLE,
  CODE_BLOCK_PRE_STYLE,
  CODE_BLOCK_SURFACE_CLASS,
  getCodeSyntaxTheme,
} from "@/components/lib/code-block-style";

interface ToolCodeBlockProps {
  code: string;
  language: string;
  maxHeightClassName?: string;
  hideHorizontalOverflow?: boolean;
}

const TOOL_CODE_STYLE: CSSProperties = {
  ...CODE_BLOCK_PRE_STYLE,
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
};

const CODE_TAG_STYLE = {
  ...CODE_BLOCK_CODE_TAG_STYLE,
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
};

export function ToolCodeBlock({
  code,
  language,
  maxHeightClassName = "max-h-48",
  hideHorizontalOverflow = false,
}: ToolCodeBlockProps) {
  const resolvedTheme = useResolvedTheme();
  const syntaxStyle = getCodeSyntaxTheme(resolvedTheme);
  const overflowClassName = hideHorizontalOverflow ? "overflow-y-auto overflow-x-hidden" : "overflow-auto";

  return (
    <div className={`${maxHeightClassName} ${overflowClassName} rounded-md ${CODE_BLOCK_SURFACE_CLASS}`}>
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
