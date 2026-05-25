import {
  APP_SIDEBAR_WIDTH,
  ISLAND_LAYOUT_MARGIN,
  SPLIT_HANDLE_WIDTH,
  WINDOWS_FRAME_BUFFER_WIDTH,
  MAX_SPLIT_PANES,
  getMinLayoutItemSizePx,
  getMinChatWidth,
  getResizeHandleWidth,
  getToolPickerWidth,
} from "@/lib/layout/constants";
import type { TopRowLayoutItemKind } from "@/lib/layout/workspace-constraints";

export type SplitAddRejectionReason =
  | "missing-session"
  | "active-session"
  | "duplicate-session"
  | "insufficient-width";

export interface SplitAddGuardInput {
  sessionId: string | null | undefined;
  activeSessionId: string | null;
  visibleSessionIds: readonly string[];
  maxPaneCount: number;
}

export interface AppMinimumWidthInput {
  sidebarOpen: boolean;
  isIslandLayout: boolean;
  hasActiveSession: boolean;
  hasRightPanel: boolean;
  hasToolsColumn: boolean;
  toolsColumnWidth?: number;
  isSplitViewEnabled: boolean;
  splitPaneCount: number;
  splitTopRowItemKinds?: TopRowLayoutItemKind[];
  isWindows: boolean;
}

export function getRequiredSplitContentWidth(paneCount: number): number {
  if (paneCount <= 1) return 0;
  return SPLIT_HANDLE_WIDTH * (paneCount - 1);
}

export function getMaxVisibleSplitPaneCount(availableWidth: number): number {
  if (!Number.isFinite(availableWidth) || availableWidth <= 0) {
    return 1;
  }

  const minPaneWidth = getMinLayoutItemSizePx(availableWidth);
  const paneWidthWithHandle = minPaneWidth + SPLIT_HANDLE_WIDTH;
  return Math.min(
    MAX_SPLIT_PANES,
    Math.max(1, Math.floor((availableWidth + SPLIT_HANDLE_WIDTH) / paneWidthWithHandle)),
  );
}

export function getSplitAddRejectionReason({
  sessionId,
  activeSessionId,
  visibleSessionIds,
  maxPaneCount,
}: SplitAddGuardInput): SplitAddRejectionReason | null {
  const normalizedSessionId = typeof sessionId === "string" ? sessionId.trim() : "";
  if (!normalizedSessionId) {
    return "missing-session";
  }

  if (normalizedSessionId === activeSessionId) {
    return "active-session";
  }

  if (visibleSessionIds.includes(normalizedSessionId)) {
    return "duplicate-session";
  }

  if (visibleSessionIds.length >= maxPaneCount) {
    return "insufficient-width";
  }

  return null;
}

export function getAppMinimumWidth({
  sidebarOpen,
  isIslandLayout,
  hasActiveSession,
  hasRightPanel,
  hasToolsColumn,
  toolsColumnWidth,
  isSplitViewEnabled,
  splitPaneCount,
  splitTopRowItemKinds,
  isWindows,
}: AppMinimumWidthInput): number {
  const sidebarWidth = sidebarOpen ? APP_SIDEBAR_WIDTH : 0;
  const outerMarginWidth = isIslandLayout ? ISLAND_LAYOUT_MARGIN : 0;
  const windowsFrameWidth = isWindows ? WINDOWS_FRAME_BUFFER_WIDTH : 0;

  if (isSplitViewEnabled && splitPaneCount > 1) {
    const splitContentWidth = splitTopRowItemKinds && splitTopRowItemKinds.length > 0
      ? Math.max(0, splitTopRowItemKinds.length - 1) * SPLIT_HANDLE_WIDTH
      : getRequiredSplitContentWidth(splitPaneCount);
    return sidebarWidth
      + outerMarginWidth
      + splitContentWidth
      + windowsFrameWidth;
  }

  const minSingleChatWidth = hasActiveSession ? 0 : getMinChatWidth(isIslandLayout);
  let minimumWidth = sidebarWidth + outerMarginWidth + minSingleChatWidth + windowsFrameWidth;
  if (!hasActiveSession) {
    return minimumWidth;
  }

  minimumWidth += getToolPickerWidth(isIslandLayout);
  if (hasRightPanel) {
    minimumWidth += getResizeHandleWidth(isIslandLayout);
  }
  if (hasToolsColumn) {
    minimumWidth += getResizeHandleWidth(isIslandLayout);
  }
  return minimumWidth;
}
