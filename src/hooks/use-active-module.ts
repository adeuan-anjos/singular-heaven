import { useState, useCallback } from "react";
import { modules } from "@/config/modules";

export function useActiveModule() {
  const [activeModuleId, setActiveModuleId] = useState<string>(modules[0].id);

  const activeModule = modules.find((m) => m.id === activeModuleId) ?? modules[0];

  const switchModule = useCallback((id: string) => {
    setActiveModuleId(id);
  }, []);

  return { activeModule, activeModuleId, switchModule, modules } as const;
}
