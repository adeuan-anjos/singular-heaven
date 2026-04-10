import { Globe, EyeOff, Link2 } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { PlaylistPrivacyStatus } from "../../services/yt-api";

export const PLAYLIST_PRIVACY_OPTIONS: Array<{
  value: PlaylistPrivacyStatus;
  label: string;
  description: string;
  icon: typeof Globe;
}> = [
  {
    value: "PUBLIC",
    label: "Pública",
    description: "Qualquer pessoa pode encontrar e abrir.",
    icon: Globe,
  },
  {
    value: "UNLISTED",
    label: "Não listada",
    description: "Só abre por link, sem aparecer publicamente.",
    icon: Link2,
  },
  {
    value: "PRIVATE",
    label: "Particular",
    description: "Só você pode acessar.",
    icon: EyeOff,
  },
];

interface PlaylistPrivacySelectorProps {
  value: PlaylistPrivacyStatus;
  onValueChange: (value: PlaylistPrivacyStatus) => void;
  disabled?: boolean;
  className?: string;
}

export function PlaylistPrivacySelector({
  value,
  onValueChange,
  disabled = false,
  className,
}: PlaylistPrivacySelectorProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <p className="text-sm font-medium">Privacidade</p>
      <ToggleGroup
        variant="outline"
        size="sm"
        value={[value]}
        onValueChange={(newValue) => {
          if (newValue.length > 0) {
            onValueChange(newValue[0] as PlaylistPrivacyStatus);
          }
        }}
        disabled={disabled}
      >
        {PLAYLIST_PRIVACY_OPTIONS.map((option) => {
          const Icon = option.icon;
          return (
            <Tooltip key={option.value}>
              <TooltipTrigger
                render={
                  <ToggleGroupItem
                    value={option.value}
                    aria-label={option.description}
                  />
                }
              >
                <Icon className="h-4 w-4 shrink-0" />
                {option.label}
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>{option.description}</p>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </ToggleGroup>
    </div>
  );
}
