# Test Likes Manually

## Cenários mínimos

1. Curtir uma música não curtida no app.
2. Verificar no YouTube Music Web se ela entrou em `Gostei`.
3. Descurtir uma música curtida no app.
4. Verificar no Web se ela saiu de `Gostei`.
5. Abrir a playlist `liked` no app e confirmar convergência.

## Logs úteis

- `yt_rate_song`
- `yt_get_liked_track_ids`
- `[TrackLikeStore] optimistic update`
- `[TrackLikeStore] toggleTrackLike confirmed`
- `[TrackLikeStore] toggleTrackLike rollback`
