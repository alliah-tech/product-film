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
| `references/engine-skeleton.html` | Motor pronto: cenas com crossfade, legendas, cursor falso, câmera com zoom, spotlight, scroll, contagem, controles, fallback de fullscreen, `?cut&t&paused`, `window.__film`. Construa o filme sobre ele preenchendo tokens, cenas e `defFull()/defPh()`. Inclui o STUDIO embutido: take one-click → MP4/WebM, música-tema mixada (synth/arquivo/Openverse) e export de GIF. |

## Invocação

`/product-film` — descreva o produto/fluxo a demonstrar. O skill executa o fluxo real,
replica as telas com fidelidade, monta o roteiro em cortes, constrói o filme e verifica cada
beat por seek antes de entregar.

## Studio embutido (gravação in-page)

Todo filme gerado sai com estúdio: `● Gravar take` captura a própria guia
(`getDisplayMedia`), começa a gravar exatamente em t=0 e para no fim do corte —
o MP4 (Chrome/Edge/Safari; WebM no Firefox) baixa pronto, sem editor. Música-tema
opcional mixada no arquivo (trilhas sintetizadas embutidas, MP3 local ou busca CC
na Openverse com crédito copiável; o corte PH permanece mudo). Do take dá para
derivar um GIF (paleta 256 + dithering) direto no browser. No preview do artifact
(iframe) a gravação é bloqueada pelo browser — baixe o HTML e abra localmente.

Dev: `npm install && npx playwright install chromium && npm test` roda a suite
(Playwright headed com getDisplayMedia falso — determinístico, sem picker).
