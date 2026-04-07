import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { Thumbnail } from "../../types/music";

interface MediaCardProps {
  title: string;
  subtitle?: string;
  thumbnails: Thumbnail[];
  rounded?: "full" | "md";
  onClick?: () => void;
}

export function MediaCard({ title, subtitle, thumbnails, rounded = "md", onClick }: MediaCardProps) {
  const imgUrl = thumbnails[0]?.url ?? "";

  return (
    <button
      type="button"
      className="flex w-40 flex-shrink-0 flex-col gap-2 rounded-md p-2 text-left hover:bg-accent"
      onClick={onClick}
    >
      <Avatar className={`h-36 w-36 ${rounded === "full" ? "rounded-full" : "rounded-md"}`}>
        <AvatarImage src={imgUrl} alt={title} className="object-cover" />
        <AvatarFallback className={rounded === "full" ? "rounded-full" : "rounded-md"}>
          {title.charAt(0)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{title}</p>
        {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
      </div>
    </button>
  );
}
