import { cn } from "@/lib/utils";
import type { MoodCategory, StackPage } from "../../types/music";

interface MoodGridProps {
  categories: MoodCategory[];
  onSelect: (page: StackPage) => void;
}

export function MoodGrid({ categories, onSelect }: MoodGridProps) {
  return (
    <div className="grid grid-cols-6 gap-3">
      {categories.map((cat) => (
        <button
          key={cat.params}
          type="button"
          className="group flex h-10 items-center overflow-hidden rounded-md bg-card text-left text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => onSelect({ type: "mood", params: cat.params, title: cat.title })}
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
