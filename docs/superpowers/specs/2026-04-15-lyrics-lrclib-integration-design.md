# LRCLIB Integration — Design Spec

**Data:** 2026-04-15
**Módulo:** `youtube-music`
**Escopo:** Substituir o `useLyrics` mock atual por integração real com a API pública LRCLIB. Backend-first: parsing e fetch acontecem no Rust. Frontend só consome JSON.

**Fora de escopo:** extração de cores dominantes da capa (será feito em outro plano com clean-room dedicado), word-level karaoke real do LRCLIB (a API não devolve enhanced; manteremos só synced).

---

## 1. Decisões UX (validadas com usuário)

| Decisão | Escolha |
|---------|---------|
| Fonte de letras | LRCLIB only — sem fallback para `yt_get_lyrics` |
| Cache | Nenhum — busca sob demanda |
| Trigger do fetch | Quando o `currentTrackId` muda no `usePlayerStore` (não quando a tela de lyrics abre) |
| UI durante o fetch | Capa + título + artista centralizados (mesmo visual de "sem letra"), sem mensagem |
| Erro de rede / timeout | Mesmo fallback "capa centralizada" + retry automático após 5s e 15s, silencioso |
| Match strategy | Match exato com `track_name`, `artist_name`, `album_name`, `duration`. Se 404, segunda tentativa sem `album_name` |
| Cores do background | Mantém `FALLBACK_COLORS` (cinza-azulado). Extração real fica para outro plano |

---

## 2. Backend (Rust)

### 2.1 Novo Tauri command

**Arquivo:** `src-tauri/src/youtube_music/commands.rs`

```rust
#[tauri::command]
pub async fn yt_lyrics_lrclib(
    track_name: String,
    artist_name: String,
    album_name: String,
    duration_seconds: u32,
) -> Result<String, String>
```

**Comportamento:**

1. Constrói URL: `https://lrclib.net/api/get?track_name=...&artist_name=...&album_name=...&duration=...` (URL-encode dos parâmetros).
2. `reqwest::get()` com `User-Agent: SingularHaven/1.0 (https://github.com/...)` (LRCLIB pede UA identificável).
3. Se 200 → parseia o JSON.
4. Se 404 → segunda tentativa SEM `album_name`. Se também 404 → retorna `Err("not_found")`.
5. Erro de rede / timeout / 5xx → propaga como `Err(...)` formatado com prefix `[yt_lyrics_lrclib]`.
6. Resposta da LRCLIB:
   ```json
   {
     "id": 12345,
     "trackName": "...",
     "artistName": "...",
     "albumName": "...",
     "duration": 222.0,
     "instrumental": false,
     "plainLyrics": "...",
     "syncedLyrics": "[mm:ss.xx]texto\n..."
   }
   ```
7. Se `instrumental === true` OU `syncedLyrics === null/empty` → retorna `Err("no_synced")`. (Para esta fase, plain lyrics não nos interessam; trataremos como "sem letra".)
8. Se `syncedLyrics` presente → parseia o formato LRC (regex `\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\](.+)`) para uma `Vec<LyricsLine>`.
9. Retorna JSON serializado de `LyricsResponse { type: "synced", lines: Vec<LyricsLine> }`.

**Tipo retornado:**

```rust
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LyricsLine {
    time: f64,        // segundos
    text: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LyricsResponse {
    #[serde(rename = "type")]
    kind: String,         // "synced"
    lines: Vec<LyricsLine>,
}
```

**Por que parsing no Rust:** evita carregar regex/parser no bundle JS, evita re-parse a cada render no React, e mantém o frontend agnóstico de formatos LRC futuros (se precisarmos suportar A2 enhanced depois, é só mudar o Rust).

### 2.2 Sem state, sem cache, sem session refresh

Diferente dos outros `yt_*` commands, este NÃO precisa de `State<YtMusicState>` nem `with_session_refresh`. É um fetch externo puro. Cliente HTTP é criado dentro da função (`reqwest::Client::new()`) — overhead trivial dado que é chamado no máximo 1-3 vezes por música.

