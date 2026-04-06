# Stack Setup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold o projeto Singular Haven com Tauri 2 + React 19 + TypeScript + Tailwind CSS 4 + shadcn/ui + ReUI, com shell de navegação entre módulos e placeholders funcionais.

**Architecture:** Single window, single WebView. Shell com sidebar compacta à esquerda, módulos carregados via React.lazy + Suspense com desmontagem condicional. Sem React Router — estado simples para navegação. Módulos registrados em array de configuração centralizado.

**Tech Stack:** Tauri 2.10.x, React 19.x, TypeScript 5.8.x, Vite 7.x, Tailwind CSS 4.1.x, @tailwindcss/vite 4.2.x, shadcn/ui CLI v4, ReUI registry, Lucide React 1.7.x, tw-animate-css.

---

## File Map

```
singular-haven/
├── src/
│   ├── main.tsx                          # Entry point React
│   ├── app.tsx                           # Shell root: sidebar + module host
│   ├── index.css                         # Tailwind + shadcn tokens + tema dark
│   ├── vite-env.d.ts                     # Vite type declarations
│   ├── lib/
│   │   └── utils.ts                      # cn() helper (shadcn)
│   ├── config/
│   │   └── modules.ts                    # Registry de módulos (id, name, icon, loader)
│   ├── components/
│   │   ├── ui/                           # shadcn/ui components (NÃO editar)
│   │   └── shell/
│   │       ├── app-shell.tsx             # Layout: sidebar + content area
│   │       ├── sidebar.tsx               # Navegação lateral com ícones
│   │       ├── module-host.tsx           # React.lazy + Suspense + mount condicional
│   │       └── module-skeleton.tsx       # Fallback skeleton para Suspense
│   ├── modules/
│   │   ├── youtube-music/
│   │   │   └── index.tsx                 # Placeholder YouTube Music
│   │   └── download-manager/
│   │       └── index.tsx                 # Placeholder Download Manager
│   ├── hooks/
│   │   └── use-active-module.ts          # Hook de estado do módulo ativo
│   └── types/
│       └── module.ts                     # Tipos compartilhados de módulo
├── src-tauri/
│   ├── capabilities/
│   │   └── default.json                  # Capabilities Tauri 2
│   ├── src/
│   │   ├── lib.rs                        # App logic principal
│   │   └── main.rs                       # Entry point Rust
│   ├── icons/                            # Ícones do app
│   ├── build.rs                          # Tauri build script
│   ├── Cargo.toml                        # Deps Rust
│   └── tauri.conf.json                   # Config Tauri
├── docs/
│   ├── memory-optimization.md            # Guia de otimização (já existe)
│   └── keep-alive-screens.md             # Referência módulos
├── components.json                       # Config shadcn/ui + ReUI registry
├── package.json
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.node.json
├── vite.config.ts
├── index.html
├── CLAUDE.md                             # Já existe
└── .gitignore
```

---

## Task 1: Scaffold Tauri 2 + React + TypeScript

**Files:**
- Create: Todos os arquivos do scaffold padrão Tauri 2 react-ts
- Modify: `CLAUDE.md` (mover para raiz do novo projeto se necessário)

- [ ] **Step 1: Inicializar repositório git**

```bash
cd ./singular-haven
git init
git add CLAUDE.md docs/
git commit -m "chore: add CLAUDE.md and docs"
```

- [ ] **Step 2: Criar scaffold Tauri em diretório temporário**

```bash
cd ~/projetos
npm create tauri-app@latest singular-haven-temp -- --manager npm --template react-ts
```

Se o diretório `singular-haven` já existe e impede o scaffold, usar diretório temp e mover os arquivos.

- [ ] **Step 3: Mover arquivos do scaffold para o projeto**

```bash
cd ~/projetos
# Copiar todos os arquivos do scaffold para singular-haven, sem sobrescrever CLAUDE.md e docs/
cp -rn singular-haven-temp/* singular-haven/
cp -rn singular-haven-temp/.* singular-haven/ 2>/dev/null
rm -rf singular-haven-temp
```

- [ ] **Step 4: Verificar estrutura**

```bash
cd ./singular-haven
ls -la
ls src/
ls src-tauri/src/
```

