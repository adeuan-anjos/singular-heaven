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
3. **GoogleAccountPicker** — `yt_detect_google_accounts` faz probing de `X-Goog-AuthUser` 0-9 para descobrir contas logadas
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

## Validacao de sessao (yt_ensure_session)

No startup, antes de reportar o status de autenticacao ao frontend:

1. Testa os cookies salvos com uma chamada leve (`get_accounts`)
2. Se retorna 401 → cookies expiraram
3. Re-extrai cookies do browser silenciosamente via `extract_cookies_auto`
4. Atualiza estado e salva novos cookies em disco
5. Se re-extracao falha (browser sem cookies validos) → reverte para nao-autenticado

O usuario nunca ve o 401. O refresh e transparente.

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

## Multi-canal (brand accounts)

Apos selecionar a conta Google, o campo `onBehalfOfUser` no contexto InnerTube e o header `X-Goog-PageId` determinam qual canal e usado. Persistido como `page_id`.

## Limitacoes conhecidas

- Email da conta Google nao e acessivel via InnerTube — so nome e foto
- Cookies expiram eventualmente (rotacao do Google) — o `yt_ensure_session` mitiga isso
- Se o browser tambem nao tem cookies validos, o usuario precisa logar no browser primeiro
- Modo "sem login" removido por estar incompleto — feature futura
