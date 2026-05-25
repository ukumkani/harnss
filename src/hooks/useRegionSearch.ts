import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from "react";

const HIGHLIGHT_SELECTOR = "[data-region-search-highlight]";
const REGION_SEARCH_HIGHLIGHT_NAME = "region-search";
const REGION_SEARCH_STYLE_ID = "region-search-highlight-style";
const SKIP_SELECTOR = [
  "script",
  "style",
  "textarea",
  "input",
  "[contenteditable='true']",
  "[data-region-search-ui]",
].join(",");

type CssHighlightRegistry = {
  set: (name: string, highlight: unknown) => void;
  delete: (name: string) => void;
};

type CssHighlightWindow = Window & typeof globalThis & {
  Highlight?: new (...ranges: Range[]) => unknown;
  CSS?: typeof CSS & { highlights?: CssHighlightRegistry };
};

export function splitSearchTerms(query: string): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];

  for (const term of query.trim().split(/\s+/)) {
    const normalized = term.toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    terms.push(normalized);
  }

  return terms;
}

export function isEditableSearchTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

function clearRegionHighlights(root: HTMLElement): void {
  const marks = Array.from(root.querySelectorAll<HTMLElement>(HIGHLIGHT_SELECTOR));
  for (const mark of marks) {
    const parent = mark.parentNode;
    if (!parent) continue;
    parent.replaceChild(root.ownerDocument.createTextNode(mark.textContent ?? ""), mark);
    parent.normalize();
  }
}

function findNextMatch(text: string, terms: string[], fromIndex: number): { index: number; length: number } | null {
  let bestIndex = -1;
  let bestLength = 0;

  for (const term of terms) {
    const index = text.indexOf(term, fromIndex);
    if (index === -1) continue;
    if (bestIndex === -1 || index < bestIndex || (index === bestIndex && term.length > bestLength)) {
      bestIndex = index;
      bestLength = term.length;
    }
  }

  return bestIndex === -1 ? null : { index: bestIndex, length: bestLength };
}

function createTextNodeRanges(node: Text, terms: string[]): Range[] {
  const text = node.nodeValue ?? "";
  const lowerText = text.toLowerCase();
  const doc = node.ownerDocument;
  const ranges: Range[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const match = findNextMatch(lowerText, terms, cursor);
    if (!match) break;

    const range = doc.createRange();
    range.setStart(node, match.index);
    range.setEnd(node, match.index + match.length);
    ranges.push(range);
    cursor = match.index + match.length;
  }

  return ranges;
}

function collectSearchRanges(root: HTMLElement, terms: string[]): Range[] {
  const view = root.ownerDocument.defaultView;
  if (!view) return [];

  const textNodes: Text[] = [];
  const walker = root.ownerDocument.createTreeWalker(root, view.NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || parent.closest(SKIP_SELECTOR)) return view.NodeFilter.FILTER_REJECT;
      if (!node.nodeValue?.trim()) return view.NodeFilter.FILTER_REJECT;
      return view.NodeFilter.FILTER_ACCEPT;
    },
  });

  while (walker.nextNode()) {
    textNodes.push(walker.currentNode as Text);
  }

  return textNodes.flatMap((node) => createTextNodeRanges(node, terms));
}

function applyCssHighlights(root: HTMLElement, highlightName: string, ranges: Range[]): boolean {
  const view = root.ownerDocument.defaultView as CssHighlightWindow | null;
  if (!view?.CSS?.highlights || !view.Highlight) return false;
  if (!root.ownerDocument.getElementById(REGION_SEARCH_STYLE_ID)) {
    const style = root.ownerDocument.createElement("style");
    style.id = REGION_SEARCH_STYLE_ID;
    style.textContent = `
      ::highlight(${REGION_SEARCH_HIGHLIGHT_NAME}) {
        background-color: color-mix(in oklab, #3ddc84 45%, transparent);
        color: inherit;
      }
    `;
    root.ownerDocument.head.appendChild(style);
  }
  view.CSS.highlights.set(highlightName, new view.Highlight(...ranges));
  return true;
}

