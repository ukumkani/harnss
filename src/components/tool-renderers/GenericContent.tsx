import type { UIMessage } from "@/types";
import { formatInput, formatResult, isCompletionSentinel } from "@/components/lib/tool-formatting";
import { guessLanguage } from "@/lib/languages";
import { ToolCodeBlock } from "./ToolCodeBlock";

function pickLanguage(text: string): string {
  return guessLanguage(text) ?? (text.trim().startsWith("{") || text.trim().startsWith("[") ? "json" : "text");
}

export function GenericContent({ message }: { message: UIMessage }) {
  const hasResult = message.toolResult && !isCompletionSentinel(message.toolResult);
  const inputText = message.toolInput ? formatInput(message.toolInput) : "";
  const resultText = hasResult ? formatResult(message.toolResult!) : "";
  return (
    <div className="space-y-1.5 text-xs">
      {message.toolInput && (
        <ToolCodeBlock code={inputText} language={pickLanguage(inputText)} maxHeightClassName="max-h-32" />
      )}
      {hasResult && (
        <ToolCodeBlock code={resultText} language={pickLanguage(resultText)} maxHeightClassName="max-h-48" />
      )}
    </div>
  );
}
