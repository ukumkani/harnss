import { useCallback } from "react";
import type { ImageAttachment, McpServerConfig, Project } from "@/types";
import type { CollaborationMode } from "../../types/codex-protocol/CollaborationMode";
import { imageAttachmentsToCodexInputs } from "../../lib/engine/codex-adapter";
import { createSystemMessage, createUserMessage } from "../../lib/message-factory";
import { buildSdkContent } from "../../lib/engine/protocol";
import { capture } from "../../lib/analytics/analytics";
import { DRAFT_ID, buildCodexCollabMode } from "./types";
import type { SharedSessionRefs, SharedSessionSetters, EngineHooks, StartOptions } from "./types";
import { useSessionCache } from "./useSessionCache";
import { useSessionCrud } from "./useSessionCrud";
import { useSessionSettings } from "./useSessionSettings";
import { useSessionRestart } from "./useSessionRestart";

interface UseSessionLifecycleParams {
  refs: SharedSessionRefs;
  setters: SharedSessionSetters;
  engines: EngineHooks;
  projects: Project[];
  activeSessionId: string | null;
  activeEngine: string;
  findProject: (projectId: string) => Project | null;
  getProjectCwd: (project: Project) => string;
  // From persistence
  saveCurrentSession: () => Promise<void>;
  seedBackgroundStore: () => void;
  // From draft materialization
  eagerStartSession: (projectId: string, options?: StartOptions) => Promise<void>;
  eagerStartAcpSession: (projectId: string, options?: StartOptions, overrideServers?: McpServerConfig[]) => Promise<void>;
  prefetchCodexModels: (preferredModel?: string) => Promise<void>;
  probeMcpServers: (projectId: string, overrideServers?: McpServerConfig[]) => Promise<void>;
  abandonEagerSession: (reason?: string) => void;
  abandonDraftAcpSession: (reason?: string) => void;
  materializeDraft: (text: string, images?: ImageAttachment[], displayText?: string) => Promise<string>;
  // From revival
  reviveSession: (text: string, images?: ImageAttachment[], displayText?: string) => Promise<void>;
  reviveAcpSession: (text: string, images?: ImageAttachment[], displayText?: string) => Promise<void>;
  reviveCodexSession: (text: string, images?: ImageAttachment[]) => Promise<void>;
  // From message queue
  enqueueMessage: (text: string, images?: ImageAttachment[], displayText?: string) => void;
  clearQueue: () => void;
  // Codex effort helpers
  resetCodexEffortToModelDefault: (effort: string | undefined) => void;
}

