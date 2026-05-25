import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from "react";

const HIGHLIGHT_SELECTOR = "[data-region-search-highlight]";
const SKIP_SELECTOR = [
  "script",
  "style",
  "textarea",
  "input",
  "[contenteditable='true']",
  "[data-region-search-ui]",
].join(",");

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

function highlightTextNode(node: Text, terms: string[]): HTMLElement[] {
  const text = node.nodeValue ?? "";
  const lowerText = text.toLowerCase();
  const doc = node.ownerDocument;
  const fragment = doc.createDocumentFragment();
  const marks: HTMLElement[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const match = findNextMatch(lowerText, terms, cursor);
    if (!match) break;

    if (match.index > cursor) {
      fragment.appendChild(doc.createTextNode(text.slice(cursor, match.index)));
    }

    const mark = doc.createElement("mark");
    mark.dataset.regionSearchHighlight = "true";
    mark.className = "rounded-sm bg-yellow-300/50 px-0.5 text-inherit dark:bg-yellow-300/25";
    mark.textContent = text.slice(match.index, match.index + match.length);
    fragment.appendChild(mark);
    marks.push(mark);
    cursor = match.index + match.length;
  }

  if (marks.length === 0) return [];
  if (cursor < text.length) {
    fragment.appendChild(doc.createTextNode(text.slice(cursor)));
  }

  node.parentNode?.replaceChild(fragment, node);
  return marks;
}

function applyRegionHighlights(root: HTMLElement, terms: string[]): HTMLElement[] {
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

  return textNodes.flatMap((node) => highlightTextNode(node, terms));
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
  const marksRef = useRef<HTMLElement[]>([]);
  const terms = useMemo(() => splitSearchTerms(query), [query]);

  const scrollToMatch = useCallback((index: number) => {
    const mark = marksRef.current[index];
    if (!mark) return;
    mark.scrollIntoView({ block: "center", inline: "nearest" });
  }, []);

  const refreshHighlights = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;

    clearRegionHighlights(root);
    if (!open || terms.length === 0) {
      marksRef.current = [];
      setMatchCount(0);
      setCurrentIndex(0);
      return;
    }

    const marks = applyRegionHighlights(root, terms);
    marksRef.current = marks;
    setMatchCount(marks.length);
    setCurrentIndex((current) => Math.min(current, Math.max(0, marks.length - 1)));
  }, [open, rootRef, terms]);

  useEffect(() => {
    refreshHighlights();
    return () => {
      const root = rootRef.current;
      if (root) clearRegionHighlights(root);
    };
  }, [refreshHighlights, refreshKey, rootRef]);

  useEffect(() => {
    if (!open || matchCount === 0) return;
    scrollToMatch(currentIndex);
  }, [currentIndex, matchCount, open, scrollToMatch]);

  const openSearch = useCallback(() => {
    setOpen(true);
  }, []);

  const closeSearch = useCallback(() => {
    const root = rootRef.current;
    if (root) clearRegionHighlights(root);
    marksRef.current = [];
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
      return (current + 1) % matchCount;
    });
  }, [matchCount]);

  const goPrev = useCallback(() => {
    setCurrentIndex((current) => {
      if (matchCount === 0) return 0;
      return (current - 1 + matchCount) % matchCount;
    });
  }, [matchCount]);

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
