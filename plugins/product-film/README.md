# product-film (skill)

Skill do Claude Code que constrói um **protótipo auto-reproduzível que É o vídeo** de
demonstração do produto: réplica fiel que se navega sozinha (cursor cenográfico, legendas
cinéticas, zoom/spotlight, contagem 4·3·2·1, loop). O usuário só **grava a tela**.

Princípio central: **todo estado visual é função pura de `t`** — `apply(t)` idempotente torna
seek, loop e teste triviais (sem scheduler que "dispara" beats, sem `resetStage()`).

## Arquivos

| Arquivo | O que é |
|---|---|
| `SKILL.md` | Processo, regras de fidelidade e UX de gravação. É o que o Claude lê ao invocar `/product-film`. |
| `references/engine-skeleton.html` | Motor pronto: cenas com crossfade, legendas, cursor falso, câmera com zoom, spotlight, scroll, contagem, controles, fallback de fullscreen, `?cut&t&paused`, `window.__film`. Construa o filme sobre ele preenchendo tokens, cenas e `defFull()/defPh()`. |

## Invocação

`/product-film` — descreva o produto/fluxo a demonstrar. O skill executa o fluxo real,
replica as telas com fidelidade, monta o roteiro em cortes, constrói o filme e verifica cada
beat por seek antes de entregar.
