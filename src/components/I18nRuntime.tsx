import { useEffect, useState } from "react";
import { DEFAULT_LANGUAGE, translateUiText } from "@/lib/i18n";
import type { AppLanguage } from "@/types";

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
      if (mounted) setLanguage(settings?.language ?? DEFAULT_LANGUAGE);
    });
    const unsubscribe = window.claude.settings.onChanged((settings) => {
      setLanguage(settings.language ?? DEFAULT_LANGUAGE);
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
