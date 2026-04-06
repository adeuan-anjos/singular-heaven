import { useActiveModule } from "@/hooks/use-active-module";
import { Sidebar } from "./sidebar";
import { ModuleHost } from "./module-host";

export function AppShell() {
  const { activeModule, activeModuleId, switchModule, modules } = useActiveModule();

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      <Sidebar
        modules={modules}
        activeModuleId={activeModuleId}
        onModuleSelect={switchModule}
      />
      <ModuleHost activeModule={activeModule} />
    </div>
  );
}