### 2.3 Registro

Adicionar a `tauri::generate_handler!` em `lib.rs` junto dos outros `youtube_music::commands::yt_*`.

### 2.4 Erros de rede e cancelamento

- **Timeout:** `reqwest` configurado com `.timeout(Duration::from_secs(8))`.
- **Cancelamento (track muda durante fetch):** o frontend descarta a resposta tardia (vê na seção 3.3). Não tentamos cancelar o request no Rust — overhead desnecessário.

---

## 3. Frontend

### 3.1 Reescrita do `use-lyrics.ts`

Substitui o mock atual por um pequeno store Zustand global + hook reactivo.

**Novo arquivo:** `src/modules/youtube-music/stores/lyrics-fetch-store.ts`

```ts
type FetchStatus = "loading" | "ready" | "error";

interface FetchEntry {
  status: FetchStatus;
  data?: LyricsData;
  error?: string;
  retriesLeft: number;
  retryTimer?: number;   // setTimeout handle
  attempt: number;       // 1, 2, 3 ...
}

interface LyricsFetchState {
  byVideoId: Record<string, FetchEntry>;
  bootstrap: () => void;       // chamado uma vez no module mount
  cleanup: () => void;
}
```

**Comportamento:**

- `bootstrap()` chama `usePlayerStore.subscribe(s => s.currentTrackId, ...)`. Cada mudança de `currentTrackId`:
  1. Lê o `Track` completo via `useTrackCacheStore.getState().getTrack(videoId)`.
  2. Se sem track ou sem `durationSeconds` → grava entry como `{ status: "ready", data: missingData }`.
  3. Senão dispara `invoke<string>("yt_lyrics_lrclib", { trackName, artistName, albumName, durationSeconds })`.
  4. Sucesso → `JSON.parse(...)` para `LyricsData` synced; grava como `ready`.
  5. Erro `not_found` ou `no_synced` → grava como `ready` com `data = { type: "missing", colors: FALLBACK_COLORS }`.
  6. Outro erro → grava como `error`, agenda retry após 5s. Se o retry falhar de novo, agenda após 15s. Após 3 tentativas (inicial + 5s + 15s), grava como `ready` com `missing`.
- `cleanup()` cancela todos os timers pendentes e limpa subscriptions. Chamado quando o módulo `youtube-music` desmonta.

**Cancelamento de respostas tardias:** quando uma response chega, comparar com `usePlayerStore.getState().currentTrackId`. Se mudou, descartar silenciosamente.

### 3.2 Novo `useLyrics(videoId)`

```ts
export function useLyrics(videoId: string | null | undefined): {
  data: LyricsData | null;
  activeLineIndex: number;
  isLoading: boolean;
}
```

Lê `byVideoId[videoId]` do store. `data` é o `entry.data ?? null`. `isLoading` é `entry?.status !== "ready"`. `activeLineIndex` derivado em `useMemo` como hoje, mas só roda quando `data.type !== "missing"`.

### 3.3 Mocks deletados

Remover `src/modules/youtube-music/mocks/lyrics-mock.ts` mas manter o export `FALLBACK_COLORS` (movê-lo para `types/lyrics.ts` ou um novo `constants/lyrics.ts`). `LYRICS_MOCKS` e `DEFAULT_MOCK` saem do código.

### 3.4 Wire-up no boot do módulo

Em `src/modules/youtube-music/index.tsx`, no `useEffect` que faz `setup` do módulo (já existe um para auth/player init), chamar `useLyricsFetchStore.getState().bootstrap()`. No cleanup, chamar `cleanup()`.

---

## 4. UI (LyricsSheet ajustes mínimos)

`LyricsSheet.tsx` ganha lógica de 3 estados (em vez de 2 atuais):