Expected: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src-tauri/`

- [ ] **Step 5: Instalar dependências base**

```bash
cd ./singular-haven
npm install
```

Expected: `node_modules/` criado, zero erros.

- [ ] **Step 6: Atualizar tauri.conf.json**

Modificar `src-tauri/tauri.conf.json`:

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Singular Haven",
  "version": "0.1.0",
  "identifier": "com.singularhaven.app",
  "build": {
    "beforeDevCommand": "npm run dev",
    "devUrl": "http://localhost:1420",
    "beforeBuildCommand": "npm run build",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      {
        "title": "Singular Haven",
        "width": 1200,
        "height": 800,
        "minWidth": 800,
        "minHeight": 600,
        "decorations": true
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ]
  }
}
```

- [ ] **Step 7: Atualizar Cargo.toml com profile otimizado**

Modificar `src-tauri/Cargo.toml` — seção `[profile.release]`:

```toml
[profile.release]
codegen-units = 1
lto = true
opt-level = "s"
panic = "abort"
strip = true
```

Nota: mudar `opt-level` de `3` (padrão do scaffold) para `"s"` — otimizar para tamanho conforme guia de memória.

- [ ] **Step 8: Commit scaffold**

```bash
git add -A
git commit -m "chore: scaffold Tauri 2 + React + TypeScript via create-tauri-app"
```

---

## Task 2: Instalar e configurar Tailwind CSS 4

**Files:**
- Modify: `package.json` (deps)
- Modify: `vite.config.ts` (plugin)
- Modify: `src/index.css` ou `src/App.css` → será substituído pelo shadcn no Task 3

- [ ] **Step 1: Instalar Tailwind CSS 4 + plugin Vite**

```bash
cd ./singular-haven
npm install tailwindcss @tailwindcss/vite
```

- [ ] **Step 2: Instalar @types/node para path alias**

```bash
npm install -D @types/node
```

- [ ] **Step 3: Atualizar vite.config.ts**

Substituir o conteúdo completo de `vite.config.ts`:

```ts
import path from "path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
});
```

- [ ] **Step 4: Criar src/index.css com Tailwind base**

Criar `src/index.css` (será expandido pelo shadcn init no próximo task):

```css
@import "tailwindcss";
```

- [ ] **Step 5: Atualizar src/main.tsx para importar index.css**

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] **Step 6: Remover App.css do scaffold**

```bash
rm src/App.css
```

Remover o import de `./App.css` do `src/App.tsx` se existir.

- [ ] **Step 7: Atualizar tsconfig.json com path alias**

Adicionar ao `compilerOptions` do `tsconfig.json`:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

Se existir `tsconfig.app.json`, adicionar o mesmo lá.

- [ ] **Step 8: Commit Tailwind**

```bash
git add -A
git commit -m "feat: configure Tailwind CSS 4 with Vite plugin and path aliases"
```

---

## Task 3: Inicializar shadcn/ui + ReUI

**Files:**
- Create: `components.json`
- Create: `src/lib/utils.ts`
- Modify: `src/index.css` (tokens shadcn)
- Modify: `tsconfig.json` (se shadcn CLI não fez)

- [ ] **Step 1: Instalar dependências do shadcn**

```bash
cd ./singular-haven
npm install class-variance-authority clsx tailwind-merge tw-animate-css lucide-react
```

- [ ] **Step 2: Rodar shadcn init**

```bash
npx shadcn@latest init
```

Quando perguntar:
- Style: `new-york`
- Base color: `neutral`
- CSS file: `src/index.css`
- CSS variables: `yes`

Se o CLI falhar por algum motivo, criar manualmente os arquivos no Step 3.

- [ ] **Step 3: Verificar components.json**

Confirmar que `components.json` foi criado na raiz com:

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/index.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}
```

- [ ] **Step 4: Adicionar registry ReUI ao components.json**

Adicionar a chave `registries` ao `components.json`:

```json
{
  "registries": {
    "reui": {
      "url": "https://reui.io/r"
    }
  }
}
```

- [ ] **Step 5: Verificar src/lib/utils.ts**

Confirmar que existe com:

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 6: Adicionar tw-animate-css ao index.css**

No topo do `src/index.css`, logo após `@import "tailwindcss"`:

```css
@import "tailwindcss";
@import "tw-animate-css";
```

O restante do arquivo (gerado pelo shadcn init) permanece inalterado.

- [ ] **Step 7: Instalar componentes shadcn necessários para o shell**

```bash
npx shadcn@latest add button tooltip separator
```

Estes são os componentes mínimos para a sidebar de navegação.

- [ ] **Step 8: Commit shadcn + ReUI**

```bash
git add -A
git commit -m "feat: initialize shadcn/ui with Tailwind v4 + ReUI registry"
```

---

## Task 4: Criar tipos e configuração de módulos

**Files:**
- Create: `src/types/module.ts`
- Create: `src/config/modules.ts`
- Create: `src/hooks/use-active-module.ts`

- [ ] **Step 1: Criar diretórios**

```bash
mkdir -p src/types src/config src/hooks src/components/shell src/modules/youtube-music src/modules/download-manager
```

- [ ] **Step 2: Criar src/types/module.ts**

```ts
import type { ComponentType, LazyExoticComponent } from "react";

