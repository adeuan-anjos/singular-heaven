import React from "react";

interface MediaGridProps {
  title?: string;
  children: React.ReactNode;
}

export function MediaGrid({ title, children }: MediaGridProps) {
  return (
    <div className="space-y-3">
      {title && (
        <div className="flex min-h-8 items-center">
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        </div>
      )}
      <div className="grid gap-4 pb-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
        {React.Children.map(children, (child, index) => (
          <div key={index} className="min-w-0">
            {child}
          </div>
        ))}
      </div>
    </div>
  );
}
