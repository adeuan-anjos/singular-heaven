# YouTube Music — Autenticacao

Como o modulo YouTube Music autentica com a conta Google do usuario.

## Arquitetura

Autenticacao e 100% backend-first. O frontend nunca toca em cookies ou faz requests HTTP. Todo o fluxo acontece no Rust:

```
Browser (cookies no disco)
  → rookie crate (extrai cookies)
    → YtMusicClient (monta headers SAPISIDHASH + X-Goog-AuthUser)
      → reqwest (faz requests InnerTube)
```

## Fluxo de login

1. **LoginScreen** — `yt_detect_browsers` lista browsers com cookies do YouTube
2. **Selecao de browser** — `yt_auth_from_browser` extrai cookies via `rookie`
3. **GoogleAccountPicker** — `yt_detect_google_accounts` faz probing de `X-Goog-AuthUser` 0-9 em paralelo (`futures::future::join_all`) para descobrir contas logadas. Dedup por `(name, channel_handle)` aplicado na iteração ordenada dos resultados (first-wins por `auth_user`).
4. **AccountPicker** — `yt_get_accounts` lista canais/brand accounts da conta selecionada
5. **Main app** — credenciais salvas, app pronto

Se o browser so tem 1 conta Google, o passo 3 e pulado automaticamente.
Se a conta so tem 1 canal, o passo 4 e pulado automaticamente.

## Persistencia

Tres arquivos em `{app_data_dir}/`:

| Arquivo | Conteudo |
|---------|----------|
| `yt_cookies.txt` | Cookie string completa do browser |
| `yt_auth_user.txt` | Indice da conta Google (0-9) |
| `yt_page_id.txt` | ID do canal/brand account selecionado |

No startup, se os tres existem, o app pula todos os pickers e vai direto para a UI principal.

No Unix, arquivos de credencial sao escritos com permissao `0600` (owner-only).

## Refresh de sessao

O YouTube rotaciona cookies de sessao (SIDCC, __Secure-1PSIDCC, e similares) silenciosamente. Se o app roda por horas sem refrescar, a proxima chamada autenticada volta `HTTP 401` mesmo com o `yt_cookies.txt` em disco aparentemente valido. O refresh e tratado em tres camadas que se complementam:

### 1. Validacao de startup (`yt_ensure_session`)

Antes de reportar o status de autenticacao ao frontend:

1. Testa os cookies salvos com uma chamada leve (`get_accounts`)
2. Se retorna 401 → delega para `refresh_cookies_and_rebuild_state`
3. Se re-extracao falha (browser sem cookies validos) → deleta credenciais e reverte para nao-autenticado

### 2. Retry reativo em 401 (`with_session_refresh`)

Todo comando Tauri autenticado (ex: `yt_load_playlist`, `yt_get_home`, `yt_rate_song`) passa por um wrapper generico:

1. Clona o `YtMusicClient` sob read lock, solta o lock, executa a operacao
2. Se o erro classifica como "session expired" (`is_session_expired` — matches `NotAuthenticated` ou string contem `401`/`Unauthorized`):
   - Dispara `refresh_cookies_and_rebuild_state`
   - Clona um client fresco do state atualizado
   - Retenta a operacao **uma unica vez**
3. Sucesso em qualquer tentativa atualiza o timestamp de ultima atividade (`SessionActivity::mark_success`)
4. Outro erro que nao seja 401 propaga direto

O usuario nunca ve o 401 — o fluxo e transparente. Se o retry tambem falhar com 401, o erro propaga; a proxima chamada recomeca do zero.

### 3. Refresh proativo no foco da janela

Quando a janela Tauri ganha foco (`WindowEvent::Focused(true)`) e a sessao esta ociosa ha mais que `STALE_THRESHOLD_SECS` (1800s = 30 min), o handler dispara `refresh_cookies_and_rebuild_state` em background via `tauri::async_runtime::spawn`. Isso garante que quando o usuario volta ao app depois de horas idle, a primeira acao dele nao paga o custo do retry reativo — os cookies ja foram renovados em paralelo enquanto ele estava clicando.

O trigger roda cross-platform (o handler de memory level do WebView2 continua Windows-only).

### Serializacao de refresh concorrente (thundering herd)

`refresh_cookies_and_rebuild_state` e protegida por uma `tokio::sync::Mutex` interna em `SessionActivity`. Quando N comandos paralelos pegam 401 simultaneamente:

1. O primeiro adquire o lock e faz a extracao completa via `rookie`
2. Os outros N-1 ficam na fila do lock
3. Ao adquirirem, fazem um double-check rapido (`client.clone().get_accounts().await`) — se o state ja foi substituido pelo primeiro task, retornam `Ok(())` sem chamar `rookie` de novo
4. Cada task entao retenta sua operacao original com o client fresco

