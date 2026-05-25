import { useCallback, useState } from "react";
import {
  MAX_BOTTOM_TOOLS_HEIGHT,
  MIN_BOTTOM_TOOLS_HEIGHT,
  getMinLayoutItemSizePx,
} from "@/lib/layout/constants";

/**
 * Manages the vertical resize handle for the bottom tool dock.
 *
 * Encapsulates the identical drag logic that was previously duplicated
 * as `handleSplitBottomResizeStart` and `handleMainBottomResizeStart`
 * in AppLayout.
 */
export function useBottomHeightResize(
  bottomHeight: number,
  setBottomHeight: (height: number) => void,
): {
  isResizing: boolean;
  handleResizeStart: (event: React.MouseEvent) => void;
} {
  const [isResizing, setIsResizing] = useState(false);

  const handleResizeStart = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    setIsResizing(true);
    const startY = event.clientY;
    const startHeight = bottomHeight;

    const handleMove = (moveEvent: MouseEvent) => {
      const delta = startY - moveEvent.clientY;
      const minHeight = Math.max(MIN_BOTTOM_TOOLS_HEIGHT, getMinLayoutItemSizePx(window.innerHeight));
      const maxHeight = Math.max(minHeight, Math.min(MAX_BOTTOM_TOOLS_HEIGHT, window.innerHeight - minHeight));
      const next = Math.max(minHeight, Math.min(maxHeight, startHeight + delta));
      setBottomHeight(next);
    };

    const handleUp = () => {
      setIsResizing(false);
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
    };

    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);
  }, [bottomHeight, setBottomHeight]);

  return { isResizing, handleResizeStart };
}
