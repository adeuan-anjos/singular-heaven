import type { ModuleConfig } from "@/types/module";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface SidebarProps {
  modules: ModuleConfig[];
  activeModuleId: string;
  onModuleSelect: (id: string) => void;
}

export function Sidebar({ modules, activeModuleId, onModuleSelect }: SidebarProps) {
  return (
    <aside className="flex h-full w-14 flex-col items-center gap-2 border-r border-border bg-background/80 px-2 py-4 backdrop-blur-xs">
      <TooltipProvider delay={0}>
        {modules.map((mod) => {
          const Icon = mod.icon;
          const isActive = mod.id === activeModuleId;

          return (
            <Tooltip key={mod.id}>
              <TooltipTrigger
                render={
                  <Button
                    variant={isActive ? "secondary" : "ghost"}
                    size="icon"
                    className={cn(
                      "h-10 w-10",
                      isActive && "bg-secondary text-secondary-foreground"
                    )}
                  />
                }
                onClick={() => onModuleSelect(mod.id)}
              >
                <Icon className="h-5 w-5" />
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>{mod.name}</p>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </TooltipProvider>
    </aside>
  );
}
