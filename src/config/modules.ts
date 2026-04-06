import { lazy } from "react";
import { Music, Download } from "lucide-react";
import type { ModuleConfig } from "@/types/module";

export const modules: ModuleConfig[] = [
  {
    id: "youtube-music",
    name: "YouTube Music",
    icon: Music,
    component: lazy(() => import("@/modules/youtube-music")),
  },
  {
    id: "download-manager",
    name: "Gerenciador de Downloads",
    icon: Download,
    component: lazy(() => import("@/modules/download-manager")),
  },
];
