import { Suspense } from "react";
import type { ModuleConfig } from "@/types/module";
import { ModuleSkeleton } from "./module-skeleton";

interface ModuleHostProps {
  activeModule: ModuleConfig;
}

export function ModuleHost({ activeModule }: ModuleHostProps) {
  const Component = activeModule.component;

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <Suspense fallback={<ModuleSkeleton />}>
        <Component key={activeModule.id} />
      </Suspense>
    </main>
  );
}
