import { useCallback } from "react";
import { toast } from "sonner";
import type { PersistedSession, ClaudeEffort } from "../../types";
import { toMcpStatusState } from "../../lib/mcp-utils";
import { capture, captureException } from "../../lib/analytics/analytics";
import { suppressNextSessionCompletion } from "../../lib/notification-utils";
import {
  DRAFT_ID,
  DEFAULT_PERMISSION_MODE,
  getEffectiveClaudePermissionMode,
} from "./types";
import type { SharedSessionRefs, SharedSessionSetters, EngineHooks, StartOptions } from "./types";

function getPermissionModeAgentNotice(permissionMode: string): string {
  switch (permissionMode) {
    case "bypassPermissions":
      return "System notice: This session's permission mode is now Allow All (bypassPermissions). Treat tool and edit approval as granted for this session. Only ask the user when you need information or a non-permission decision.";
    case "acceptEdits":
      return "System notice: This session's permission mode is now Auto Accept (acceptEdits). Treat trusted edits as approved for this session, but continue to ask for untrusted or higher-risk actions.";
    default:
      return "System notice: This session's permission mode is now Ask (default). Ask for user approval before tool calls, edits, or other permission-sensitive actions.";
  }
}

interface UseSessionSettingsParams {
  refs: SharedSessionRefs;
  setters: SharedSessionSetters;
  engines: EngineHooks;
  // From draft materialization
  eagerStartSession: (projectId: string, options?: StartOptions) => Promise<void>;
  abandonEagerSession: (reason?: string) => void;
  // From codex effort helpers
  resetCodexEffortToModelDefault: (effort: string | undefined) => void;
}

