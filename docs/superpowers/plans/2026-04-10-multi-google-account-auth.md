# Multi-Google Account Auth + Persistent Login

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir login com diferentes contas Google (emails), lembrar a seleção para não perguntar a cada startup, e oferecer logout acessível na UI.

**Architecture:** O header `X-Goog-AuthUser` (atualmente hardcoded `"0"`) determina qual conta Google é usada. Adicionamos um campo `auth_user: u32` ao cliente, persistimos junto com cookies e page_id, e probing sequencial (0, 1, 2...) descobre contas logadas no browser. O startup pula todas as telas de seleção quando tudo já está salvo. Logout fica num dropdown no TopBar com avatar do usuário.

**Tech Stack:** Rust (ytmusic-api crate + Tauri commands), React 19, TypeScript, shadcn/ui DropdownMenu + Avatar

---

## File Structure

### Rust - Crate (`crates/ytmusic-api/src/`)
- **Modify:** `auth.rs` — `build_auth_headers` recebe `auth_user: u32` em vez de hardcoded `"0"`
- **Modify:** `client.rs` — campo `auth_user: u32` no `YtMusicClient`, setter/getter, passado ao `build_auth_headers`

### Rust - Tauri (`src-tauri/src/youtube_music/`)
- **Modify:** `client.rs` — persistência de `auth_user` (save/load/delete `yt_auth_user.txt`), `new_from_cookies` recebe `auth_user`
- **Modify:** `commands.rs` — novo comando `yt_detect_google_accounts`, atualizar `yt_auth_from_browser` para receber `auth_user`, atualizar `yt_auth_logout` para limpar `auth_user`
- **Modify:** `src-tauri/src/lib.rs` — startup carrega `auth_user` junto com cookies/page_id

### Frontend (`src/modules/youtube-music/`)
- **Modify:** `services/yt-api.ts` — novas funções wrapper + tipos
- **Modify:** `index.tsx` — novo estado `"google-account-select"`, skip direto para `"authenticated"` se tudo salvo
- **Create:** `components/auth/google-account-picker.tsx` — picker de conta Google
- **Modify:** `components/auth/account-picker.tsx` — receber callback de logout
- **Modify:** `components/layout/top-bar.tsx` — avatar do usuário com dropdown (logout + trocar conta)

---

## Task 1: `auth_user` dinâmico no crate ytmusic-api

**Files:**
- Modify: `crates/ytmusic-api/src/auth.rs:40-47`
- Modify: `crates/ytmusic-api/src/client.rs:10-18,21-37,40-67`

- [ ] **Step 1: Atualizar `build_auth_headers` para receber `auth_user`**

```rust
// auth.rs — alterar a assinatura e o header
pub fn build_auth_headers(cookies: &str, page_id: Option<&str>, auth_user: u32) -> Vec<(String, String)> {
    let mut headers = vec![
        ("User-Agent".to_string(), USER_AGENT.to_string()),
        ("Accept".to_string(), "*/*".to_string()),
        ("Accept-Language".to_string(), "en-US,en;q=0.5".to_string()),
        ("Content-Type".to_string(), "application/json".to_string()),
        ("X-Goog-AuthUser".to_string(), auth_user.to_string()),
        ("Origin".to_string(), ORIGIN.to_string()),
        ("Cookie".to_string(), cookies.to_string()),
    ];
    // ... resto igual (SAPISIDHASH e PageId)
```

- [ ] **Step 2: Adicionar campo `auth_user` ao `YtMusicClient`**

```rust
// client.rs
pub struct YtMusicClient {
    http: reqwest::Client,
    cookies: Option<String>,
    language: String,
    country: String,
    on_behalf_of_user: Option<String>,
    auth_user: u32,  // NEW
}
```

- [ ] **Step 3: Atualizar construtores e header builder**

