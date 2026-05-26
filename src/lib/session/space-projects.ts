import type { ChatSession, Project } from "@/types";
import { makeProjectScopeKey } from "@/stores/settings-store";

interface ResolveProjectForSpaceOptions {
  spaceId: string;
  activeProjectId: string | null;
  lastSessionBySpace: Record<string, string>;
  projects: Project[];
  sessions: Pick<ChatSession, "id" | "projectId">[];
}

interface ResolveRememberedSessionForSpaceOptions {
  spaceId: string;
  lastSessionBySpace: Record<string, string>;
  projects: Project[];
  sessions: Pick<ChatSession, "id" | "projectId">[];
}

export function resolveRememberedSessionForSpace({
  spaceId,
  lastSessionBySpace,
  projects,
  sessions,
}: ResolveRememberedSessionForSpaceOptions): Pick<ChatSession, "id" | "projectId"> | null {
  const rememberedSessionId = lastSessionBySpace[spaceId];
  if (!rememberedSessionId) return null;

  const projectIdsInSpace = new Set(
    projects
      .filter((project) => (project.spaceId || "default") === spaceId)
      .map((project) => project.id),
  );
  if (projectIdsInSpace.size === 0) return null;

  const rememberedSession = sessions.find((session) => session.id === rememberedSessionId);
  if (!rememberedSession || !projectIdsInSpace.has(rememberedSession.projectId)) return null;

  return rememberedSession;
}

export function resolveProjectForSpace({
  spaceId,
  activeProjectId,
  lastSessionBySpace,
  projects,
  sessions,
}: ResolveProjectForSpaceOptions): Project | null {
  const projectsInSpace = projects.filter((project) => (project.spaceId || "default") === spaceId);
  if (projectsInSpace.length === 0) return null;

  const projectsById = new Map(projectsInSpace.map((project) => [project.id, project]));

  if (activeProjectId) {
    const activeProject = projectsById.get(activeProjectId);
    if (activeProject) return activeProject;
  }

  const rememberedSession = resolveRememberedSessionForSpace({
    spaceId,
    lastSessionBySpace,
    projects,
    sessions,
  });
  if (rememberedSession) {
    const rememberedProject = projectsById.get(rememberedSession.projectId);
    if (rememberedProject) return rememberedProject;
  }

  return projectsInSpace[0];
}

function readSettingsStoreGitCwd(projectId: string, spaceId: string): string | null {
  try {
    const raw = localStorage.getItem("harnss-settings-store");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: { projects?: Record<string, { gitCwd?: unknown }> } };
    const projects = parsed.state?.projects;
    if (!projects) return null;
    const scoped = projects[makeProjectScopeKey(spaceId, projectId)]?.gitCwd;
    const legacy = projects[projectId]?.gitCwd;
    const value = typeof scoped === "string" ? scoped : typeof legacy === "string" ? legacy : null;
    return value?.trim() || null;
  } catch {
    return null;
  }
}

export function getStoredProjectGitCwd(projectId: string, spaceId = "default"): string | null {
  const storedSetting = readSettingsStoreGitCwd(projectId, spaceId);
  if (storedSetting) return storedSetting;

  const stored = localStorage.getItem(`harnss-${projectId}-git-cwd`);
  if (!stored) return null;

  const trimmed = stored.trim();
  return trimmed ? trimmed : null;
}
