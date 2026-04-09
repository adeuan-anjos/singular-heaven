# Test Playback Manually

Checklist mínimo para validar playback e queue.

## Fluxos

1. Playlist grande:
   - `Play All`
   - abrir queue
   - ligar/desligar shuffle
   - validar `repeat all` no fim
2. Álbum pequeno:
   - tocar faixa
   - fechar e reabrir queue
3. Search songs:
   - tocar uma faixa
   - validar índice correto na queue

## Sinais de problema

- ordem da queue diferente da origem
- queue presa em loading
- `previous` em shuffle voltando para a faixa errada
- `repeat all` voltando para ordem linear quando deveria embaralhar novo ciclo
