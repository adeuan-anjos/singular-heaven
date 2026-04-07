import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";

interface TopBarProps {
  onBack: () => void;
  onForward: () => void;
  canGoBack: boolean;
  canGoForward: boolean;
  onSearch: () => void;
}

export function TopBar({
  onBack,
  onForward,
  canGoBack,
  canGoForward,
  onSearch,
}: TopBarProps) {
  return (
    <div className="flex shrink-0 border-b border-border">
      {/* Spacer matching side panel width */}
      <div className="w-64 shrink-0" />

      {/* Navigation controls */}
      <div className="flex items-center gap-1 px-4 py-2">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                onClick={onBack}
                disabled={!canGoBack}
              />
            }
          >
            <ChevronLeft className="h-4 w-4" />
          </TooltipTrigger>
          <TooltipContent>Voltar</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                onClick={onForward}
                disabled={!canGoForward}
              />
            }
          >
            <ChevronRight className="h-4 w-4" />
          </TooltipTrigger>
          <TooltipContent>Avançar</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                onClick={onSearch}
              />
            }
          >
            <Search className="h-4 w-4" />
          </TooltipTrigger>
          <TooltipContent>Buscar</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
