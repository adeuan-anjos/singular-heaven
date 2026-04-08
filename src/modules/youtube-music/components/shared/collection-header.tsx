import { useState, type ComponentType } from "react";
import { Button } from "@/components/ui/button";
import { Heart, Ellipsis } from "lucide-react";

export interface CollectionHeaderAction {
  label: string;
  icon?: ComponentType<{ className?: string }>;
  onClick: () => void;
  variant?: "outline" | "default";
}

export interface CollectionHeaderProps {
  title: string;
  thumbnailUrl?: string;
  /** Clickable subtitle (e.g. artist name) */
  subtitle?: string;
  onGoToAuthor?: () => void;
  /** Flexible info lines — each page passes what it needs */
  infoLines?: string[];
  description?: string;
  /** Action buttons — each page configures its own set */
  actions: CollectionHeaderAction[];
  /** Heart toggle */
  onLikeToggle?: () => void;
  liked?: boolean;
}

export function CollectionHeader({
  title,
  thumbnailUrl,
  subtitle,
  onGoToAuthor,
  infoLines,
  description,
  actions,
  onLikeToggle,
  liked,
}: CollectionHeaderProps) {
  const [internalLiked, setInternalLiked] = useState(false);
  const isLiked = liked ?? internalLiked;
  const toggleLike = onLikeToggle ?? (() => setInternalLiked((v) => !v));

  return (
    <div className="space-y-4">
      {/* Cover + Info */}
      <div className="flex items-start gap-6">
        <div className="flex h-48 w-48 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-muted">
          {thumbnailUrl ? (
            <img referrerPolicy="no-referrer" src={thumbnailUrl} alt={title} className="h-full w-full object-cover" />
          ) : (
            <span className="text-4xl text-muted-foreground">{title.charAt(0)}</span>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <h1 className="text-4xl font-bold text-foreground">{title}</h1>
          {subtitle && (
            <p className="text-sm text-muted-foreground">
              {onGoToAuthor ? (
                <button type="button" className="hover:underline" onClick={onGoToAuthor}>
                  {subtitle}
                </button>
              ) : (
                <span>{subtitle}</span>
              )}
            </p>
          )}
          {infoLines?.map((line) => (
            <p key={line} className="text-sm text-muted-foreground">
              {line}
            </p>
          ))}
          {description && (
            <p className="line-clamp-2 text-sm text-muted-foreground/70">{description}</p>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        {actions.map((action) => (
          <Button
            key={action.label}
            variant={action.variant ?? "outline"}
            onClick={action.onClick}
          >
            {action.icon && <action.icon className="mr-2 h-4 w-4" />}
            {action.label}
          </Button>
        ))}
        <Button variant="ghost" size="icon" onClick={toggleLike}>
          <Heart className={`h-5 w-5 ${isLiked ? "fill-red-500 text-red-500" : ""}`} />
        </Button>
        <Button variant="ghost" size="icon">
          <Ellipsis className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}
