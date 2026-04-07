import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

interface MusicHeaderProps {
  title: string;
  onBack: () => void;
}

export function MusicHeader({ title, onBack }: MusicHeaderProps) {
  return (
    <div className="flex items-center gap-3 border-b border-border px-4 py-2">
      <Button variant="ghost" size="icon" onClick={onBack}>
        <ArrowLeft className="h-5 w-5" />
      </Button>
      <h1 className="truncate text-lg font-semibold text-foreground">{title}</h1>
    </div>
  );
}
