import { useActiveModule } from "@/hooks/use-active-module";
import { Toaster } from "@/components/ui/sonner";
import { Sidebar } from "./sidebar";
import { ModuleHost } from "./module-host";
import { Titlebar } from "./titlebar";

export function AppShell() {
  const { activeModule, activeModuleId, switchModule, modules } = useActiveModule();

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background">
      <Titlebar />
      <div className="flex min-h-0 flex-1">
        <Sidebar
          modules={modules}
          activeModuleId={activeModuleId}
          onModuleSelect={switchModule}
        />
        <ModuleHost activeModule={activeModule} />
      </div>
      <Toaster />
    </div>
  );
}
