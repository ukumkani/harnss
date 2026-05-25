import { useEffect, useState } from "react";
import { DEFAULT_LANGUAGE, translateUiText } from "@/lib/i18n";
import type { AppFontFamily, AppLanguage, AppSettings } from "@/types";

const textOriginals = new WeakMap<Text, string>();
const TRANSLATED_ATTRS = ["placeholder", "title", "aria-label"] as const;
const TEXT_SKIP_SELECTOR = [
  "script",
  "style",
  "pre",
  "code",
  "textarea",
  "input",
  "[contenteditable='true']",
  "[data-chat-message]",
  ".prose",
].join(",");
const ATTRIBUTE_SKIP_SELECTOR = [
  "script",
  "style",
  "pre",
  "code",
  "textarea",
  "[contenteditable='true']",
  "[data-chat-message]",
  ".prose",
].join(",");

const FONT_FAMILY_CSS: Record<AppFontFamily, string> = {
  system: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  arial: "Arial, Helvetica, sans-serif",
  helvetica: "Helvetica, Arial, sans-serif",
  serif: 'Georgia, "Times New Roman", serif',
  mono: '"SF Mono", "Fira Code", "Cascadia Code", "JetBrains Mono", Menlo, monospace',
};

function getFontFamilyCss(fontFamily: AppSettings["appFontFamily"]): string {
  return FONT_FAMILY_CSS[fontFamily] ?? FONT_FAMILY_CSS.system;
}

function getBodyLineHeight(fontSize: number): number {
  return Math.ceil(fontSize * 1.36);
}

function applyTypographySettings(settings: AppSettings): void {
  const configuredFontSize = Number(settings.appBodyFontSize);
  const fontSize = Number.isFinite(configuredFontSize) && configuredFontSize >= 10 && configuredFontSize <= 30
    ? configuredFontSize
    : 12;
  const rootStyle = document.documentElement.style;
  rootStyle.setProperty("--app-font-family", getFontFamilyCss(settings.appFontFamily));
  rootStyle.setProperty("--app-body-font-size", `${fontSize}px`);
  rootStyle.setProperty("--app-body-line-height", `${getBodyLineHeight(fontSize)}px`);
}

function restoreTextNode(node: Text): string {
  const original = textOriginals.get(node);
  if (original != null) {
    node.nodeValue = original;
    return original;
  }
  const current = node.nodeValue ?? "";
  textOriginals.set(node, current);
  return current;
}

function translateTextNode(node: Text, language: AppLanguage): void {
  const parent = node.parentElement;
  if (!parent || parent.closest(TEXT_SKIP_SELECTOR)) return;

  const original = restoreTextNode(node);
  const trimmed = original.trim();
  if (!trimmed) return;

  const translated = translateUiText(language, trimmed);
  if (translated === trimmed) return;

  node.nodeValue = original.replace(trimmed, translated);
}

function getOriginalAttribute(element: Element, attr: typeof TRANSLATED_ATTRS[number]): string | null {
  const dataAttr = `data-i18n-original-${attr}`;
  const original = element.getAttribute(dataAttr);
  if (original != null) return original;

  const current = element.getAttribute(attr);
  if (current != null) {
    element.setAttribute(dataAttr, current);
  }
  return current;
}

function translateAttributes(element: Element, language: AppLanguage): void {
  if (element.closest(ATTRIBUTE_SKIP_SELECTOR)) return;

  for (const attr of TRANSLATED_ATTRS) {
    const original = getOriginalAttribute(element, attr);
    if (!original) continue;

    const translated = translateUiText(language, original.trim());
    const nextValue = translated === original.trim()
      ? original
      : original.replace(original.trim(), translated);
    if (element.getAttribute(attr) !== nextValue) {
      element.setAttribute(attr, nextValue);
    }
  }
}

function translateTree(root: ParentNode, language: AppLanguage): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    translateTextNode(node as Text, language);
    node = walker.nextNode();
  }

  const elementRoot = root instanceof Element ? root : document.body;
  translateAttributes(elementRoot, language);
  elementRoot.querySelectorAll("*").forEach((element) => translateAttributes(element, language));
}

export function I18nRuntime() {
  const [language, setLanguage] = useState<AppLanguage>(DEFAULT_LANGUAGE);

  useEffect(() => {
    let mounted = true;
    window.claude.settings.get().then((settings) => {
      if (!mounted || !settings) return;
      setLanguage(settings.language ?? DEFAULT_LANGUAGE);
      applyTypographySettings(settings);
    });
    const unsubscribe = window.claude.settings.onChanged((settings) => {
      setLanguage(settings.language ?? DEFAULT_LANGUAGE);
      applyTypographySettings(settings);
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    translateTree(document.body, language);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.TEXT_NODE) {
            translateTextNode(node as Text, language);
            return;
          }
          if (node.nodeType === Node.ELEMENT_NODE) {
            translateTree(node as Element, language);
          }
        });

        if (mutation.type === "attributes" && mutation.target instanceof Element) {
          translateAttributes(mutation.target, language);
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: TRANSLATED_ATTRS,
    });

    return () => observer.disconnect();
  }, [language]);

  return null;
}