function clearCssHighlights(root: HTMLElement, highlightName: string): void {
  const view = root.ownerDocument.defaultView as CssHighlightWindow | null;
  view?.CSS?.highlights?.delete(highlightName);
}

interface RegionSearchState {
  open: boolean;
  query: string;
  currentIndex: number;
  matchCount: number;
  openSearch: () => void;
  closeSearch: () => void;
  setQuery: (query: string) => void;
  goNext: () => void;
  goPrev: () => void;
  handleKeyDownCapture: (event: ReactKeyboardEvent<HTMLElement>) => void;
}

export function useRegionSearch(
  rootRef: RefObject<HTMLElement | null>,
  refreshKey?: unknown,
): RegionSearchState {
  const [open, setOpen] = useState(false);
  const [query, setQueryState] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [matchCount, setMatchCount] = useState(0);
  const rangesRef = useRef<Range[]>([]);
  const highlightNameRef = useRef(REGION_SEARCH_HIGHLIGHT_NAME);
  const terms = useMemo(() => splitSearchTerms(query), [query]);

  const scrollToMatch = useCallback((index: number) => {
    const range = rangesRef.current[index];
    const node = range?.commonAncestorContainer;
    const element = node instanceof Element ? node : node?.parentElement;
    element?.scrollIntoView({ block: "center", inline: "nearest" });
  }, []);

  const refreshHighlights = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;

    clearCssHighlights(root, highlightNameRef.current);
    clearRegionHighlights(root);
    if (!open || terms.length === 0) {
      rangesRef.current = [];
      setMatchCount(0);
      setCurrentIndex(0);
      return;
    }

    const ranges = collectSearchRanges(root, terms);
    applyCssHighlights(root, highlightNameRef.current, ranges);
    rangesRef.current = ranges;
    setMatchCount(ranges.length);
    setCurrentIndex((current) => Math.min(current, Math.max(0, ranges.length - 1)));
  }, [open, rootRef, terms]);

  useEffect(() => {
    refreshHighlights();
    return () => {
      const root = rootRef.current;
      if (root) {
        clearCssHighlights(root, highlightNameRef.current);
        clearRegionHighlights(root);
      }
    };
  }, [refreshHighlights, refreshKey, rootRef]);

  const openSearch = useCallback(() => {
    setOpen(true);
  }, []);

  const closeSearch = useCallback(() => {
    const root = rootRef.current;
    if (root) {
      clearCssHighlights(root, highlightNameRef.current);
      clearRegionHighlights(root);
    }
    rangesRef.current = [];
    setMatchCount(0);
    setCurrentIndex(0);
    setQueryState("");
    setOpen(false);
  }, [rootRef]);

  const setQuery = useCallback((nextQuery: string) => {
    setQueryState(nextQuery);
    setCurrentIndex(0);
  }, []);

  const goNext = useCallback(() => {
    setCurrentIndex((current) => {
      if (matchCount === 0) return 0;
      const next = (current + 1) % matchCount;
      scrollToMatch(next);
      return next;
    });
  }, [matchCount, scrollToMatch]);

  const goPrev = useCallback(() => {
    setCurrentIndex((current) => {
      if (matchCount === 0) return 0;
      const next = (current - 1 + matchCount) % matchCount;
      scrollToMatch(next);
      return next;
    });
  }, [matchCount, scrollToMatch]);

  const handleKeyDownCapture = useCallback((event: ReactKeyboardEvent<HTMLElement>) => {
    if (isEditableSearchTarget(event.target)) return;

    if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === "f") {
      event.preventDefault();
      event.stopPropagation();
      event.nativeEvent.stopImmediatePropagation?.();
      openSearch();
      return;
    }

    if (open && event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeSearch();
    }
  }, [closeSearch, open, openSearch]);

  return {
    open,
    query,
    currentIndex,
    matchCount,
    openSearch,
    closeSearch,
    setQuery,
    goNext,
    goPrev,
    handleKeyDownCapture,
  };
}
