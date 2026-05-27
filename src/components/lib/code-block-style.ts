import type { CSSProperties } from "react";
import { oneDark, oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";

type ResolvedTheme = "light" | "dark";

export const CODE_BLOCK_SURFACE_CLASS = "bg-foreground/[0.05]";
export const CODE_BLOCK_HEADER_CLASS = "bg-transparent";

export const CODE_BLOCK_PRE_STYLE: CSSProperties = {
  margin: 0,
  padding: "12px",
  background: "transparent",
  textShadow: "none",
  color: "var(--foreground)",
  fontSize: "12px",
  lineHeight: "1.55",
};

export const CODE_BLOCK_CODE_TAG_STYLE: CSSProperties = {
  background: "transparent",
  color: "var(--foreground)",
  textShadow: "none",
};

export function getCodeSyntaxTheme(resolvedTheme: ResolvedTheme) {
  const base = resolvedTheme === "dark" ? oneDark : oneLight;
  return {
    ...base,
    'code[class*="language-"]': {
      ...(base['code[class*="language-"]'] ?? {}),
      background: "transparent",
      textShadow: "none",
    },
    'pre[class*="language-"]': {
      ...(base['pre[class*="language-"]'] ?? {}),
      background: "transparent",
      textShadow: "none",
    },
  };
}
