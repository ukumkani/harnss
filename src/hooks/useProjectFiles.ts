import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FileTreeNode } from "@/lib/file-tree";
import { captureException } from "@/lib/analytics/analytics";

interface UseProjectFilesReturn {
  tree: FileTreeNode[] | null;
  loading: boolean;
  error: string | null;
  /** Refresh the root and currently expanded directories only. */
  refresh: () => void;
  /** Refresh one visible directory. */
  refreshDir: (dirPath: string) => Promise<void>;
  /** Load a directory when the user opens it. */
  loadDir: (dirPath: string, options?: { force?: boolean }) => Promise<void>;
}

interface ReplaceResult {
  nodes: FileTreeNode[];
  changed: boolean;
}

function normalizeDirPath(dirPath: string): string {
  return dirPath.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

function dirname(p: string): string {
  const normalized = normalizeDirPath(p);
  const idx = normalized.lastIndexOf("/");
  return idx === -1 ? "" : normalized.slice(0, idx);
}

function replaceDirectoryChildren(
  nodes: FileTreeNode[],
  dirPath: string,
  children: FileTreeNode[],
): ReplaceResult {
  let changed = false;
  const next = nodes.map((node) => {
    if (node.type !== "directory") return node;
    if (node.path === dirPath) {
      changed = true;
      return { ...node, children };
    }
    if (dirPath.startsWith(`${node.path}/`) && node.children) {
      const result = replaceDirectoryChildren(node.children, dirPath, children);
      if (result.changed) {
        changed = true;
        return { ...node, children: result.nodes };
      }
    }
    return node;
  });
  return { nodes: next, changed };
}

/**
 * Fetches Project Files lazily. Only the root and user-expanded directories are
 * loaded. Search and full-tree statistics stay disabled until we have a stable
 * incremental index instead of a whole-project scan.
 */
export function useProjectFiles(
  cwd: string | undefined,
  enabled: boolean,
  expandedDirs: Set<string>,
): UseProjectFilesReturn {
  const [tree, setTree] = useState<FileTreeNode[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cwdRef = useRef(cwd);
  const enabledRef = useRef(enabled);
  const expandedDirsRef = useRef(expandedDirs);
  const treeRef = useRef<FileTreeNode[] | null>(null);
  const loadedDirsRef = useRef(new Set<string>());
  const loadingDirsRef = useRef(new Set<string>());
  const loadingPromisesRef = useRef(new Map<string, Promise<void>>());
  const versionRef = useRef(0);

  useEffect(() => {
    cwdRef.current = cwd;
    enabledRef.current = enabled;
    expandedDirsRef.current = expandedDirs;
  }, [cwd, enabled, expandedDirs]);

  const loadDir = useCallback(async (dirPath: string, options?: { force?: boolean }) => {
    const currentCwd = cwdRef.current;
    if (!currentCwd || !enabledRef.current) return;

    const requestVersion = versionRef.current;
    const normalizedDir = normalizeDirPath(dirPath);
    if (normalizedDir !== "" && !treeRef.current) {
      await loadDir("", { force: true });
      if (requestVersion !== versionRef.current || !treeRef.current) return;
    }
    if (!options?.force && loadedDirsRef.current.has(normalizedDir)) return;
    const existingLoad = loadingPromisesRef.current.get(normalizedDir);
    if (existingLoad) {
      await existingLoad;
      return;
    }

    const loadPromise = (async () => {
      loadingDirsRef.current.add(normalizedDir);
      setLoading(true);
      setError(null);

      try {
        const result = await window.claude.files.listDir(currentCwd, normalizedDir);
        if (requestVersion !== versionRef.current || currentCwd !== cwdRef.current || !enabledRef.current) return;
        if (result.error) throw new Error(result.error);

        if (normalizedDir === "") {
          loadedDirsRef.current.add(normalizedDir);
          treeRef.current = result.entries;
          setTree(result.entries);
          return;
        }

        const currentTree = treeRef.current;
        if (!currentTree) return;
        const resultTree = replaceDirectoryChildren(currentTree, normalizedDir, result.entries);
        if (resultTree.changed) {
          treeRef.current = resultTree.nodes;
          setTree(resultTree.nodes);
          loadedDirsRef.current.add(normalizedDir);
        }
      } catch (err) {
        if (requestVersion !== versionRef.current) return;
        captureException(err instanceof Error ? err : new Error(String(err)), { label: "FILE_LIST_DIR_ERR" });
        setError(err instanceof Error ? err.message : "Failed to list files");
      } finally {
        if (requestVersion !== versionRef.current) return;
        loadingDirsRef.current.delete(normalizedDir);
        loadingPromisesRef.current.delete(normalizedDir);
        if (loadingDirsRef.current.size === 0) {
          setLoading(false);
        }
      }
    })();
    loadingPromisesRef.current.set(normalizedDir, loadPromise);
    await loadPromise;
  }, []);

  useEffect(() => {
    versionRef.current += 1;
    loadedDirsRef.current.clear();
    loadingDirsRef.current.clear();
    loadingPromisesRef.current.clear();
    treeRef.current = null;
    setTree(null);
    setError(null);
    setLoading(false);
    if (cwd && enabled) {
      void loadDir("", { force: true });
    }
  }, [cwd, enabled, loadDir]);

  const expandedDirList = useMemo(
    () => Array.from(expandedDirs).map(normalizeDirPath).sort((a, b) => a.split("/").length - b.split("/").length),
    [expandedDirs],
  );

  useEffect(() => {
    if (!cwd || !enabled) return;
    let cancelled = false;
    void (async () => {
      for (const dir of expandedDirList) {
        if (cancelled) return;
        await loadDir(dir);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cwd, enabled, expandedDirList, loadDir]);

  const refreshDir = useCallback(async (dirPath: string) => {
    await loadDir(dirPath, { force: true });
  }, [loadDir]);

  const refresh = useCallback(() => {
    const openDirs = new Set(["", ...Array.from(expandedDirsRef.current).map(normalizeDirPath)]);
    for (const dir of openDirs) {
      void loadDir(dir, { force: true });
    }
  }, [loadDir]);

  useEffect(() => {
    if (!cwd || !enabled) return;

    void window.claude.files.watch(cwd);
    const unsubscribe = window.claude.files.onChanged(({ cwd: changedCwd, path, paths }) => {
      if (changedCwd !== cwd) return;
      const openDirs = new Set(["", ...Array.from(expandedDirsRef.current).map(normalizeDirPath)]);
      const changedPaths = paths?.length ? paths : (typeof path === "string" ? [path] : []);
      const refreshDirs = new Set<string>();
      if (changedPaths.length === 0) {
        for (const dir of openDirs) {
          refreshDirs.add(dir);
        }
      } else {
        for (const changedPath of changedPaths) {
          const parentDir = dirname(changedPath);
          if (openDirs.has(parentDir)) {
            refreshDirs.add(parentDir);
          }
        }
      }
      for (const dir of refreshDirs) {
        void loadDir(dir, { force: true });
      }
    });

    return () => {
      unsubscribe();
      void window.claude.files.unwatch(cwd);
    };
  }, [cwd, enabled, loadDir]);

  return { tree, loading, error, refresh, refreshDir, loadDir };
}
