import type { UIMessage } from "@/types";
import { createSystemMessage } from "@/lib/message-factory";

const MAX_DESC_LENGTH = 100;

function truncateDesc(text: string): string {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > MAX_DESC_LENGTH ? `${compact.slice(0, MAX_DESC_LENGTH - 1)}…` : compact;
}

function fileName(path: unknown): string {
  return String(path ?? "").split("/").pop() ?? "";
}

function commandSummary(command: unknown): string {
  return String(command ?? "").split("\n")[0].trim().slice(0, 60);
}

function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*]\([^)]+\)/g, " ")
    .replace(/\[[^\]]+]\([^)]+\)/g, " ")
    .replace(/[#>*_~|[\]()-]/g, " ");
}

function isSuggestionLine(line: string): boolean {
  return /^(建议|后续|下一步|计划|可以|如果|需要的话|另外|next|suggestion|follow[- ]?up|todo)\b/i.test(line.trim());
}

export function summarizeTurnForStash(messages: UIMessage[]): string {
  const lastUserIndex = messages.findLastIndex((message) => message.role === "user");
  const currentTurn = lastUserIndex >= 0 ? messages.slice(lastUserIndex + 1) : messages;
  const summaries: string[] = [];

  for (const message of currentTurn) {
    if (message.role !== "tool_call") continue;
    switch (message.toolName) {
      case "Write":
        summaries.push(`创建 ${fileName(message.toolInput?.file_path ?? message.toolResult?.filePath)}`);
        break;
      case "Edit":
      case "NotebookEdit":
        summaries.push(`更新 ${fileName(message.toolInput?.file_path ?? message.toolResult?.filePath)}`);
        break;
      case "Bash": {
        const command = commandSummary(message.toolInput?.command);
        if (command) summaries.push(`执行 ${command}`);
        break;
      }
      case "TodoWrite":
        summaries.push("更新任务清单");
        break;
      default:
        break;
    }
    if (summaries.length >= 3) break;
  }

  if (summaries.length > 0) return truncateDesc(summaries.filter(Boolean).join("；"));

  const assistantText = currentTurn
    .filter((message) => message.role === "assistant" && message.content.trim())
    .map((message) => message.content)
    .join("\n");
  const contentLine = stripMarkdown(assistantText)
    .split(/\n+/)
    .map((line) => line.trim())
    .find((line) => line && !isSuggestionLine(line));

  return truncateDesc(contentLine || "会话执行完成");
}

export async function appendGitStashResult(
  cwd: string | undefined,
  messages: UIMessage[],
  appendMessage: (message: UIMessage) => void,
): Promise<void> {
  if (!cwd) return;

  const desc = summarizeTurnForStash(messages);
  const result = await window.claude.git.stashPush(cwd, desc);
  if (result.skipped) return;

  const statusText = result.status === "success"
    ? "成功"
    : result.status === "missing"
      ? "缺失"
      : "失败";
  const branchText = result.branch ?? "null";
  const detail = result.error ? `${desc}；${result.error}` : desc;
  appendMessage(createSystemMessage(`Git stash push: \`${branchText}\` ${statusText} ${detail}`));
}