```rust
// client.rs — new()
Ok(Self {
    http,
    cookies: None,
    language: "pt-BR".to_string(),
    country: "BR".to_string(),
    on_behalf_of_user: None,
    auth_user: 0,
})

// client.rs — from_cookies() adicionar auth_user param
pub fn from_cookies(cookies: impl Into<String>, auth_user: u32) -> Result<Self> {
    // ...
    Ok(Self {
        http,
        cookies: Some(cookies),
        language: "pt-BR".to_string(),
        country: "BR".to_string(),
        on_behalf_of_user: None,
        auth_user,
    })
}

// client.rs — build_authenticated_header_map
fn build_authenticated_header_map(&self, content_type: &str) -> Result<HeaderMap> {
    let cookies = self.cookies.as_ref().ok_or(Error::NotAuthenticated)?;
    let auth_headers = build_auth_headers(cookies, self.on_behalf_of_user.as_deref(), self.auth_user);
    // ... resto igual
}
```

- [ ] **Step 4: Adicionar setter/getter para `auth_user`**

```rust
// client.rs
pub fn set_auth_user(&mut self, auth_user: u32) {
    println!("[YtMusicClient] set_auth_user: {auth_user}");
    self.auth_user = auth_user;
}

pub fn auth_user(&self) -> u32 {
    self.auth_user
}
```

- [ ] **Step 5: Verificar compilação do crate**

Run: `cd crates/ytmusic-api && cargo check`
Expected: Compilation errors nos consumidores (Tauri) — `from_cookies` agora exige `auth_user`. Isso será resolvido no Task 2.

- [ ] **Step 6: Commit**

```bash
git add crates/ytmusic-api/src/auth.rs crates/ytmusic-api/src/client.rs
git commit -m "feat(ytmusic-api): make auth_user dynamic instead of hardcoded 0"
```

---

## Task 2: Persistência de `auth_user` no Tauri state

**Files:**
- Modify: `src-tauri/src/youtube_music/client.rs`
- Modify: `src-tauri/src/lib.rs:303-324`

- [ ] **Step 1: Adicionar persistência de `auth_user` em `YtMusicState`**

```rust
// client.rs — adicionar após o bloco de Page ID persistence

// -------------------------------------------------------------------------
// Auth User index persistence
// -------------------------------------------------------------------------

pub fn get_auth_user_path(app_data_dir: &PathBuf) -> PathBuf {
    app_data_dir.join("yt_auth_user.txt")
}

pub fn save_auth_user(app_data_dir: &PathBuf, auth_user: u32) -> Result<(), String> {
    let path = Self::get_auth_user_path(app_data_dir);
    println!("[YtMusicState] Saving auth_user to {}", path.display());
    std::fs::create_dir_all(app_data_dir)
        .map_err(|e| format!("Failed to create app data dir: {e}"))?;
    std::fs::write(&path, auth_user.to_string())
        .map_err(|e| format!("Failed to write auth_user file: {e}"))?;
    println!("[YtMusicState] Auth user saved: {auth_user}");
    Ok(())
}

pub fn load_auth_user(app_data_dir: &PathBuf) -> Option<u32> {
    let path = Self::get_auth_user_path(app_data_dir);
    println!("[YtMusicState] Checking for saved auth_user at {}", path.display());
    match std::fs::read_to_string(&path) {
        Ok(val) if !val.trim().is_empty() => {
            let auth_user = val.trim().parse::<u32>().ok()?;
            println!("[YtMusicState] Auth user loaded: {auth_user}");
            Some(auth_user)
        }
        _ => {
            println!("[YtMusicState] No saved auth_user found.");
            None
        }
    }
}

pub fn delete_auth_user(app_data_dir: &PathBuf) {
    let path = Self::get_auth_user_path(app_data_dir);
    if path.exists() {
        let _ = std::fs::remove_file(&path);
        println!("[YtMusicState] Auth user deleted.");
    }
}
```

- [ ] **Step 2: Atualizar `new_from_cookies` para receber `auth_user`**

```rust
// client.rs
pub fn new_from_cookies(cookie_string: String, auth_user: u32) -> Result<Self, String> {
    println!("[YtMusicState] Creating cookie-auth client ({} chars, auth_user={auth_user})...", cookie_string.len());
    let client = YtMusicClient::from_cookies(&cookie_string, auth_user)
        .map_err(|e| format!("[YtMusicState] Failed: {e}"))?;
    println!("[YtMusicState] Cookie-auth client ready.");
    Ok(Self { client, cookies: Some(cookie_string) })
}
```

- [ ] **Step 3: Atualizar startup em `lib.rs` para carregar `auth_user`**

