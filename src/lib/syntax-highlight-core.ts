import type { CSSProperties } from "react";
import { refractor } from "refractor/all";
import type { Root, Element, Text, ElementContent, RootContent } from "hast";

export type PrismThemeStyle = Record<string, CSSProperties>;

export interface HighlightToken {
  text: string;
  style?: CSSProperties;
}

export type HighlightLine = HighlightToken[];

function getCombinations(names: string[]): string[] {
  if (names.length === 0) return [];
  if (names.length === 1) return names;

  const result: string[] = [...names];
  for (let i = 0; i < names.length; i++) {
    for (let j = 0; j < names.length; j++) {
      if (i !== j) result.push(`${names[i]}.${names[j]}`);
    }
  }
  if (names.length >= 3) {
    for (let i = 0; i < names.length; i++) {
      for (let j = 0; j < names.length; j++) {
        for (let k = 0; k < names.length; k++) {
          if (i !== j && j !== k && i !== k) {
            result.push(`${names[i]}.${names[j]}.${names[k]}`);
          }
        }
      }
    }
  }
  return result;
}

function resolveTokenStyle(
  classNames: string[],
  stylesheet: PrismThemeStyle,
): CSSProperties {
  const names = classNames.filter((c) => c !== "token");
  const combos = getCombinations(names);
  let style: CSSProperties = {};
  for (const combo of combos) {
    if (stylesheet[combo]) style = { ...style, ...stylesheet[combo] };
  }
  return style;
}

export function highlightToLineTokens(
  code: string,
  language: string,
  style: PrismThemeStyle,
): HighlightLine[] {
  if (!code) return [];
  if (language === "text" || !refractor.registered(language)) {
    return code.split("\n").map((line) => [{ text: line || " " }]);
  }

  const trimmed = code.endsWith("\n") ? code.slice(0, -1) : code;
  const tree: Root = refractor.highlight(trimmed, language);

  const lines: HighlightLine[] = [[]];

  function pushText(text: string, inheritedStyle: CSSProperties | undefined): void {
    if (!text) return;
    lines[lines.length - 1].push(
      inheritedStyle && Object.keys(inheritedStyle).length > 0
        ? { text, style: inheritedStyle }
        : { text },
    );
  }

  function walk(
    node: RootContent | ElementContent,
    inheritedStyle: CSSProperties | undefined,
  ): void {
    if (node.type === "text") {
      const parts = (node as Text).value.split("\n");
      for (let i = 0; i < parts.length; i++) {
        if (i > 0) lines.push([]);
        pushText(parts[i], inheritedStyle);
      }
      return;
    }

    if (node.type === "element") {
      const el = node as Element;
      const classNames = (el.properties?.className as string[]) ?? [];
      const tokenStyle = resolveTokenStyle(classNames, style);
      const mergedStyle = inheritedStyle
        ? { ...inheritedStyle, ...tokenStyle }
        : Object.keys(tokenStyle).length > 0
          ? tokenStyle
          : undefined;

      for (const child of el.children) {
        walk(child, mergedStyle);
      }
    }
  }

  for (const node of tree.children) {
    walk(node, undefined);
  }

  return lines.map((tokens) => tokens.length === 0 ? [{ text: " " }] : tokens);
}