```tsx
const { data, activeLineIndex, isLoading } = useLyrics(currentTrackId);

// Estado A: dados sincronizados → renderiza lyrics
// Estado B: loading OU error em retry → renderiza LyricsEmpty SEM mensagem
// Estado C: ready com type === "missing" → renderiza LyricsEmpty COM mensagem
```

**`LyricsEmpty` ganha prop opcional `showMessage?: boolean` (default `true`).** Quando `false` (estados loading/retry), oculta o parágrafo "Letra não disponível para esta música." e mostra apenas capa + título + artista centralizados.

```tsx
<LyricsEmpty track={track} showMessage={!isLoading} />
```

A transição de loading → lyrics fica suave porque os dois estados compartilham o mesmo container; o componente que muda à direita é `LyricsEmpty` → `LyricsLines`. A animação de spring do `motion` (já instalada) cobre.

---

## 5. Edge cases

| Caso | Comportamento |
|------|---------------|
| Track sem `durationSeconds` | Skip request, marca como `missing` |
| Track muda durante fetch | Resposta tardia descartada via comparação com `currentTrackId` atual |
| LRCLIB `instrumental === true` | Trata como `missing` |
| LRCLIB devolve apenas `plainLyrics` | Trata como `missing` (escopo desta fase = só synced) |
| Mesma música tocada de novo (sem cache) | Refaz request — comportamento intencional, dado escolha "sem cache" |
| Modo `enhanced` (word-level) | LRCLIB não fornece — sai do código de UI por enquanto, mas tipos em `types/lyrics.ts` permanecem (para integração futura) |
| App offline ao trocar de música | 3 retries silenciosos, depois `missing` |

---

## 6. Verificação

1. `npm run tauri dev`
2. Tocar uma música popular (Beatles, Queen, etc — alta chance de hit no LRCLIB)
3. Abrir a tela de lyrics — capa + título centralizados, em ~200-500ms transiciona para letras sincronizadas
4. Trocar de música — letras atualizam sozinhas conforme `currentTrackId` muda
5. Tocar uma música obscura → fallback "Letra não disponível" aparece
6. DevTools → Network: validar requests para `lrclib.net/api/get?...`. 1 hit ou 2 (se primeira falhou)
7. Desconectar Wi-Fi e trocar música → capa centralizada (sem mensagem) durante retries; após ~20s vira "Letra não disponível"
8. `npx tsc --noEmit` zero erros, `npm run build` passa

---

## 7. Mudanças resumidas

### Backend
- `src-tauri/src/youtube_music/commands.rs` — adiciona `yt_lyrics_lrclib`
- `src-tauri/src/lib.rs` — registra o command
- `src-tauri/Cargo.toml` — sem mudanças (reqwest e serde já presentes)

### Frontend
- `src/modules/youtube-music/stores/lyrics-fetch-store.ts` — NOVO
- `src/modules/youtube-music/hooks/use-lyrics.ts` — REESCRITO (lê do fetch store)
- `src/modules/youtube-music/components/lyrics/lyrics-empty.tsx` — adiciona prop `showMessage`
- `src/modules/youtube-music/components/lyrics/lyrics-sheet.tsx` — passa `showMessage={!isLoading}` para LyricsEmpty
- `src/modules/youtube-music/index.tsx` — chama `bootstrap()`/`cleanup()` do fetch store
- `src/modules/youtube-music/types/lyrics.ts` — sem mudanças (a `LyricsData` discriminada continua adequada)
- `src/modules/youtube-music/mocks/lyrics-mock.ts` — DELETADO; `FALLBACK_COLORS` movido para `types/lyrics.ts`

---

## 8. Fora de escopo (próximas fases)

- Extração real de cores dominantes da capa (clean-room separado)
- Cache local de letras (caso a equipe decida no futuro)
- Word-level karaoke (precisa de fonte alternativa — LRCLIB não tem)
- Instrumental tracks: animação visual diferente
- Fallback para `yt_get_lyrics` (decisão atual: só LRCLIB)