export function useSessionSettings({
  refs,
  setters,
  engines,
  eagerStartSession,
  abandonEagerSession,
  resetCodexEffortToModelDefault,
}: UseSessionSettingsParams) {
  const getClaudeSdkModel = useCallback((model: string): string | undefined => {
    const normalized = model.trim();
    if (!normalized) return undefined;
    return normalized.toLowerCase() === "default" ? undefined : normalized;
  }, []);
  const { claude, engine } = engines;
  const {
    setSessions,
    setStartOptions,
    setPreStartedSessionId,
    setDraftMcpStatuses,
    setCachedModels,
  } = setters;
  const {
    activeSessionIdRef,
    sessionsRef,
    liveSessionIdsRef,
    backgroundStoreRef,
    preStartedSessionIdRef,
    draftProjectIdRef,
    startOptionsRef,
    sessionInfoRef,
    codexRawModelsRef,
  } = refs;

  // ── Shared helper: persist a partial session update to state + disk ──

  const persistSessionPatch = useCallback((
    sessionId: string,
    patch: Partial<PersistedSession>,
  ) => {
    const session = sessionsRef.current.find((entry) => entry.id === sessionId);
    if (!session) return;

    setSessions((prev) =>
      prev.map((entry) => (entry.id === sessionId ? { ...entry, ...patch } : entry)),
    );

    window.claude.sessions.load(session.projectId, sessionId).then((data) => {
      if (data) {
        window.claude.sessions.save({ ...data, ...patch });
      }
    }).catch(() => { /* session may have been deleted */ });
  }, [sessionsRef, setSessions]);

  const notifyAgentPermissionMode = useCallback((sessionId: string, sessionEngine: string | undefined, permissionMode: string) => {
    if (!liveSessionIdsRef.current.has(sessionId)) return;

    const notice = getPermissionModeAgentNotice(permissionMode);
    const engineId = sessionEngine ?? "claude";
    if (engineId === "acp") {
      void window.claude.acp.prompt(sessionId, notice).catch((err) => {
        captureException(err instanceof Error ? err : new Error(String(err)), { label: "ACP_PERMISSION_MODE_NOTICE_ERR" });
      });
      return;
    }

    if (engineId === "codex") {
      void window.claude.codex.send(
        sessionId,
        notice,
        [],
        refs.codexEffortRef.current,
      ).catch((err) => {
        captureException(err instanceof Error ? err : new Error(String(err)), { label: "CODEX_PERMISSION_MODE_NOTICE_ERR" });
      });
      return;
    }

    void window.claude.send(sessionId, {
      type: "user",
      message: { role: "user", content: notice },
    }).catch((err) => {
      captureException(err instanceof Error ? err : new Error(String(err)), { label: "CLAUDE_PERMISSION_MODE_NOTICE_ERR" });
    });
  }, [liveSessionIdsRef, refs.codexEffortRef]);

  // ── Active model ──

  const setActiveModel = useCallback((model: string) => {
    const id = activeSessionIdRef.current;
    if (!id) return;

    const applyCodexDefaultEffort = (modelId: string) => {
      const codexModel = codexRawModelsRef.current.find((entry) => entry.id === modelId);
      resetCodexEffortToModelDefault(codexModel?.defaultReasoningEffort);
    };

    if (id === DRAFT_ID) {
      setStartOptions((prev) => ({ ...prev, model }));
      if ((startOptionsRef.current.engine ?? "claude") === "codex") {
        applyCodexDefaultEffort(model);
      }
      const draftEngine = startOptionsRef.current.engine ?? "claude";
      // Model change requires eager Claude session restart only when the draft engine is Claude.
      if (preStartedSessionIdRef.current && draftEngine === "claude") {
        const oldId = preStartedSessionIdRef.current;
        suppressNextSessionCompletion(oldId);
        window.claude.stop(oldId, "draft_model_change");
        liveSessionIdsRef.current.delete(oldId);
        backgroundStoreRef.current.delete(oldId);
        preStartedSessionIdRef.current = null;
        setPreStartedSessionId(null);
        setDraftMcpStatuses([]);
        // Re-start eager session with new model
        if (draftProjectIdRef.current) {
          eagerStartSession(draftProjectIdRef.current, { ...startOptionsRef.current, model });
          // Set pending statuses while new session connects
          window.claude.mcp.list(draftProjectIdRef.current).then(servers => {
            if (activeSessionIdRef.current === DRAFT_ID) {
              setDraftMcpStatuses(servers.map(s => ({
                name: s.name,
                status: "pending" as const,
              })));
            }
          }).catch(() => { /* IPC failure */ });
        }
      } else if (preStartedSessionIdRef.current && draftEngine !== "claude") {
        // If draft engine switched away from Claude, drop the stale eager session.
        abandonEagerSession("engine_switch");
      }
      return;
    }

    const session = sessionsRef.current.find((s) => s.id === id);
    if (!session) return;

    const persistModel = () => {
      persistSessionPatch(id, { model });
    };

    const isLiveClaudeSession = (session.engine ?? "claude") === "claude"
      && liveSessionIdsRef.current.has(id);
    const isLiveCodexSession = (session.engine ?? "claude") === "codex"
      && liveSessionIdsRef.current.has(id);

    if (isLiveClaudeSession) {
      claude.setModel(getClaudeSdkModel(model)).then((result) => {
        if (result?.error) {
          toast.error("Failed to switch model", { description: result.error });
          return;
        }
        persistModel();
      }).catch((err) => {
        captureException(err instanceof Error ? err : new Error(String(err)), { label: "CLAUDE_MODEL_SWITCH_ERR" });
        const message = err instanceof Error ? err.message : String(err);
        toast.error("Failed to switch model", { description: message });
      });
      return;
    }

    if (isLiveCodexSession) {
      window.claude.codex.setModel(id, model).then((result) => {
        if (result?.error) {
          toast.error("Failed to switch model", { description: result.error });
          return;
        }
        applyCodexDefaultEffort(model);
        persistModel();
      }).catch((err) => {
        captureException(err instanceof Error ? err : new Error(String(err)), { label: "CODEX_MODEL_SWITCH_ERR" });
        const message = err instanceof Error ? err.message : String(err);
        toast.error("Failed to switch model", { description: message });
      });
      return;
    }

    if ((session.engine ?? "claude") === "codex") {
      applyCodexDefaultEffort(model);
    }
    persistModel();
  }, [abandonEagerSession, claude.setModel, eagerStartSession, getClaudeSdkModel, persistSessionPatch, resetCodexEffortToModelDefault]);

  // ── Active permission mode ──

  const setActivePermissionMode = useCallback((permissionMode: string) => {
    const id = activeSessionIdRef.current;
    if (!id) return;

    const normalizedPermission = permissionMode === "plan"
      ? DEFAULT_PERMISSION_MODE
      : permissionMode;
    const nextOptions = {
      ...startOptionsRef.current,
      permissionMode: normalizedPermission,
    };
    const effectiveClaudeMode = getEffectiveClaudePermissionMode(nextOptions);

    setStartOptions((prev) => ({ ...prev, permissionMode: normalizedPermission }));

    if (id === DRAFT_ID) {
      // Apply to pre-started session if running (no restart needed)
      if (preStartedSessionIdRef.current) {
        window.claude.setPermissionMode(preStartedSessionIdRef.current, effectiveClaudeMode);
      }
      return;
    }

    persistSessionPatch(id, { permissionMode: normalizedPermission });

    const session = sessionsRef.current.find((s) => s.id === id);
    const previousPermission = session?.permissionMode?.trim() || startOptionsRef.current.permissionMode;
    const sessionEngine = session?.engine ?? "claude";
    const shouldNotifyPermissionMode = normalizedPermission !== previousPermission;
    if (sessionEngine === "claude") {
      void engine.setPermissionMode(effectiveClaudeMode).then(() => {
        if (shouldNotifyPermissionMode) notifyAgentPermissionMode(id, sessionEngine, normalizedPermission);
      });
      return;
    }
    if (sessionEngine === "codex") {
      engine.setPermissionMode(normalizedPermission);
    }
    if (shouldNotifyPermissionMode) notifyAgentPermissionMode(id, sessionEngine, normalizedPermission);
  }, [engine.setPermissionMode, notifyAgentPermissionMode, persistSessionPatch, startOptionsRef]);

  // ── Active plan mode ──

  const setActivePlanMode = useCallback((planMode: boolean) => {
    const id = activeSessionIdRef.current;
    if (!id) return;

    const livePermissionMode = !planMode
      ? sessionInfoRef.current?.permissionMode?.trim()
      : undefined;
    const nextPermissionMode = livePermissionMode && livePermissionMode !== "plan"
      ? livePermissionMode
      : startOptionsRef.current.permissionMode;
    const nextOptions = {
      ...startOptionsRef.current,
      planMode,
      ...(nextPermissionMode ? { permissionMode: nextPermissionMode } : {}),
    };
    const effectiveClaudeMode = getEffectiveClaudePermissionMode(nextOptions);
    setStartOptions((prev) => ({
      ...prev,
      planMode,
      ...(nextPermissionMode ? { permissionMode: nextPermissionMode } : {}),
    }));
    if (planMode) capture("plan_mode_entered");
    setSessions((prev) => prev.map((s) => (
      s.id === id ? { ...s, planMode } : s
    )));

    if (id === DRAFT_ID) {
      if (preStartedSessionIdRef.current) {
        window.claude.setPermissionMode(preStartedSessionIdRef.current, effectiveClaudeMode);
      }
      return;
    }

    const sessionEngine = sessionsRef.current.find((s) => s.id === id)?.engine ?? "claude";
    persistSessionPatch(id, { planMode });
    if (sessionEngine === "claude") {
      engine.setPermissionMode(effectiveClaudeMode);
    }
    // Codex: no mid-session mode RPC — collaborationMode is sent per-turn on turn/start.
    // startOptions is already updated above, so the next send() will pick it up.
  }, [engine.setPermissionMode, persistSessionPatch, sessionInfoRef, startOptionsRef]);

  // ── Active thinking ──

  const setActiveThinking = useCallback((thinkingEnabled: boolean) => {
    const id = activeSessionIdRef.current;
    if (!id) return;

    setStartOptions((prev) => ({ ...prev, thinkingEnabled }));
    capture("thinking_toggled", { enabled: thinkingEnabled });

    if (id === DRAFT_ID) {
      if (preStartedSessionIdRef.current) {
        window.claude.setThinking(preStartedSessionIdRef.current, thinkingEnabled);
      }
      return;
    }

    const sessionEngine = sessionsRef.current.find((s) => s.id === id)?.engine ?? "claude";
    if (sessionEngine !== "claude" || !liveSessionIdsRef.current.has(id)) return;

    claude.setThinkingEnabled(thinkingEnabled).then((result) => {
      if (result?.error) {
        toast.error("Failed to update reasoning", { description: result.error });
      }
    }).catch((err) => {
      captureException(err instanceof Error ? err : new Error(String(err)), { label: "THINKING_TOGGLE_ERR" });
      const message = err instanceof Error ? err.message : String(err);
      toast.error("Failed to update reasoning", { description: message });
    });
  }, [claude.setThinkingEnabled]);

  // ── Active Claude effort ──

  const setActiveClaudeEffort = useCallback(async (effort: ClaudeEffort) => {
    const id = activeSessionIdRef.current;
    if (!id) return;

    setStartOptions((prev) => ({ ...prev, effort }));

    if (id === DRAFT_ID) {
      const preStartedId = preStartedSessionIdRef.current;
      if (!preStartedId) return;

      const restartResult = await window.claude.restartSession(preStartedId, undefined, undefined, effort);
      if (restartResult?.error) {
        toast.error("Failed to update effort", { description: restartResult.error });
        return;
      }

      const [statusResult, modelsResult] = await Promise.all([
        window.claude.mcpStatus(preStartedId),
        window.claude.supportedModels(preStartedId),
      ]);

      if (statusResult.servers?.length) {
        setDraftMcpStatuses(statusResult.servers.map((server) => ({
          name: server.name,
          status: toMcpStatusState(server.status),
        })));
      }
      if (modelsResult.models?.length) {
        setCachedModels(modelsResult.models);
      }
      return;
    }

    const sessionEngine = sessionsRef.current.find((s) => s.id === id)?.engine ?? "claude";
    if (sessionEngine !== "claude") return;

    if (!liveSessionIdsRef.current.has(id)) {
      persistSessionPatch(id, { effort });
      return;
    }

    const restartResult = await window.claude.restartSession(id, undefined, undefined, effort);
    if (restartResult?.error) {
      toast.error("Failed to update effort", { description: restartResult.error });
      return;
    }
    persistSessionPatch(id, { effort });
  }, [liveSessionIdsRef, persistSessionPatch, sessionsRef, setCachedModels, setDraftMcpStatuses, setStartOptions]);

  // ── Active Claude model + effort (combined) ──

  const setActiveClaudeModelAndEffort = useCallback(async (model: string, effort: ClaudeEffort) => {
    const id = activeSessionIdRef.current;
    if (!id) return;

    setStartOptions((prev) => ({ ...prev, model, effort }));

    if (id === DRAFT_ID) {
      const preStartedId = preStartedSessionIdRef.current;
      const draftEngine = startOptionsRef.current.engine ?? "claude";
      if (!preStartedId || draftEngine !== "claude") return;

      const restartResult = await window.claude.restartSession(
        preStartedId,
        undefined,
        undefined,
        effort,
        getClaudeSdkModel(model),
      );
      if (restartResult?.error) {
        toast.error("Failed to update model effort", { description: restartResult.error });
        return;
      }

      const [statusResult, modelsResult] = await Promise.all([
        window.claude.mcpStatus(preStartedId),
        window.claude.supportedModels(preStartedId),
      ]);

      if (statusResult.servers?.length) {
        setDraftMcpStatuses(statusResult.servers.map((server) => ({
          name: server.name,
          status: toMcpStatusState(server.status),
        })));
      }
      if (modelsResult.models?.length) {
        setCachedModels(modelsResult.models);
      }
      return;
    }

    const session = sessionsRef.current.find((s) => s.id === id);
    if (!session) return;

    const sessionEngine = session.engine ?? "claude";
    if (sessionEngine !== "claude") return;

    const persistModelAndEffort = () => {
      persistSessionPatch(id, { model, effort });
    };

    if (liveSessionIdsRef.current.has(id)) {
      const restartResult = await window.claude.restartSession(
        id,
        undefined,
        undefined,
        effort,
        getClaudeSdkModel(model),
      );
      if (restartResult?.error) {
        toast.error("Failed to update model effort", { description: restartResult.error });
        return;
      }
    }

    persistModelAndEffort();
  }, [getClaudeSdkModel, persistSessionPatch, setCachedModels, setDraftMcpStatuses, setStartOptions]);

  // ── Per-session model (for split view / non-active sessions) ──

  const setSessionModel = useCallback(async (sessionId: string, model: string) => {
    if (!sessionId || sessionId === DRAFT_ID) return;

    const session = sessionsRef.current.find((entry) => entry.id === sessionId);
    if (!session) return;

    const persistModel = () => {
      persistSessionPatch(sessionId, { model });
    };

    if ((session.engine ?? "claude") === "claude" && liveSessionIdsRef.current.has(sessionId)) {
      const result = await window.claude.setModel(sessionId, getClaudeSdkModel(model));
      if (result?.error) {
        toast.error("Failed to switch model", { description: result.error });
        return;
      }
      persistModel();
      return;
    }

    if ((session.engine ?? "claude") === "codex" && liveSessionIdsRef.current.has(sessionId)) {
      const result = await window.claude.codex.setModel(sessionId, model);
      if (result?.error) {
        toast.error("Failed to switch model", { description: result.error });
        return;
      }
      persistModel();
      return;
    }

    persistModel();
  }, [getClaudeSdkModel, liveSessionIdsRef, persistSessionPatch, sessionsRef]);

  // ── Per-session permission mode ──

  const setSessionPermissionMode = useCallback(async (sessionId: string, permissionMode: string) => {
    if (!sessionId || sessionId === DRAFT_ID) return;

    const session = sessionsRef.current.find((entry) => entry.id === sessionId);
    if (!session) return;

    const normalizedPermission = permissionMode === "plan"
      ? DEFAULT_PERMISSION_MODE
      : permissionMode;
    const previousPermission = session.permissionMode?.trim();
    persistSessionPatch(sessionId, { permissionMode: normalizedPermission });

    const sessionEngine = session.engine ?? "claude";
    const shouldNotifyPermissionMode = normalizedPermission !== previousPermission;

    if (sessionEngine !== "claude" || !liveSessionIdsRef.current.has(sessionId)) {
      if (shouldNotifyPermissionMode) notifyAgentPermissionMode(sessionId, sessionEngine, normalizedPermission);
      return;
    }

    const effectiveClaudeMode = getEffectiveClaudePermissionMode({
      permissionMode: normalizedPermission,
      planMode: !!session.planMode,
    });
    const result = await window.claude.setPermissionMode(sessionId, effectiveClaudeMode);
    if (result?.error) {
      toast.error("Failed to update permission mode", { description: result.error });
      return;
    }
    if (shouldNotifyPermissionMode) notifyAgentPermissionMode(sessionId, sessionEngine, normalizedPermission);
  }, [liveSessionIdsRef, notifyAgentPermissionMode, persistSessionPatch, sessionsRef]);

  // ── Per-session plan mode ──

  const setSessionPlanMode = useCallback(async (sessionId: string, planMode: boolean) => {
    if (!sessionId || sessionId === DRAFT_ID) return;

    const session = sessionsRef.current.find((entry) => entry.id === sessionId);
    if (!session) return;

    persistSessionPatch(sessionId, { planMode });

    if ((session.engine ?? "claude") !== "claude" || !liveSessionIdsRef.current.has(sessionId)) {
      return;
    }

    const normalizedPermission = session.permissionMode?.trim() || DEFAULT_PERMISSION_MODE;
    const effectiveClaudeMode = getEffectiveClaudePermissionMode({
      permissionMode: normalizedPermission,
      planMode,
    });
    const result = await window.claude.setPermissionMode(sessionId, effectiveClaudeMode);
    if (result?.error) {
      toast.error("Failed to update plan mode", { description: result.error });
    }
  }, [liveSessionIdsRef, persistSessionPatch, sessionsRef]);

  // ── Per-session Claude model + effort (combined) ──

  const setSessionClaudeModelAndEffort = useCallback(async (sessionId: string, model: string, effort: ClaudeEffort) => {
    if (!sessionId || sessionId === DRAFT_ID) return;

    const session = sessionsRef.current.find((entry) => entry.id === sessionId);
    if (!session || (session.engine ?? "claude") !== "claude") return;

    if (liveSessionIdsRef.current.has(sessionId)) {
      const restartResult = await window.claude.restartSession(
        sessionId,
        undefined,
        undefined,
        effort,
        getClaudeSdkModel(model),
      );
      if (restartResult?.error) {
        toast.error("Failed to update model effort", { description: restartResult.error });
        return;
      }
    }

    persistSessionPatch(sessionId, { model, effort });
  }, [getClaudeSdkModel, liveSessionIdsRef, persistSessionPatch, sessionsRef]);

  return {
    persistSessionPatch,
    setActiveModel,
    setActivePermissionMode,
    setActivePlanMode,
    setActiveThinking,
    setActiveClaudeEffort,
    setActiveClaudeModelAndEffort,
    setSessionModel,
    setSessionPermissionMode,
    setSessionPlanMode,
    setSessionClaudeModelAndEffort,
  };
}
