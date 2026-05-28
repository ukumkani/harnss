import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { UIMessage } from "@/types";
import { ChatUiStateProvider } from "./chat-ui-state";
import { ToolCall } from "./ToolCall";

describe("ToolCall", () => {
  it("renders presented plans expanded and full by default", () => {
    const plan = `# Implementation Plan

${Array.from({ length: 220 }, (_, index) => `- Step ${index + 1}`).join("\n")}`;
    const message: UIMessage = {
      id: "plan-1",
      role: "tool_call",
      content: "",
      toolName: "ExitPlanMode",
      toolInput: {
        plan,
        filePath: "/repo/.codex/plan.md",
      },
      toolResult: {
        content: "Plan: 220 steps",
      },
      timestamp: 0,
    };

    const markup = renderToStaticMarkup(
      <ChatUiStateProvider>
        <ToolCall message={message} disableCollapseAnimation />
      </ChatUiStateProvider>,
    );

    expect(markup).toContain("Presented plan");
    expect(markup).toContain("Step 220");
    expect(markup).not.toContain("Show full plan");
  });

  it("keeps command tools marked running while streaming output", () => {
    const message: UIMessage = {
      id: "cmd-1",
      role: "tool_call",
      content: "",
      toolName: "Bash",
      toolInput: {
        command: "pnpm build",
      },
      toolResult: {
        type: "text",
        status: "in_progress",
        stdout: "building...",
      },
      timestamp: 0,
    };

    const markup = renderToStaticMarkup(
      <ChatUiStateProvider>
        <ToolCall message={message} disableCollapseAnimation />
      </ChatUiStateProvider>,
    );

    expect(markup).toContain("Running");
    expect(markup).not.toContain("Ran");
  });

  it("falls back to running while the conversation is still processing", () => {
    const message: UIMessage = {
      id: "cmd-2",
      role: "tool_call",
      content: "",
      toolName: "Bash",
      toolInput: {
        command: "pnpm test",
      },
      toolResult: {
        type: "text",
        stdout: "partial output",
      },
      timestamp: 0,
    };

    const markup = renderToStaticMarkup(
      <ChatUiStateProvider>
        <ToolCall message={message} disableCollapseAnimation isConversationProcessing />
      </ChatUiStateProvider>,
    );

    expect(markup).toContain("Running");
    expect(markup).not.toContain("Ran");
  });
});