```rust
// lib.rs — dentro do bloco if let Some(cookie_string) = saved_cookies
if let Some(cookie_string) = saved_cookies {
    // Load saved auth_user (default to 0 if not found)
    let auth_user = app_data_dir.as_ref()
        .and_then(|dir| YtMusicState::load_auth_user(dir))
        .unwrap_or(0);

    println!("[setup] Found saved cookies, creating cookie-auth client (auth_user={auth_user})...");
    match YtMusicState::new_from_cookies(cookie_string, auth_user) {
        Ok(mut state) => {
            // Restore saved brand account (pageId) if available
            if let Some(ref dir) = app_data_dir {
                if let Some(page_id) = YtMusicState::load_page_id(dir) {
                    println!("[setup] Restoring saved page_id: {page_id}");
                    state.client.set_on_behalf_of_user(Some(page_id));
                }
            }
            println!("[setup] Cookie-auth client created from saved cookies.");
            app.manage(Arc::new(Mutex::new(state)));
            println!("[setup] YtMusicState added to managed state.");
            return Ok(());
        }
        // ... erro igual
    }
}
```

- [ ] **Step 4: Atualizar `yt_auth_from_browser` para receber e persistir `auth_user`**

```rust
// commands.rs — alterar assinatura
#[tauri::command]
pub async fn yt_auth_from_browser(
    browser: String,
    auth_user: Option<u32>,  // NEW — default 0
    app: AppHandle,
    state: State<'_, Arc<Mutex<YtMusicState>>>,
) -> Result<AuthStatusResponse, String> {
    let auth_user = auth_user.unwrap_or(0);
    println!("[yt_auth_from_browser] browser={browser}, auth_user={auth_user}");

    // 1. Extract cookies (igual)
    let (used_browser, cookie_string) = if browser == "auto" {
        extract_cookies_auto()?
    } else {
        let cookies = extract_cookies_from_browser(&browser)?
            .ok_or_else(|| format!("[yt_auth_from_browser] No YouTube cookies found in {browser}"))?;
        (browser.clone(), cookies)
    };

    // 2. Create YtMusicState with cookies AND auth_user
    let new_state = YtMusicState::new_from_cookies(cookie_string.clone(), auth_user)?;

    // 3. Save cookies AND auth_user to disk
    let app_data_dir = app.path().app_data_dir()
        .map_err(|e| format!("[yt_auth_from_browser] Failed to resolve app data dir: {e}"))?;
    YtMusicState::save_cookies(&app_data_dir, &cookie_string)?;
    YtMusicState::save_auth_user(&app_data_dir, auth_user)?;

    // 4. Replace state
    let mut state_guard = state.lock().await;
    *state_guard = new_state;

    Ok(AuthStatusResponse { authenticated: true, method: "cookie".to_string() })
}
```

- [ ] **Step 5: Atualizar `yt_auth_logout` para limpar `auth_user`**

```rust
// commands.rs — adicionar delete_auth_user ao logout
pub async fn yt_auth_logout(
    app: AppHandle,
    state: State<'_, Arc<Mutex<YtMusicState>>>,
) -> Result<AuthStatusResponse, String> {
    println!("[yt_auth_logout] Logging out...");

    let app_data_dir = app.path().app_data_dir()
        .map_err(|e| format!("[yt_auth_logout] Failed to resolve app data dir: {e}"))?;

    YtMusicState::delete_cookies(&app_data_dir)?;
    YtMusicState::delete_page_id(&app_data_dir);
    YtMusicState::delete_auth_user(&app_data_dir);  // NEW

    let new_state = YtMusicState::new_unauthenticated()?;
    let mut state_guard = state.lock().await;
    *state_guard = new_state;

    Ok(AuthStatusResponse { authenticated: false, method: "none".to_string() })
}
```

- [ ] **Step 6: Verificar compilação**

