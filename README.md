<p align="center">
  <img src="assets/brand/icon-circle-256.png" alt="Singular Haven" width="128" height="128" />
</p>

<h1 align="center">Singular Haven</h1>

<p align="center">
  A lightweight, unified desktop app for personal utilities — built to replace bloated web apps that eat your RAM for breakfast.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-0.1.0-blue" alt="Version" />
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey" alt="Platform" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License" />
  <img src="https://img.shields.io/badge/vibe--coded-100%25-ff69b4" alt="Vibe Coded" />
</p>

---

## Why?

YouTube Music on the browser easily eats **1.5 GB of RAM**. Multiply that by every web app you keep open — Spotify, Discord, downloads — and suddenly half your memory is gone.

Singular Haven replaces all of that with a single native app:

| State | Memory Usage |
|---|---|
| Active use | **100 – 250 MB** |
| Background | **50 – 90 MB** |

That's **6–15x less** than browser-based alternatives.

## What It Does

Singular Haven is a modular desktop app where each utility lives as an independent module. Inactive modules are fully unloaded from memory — zero listeners, zero state, zero background cost.

### YouTube Music (Active)

A full-featured YouTube Music client with a custom lightweight UI — no browser, no Electron, no web bloat.

- Full playback with queue management, shuffle, and repeat
- Home, Explore, Library, Search — all native
- Playlist management (create, edit, delete, reorder, custom thumbnails)
- Track likes synced with your real YouTube Music account
- Radio mode with on-demand track loading
- Artist and album pages
- Multi-account Google support with channel selection
- Transparent session refresh — no random logouts
- MediaSession integration for system media controls
- Virtual scrolling for large playlists
- SWR cache with SQLite — instant startup from warm cache

### Download Manager (Planned)

Native download management — in development.

### More Modules Planned

Voice channels, minimal browser, AI assistant — all following the same philosophy: native, lightweight, unified.

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | [Tauri 2.0](https://tauri.app/) (Rust + WebView) |
| Frontend | React 19 + TypeScript + Vite |
| Styling | Tailwind CSS 4 + [shadcn/ui](https://ui.shadcn.com/) |
| State | Zustand (granular selectors, no re-render cascades) |
| Routing | Wouter |
| Backend | Rust with Tokio async runtime |
| Database | SQLite (via rusqlite) |
| HTTP | reqwest with rustls-tls |
| YouTube API | Custom `ytmusic-api` Rust crate (InnerTube) |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (LTS)
- [Rust](https://rustup.rs/) (stable)
- [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your platform

### Development

```bash
git clone https://github.com/adeuan-anjos/singular-heaven.git
cd singular-heaven
npm install
npm run tauri dev
```

### Build

```bash
npm run tauri build
```

## Architecture

```
src/
├── components/ui/      # shadcn/ui components (do not edit directly)
├── modules/
│   ├── youtube-music/  # YouTube Music client
│   │   ├── components/ # UI (pages, layout, shared)
│   │   ├── stores/     # Zustand stores (player, queue, cache, likes)
│   │   └── services/   # Business logic
│   └── download-manager/ # Download manager (stub)
└── app-shell.tsx       # Root layout (titlebar, sidebar, module host)

src-tauri/
├── src/
│   ├── lib.rs          # Tauri setup, protocols, plugin registration
│   └── youtube_music/  # Rust backend (auth, streaming, API, cache)
└── Cargo.toml

crates/
└── ytmusic-api/        # Custom YouTube Music InnerTube API client
```

Modules are loaded via `React.lazy` + `Suspense` and fully unmounted when inactive. Rust sidecars start on demand and shut down when their module deactivates.

## Performance Philosophy

This app is **obsessively optimized for low memory usage**:

- High-frequency state (player progress, timers) uses `useRef` + direct DOM manipulation — never `useState` in root components
- Zustand with granular selectors prevents re-render cascades
- Virtual scrolling for any list that could exceed 100 items
- `React.memo` on every component receiving high-frequency callbacks
- `Arc<RwLock>` in Rust for parallel API calls (startup went from 10.3s to 1.36s)
- SWR cache backed by SQLite — warm starts in ~21ms
- CSS animations use only `transform`/`opacity` (GPU-composable) and pause when minimized

## Vibe Coded

This project is **100% vibe coded** — built entirely with AI assistance during spare time. No team, no sprints, no deadlines. Just a developer tired of web apps eating all the RAM, and an AI that doesn't sleep.

## License

[MIT](LICENSE)
