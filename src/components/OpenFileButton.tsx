import { memo, useCallback } from "react";
import { FileText } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface OpenFileButtonProps {
  filePath: string;
  onOpenFile?: (filePath: string) => void;
  className?: string;
}

export const OpenFileButton = memo(function OpenFileButton({
  filePath,
  onOpenFile,
  className = "",
}: OpenFileButtonProps) {
  const handleClick = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      onOpenFile?.(filePath);
    },
    [filePath, onOpenFile],
  );

  if (!onOpenFile) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={handleClick}
          className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md
            text-foreground/0 transition-all duration-150
            group-hover:text-foreground/25 hover:!text-foreground/60 hover:bg-foreground/[0.06]
            active:scale-90 cursor-pointer ${className}`}
        >
          <FileText className="h-3 w-3" strokeWidth={2} />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>
        <p className="text-xs">Open file</p>
      </TooltipContent>
    </Tooltip>
  );
});
