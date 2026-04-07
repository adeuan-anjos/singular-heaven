import React from "react";

interface MediaGridProps {
  title?: string;
  children: React.ReactNode;
}

export function MediaGrid({ title, children }: MediaGridProps) {
  return (
    <div className="space-y-3">
      {title && (
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      )}
      <div className="grid gap-4 pb-4" style={{ gridTemplateColumns: "repeat(6, 1fr)", width: "max(100%, 1020px)" }}>
        {React.Children.map(children, (child, index) => (
          <div key={index} className="min-w-0">
            {child}
          </div>
        ))}
      </div>
    </div>
  );
}