Run: `npm run tauri dev` (ou `cd src-tauri && cargo check`)
Expected: PASS — sem erros de compilação

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/youtube_music/client.rs src-tauri/src/youtube_music/commands.rs src-tauri/src/lib.rs
git commit -m "feat(tauri): persist auth_user index alongside cookies and page_id"
```

---

## Task 3: Comando `yt_detect_google_accounts` (probing multi-conta)

**Files:**
- Modify: `src-tauri/src/youtube_music/commands.rs`
- Modify: `src-tauri/src/lib.rs` (registrar comando)

- [ ] **Step 1: Adicionar DTO de resposta**

```rust
// commands.rs — junto dos outros DTOs de auth
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleAccountInfo {
    pub auth_user: u32,
    pub name: String,
    pub photo_url: Option<String>,
    pub channel_handle: Option<String>,
}
```

- [ ] **Step 2: Implementar o comando**

```rust
// commands.rs
/// Detect all Google accounts available in the current cookies by probing
/// different X-Goog-AuthUser values (0, 1, 2...).
#[tauri::command]
pub async fn yt_detect_google_accounts(
    state: State<'_, Arc<Mutex<YtMusicState>>>,
) -> Result<Vec<GoogleAccountInfo>, String> {
    println!("[yt_detect_google_accounts] Probing Google accounts...");

    let state_guard = state.lock().await;
    let cookies = state_guard.cookies.as_ref()
        .ok_or("[yt_detect_google_accounts] Not authenticated")?;

    let mut google_accounts = Vec::new();
    let mut seen_names = std::collections::HashSet::new();

    for auth_user_idx in 0u32..5 {
        println!("[yt_detect_google_accounts] Trying auth_user={auth_user_idx}...");

        // Create a temporary client with this auth_user index
        let temp_client = match YtMusicClient::from_cookies(cookies.as_str(), auth_user_idx) {
            Ok(c) => c,
            Err(e) => {
                println!("[yt_detect_google_accounts] auth_user={auth_user_idx}: client error: {e}");
                break;
            }
        };

        match temp_client.get_accounts().await {
            Ok(accounts) => {
                // The active account (isActive=true) identifies this Google account
                // If no active account or accounts list is empty, we've gone past the last account
                if accounts.is_empty() {
                    println!("[yt_detect_google_accounts] auth_user={auth_user_idx}: empty response, stopping");
                    break;
                }

                // Find the active/first account as the Google account identity
                let identity = accounts.iter().find(|a| a.is_active)
                    .or_else(|| accounts.first());

                if let Some(acct) = identity {
                    // Duplicate check — if we see the same name, same account
                    if !seen_names.insert(acct.name.clone()) {
                        println!("[yt_detect_google_accounts] auth_user={auth_user_idx}: duplicate of previous, stopping");
                        break;
                    }

                    println!("[yt_detect_google_accounts] auth_user={auth_user_idx}: found '{}'", acct.name);
                    google_accounts.push(GoogleAccountInfo {
                        auth_user: auth_user_idx,
                        name: acct.name.clone(),
                        photo_url: acct.photo_url.clone(),
                        channel_handle: acct.channel_handle.clone(),
                    });
                } else {
                    break;
                }
            }
            Err(e) => {
                println!("[yt_detect_google_accounts] auth_user={auth_user_idx}: error: {e}");
                break;
            }
        }
    }

    println!("[yt_detect_google_accounts] Found {} Google accounts", google_accounts.len());
    Ok(google_accounts)
}
```

- [ ] **Step 3: Registrar o comando em `lib.rs`**

Adicionar `yt_detect_google_accounts` ao `.invoke_handler(tauri::generate_handler![...])`.

- [ ] **Step 4: Verificar compilação**

Run: `cd src-tauri && cargo check`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/youtube_music/commands.rs src-tauri/src/lib.rs
git commit -m "feat(tauri): add yt_detect_google_accounts command for multi-account probing"
```

---

## Task 4: Frontend — API wrappers e tipos

**Files:**
- Modify: `src/modules/youtube-music/services/yt-api.ts`

- [ ] **Step 1: Adicionar tipo e funções**

```typescript
// yt-api.ts — junto dos tipos de auth existentes

export interface ApiGoogleAccountInfo {
  authUser: number;
  name: string;
  photoUrl: string | null;
  channelHandle: string | null;
}

// Após ytAuthLogout()
export async function ytDetectGoogleAccounts(): Promise<ApiGoogleAccountInfo[]> {
  return invoke<ApiGoogleAccountInfo[]>("yt_detect_google_accounts");
}

// Atualizar ytAuthFromBrowser para aceitar authUser
export async function ytAuthFromBrowser(
  browser: string,
  authUser?: number
): Promise<ApiAuthStatus> {
  return invoke<ApiAuthStatus>("yt_auth_from_browser", {
    browser,
    authUser: authUser ?? 0,
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/modules/youtube-music/services/yt-api.ts
git commit -m "feat(frontend): add API wrappers for multi-google-account auth"
```

