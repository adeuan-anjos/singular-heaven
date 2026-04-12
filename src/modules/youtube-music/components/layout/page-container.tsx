import type { ReactNode } from "react";

interface PageContainerProps {
  children: ReactNode;
}

/**
 * Owns horizontal width, padding, and vertical gap for every page in the
 * YouTube Music module. Sits inside ScrollRegion and wraps <Switch>, so
 * routes render their content directly without declaring their own outer
 * wrapper.
 *
 * - max-w-screen-xl + mx-auto: centered content up to ~1280px.
 * - p-6: shadcn v4 dashboard default (24px on all sides).
 * - gap-6: vertical rhythm between sibling sections (replaces space-y-*).
 * - @container/main: enables container queries for descendants.
 */
export function PageContainer({ children }: PageContainerProps) {
  return (
    <div className="@container/main mx-auto flex w-full max-w-screen-xl flex-col gap-6 p-6">
      {children}
    </div>
  );
}