export interface ModuleConfig {
  id: string;
  name: string;
  icon: ComponentType<{ className?: string }>;
  component: LazyExoticComponent<ComponentType>;
}
```

- [ ] **Step 3: Criar src/config/modules.ts**

```ts
import { lazy } from "react";
import type { ModuleConfig } from "@/types/module";
import Music from "lucide-react/icons/music";
import Download from "lucide-react/icons/download";

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
```

- [ ] **Step 4: Criar src/hooks/use-active-module.ts**

```ts
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
```

- [ ] **Step 5: Commit tipos e config**

```bash
git add src/types/ src/config/ src/hooks/
git commit -m "feat: add module type system, registry, and active module hook"
```

---

## Task 5: Criar placeholders dos módulos

**Files:**
- Create: `src/modules/youtube-music/index.tsx`
- Create: `src/modules/download-manager/index.tsx`

- [ ] **Step 1: Criar src/modules/youtube-music/index.tsx**

```tsx
export default function YouTubeMusicModule() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-foreground">YouTube Music</h1>
        <p className="mt-2 text-muted-foreground">Módulo em desenvolvimento</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Criar src/modules/download-manager/index.tsx**

```tsx
export default function DownloadManagerModule() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-foreground">Gerenciador de Downloads</h1>
        <p className="mt-2 text-muted-foreground">Módulo em desenvolvimento</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit placeholders**

```bash
git add src/modules/
git commit -m "feat: add placeholder modules for YouTube Music and Download Manager"
```

---

## Task 6: Criar o shell do app (sidebar + module host)

**Files:**
- Create: `src/components/shell/module-skeleton.tsx`
- Create: `src/components/shell/sidebar.tsx`
- Create: `src/components/shell/module-host.tsx`
- Create: `src/components/shell/app-shell.tsx`
- Modify: `src/app.tsx` (renomear de App.tsx)
- Modify: `src/main.tsx`

- [ ] **Step 1: Criar src/components/shell/module-skeleton.tsx**

```tsx
export function ModuleSkeleton() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
    </div>
  );
}
```

- [ ] **Step 2: Criar src/components/shell/sidebar.tsx**

```tsx
import type { ModuleConfig } from "@/types/module";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface SidebarProps {
  modules: ModuleConfig[];
  activeModuleId: string;
  onModuleSelect: (id: string) => void;
}

