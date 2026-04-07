import { SectionHeader } from "./section-header";

interface CarouselSectionProps {
  title: string;
  onSeeAll?: () => void;
  children: React.ReactNode;
}

export function CarouselSection({ title, onSeeAll, children }: CarouselSectionProps) {
  return (
    <div className="space-y-3">
      <SectionHeader title={title} onSeeAll={onSeeAll} />
      <div className="overflow-x-auto">
        <div className="flex gap-2 pb-4">
          {children}
        </div>
      </div>
    </div>
  );
}
