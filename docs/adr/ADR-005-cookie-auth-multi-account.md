# ADR-005: Cookie Auth com Multi-Account Google

## Status

Accepted

## Context

O app precisa autenticar no YouTube Music sem OAuth (Google bloqueou WEB_REMIX + OAuth em agosto 2025). O usuario pode ter multiplas contas Google logadas no browser e precisa escolher qual usar. Alem disso, cookies salvos expiram e o app precisa se recuperar silenciosamente.

## Decision

Autenticacao 100% via cookies extraidos do browser pelo crate `rookie` (Rust). O header `X-Goog-AuthUser` (0-9) determina qual conta Google e usada. O fluxo:

1. `rookie` extrai cookies do browser selecionado
2. Probing de `X-Goog-AuthUser` 0 ate 9 descobre todas as contas Google logadas
3. Usuario seleciona conta Google, depois canal (brand account)
4. Cookies + `auth_user` + `page_id` sao persistidos em disco
5. No startup, se tudo esta salvo, pula direto para o app
6. `yt_ensure_session` valida cookies no startup e re-extrai silenciosamente se expirados (401)

### Limitacoes aceitas

- Email da conta Google nao e acessivel via InnerTube nem cookies — mostrar apenas nome e foto
- Maximo de 10 contas simultaneas por browser (limite do Google)
- Contas sem YouTube Music retornam 403 e sao puladas no probing
- Se o browser nao tem cookies validos, o usuario precisa logar no browser primeiro

## Consequences

- `X-Goog-AuthUser` antes hardcoded como `"0"` agora e dinamico (`auth_user: u32` no `YtMusicClient`)
- Tres arquivos de persistencia: `yt_cookies.txt`, `yt_page_id.txt`, `yt_auth_user.txt`
- Frontend tem 4 estados de auth: `loading` → `unauthenticated` → `google-account-select` → `account-select` → `authenticated`
- Startup com credenciais salvas pula todos os pickers
- Logout limpa os tres arquivos e volta para `unauthenticated`
- Modo "sem login" removido da UI por estar incompleto (feature futura)
