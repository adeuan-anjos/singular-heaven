# Singular Haven — Stack Setup Design Spec

**Data**: 2026-04-06
**Escopo**: Scaffold do projeto + configuração completa da stack + shell do app com navegação

## Objetivo

Montar o projeto Tauri 2 com React 19 + TypeScript + Tailwind CSS 4 + shadcn/ui + ReUI configurados e funcionando. Criar a estrutura de módulos e o shell do app com navegação lateral.

## Stack — Versões Fixadas

| Pacote | Versão |
|---|---|
| `@tauri-apps/cli` | ^2.10.1 |
| `@tauri-apps/api` | ^2.10.1 |
| `react` | ^19.2.4 |
| `react-dom` | ^19.2.4 |
| `typescript` | ^5.7.0 |
| `tailwindcss` | ^4.1.0 |
| `@tailwindcss/vite` | ^4.2.2 |
| `lucide-react` | ^1.7.0 |
| `tw-animate-css` | latest |
| `class-variance-authority` | latest |
| `clsx` | latest |
| `tailwind-merge` | latest |
| `@types/react` | ^19.2.14 |
| `@types/react-dom` | ^19.2.3 |

**shadcn/ui**: CLI v4 (`npx shadcn@latest init`)
**ReUI**: Registry shadcn (`npx shadcn@latest add @reui/[componente]`)

## Scaffold

### Comando base

```bash
npm create tauri-app@latest singular-haven -- --manager npm --template react-ts
```

Isto gera a estrutura Vite + React + TypeScript + Tauri 2. Depois:

1. Atualizar dependências para as versões acima
2. Instalar Tailwind CSS 4 com plugin Vite
3. Inicializar shadcn/ui
4. Configurar ReUI registry

### Vite config

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
});
```

### CSS — Tailwind v4

```css
@import "tailwindcss";
@import "tw-animate-css";

@theme {
  /* Design tokens do Singular Haven */
  /* shadcn/ui gera os tokens base aqui */
}
```

Sem `tailwind.config.js`. Sem PostCSS config. Tudo via CSS + Vite plugin.

## Estrutura de Pastas

```
singular-haven/
├── src/
│   ├── app.tsx                    # Router principal, monta shell + módulos lazy
│   ├── main.tsx                   # Entry point React
│   ├── index.css                  # Tailwind + tema + shadcn tokens
│   ├── lib/
│   │   └── utils.ts               # cn() helper (shadcn)
│   ├── components/
│   │   ├── ui/                    # shadcn/ui components (NÃO editar)
│   │   ├── shell/
│   │   │   ├── app-shell.tsx      # Layout principal: sidebar + content area
│   │   │   ├── sidebar.tsx        # Navegação lateral entre módulos
│   │   │   └── module-loader.tsx  # React.lazy + Suspense wrapper
│   │   └── shared/                # Componentes compartilhados entre módulos
│   ├── modules/
│   │   ├── youtube-music/         # Módulo YT Music (futuro)
│   │   │   └── index.tsx          # Entry point do módulo (lazy loaded)
│   │   └── download-manager/      # Módulo Download Manager (futuro)
│   │       └── index.tsx          # Entry point do módulo (lazy loaded)
│   ├── hooks/                     # Hooks compartilhados
│   ├── stores/                    # Estado global (se necessário)
│   └── types/                     # Tipos TypeScript compartilhados
├── src-tauri/
│   ├── src/
│   │   └── lib.rs                 # Backend Rust principal
│   ├── Cargo.toml
│   └── tauri.conf.json
├── docs/
│   └── keep-alive-screens.md      # Doc de referência para módulos
├── components.json                # Config shadcn/ui (sem tailwind.config ref)
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## Arquitetura de Módulos

### Carregamento lazy

Cada módulo é importado via `React.lazy()`:

```tsx
const YouTubeMusic = React.lazy(() => import("./modules/youtube-music"));
const DownloadManager = React.lazy(() => import("./modules/download-manager"));
```

### Desmontagem condicional

Módulos inativos são **desmontados**, não escondidos. Nenhum `display: none` — o componente é removido da árvore React:

```tsx
<Suspense fallback={<ModuleSkeleton />}>
  {activeModule === "youtube-music" && <YouTubeMusic />}
  {activeModule === "download-manager" && <DownloadManager />}
</Suspense>
```

### Contrato de módulo

Cada módulo exporta um default component e opcionalmente metadata:

```tsx
// modules/youtube-music/index.tsx
export default function YouTubeMusicModule() { ... }
export const moduleConfig = {
  id: "youtube-music",
  name: "YouTube Music",
  icon: "music",  // lucide icon name
};
```

## Shell do App

### Layout

- **Sidebar esquerda**: Ícones dos módulos ativos, compacta (56-64px largura)
- **Área de conteúdo**: Ocupa o restante, renderiza o módulo ativo
- **Visual**: `backdrop-blur-xs` para efeito de vidro no fundo, usando classes semânticas do Tailwind/shadcn

### Navegação

- Sidebar com ícones Lucide para cada módulo
- Estado ativo destacado visualmente
- Tooltip com nome do módulo ao hover
- Extensível: adicionar módulo = adicionar entry na config + pasta em modules/

### Registro de módulos

Array de configuração centralizado:

```tsx
const modules = [
  { id: "youtube-music", name: "YouTube Music", icon: Music, component: () => import("./modules/youtube-music") },
  { id: "download-manager", name: "Gerenciador de Downloads", icon: Download, component: () => import("./modules/download-manager") },
] as const;
```

Adicionar módulo futuro = adicionar linha neste array + criar pasta.

## Decisões de Design

1. **Sem React Router**: Navegação entre módulos é simples (state + lazy mount). Router seria overhead desnecessário para tabs de módulos.
2. **Sem state manager global no MVP**: `useState` no shell para módulo ativo. Zustand/Jotai só quando necessário.
3. **shadcn/ui puro**: Todos os componentes de UI vêm do shadcn ou ReUI. Zero componentes custom do zero.
4. **Imports Lucide por path**: `import Music from "lucide-react/icons/music"` para performance no dev server.
5. **Sem customização de `src/components/ui/`**: Styling via `className` apenas.

## O que NÃO está neste escopo

- Implementação dos módulos YouTube Music e Download Manager (apenas placeholders)
- Backend Rust além do scaffold padrão do Tauri
- Onboarding/stepper (fase posterior)
- OAuth/autenticação (fase posterior)
- Sidecars (yt-dlp, ytmusic-api) — fase posterior