export function Sidebar({ modules, activeModuleId, onModuleSelect }: SidebarProps) {
  return (
    <aside className="flex h-full w-14 flex-col items-center gap-2 border-r border-border bg-background/80 px-2 py-4 backdrop-blur-xs">
      <TooltipProvider delayDuration={0}>
        {modules.map((mod) => {
          const Icon = mod.icon;
          const isActive = mod.id === activeModuleId;

          return (
            <Tooltip key={mod.id}>
              <TooltipTrigger asChild>
                <Button
                  variant={isActive ? "secondary" : "ghost"}
                  size="icon"
                  className={cn(
                    "h-10 w-10",
                    isActive && "bg-secondary text-secondary-foreground"
                  )}
                  onClick={() => onModuleSelect(mod.id)}
                >
                  <Icon className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>{mod.name}</p>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </TooltipProvider>
    </aside>
  );
}
```

- [ ] **Step 3: Criar src/components/shell/module-host.tsx**

```tsx
import { Suspense } from "react";
import type { ModuleConfig } from "@/types/module";
import { ModuleSkeleton } from "./module-skeleton";

interface ModuleHostProps {
  activeModule: ModuleConfig;
}

export function ModuleHost({ activeModule }: ModuleHostProps) {
  const Component = activeModule.component;

  return (
    <main className="flex-1 overflow-hidden">
      <Suspense fallback={<ModuleSkeleton />}>
        <Component key={activeModule.id} />
      </Suspense>
    </main>
  );
}
```

Nota: `key={activeModule.id}` garante que React desmonta o componente anterior completamente ao trocar de módulo, em vez de tentar reutilizar a instância.

- [ ] **Step 4: Criar src/components/shell/app-shell.tsx**

```tsx
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
```

- [ ] **Step 5: Substituir src/App.tsx pelo app.tsx**

Deletar `src/App.tsx` e criar `src/app.tsx`:

```tsx
import { AppShell } from "@/components/shell/app-shell";

export default function App() {
  return <AppShell />;
}
```

- [ ] **Step 6: Atualizar src/main.tsx**

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./app";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] **Step 7: Limpar arquivos do scaffold não usados**

```bash
rm -f src/assets/react.svg public/tauri.svg public/vite.svg
```

Remover a pasta `src/assets/` se estiver vazia:

```bash
rmdir src/assets 2>/dev/null
```

- [ ] **Step 8: Commit shell**

```bash
git add -A
git commit -m "feat: app shell with sidebar navigation and module mounting system"
```

---

## Task 7: Configurar tema dark + backdrop glass

**Files:**
- Modify: `src/index.css` (adicionar dark mode como padrão)
- Modify: `index.html` (classe dark no html)

- [ ] **Step 1: Adicionar classe dark ao index.html**

Modificar `index.html` — adicionar `class="dark"` ao elemento `<html>`:

```html
<!doctype html>
<html lang="pt-BR" class="dark">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Singular Haven</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Verificar que o shadcn gerou tokens dark no index.css**

Ler `src/index.css` e confirmar que existe um bloco `.dark { ... }` com todos os tokens invertidos. Se não existir, o shadcn init não gerou corretamente e será necessário adicioná-lo.

- [ ] **Step 3: Commit tema dark**

```bash
git add index.html src/index.css
git commit -m "feat: set dark theme as default with glass backdrop sidebar"
```

---

## Task 8: Criar doc keep-alive-screens + verificação final

**Files:**
- Create: `docs/keep-alive-screens.md`

- [ ] **Step 1: Criar docs/keep-alive-screens.md**

```markdown
# Keep-Alive Screens — Referência de Módulos

## Regra Geral

Todos os módulos são **desmontados** quando inativos. Nenhum módulo mantém estado, listeners, timers ou sidecars quando não está visível.

## Como funciona

1. Módulos são carregados via `React.lazy()` e montados com `<Suspense>`
2. Cada módulo recebe uma `key` única no `ModuleHost` — trocar de módulo força unmount completo
3. O `useEffect` cleanup de cada módulo DEVE liberar todos os recursos (ver `docs/memory-optimization.md` seção 3)

## Quando NÃO desmontar

Se no futuro um módulo precisar manter estado entre navegações (ex: player de música tocando em background), ele deve:

1. Extrair o estado persistente para um store global (Zustand)
2. Manter o sidecar vivo via gerenciador no nível do app (não do módulo)
3. Documentar aqui qual módulo e por quê

## Módulos Ativos

| Módulo | Desmonta? | Sidecars | Notas |
|---|---|---|---|
| YouTube Music | Sim | yt-dlp, ytmusic-api | Futuro: player pode precisar de keep-alive |
| Download Manager | Sim | yt-dlp (compartilhado) | Downloads ativos devem continuar em background via Rust |
```

- [ ] **Step 2: Rodar verificação de tipos**

```bash
cd ./singular-haven
npx tsc --noEmit
```

Expected: Zero erros de tipo.

- [ ] **Step 3: Rodar dev server para verificação visual**

```bash
npm run tauri dev
```

Expected: Janela Tauri abre com sidebar à esquerda mostrando 2 ícones (Music e Download), área de conteúdo mostrando o placeholder do módulo ativo, tema dark aplicado, backdrop-blur na sidebar.

- [ ] **Step 4: Verificar troca de módulos**

Clicar nos ícones da sidebar e confirmar:
- Módulo anterior é desmontado (não apenas escondido)
- Módulo novo é carregado com skeleton intermediário
- Tooltip aparece ao hover nos ícones

- [ ] **Step 5: Commit final**

```bash
git add -A
git commit -m "feat: add keep-alive docs and verify full stack setup"
```

---

## Checklist de Verificação Final

- [ ] `npm run tauri dev` roda sem erros
- [ ] `npx tsc --noEmit` passa sem erros
- [ ] Sidebar com 2 ícones de módulo funciona
- [ ] Troca de módulo desmonta o anterior
- [ ] Tema dark aplicado
- [ ] Backdrop-blur visível na sidebar
- [ ] Nenhum arquivo do scaffold original permanece (logos, App.css, assets demo)
- [ ] `components.json` tem ReUI registry configurado
- [ ] `npx shadcn@latest add button` funciona (teste de CLI)