---

## Task 5: Frontend — Auth state machine atualizada

**Files:**
- Modify: `src/modules/youtube-music/index.tsx`

- [ ] **Step 1: Atualizar `AuthState` type e adicionar `"google-account-select"`**

```typescript
type AuthState =
  | "loading"
  | "unauthenticated"
  | "google-account-select"  // NEW — escolher conta Google (email)
  | "account-select"          // escolher canal do YouTube
  | "authenticated"
  | "skipped";
```

- [ ] **Step 2: Atualizar `checkAuth` para pular direto se page_id já salvo**

O backend já restaura `page_id` e `auth_user` no startup. Se está autenticado E tem `page_id` restaurado, pode ir direto para `authenticated`. Precisamos verificar isso.

Adicionar um novo comando Tauri `yt_auth_status` estendido que retorne se há `page_id` salvo, OU checar do frontend:

```typescript
// index.tsx — alterar checkAuth
async function checkAuth() {
  try {
    const status = await invoke<{
      authenticated: boolean;
      method: string;
      hasPageId: boolean;  // NEW — backend retorna se já tem page_id
    }>("yt_auth_status");
    console.log("[YouTubeMusicModule] yt_auth_status result", status);
    if (!cancelled) {
      if (status.authenticated && status.hasPageId) {
        // Tudo salvo — pular direto para main app
        setAuthState("authenticated");
      } else if (status.authenticated) {
        // Tem cookies mas não tem page_id — mostrar seleção
        setAuthState("account-select");
      } else {
        setAuthState("unauthenticated");
      }
    }
  } catch (err) {
    console.error("[YouTubeMusicModule] yt_auth_status failed", err);
    if (!cancelled) setAuthState("unauthenticated");
  }
}
```

**Atualizar `yt_auth_status` no backend (commands.rs):**

```rust
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthStatusResponse {
    pub authenticated: bool,
    pub method: String,
    pub has_page_id: bool,  // NEW
}

// No handler:
#[tauri::command]
pub async fn yt_auth_status(
    app: AppHandle,
    state: State<'_, Arc<Mutex<YtMusicState>>>,
) -> Result<AuthStatusResponse, String> {
    let state = state.lock().await;
    let authenticated = state.is_authenticated();
    let method = state.auth_method().to_string();
    let has_page_id = state.client.on_behalf_of_user().is_some();
    println!("[yt_auth_status] authenticated={authenticated}, method={method}, has_page_id={has_page_id}");
    Ok(AuthStatusResponse { authenticated, method, has_page_id })
}
```

- [ ] **Step 3: Adicionar handler para Google account selecionada**

```typescript
const handleGoogleAccountSelected = useCallback((authUser: number) => {
  console.log("[YouTubeMusicModule] Google account selected, auth_user=", authUser);
  setAuthState("account-select");
}, []);
```

- [ ] **Step 4: Adicionar handler de logout**

```typescript
const handleLogout = useCallback(async () => {
  console.log("[YouTubeMusicModule] logging out");
  try {
    await ytAuthLogout();
    playlistLibraryClear();
    trackCacheClear();
    trackLikesClear();
    playerCleanup();
    void queueCleanup();
    setAuthState("unauthenticated");
  } catch (err) {
    console.error("[YouTubeMusicModule] logout failed", err);
  }
}, [playerCleanup, playlistLibraryClear, queueCleanup, trackCacheClear, trackLikesClear]);
```

- [ ] **Step 5: Renderizar nova tela no switch de authState**

```tsx
if (authState === "google-account-select") {
  return (
    <GoogleAccountPicker
      onAccountSelected={handleGoogleAccountSelected}
      onBack={() => setAuthState("unauthenticated")}
    />
  );
}
```

- [ ] **Step 6: Passar `onLogout` para o TopBar**

```tsx
// No return do componente autenticado
<TopBar
  onBack={nav.pop}
  onForward={nav.forward}
  canGoBack={nav.canGoBack}
  canGoForward={nav.canGoForward}
  onNavigate={nav.push}
  onPlayTrack={handlePlayTrack}
  onSearchSubmit={handleSearchSubmit}
  onLogout={handleLogout}  // NEW
/>
```

