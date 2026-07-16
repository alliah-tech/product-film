---
name: product-film
description: Use when é preciso um vídeo de demonstração de produto (Product Hunt, landing, YouTube, artigos) e não há como produzir/editar vídeo diretamente — pedidos como "protótipo navegável que navega sozinho", "demo auto-reproduzível para eu gravar a tela", "product film", "vídeo do launch", ou quando um roteiro/storyboard de demo precisa virar algo gravável e fiel ao produto em produção.
---

# Product Film — protótipo auto-reproduzível para gravar

## Overview

Constrói-se um HTML único que **é** o vídeo: réplica fiel do produto que se navega sozinha
(cursor cenográfico, legendas cinéticas, zoom/spotlight, contagem, loop), e o usuário só grava
a tela. Princípio central: **todo estado visual é função pura de `t`** — nada de scheduler que
"dispara" beats nem `resetStage()`; `apply(t)` idempotente torna seek, loop e teste triviais.

O motor de referência (`references/engine-skeleton.html`) já vem completo e testado em produção — construa o filme sobre ele preenchendo tokens, cenas e as tabelas `defFull()/defPh()`.

## Processo

1. **Verdade primeiro — EXECUTE o fluxo real.** Antes de replicar, rode o fluxo de verdade
   (Playwright em prod/dev com um input real) e capture screenshots + valores exatos. Isso quase
   sempre derruba premissas do roteiro (input sugerido que não dispara o resultado esperado,
   strings no idioma errado, botão que não existe naquela página) → **alerte o usuário e registre
   os achados como débitos**; nunca materialize a premissa errada no filme.
2. **Fidelidade absoluta:** tokens/fontes/componentes copiados do código real; dados de uma
   execução real. **Só estados alcançáveis no produto** — cena "logado/Pro" = réplica da página
   logada REAL (shell incluso), jamais um estado híbrido inventado (ex.: teaser "desbloqueado").
   Conteúdo gerado por IA do produto pode ser plausível-realista; UI não.
3. **Roteiro em cortes:** PH ≈ 20s mudo em loop; full 40–60s para YouTube/landing. Legendas
   ≤5 palavras, 1 keyword em accent. Se o projeto exigir design spec (ui-designer), é antes daqui.
4. **Construa sobre** `references/engine-skeleton.html` (motor pronto: cenas, legendas, cursor,
   câmera, spotlight, scroll, contagem 4·3·2·1, controles, fullscreen-fallback, `?cut&t&paused`,
   `window.__film`). Preencha tokens, cenas e as tabelas `defFull()/defPh()`.
5. **Verifique por SEEK, nunca assistindo em headless:** sirva local (`node http server`),
   navegue `?cut=X&t=BEAT&paused=1`, screenshot de cada beat, compare com os screenshots de prod.
   Headless estrangula rAF — playback cronometrado ali mente. Um run 1x em browser real no final.
6. **Entregue:** artifact (avise que preview em iframe **nega fullscreen** — o hint do skeleton
   oferece aba standalone/arquivo local/OBS região) + cópia no repo (`docs/marketing/demo-film/`)
   + instruções: F → escolher corte → contagem dá a folga → cortar o vídeo no fim do "1".
   Derivados depois: re-encode ffmpeg (CRF ~26 + faststart) p/ landing, GIF <3MB, stills.

## Quick reference — UX de gravação (inegociável)

| Item | Comportamento |
|---|---|
| Play/restart | Contagem 4·3·2·1 (Space pula, Esc cancela) |
| Durante o play | Controles somem NA HORA + `cursor: none`; só borda inferior revela |
| Teclado | Space/K, R restart, ←/→ ±2s, F fullscreen, Esc pausa |
| Palco | 1920×1080 fixo, letterbox preto, escala p/ caber |
| Loop | `t -= dur`; emenda por textura/frame contínuo, sem corte seco |

## Common mistakes (todas aconteceram de verdade)

| Erro | Correção |
|---|---|
| Scheduler dispara beats + reset no loop | Estado = f(t); seek/loop saem de graça |
| Cursor ancorado em elemento que troca `display` no meio do gesto | `getBoundingClientRect` de `display:none` = (0,0) → cursor voa; ancore por coordenadas fixas nesses trechos |
| Scroll além do fim da página | Browser real para no fim: clamp `min(y, conteúdo − viewport)` |
| Fontes via CDN | CSP de artifact bloqueia: woff2 **data URI** (fonte variável = 1 arquivo, vários pesos) |
| `buildX()` chamado antes das tabelas `var` | Hoisting: declarações içam, atribuições não — boot no fim do script |
| Confiar no F/fullscreen em preview | Iframe cross-origin nega a API — detectar rejeição + hint com saídas |
| Estado de UI "montado" p/ ficar bonito | Não existe em prod = mentira no vídeo; o dono do produto percebe |
