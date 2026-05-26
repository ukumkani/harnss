import { beforeEach, describe, expect, it } from "vitest";
import { getStoredProjectGitCwd, resolveProjectForSpace, resolveRememberedSessionForSpace } from "@/lib/session/space-projects";
import type { ChatSession, Project } from "@/types";

const projects: Project[] = [
  {
    id: "project-a",
    name: "Project A",
    path: "/tmp/project-a",
    createdAt: 1,
    spaceId: "space-a",
  },
  {
    id: "project-b",
    name: "Project B",
    path: "/tmp/project-b",
    createdAt: 2,
    spaceId: "space-b",
  },
  {
    id: "project-c",
    name: "Project C",
    path: "/tmp/project-c",
    createdAt: 3,
    spaceId: "space-b",
  },
];

const sessions: Pick<ChatSession, "id" | "projectId">[] = [
  { id: "session-a", projectId: "project-a" },
  { id: "session-b", projectId: "project-b" },
];

function createLocalStorageMock() {
  const store = new Map<string, string>();
  return {
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  };
}

describe("resolveProjectForSpace", () => {
  it("keeps the active project when it already belongs to the selected space", () => {
    expect(resolveProjectForSpace({
      spaceId: "space-a",
      activeProjectId: "project-a",
      lastSessionBySpace: {},
      projects,
      sessions,
    })?.id).toBe("project-a");
  });

  it("falls back to the remembered session project when the active project lags behind the space switch", () => {
    expect(resolveProjectForSpace({
      spaceId: "space-b",
      activeProjectId: "project-a",
      lastSessionBySpace: { "space-b": "session-b" },
      projects,
      sessions,
    })?.id).toBe("project-b");
  });

  it("falls back to the first project in the space when there is no remembered session", () => {
    expect(resolveProjectForSpace({
      spaceId: "space-b",
      activeProjectId: "project-a",
      lastSessionBySpace: {},
      projects,
      sessions,
    })?.id).toBe("project-b");
  });
});

describe("resolveRememberedSessionForSpace", () => {
  it("returns the remembered session when it belongs to the selected space", () => {
    expect(resolveRememberedSessionForSpace({
      spaceId: "space-b",
      lastSessionBySpace: { "space-b": "session-b" },
      projects,
      sessions,
    })?.id).toBe("session-b");
  });

  it("returns null when there is no remembered session for the space", () => {
    expect(resolveRememberedSessionForSpace({
      spaceId: "space-b",
      lastSessionBySpace: {},
      projects,
      sessions,
    })).toBeNull();
  });

  it("returns null when the remembered session no longer belongs to the selected space", () => {
    expect(resolveRememberedSessionForSpace({
      spaceId: "space-b",
      lastSessionBySpace: { "space-b": "session-a" },
      projects,
      sessions,
    })).toBeNull();
  });
});

describe("getStoredProjectGitCwd", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      value: createLocalStorageMock(),
      configurable: true,
      writable: true,
    });
  });

  it("prefers the space/project scoped cwd over the legacy project cwd", () => {
    localStorage.setItem("harnss-settings-store", JSON.stringify({
      state: {
        projects: {
          "space-a:project-a": { gitCwd: "/tmp/space-a-worktree" },
          "project-a": { gitCwd: "/tmp/legacy-worktree" },
        },
      },
    }));

    expect(getStoredProjectGitCwd("project-a", "space-a")).toBe("/tmp/space-a-worktree");
  });

  it("falls back to the legacy project cwd when no scoped cwd exists", () => {
    localStorage.setItem("harnss-settings-store", JSON.stringify({
      state: {
        projects: {
          "project-a": { gitCwd: "/tmp/legacy-worktree" },
        },
      },
    }));

    expect(getStoredProjectGitCwd("project-a", "space-a")).toBe("/tmp/legacy-worktree");
  });
});
