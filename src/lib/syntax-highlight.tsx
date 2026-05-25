import { type ReactNode } from "react";
import {
  highlightToLineTokens,
  type PrismThemeStyle,
  type HighlightLine,
} from "@/lib/syntax-highlight-core";

// ── Full-file tokenization ──

/**
 * Tokenizes full content with file-level context using refractor (Prism),
 * then splits into per-line ReactNodes.
 *
 * This preserves multi-line construct highlighting (block comments, template
 * literals, multi-line strings) which is lost when highlighting individual lines.
 */
export function highlightToLines(
  code: string,
  language: string,
  style: PrismThemeStyle,
): ReactNode[] {
  return renderHighlightedLines(highlightToLineTokens(code, language, style));
}

export function renderHighlightedLines(lines: HighlightLine[]): ReactNode[] {
  let keyCounter = 0;
  return lines.map((tokens, i) => {
    if (tokens.length === 0) return " ";
    if (tokens.length === 1 && !tokens[0].style) return tokens[0].text;

    const nodes = tokens.map((token) => (
      token.style
        ? <span key={keyCounter++} style={token.style}>{token.text}</span>
        : token.text
    ));
    return <span key={`line-${i}`}>{nodes}</span>;
  });
}