- [ ] **Step 7: Atualizar a LoginScreen para passar para google-account-select**

A `LoginScreen` continua igual — após `yt_auth_from_browser` com sucesso, chama `onAuthenticated()` que agora deve ir para `"google-account-select"`.

Atualizar `handleAuthenticated`:

```typescript
const handleAuthenticated = useCallback(() => {
  console.log("[YouTubeMusicModule] user authenticated, proceeding to Google account selection");
  setAuthState("google-account-select");
}, []);
```

- [ ] **Step 8: Commit**

```bash
git add src/modules/youtube-music/index.tsx src-tauri/src/youtube_music/commands.rs
git commit -m "feat: update auth state machine for multi-google-account flow"
```

---

## Task 6: Componente `GoogleAccountPicker`

**Files:**
- Create: `src/modules/youtube-music/components/auth/google-account-picker.tsx`

- [ ] **Step 1: Criar o componente**

```tsx
import { useState, useEffect } from "react";
import { Mail, Loader2, ArrowLeft } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ytDetectGoogleAccounts,
  ytAuthFromBrowser,
  type ApiGoogleAccountInfo,
} from "../../services/yt-api";

interface GoogleAccountPickerProps {
  onAccountSelected: (authUser: number) => void;
  onBack: () => void;
}

export function GoogleAccountPicker({
  onAccountSelected,
  onBack,
}: GoogleAccountPickerProps) {
  const [accounts, setAccounts] = useState<ApiGoogleAccountInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function detect() {
      try {
        console.log("[GoogleAccountPicker] Detecting Google accounts...");
        const result = await ytDetectGoogleAccounts();
        console.log("[GoogleAccountPicker] Found accounts:", result.length);

        if (cancelled) return;

        if (result.length <= 1) {
          // Apenas uma conta Google — pular seleção
          console.log("[GoogleAccountPicker] Single account, auto-selecting");
          onAccountSelected(result[0]?.authUser ?? 0);
          return;
        }

        setAccounts(result);
      } catch (err) {
        console.error("[GoogleAccountPicker] Detection failed:", err);
        if (!cancelled) onAccountSelected(0); // fallback
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    detect();
    return () => {
      cancelled = true;
    };
  }, [onAccountSelected]);

  const handleSelect = async (account: ApiGoogleAccountInfo) => {
    console.log(
      "[GoogleAccountPicker] Selecting:",
      account.name,
      "auth_user=",
      account.authUser
    );
    setSelecting(account.authUser);
    try {
      // Re-auth with the selected auth_user index
      // The browser cookies are already saved — we just need to update auth_user
      await ytAuthFromBrowser("auto", account.authUser);
      onAccountSelected(account.authUser);
    } catch (err) {
      console.error("[GoogleAccountPicker] Selection failed:", err);
      setSelecting(null);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-primary/10">
            <Mail className="size-6 text-primary" />
          </div>
          <CardTitle className="text-xl">Selecionar conta Google</CardTitle>
          <CardDescription>
            Escolha qual conta do Google deseja usar.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {accounts.map((account) => (
            <button
              key={account.authUser}
              onClick={() => handleSelect(account)}
              disabled={selecting !== null}
              className="flex items-center gap-3 rounded-lg border border-border px-4 py-3 text-left transition-colors hover:bg-accent disabled:opacity-50"
            >
              {account.photoUrl ? (
                <img
                  referrerPolicy="no-referrer"
                  src={account.photoUrl}
                  alt={account.name}
                  className="size-10 rounded-full"
                />
              ) : (
                <div className="flex size-10 items-center justify-center rounded-full bg-muted text-sm font-medium">
                  {account.name.charAt(0)}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {account.name}
                </div>
                {account.channelHandle && (
                  <div className="truncate text-xs text-muted-foreground">
                    {account.channelHandle}
                  </div>
                )}
              </div>
              {selecting === account.authUser && (
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              )}
            </button>
          ))}

          <div className="border-t pt-3 text-center">
            <button
              onClick={onBack}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="size-3.5" />
              Voltar
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/modules/youtube-music/components/auth/google-account-picker.tsx
git commit -m "feat: add GoogleAccountPicker component for multi-email selection"
```