export function useSessionLifecycle({
  refs,
  setters,
  engines,
  projects,
  activeSessionId,
  activeEngine,
  findProject,
  getProjectCwd,
  saveCurrentSession,
  seedBackgroundStore,
  eagerStartSession,
  eagerStartAcpSession,
  prefetchCodexModels,
  probeMcpServers,
  abandonEagerSession,
  abandonDraftAcpSession,
  materializeDraft,
  reviveSession,
  reviveAcpSession,
  reviveCodexSession,
  enqueueMessage,
  clearQueue,
  resetCodexEffortToModelDefault,
}: UseSessionLifecycleParams) {
  const { claude, acp, codex, engine } = engines;

  // ── Session cache: LRU payload cache, session list loading, model hydration ──
  const {
    cacheSessionPayload,
    consumeCachedSessionPayload,
    applyLoadedSession,
    evictFromCache,
  } = useSessionCache({
    refs,
    setters,
    engines,
    projects,
    activeSessionId,
    activeEngine,
    getProjectCwd,
    prefetchCodexModels,
  });

  // ── Session CRUD: create, switch, delete, rename, deselect, import, draft agent ──
  const {
    createSession,
    switchSession,
    deleteSession,
    renameSession,
    deselectSession,
    importCCSession,
    setDraftAgent,
  } = useSessionCrud({
    refs,
    setters,
    engines,
    findProject,
    getProjectCwd,
    saveCurrentSession,
    seedBackgroundStore,
    eagerStartSession,
    eagerStartAcpSession,
    prefetchCodexModels,
    probeMcpServers,
    abandonEagerSession,
    abandonDraftAcpSession,
    cacheSessionPayload,
    consumeCachedSessionPayload,
    applyLoadedSession,
    evictFromCache,
    clearQueue,
  });

  // ── Session settings: model, permission mode, plan mode, thinking, effort ──
  const {
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
  } = useSessionSettings({
    refs,
    setters,
    engines,
    eagerStartSession,
    abandonEagerSession,
    resetCodexEffortToModelDefault,
  });

  // ── Session restart: ACP restart, worktree restart, full revert ──
  const {
    restartAcpSession,
    restartActiveSessionInCurrentWorktree,
    fullRevertSession,
  } = useSessionRestart({
    refs,
    setters,
    engines,
    findProject,
    getProjectCwd,
  });

  // ── Send: the main message-sending function (kept here — most intertwined) ──

  const prepareGitBranchForTask = useCallback(async () => {
    const activeId = refs.activeSessionIdRef.current;
    const projectId = activeId === DRAFT_ID
      ? refs.draftProjectIdRef.current
      : refs.sessionsRef.current.find((session) => session.id === activeId)?.projectId;
    if (!projectId) return;

    const project = findProject(projectId);
    if (!project) return;

    const result = await window.claude.git.prepareBranch(getProjectCwd(project));
    if (result.skipped) return;

    const remoteStatus = result.remoteUpdate?.status ?? "missing";
    const stashStatus = result.stashRestore?.status ?? "missing";
    if (remoteStatus === "missing" && stashStatus === "missing") return;

    const label = (status: "success" | "missing" | "failure") =>
      status === "success" ? "成功" : status === "missing" ? "缺失" : "失败";
    const branchText = result.branch ?? "null";
    const restoredPaths = result.stashRestore?.restoredPaths ?? [];
    const restoredText = stashStatus === "success"
      ? restoredPaths.length > 0
        ? `；恢复: ${restoredPaths.map((filePath) => `\`${filePath}\``).join(", ")}`
        : "；恢复: 无"
      : "";
    const stashIdText = result.stashRestore?.stashId ? ` stashId=${result.stashRestore.stashId}` : "";
    const errors = [
      result.remoteUpdate?.error ? `远程更新错误: ${result.remoteUpdate.error}` : "",
      result.stashRestore?.error ? `暂存恢复错误: ${result.stashRestore.error}` : "",
      result.error ? `错误: ${result.error}` : "",
    ].filter(Boolean);
    const errorText = errors.length > 0 ? `；${errors.join("；")}` : "";
    const isError = remoteStatus === "failure" || stashStatus === "failure" || !!result.error;

    engine.setMessages((prev) => [
      ...prev,
      createSystemMessage(
        `Git pre-task update: \`${branchText}\` remote=${label(remoteStatus)} stash=${label(stashStatus)}${stashIdText}${restoredText}${errorText}`,
        isError,
      ),
    ]);
  }, [engine, findProject, getProjectCwd, refs]);

  const send = useCallback(
    async (text: string, images?: ImageAttachment[], displayText?: string) => {
      const activeId = refs.activeSessionIdRef.current;
      if (!activeId) return;

      const activeSessionEngine = activeId === DRAFT_ID
        ? null
        : (refs.sessionsRef.current.find(s => s.id === activeId)?.engine ?? "claude");
      const sendEngine = activeId === DRAFT_ID
        ? (refs.startOptionsRef.current.engine ?? "claude")
        : (activeSessionEngine ?? "claude");
      const trackMessageSent = (sessionId?: string) => {
        capture("message_sent", {
          engine: sendEngine,
          has_images: !!images?.length,
          message_length: text.length,
          ...(sendEngine === "acp" && sessionId ? { session_id: sessionId } : {}),
        });
      };

      if (activeSessionEngine && refs.isProcessingRef.current && refs.liveSessionIdsRef.current.has(activeId)) {
        trackMessageSent(activeSessionEngine === "acp" ? activeId : undefined);
        enqueueMessage(text, images, displayText);
        return;
      }

      let taskPrepared = false;
      const prepareTaskOnce = async () => {
        if (taskPrepared) return;
        taskPrepared = true;
        await prepareGitBranchForTask();
      };
      const waitForSubmittedTurnPaint = () => new Promise<void>((resolve) => {
        if (typeof requestAnimationFrame === "function") {
          requestAnimationFrame(() => resolve());
          return;
        }
        setTimeout(resolve, 0);
      });

      if (activeId === DRAFT_ID) {
        const draftEngine = refs.startOptionsRef.current.engine ?? "claude";

        if (draftEngine === "acp") {
          refs.pendingAcpDraftPromptRef.current = { text, images, displayText };
          // Show user message + spinner immediately, before the potentially slow materializeDraft
          const userMsg = createUserMessage(text, images, displayText);
          acp.setMessages((prev) => [...prev, userMsg]);
          acp.setIsProcessing(true);

          await waitForSubmittedTurnPaint();
          await prepareTaskOnce();

          const sessionId = await materializeDraft(text, images, displayText);
          if (!sessionId) {
            // materializeDraft failed, was cancelled, or is waiting for auth.
            if (!acp.authRequired) {
              refs.pendingAcpDraftPromptRef.current = null;
            }
            acp.setIsProcessing(false);
            return;
          }

          trackMessageSent(sessionId);

          // Session is live — send the prompt (user message already in UI)
          await new Promise((resolve) => setTimeout(resolve, 50));
          const promptResult = await window.claude.acp.prompt(sessionId, text, images);
          if (promptResult?.error) {
            acp.setMessages((prev) => [
              ...prev,
              createSystemMessage(`ACP prompt error: ${promptResult.error}`, true),
            ]);
            acp.setIsProcessing(false);
            refs.pendingAcpDraftPromptRef.current = null;
            return;
          }
          refs.pendingAcpDraftPromptRef.current = null;
          return;
        }

        if (draftEngine === "codex") {
          trackMessageSent();
          codex.setMessages((prev) => [
            ...prev,
            createUserMessage(text, images, displayText),
          ]);
          codex.setIsProcessing(true);

          await waitForSubmittedTurnPaint();
          await prepareTaskOnce();

          const sessionId = await materializeDraft(text, images, displayText);
          if (!sessionId) {
            codex.setIsProcessing(false);
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, 50));

          const codexSession = refs.sessionsRef.current.find((s) => s.id === sessionId);
          let codexCollabMode: CollaborationMode | undefined;
          try {
            codexCollabMode = buildCodexCollabMode(refs.startOptionsRef.current.planMode, codexSession?.model);
          } catch (err) {
            codex.setMessages((prev) => [
              ...prev,
              createSystemMessage(err instanceof Error ? err.message : String(err), true),
            ]);
            codex.setIsProcessing(false);
            return;
          }
          const sendResult = await window.claude.codex.send(
            sessionId,
            text,
            imageAttachmentsToCodexInputs(images),
            refs.codexEffortRef.current,
            codexCollabMode,
          );
          if (sendResult?.error) {
            refs.liveSessionIdsRef.current.delete(sessionId);
            codex.setMessages((prev) => [
              ...prev,
              createSystemMessage(`Unable to send message: ${sendResult.error}`, true),
            ]);
            codex.setIsProcessing(false);
          }
          return;
        }

        // Claude SDK path
        trackMessageSent();
        const draftUserMessage = createUserMessage(text, images, displayText);
        claude.setMessages((prev) => [
          ...prev,
          draftUserMessage,
        ]);
        claude.setIsProcessing(true);

        await waitForSubmittedTurnPaint();
        await prepareTaskOnce();

        const sessionId = await materializeDraft(text);
        if (!sessionId) {
          claude.setIsProcessing(false);
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));

        {
          const content = buildSdkContent(text, images);
          const sendResult = await window.claude.send(sessionId, {
            type: "user",
            message: { role: "user", content },
          });
          if (sendResult?.error) {
            refs.liveSessionIdsRef.current.delete(sessionId);
            claude.setMessages((prev) => [
              ...prev,
              createSystemMessage(`Unable to send message: ${sendResult.error}`, true),
            ]);
            claude.setIsProcessing(false);
            return;
          }
        }
        return;
      }

      if (activeSessionEngine === "acp") {
        // ACP sessions: send through ACP hook if live
        if (refs.liveSessionIdsRef.current.has(activeId)) {
          trackMessageSent(activeId);
          acp.setMessages((prev) => [
            ...prev,
            createUserMessage(text, images, displayText),
          ]);
          acp.setIsProcessing(true);
          await waitForSubmittedTurnPaint();
          await prepareTaskOnce();
          await acp.sendRaw(text, images);
          return;
        }
        // ACP session dead (app restarted) — attempt revival via session/load
        await prepareTaskOnce();
        await reviveAcpSession(text, images, displayText);
        return;
      }

      trackMessageSent();

      if (activeSessionEngine === "codex") {
        // Codex sessions: send through Codex hook if live
        if (refs.liveSessionIdsRef.current.has(activeId)) {
          const activeSession = refs.sessionsRef.current.find((s) => s.id === activeId);
          let codexCollabMode: CollaborationMode | undefined;
          try {
            codexCollabMode = buildCodexCollabMode(refs.startOptionsRef.current.planMode, activeSession?.model);
          } catch (err) {
            codex.setMessages((prev) => [
              ...prev,
              createSystemMessage(err instanceof Error ? err.message : String(err), true),
            ]);
            return;
          }
          codex.setMessages((prev) => [
            ...prev,
            createUserMessage(text, images, displayText),
          ]);
          codex.setIsProcessing(true);
          await waitForSubmittedTurnPaint();
          await prepareTaskOnce();
          const ok = await codex.sendRaw(text, images, codexCollabMode);
          if (!ok) {
            codex.setMessages((prev) => [
              ...prev,
              createSystemMessage("Unable to send message.", true),
            ]);
          }
          return;
        }
        // Codex session dead — attempt revival via thread/resume
        await prepareTaskOnce();
        await reviveCodexSession(text, images);
        return;
      }

      // Claude SDK path
      if (refs.liveSessionIdsRef.current.has(activeId)) {
        const userMsg = createUserMessage(text, images, displayText);
        claude.setMessages((prev) => [
          ...prev,
          userMsg,
        ]);
        claude.setIsProcessing(true);
        await waitForSubmittedTurnPaint();
        await prepareTaskOnce();
        const sent = await claude.sendRaw(text, images);
        if (sent) return;
        claude.setMessages((prev) => prev.filter((message) => message.id !== userMsg.id));
        refs.liveSessionIdsRef.current.delete(activeId);
      }

      if (refs.activeSessionIdRef.current !== DRAFT_ID) {
        await prepareTaskOnce();
        await reviveSession(text, images, displayText);
        return;
      }
    },
    [
      claude.sendRaw,
      claude.setMessages,
      claude.setIsProcessing,
      acp.sendRaw,
      acp.setMessages,
      acp.setIsProcessing,
      codex.sendRaw,
      codex.setMessages,
      codex.setIsProcessing,
      materializeDraft,
      reviveSession,
      reviveAcpSession,
      reviveCodexSession,
      enqueueMessage,
      prepareGitBranchForTask,
    ],
  );

  return {
    createSession,
    switchSession,
    deleteSession,
    renameSession,
    deselectSession,
    importCCSession,
    setDraftAgent,
    setActiveModel,
    setSessionModel,
    setActivePermissionMode,
    setSessionPermissionMode,
    setActivePlanMode,
    setSessionPlanMode,
    setActiveThinking,
    setActiveClaudeEffort,
    setActiveClaudeModelAndEffort,
    setSessionClaudeModelAndEffort,
    restartAcpSession,
    restartActiveSessionInCurrentWorktree,
    fullRevertSession,
    send,
  };
}
