import { Button } from "@/components/ui/button";

interface SectionHeaderProps {
  title: string;
  onSeeAll?: () => void;
}

export function SectionHeader({ title, onSeeAll }: SectionHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      {onSeeAll && (
        <Button variant="ghost" size="sm" onClick={onSeeAll}>
          Ver tudo
        </Button>
      )}
    </div>
  );
}