---

## Task 7: Logout no TopBar (avatar + dropdown)

**Files:**
- Modify: `src/modules/youtube-music/components/layout/top-bar.tsx`

- [ ] **Step 1: Adicionar props e importações**

Adicionar `onLogout` ao TopBar props. Importar `DropdownMenu`, `Avatar`, e `LogOut` icon.

```tsx
// top-bar.tsx — adicionar aos imports
import { LogOut } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ytGetAccounts, type ApiAccountInfo } from "../../services/yt-api";

// Adicionar à interface de props
interface TopBarProps {
  // ... props existentes
  onLogout?: () => void;
}
```

- [ ] **Step 2: Adicionar estado para conta ativa e carregar no mount**

```tsx
// Dentro do TopBar
const [activeAccount, setActiveAccount] = useState<ApiAccountInfo | null>(null);

useEffect(() => {
  let cancelled = false;
  ytGetAccounts()
    .then((accounts) => {
      if (cancelled) return;
      const active = accounts.find((a) => a.isActive) ?? accounts[0] ?? null;
      setActiveAccount(active);
    })
    .catch(() => {});
  return () => { cancelled = true; };
}, []);
```

- [ ] **Step 3: Renderizar avatar com dropdown no canto direito**

```tsx
// Dentro do JSX do TopBar, após os controles de busca, no final direito
{onLogout && (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <button className="flex size-8 items-center justify-center rounded-full hover:bg-accent">
        {activeAccount?.photoUrl ? (
          <img
            referrerPolicy="no-referrer"
            src={activeAccount.photoUrl}
            alt={activeAccount.name}
            className="size-7 rounded-full"
          />
        ) : (
          <div className="flex size-7 items-center justify-center rounded-full bg-muted text-xs font-medium">
            {activeAccount?.name?.charAt(0) ?? "?"}
          </div>
        )}
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" sideOffset={8}>
      <div className="px-3 py-2">
        <div className="text-sm font-medium">{activeAccount?.name}</div>
        {activeAccount?.channelHandle && (
          <div className="text-xs text-muted-foreground">{activeAccount.channelHandle}</div>
        )}
      </div>
      <DropdownMenuItem onClick={onLogout}>
        <LogOut className="mr-2 size-4" />
        Sair
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
)}
```

- [ ] **Step 4: Commit**

```bash
git add src/modules/youtube-music/components/layout/top-bar.tsx
git commit -m "feat: add user avatar with logout dropdown in TopBar"
```

---

## Task 8: Integração e teste end-to-end

**Files:** Todos os modificados anteriormente

- [ ] **Step 1: Importar `GoogleAccountPicker` no `index.tsx`**

```tsx
import { GoogleAccountPicker } from "./components/auth/google-account-picker";
```

- [ ] **Step 2: Importar `ytAuthLogout` no `index.tsx`** (se ainda não importado)

```tsx
import { ytGetCachedTracks, ytAuthLogout, type QueueSnapshot } from "./services/yt-api";
```

- [ ] **Step 3: Verificar compilação completa**

Run: `npm run tauri dev`
Expected: App compila e inicia sem erros

- [ ] **Step 4: Testar fluxo — primeira vez (sem cookies salvos)**

1. Deletar `yt_cookies.txt`, `yt_page_id.txt`, `yt_auth_user.txt` do app_data_dir
2. Abrir app → LoginScreen aparece
3. Clicar em um browser → extrai cookies
4. GoogleAccountPicker aparece (se 2+ contas) ou auto-pula
5. AccountPicker aparece (se 2+ canais) ou auto-pula
6. Main app renderiza

- [ ] **Step 5: Testar fluxo — startup com tudo salvo**

1. Fechar e reabrir o app
2. Deve ir direto para main app (sem AccountPicker nem GoogleAccountPicker)

- [ ] **Step 6: Testar logout**

1. Clicar no avatar no TopBar → dropdown aparece com nome da conta
2. Clicar "Sair"
3. Volta para LoginScreen
4. Verificar que `yt_cookies.txt`, `yt_page_id.txt`, `yt_auth_user.txt` foram deletados

- [ ] **Step 7: Commit final**

```bash
git add -A
git commit -m "feat: complete multi-google-account auth with persistent login and logout"
```
