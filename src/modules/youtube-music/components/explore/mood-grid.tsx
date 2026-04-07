import type { MoodCategory, StackPage } from "../../types/music";

interface MoodGridProps {
  categories: MoodCategory[];
  onSelect: (page: StackPage) => void;
}

export function MoodGrid({ categories, onSelect }: MoodGridProps) {
  return (
    <div className="flex flex-wrap gap-2 px-2">
      {categories.map((cat) => (
        <button
          key={cat.params}
          type="button"
          className="inline-flex h-8 items-center rounded-full border border-border px-3 text-sm text-foreground hover:bg-accent"
          onClick={() => onSelect({ type: "mood", params: cat.params, title: cat.title })}
        >
          {cat.title}
        </button>
      ))}
    </div>
  );
}