Custo: N chamadas `get_accounts` (baratas) em vez de N invocacoes paralelas de `rookie` (caras — abre disk-raw no Windows, descriptografa DPAPI).

### Por que playback continua tocando mesmo com cookies stale

`fetch_audio_bytes` (em `crates/ytmusic-api/src/client.rs`) cria um cliente `reqwest` proprio **sem cookies** para baixar o stream URL pre-assinado. Ou seja, uma musica que ja comecou a tocar nao e afetada por cookies stale — so chamadas InnerTube autenticadas (que e onde moram playlist fetch, library, likes, etc.) falham. E o motivo de o bug original ter se manifestado como "musica toca a noite toda, abrir playlist de manha quebra".

## Logout

`yt_auth_logout` deleta os tres arquivos de credencial e reverte o estado para nao-autenticado. Acessivel pelo dropdown do avatar no TopBar.

## SAPISIDHASH

O YouTube exige um hash de autenticacao no header `Authorization`:

```
SAPISIDHASH timestamp_SHA1(timestamp SAPISID origin)
```

- `SAPISID` e extraido dos cookies (prefere `__Secure-3PAPISID`)
- `origin` e `https://music.youtube.com`
- Calculado pelo crate `ytmusic-api` em `auth.rs`

## Multi-conta Google

O header `X-Goog-AuthUser` determina qual conta Google e usada. O Google suporta ate 10 contas simultaneas por browser. Contas sem YouTube Music retornam 403 e sao puladas no probing.

O probe 0-9 roda em paralelo: 10 `YtMusicClient` temporarios sao construidos com `auth_user` distintos e disparados simultaneamente via `futures::future::join_all`. Como os clients temporarios nao tocam no `YtMusicState` compartilhado, nao ha contencao de lock. O tempo total da deteccao e ~max(10 requests) em vez de ~sum(10 requests).

## Multi-canal (brand accounts)

Apos selecionar a conta Google, o campo `onBehalfOfUser` no contexto InnerTube e o header `X-Goog-PageId` determinam qual canal e usado. Persistido como `page_id`.

## Permissoes no Windows (UAC)

No Windows, o build de producao requer **privilegios de administrador** para extrair cookies de browsers Chromium (Chrome, Brave, Edge). Dois motivos:

1. **Appbound encryption (Chromium 130+)** — cookies sao criptografados com DPAPI do SYSTEM. Descriptografar exige abrir `lsass.exe` e duplicar seu token, o que requer admin.
2. **File lock bypass** — enquanto o browser esta aberto, o arquivo de cookies esta travado. O `rookie` usa acesso direto ao disco (`\\.\C:`) via `rawcopy-rs-next` para copiar o arquivo, o que requer admin.

O manifesto UAC (`requireAdministrator`) esta configurado em `src-tauri/build.rs`. O Windows mostra um prompt UAC ao abrir o app.

Em dev mode, o processo herda a elevacao do terminal — se o terminal roda como admin, funciona sem prompt.

Firefox nao usa appbound encryption e nao precisa de admin para leitura de cookies.

## Comandos de teste (debug-only)

Gateados por `#[cfg(debug_assertions)]` — nao existem em build de producao. Servem para validar o refresh sem esperar expiracao real:

- `yt_dev_session_stats` — retorna `authenticated`, `auth_user`, `has_page_id`, `seconds_since` e flag `stale` contra `STALE_THRESHOLD_SECS`
- `yt_dev_corrupt_cookies` — substitui os cookies em memoria por lixo. Proxima chamada autenticada pega 401 e exercita o fluxo de retry
- `yt_dev_backdate_activity` — antedata o timestamp de `last_success` (default 40min atras). Forca o focus handler a entender que a sessao esta stale e disparar refresh proativo quando a janela ganhar foco

Uso tipico no devtools console:

```js
await window.__TAURI_INTERNALS__.invoke('yt_dev_corrupt_cookies');
await window.__TAURI_INTERNALS__.invoke('yt_get_accounts'); // → 401 → refresh → retry
```

Logs relevantes aparecem no terminal do `npm run tauri dev` (`[with_session_refresh]`, `[refresh_cookies_and_rebuild_state]`, `[focus] proactive check`).

## Limitacoes conhecidas

- Email da conta Google nao e acessivel via InnerTube — so nome e foto
- Se o browser nao tem cookies validos em nenhum dos 7 browsers suportados (edge, chrome, firefox, brave, chromium, opera, vivaldi), o refresh reativo falha e o usuario precisa fazer login no browser novamente
- Maximo de 10 contas simultaneas por browser (limite do Google)
- Contas sem YouTube Music retornam 403 e sao puladas no probing
- Modo "sem login" removido por estar incompleto — feature futura
- Build de producao no Windows exige admin (UAC) para extracao de cookies
