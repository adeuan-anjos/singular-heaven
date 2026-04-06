import type { ComponentType, LazyExoticComponent } from "react";

export interface ModuleConfig {
  id: string;
  name: string;
  icon: ComponentType<{ className?: string }>;
  component: LazyExoticComponent<ComponentType>;
}
