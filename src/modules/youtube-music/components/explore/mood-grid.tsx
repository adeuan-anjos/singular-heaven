import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { paths } from "../../router/paths";
import type { MoodCategory } from "../../types/music";

interface MoodGridProps {
  categories: MoodCategory[];
}

export function MoodGrid({ categories }: MoodGridProps) {
  const [, navigate] = useLocation();
  return (
    <div className="grid grid-cols-6 gap-3">
      {categories.map((cat) => (
        <button
          key={cat.params}
          type="button"
          className="group flex h-10 items-center overflow-hidden rounded-md bg-card text-left text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => navigate(paths.mood(cat.params, cat.title))}
        >
          <span
            aria-hidden="true"
            className={cn("h-full w-1 shrink-0", cat.color ?? "bg-muted-foreground")}
          />
          <span className="truncate px-3">{cat.title}</span>
        </button>
      ))}
    </div>
  );
}
