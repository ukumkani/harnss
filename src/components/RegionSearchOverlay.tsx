import { memo, useCallback, useEffect, useRef } from "react";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";

interface RegionSearchOverlayProps {
  query: string;
  currentIndex: number;
  matchCount: number;
  onQueryChange: (query: string) => void;
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
}

export const RegionSearchOverlay = memo(function RegionSearchOverlay({
  query,
  currentIndex,
  matchCount,
  onQueryChange,
  onClose,
  onNext,
  onPrev,
}: RegionSearchOverlayProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      if (event.shiftKey) onPrev();
      else onNext();
    }
  }, [onClose, onNext, onPrev]);

  const hasQuery = query.trim().length > 0;

  return (
    <div
      data-region-search-ui
      className="absolute end-3 top-3 z-30 animate-in fade-in slide-in-from-top-2 duration-150"
    >
      <div className="flex items-center gap-1 rounded-lg border border-border/50 bg-background/95 px-2 py-1 shadow-lg backdrop-blur-sm">
        <Search className="h-3.5 w-3.5 shrink-0 text-foreground/65" />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search keywords..."
          className="w-44 bg-transparent px-1.5 py-0.5 text-sm text-foreground placeholder:text-muted-foreground/55 outline-none"
        />
        {hasQuery && (
          <span className="shrink-0 text-xs tabular-nums text-foreground/65">
            {matchCount === 0 ? "0" : `${currentIndex + 1}/${matchCount}`}
          </span>
        )}
        <button
          type="button"
          onClick={onPrev}
          disabled={matchCount === 0}
          className="rounded p-0.5 text-foreground/65 transition-colors hover:text-foreground disabled:opacity-30"
          aria-label="Previous match"
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={matchCount === 0}
          className="rounded p-0.5 text-foreground/65 transition-colors hover:text-foreground disabled:opacity-30"
          aria-label="Next match"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-0.5 text-foreground/65 transition-colors hover:text-foreground"
          aria-label="Close search"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
});
