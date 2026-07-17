# Studio de Gravação (MP4/GIF/Música) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Embutir no `engine-skeleton.html` um estúdio de gravação: take one-click → download MP4/WebM, export de GIF por pós-processamento, e música-tema (synth embutida, arquivo local, Openverse API) mixada dentro do take.

**Architecture:** Todo o studio vive DENTRO do mesmo IIFE do engine, numa seção nova de "mobília pronta" (CSS + HTML + JS), integrado por 7 micro-hooks no engine (`studioOn*` — function declarations, logo içadas). Captura via `getDisplayMedia`+`MediaRecorder` (recorder começa no `t=0`, para no primeiro wrap do loop). Música via grafo WebAudio com saída dupla (monitor + `MediaStreamDestination` adicionado ao stream gravado). GIF com encoder próprio (paleta uniforme + Floyd–Steinberg + LZW). Testes e2e com Playwright headed + `getDisplayMedia` FALSO injetado (canvas.captureStream), determinístico e sem picker.

**Tech Stack:** HTML/JS ES5 (estilo do skeleton, sem libs), WebAudio, MediaRecorder, Playwright Test (devDependency, só para testes — nada entra no HTML).

**Spec:** `docs/superpowers/specs/2026-07-16-studio-gravacao-design.md`

## Desvio consciente do spec (aprovar na revisão)

O spec menciona embutir **gifenc** minificado (MIT). Este plano implementa **encoder GIF próprio** (~140 linhas legíveis: paleta uniforme 6×7×6, dithering Floyd–Steinberg, LZW canônico estilo omggif). Motivo: um minificado de terceiro não é reproduzível/auditável no plano, e o encoder próprio elimina dependência e atribuição. Mesmos critérios de aceite (GIF válido, loop infinito, aviso >3 MB).

## Global Constraints

- **Um único HTML, zero dependência externa em runtime** (CSP de artifact bloqueia CDN). devDependencies só para teste.
- **Estilo do skeleton**: ES5 (`var`, `function`), 2 espaços, comentários pt-BR; studio no MESMO IIFE, delimitado por banner `/* ============ STUDIO ... ============ */`; hooks `studioOn*` são **function declarations** (hoisting — regra já documentada no skeleton).
- **Não tocar no princípio `f(t)`**: nada de estado novo dentro de `apply`/tabelas; studio é orquestração em volta (`studioOnApply` só lê `t`).
- **Corte PH é mudo**: `musicActive()` exige `cutName === 'full'`.
- **Nunca trocar de branch na árvore principal** (regra global do usuário); commits direto na `main`, padrão do repo: título conventional-commit pt-BR sem acentos.
- Todo commit termina com `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Testes: `npx playwright test` (headed, 1 worker, Chromium do Playwright — SEM H.264, logo takes de teste saem `webm`; a cascata MP4 é testada por unidade com `isTypeSupported` stubado).
- Node ≥ 18. Comandos shell abaixo são Git Bash (win32).

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `plugins/product-film/references/engine-skeleton.html` (modify) | 7 hooks no engine + seção STUDIO (CSS/HTML/JS) |
| `package.json`, `playwright.config.cjs`, `.gitignore` (create/modify) | Harness de teste |
| `tests/serve.cjs` (create) | HTTP server estático sem deps (porta 4173) + fixture WAV on-the-fly |
| `tests/helpers/wav.js` (create) | Gerador de WAV PCM (fixture de áudio) |
| `tests/helpers/fake-gdm.js` (create) | `getDisplayMedia` falso p/ testes (canvas.captureStream + faixa de áudio opcional) |
| `tests/fixtures/iframe-host.html` (create) | Hospeda o skeleton em iframe p/ testar degradação |
| `tests/e2e/*.spec.js` (create, 7 arquivos) | Specs por tarefa |
| `plugins/product-film/SKILL.md`, `plugins/product-film/README.md`, `plugins/product-film/.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` (modify) | Docs + bump 1.1.0 |

---

### Task 1: Harness Playwright + baseline do engine

**Files:**
- Create: `package.json`, `playwright.config.cjs`, `tests/serve.cjs`, `tests/helpers/wav.js`, `tests/e2e/baseline.spec.js`
- Modify: `.gitignore`

**Interfaces:**
- Produces: server em `http://localhost:4173` servindo a raiz do repo; rota especial `/tests/fixtures/track.wav` (WAV 1s gerado); `wavBuffer(seconds, hz)` em `tests/helpers/wav.js`; comando `npx playwright test`.

- [ ] **Step 1: Criar package.json**

```json
{
  "name": "product-film-dev",
  "private": true,
  "scripts": {
    "test": "playwright test",
    "serve": "node tests/serve.cjs"
  },
  "devDependencies": {
    "@playwright/test": "^1.49.0"
  }
}
```

- [ ] **Step 2: Append no .gitignore**

Conteúdo final do `.gitignore`:

```
.DS_Store
Thumbs.db
node_modules/
test-results/
playwright-report/
```

- [ ] **Step 3: Criar tests/helpers/wav.js**

```js
'use strict';
/* Gera um WAV PCM16 mono (fixture de áudio para testes). */
function wavBuffer(seconds, hz) {
  seconds = seconds || 1; hz = hz || 440;
  const rate = 44100, n = Math.floor(rate * seconds);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin(2 * Math.PI * hz * i / rate) * 12000), 44 + i * 2);
  return buf;
}
module.exports = { wavBuffer };
```

- [ ] **Step 4: Criar tests/serve.cjs**

```js
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { wavBuffer } = require('./helpers/wav');

const ROOT = path.resolve(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.wav': 'audio/wav', '.md': 'text/plain' };

http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/tests/fixtures/track.wav') {
    res.writeHead(200, { 'Content-Type': 'audio/wav' });
    res.end(wavBuffer(1, 330));
    return;
  }
  const file = path.normalize(path.join(ROOT, urlPath));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('not found'); return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  res.end(fs.readFileSync(file));
}).listen(4173, () => console.log('serve on :4173'));
```

- [ ] **Step 5: Criar playwright.config.cjs**

Headed + 1 worker: rAF/MediaRecorder precisam de timing real (o próprio SKILL.md alerta que headless estrangula rAF). `--autoplay-policy` permite AudioContext sem gesto (testes disparam via `evaluate`).

```js
'use strict';
const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 90000,
  workers: 1,
  use: {
    baseURL: 'http://localhost:4173',
    headless: false,
    viewport: { width: 1280, height: 800 },
    launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] }
  },
  webServer: {
    command: 'node tests/serve.cjs',
    url: 'http://localhost:4173/plugins/product-film/references/engine-skeleton.html',
    reuseExistingServer: true,
    timeout: 15000
  }
});
```

- [ ] **Step 6: Criar tests/e2e/baseline.spec.js (guarda o engine existente)**

```js
'use strict';
const { test, expect } = require('@playwright/test');
const PAGE = '/plugins/product-film/references/engine-skeleton.html';

test('engine boota e faz seek via ?cut&t&paused', async ({ page }) => {
  await page.goto(PAGE + '?cut=full&t=5&paused=1');
  await expect(page.locator('#stage')).toBeVisible();
  expect(await page.evaluate(() => window.__film.t)).toBeCloseTo(5, 1);
  await page.evaluate(() => window.__film.seek(2));
  expect(await page.evaluate(() => window.__film.t)).toBeCloseTo(2, 1);
});

test('start overlay aparece sem query params', async ({ page }) => {
  await page.goto(PAGE);
  await expect(page.locator('#start')).toBeVisible();
  await expect(page.locator('.cutbtn[data-cut="full"]')).toBeVisible();
});
```

- [ ] **Step 7: Instalar e rodar**

```bash
npm install
npx playwright install chromium
npx playwright test
```

Expected: `2 passed`.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json playwright.config.cjs .gitignore tests/
git commit -m "chore: harness de testes playwright para o engine-skeleton

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Hooks no engine + scaffold do studio (env, estado, degradação)

**Files:**
- Modify: `plugins/product-film/references/engine-skeleton.html`
- Create: `tests/fixtures/iframe-host.html`, `tests/e2e/studio-scaffold.spec.js`

**Interfaces:**
- Consumes: internals do IIFE do engine (`t, playing, started, cutName, CUT, setCut, seek, play, pause, startCountdown, startOv, controls, stage, win, $`).
- Produces (usado pelas Tasks 3–7):
  - Hooks chamados pelo engine: `studioOnPlay()`, `studioOnPause()`, `studioOnSeek(t)`, `studioOnApply(t)`, `studioOnWrap() -> boolean` (true = consumiu o wrap; engine então trava `t = CUT.dur - 0.001` em vez de dar loop), `studioOnCountdownCancel()`.
  - `var cdDone` — callback corrente da contagem (Space passa a usar `cdDone`, não `play` fixo).
  - `STUDIO_ENV = { iframe: bool, gdm: bool }`, `canRec()`.
  - `recState = { state: 'idle'|'arming'|'recording'|'processing', stream, recorder, chunks, mime, endKind, lastTake, autoDownload }`.
  - `updateStudioUi()`; elementos `#st-row #st-rec #st-cutsel #st-music #st-nohint #c-rec #st-toast #music-panel #gif-panel`.
  - `window.__film.studio` (getters `state/lastTake/env`, setter `autoDownload`) — Tasks seguintes ESTENDEM `studioApi`.

- [ ] **Step 1: Escrever o teste que falha (tests/e2e/studio-scaffold.spec.js)**

```js
'use strict';
const { test, expect } = require('@playwright/test');
const PAGE = '/plugins/product-film/references/engine-skeleton.html';

test('studio expõe estado idle e env com canRec', async ({ page }) => {
  await page.goto(PAGE);
  const s = await page.evaluate(() => ({
    state: window.__film.studio.state,
    env: window.__film.studio.env
  }));
  expect(s.state).toBe('idle');
  expect(s.env.iframe).toBe(false);
  expect(s.env.gdm).toBe(true);
  expect(s.env.canRec).toBe(true);
  await expect(page.locator('#st-rec')).toBeVisible();
  await expect(page.locator('#st-nohint')).toBeHidden();
});

test('em iframe degrada para hint (sem REC)', async ({ page }) => {
  await page.goto('/tests/fixtures/iframe-host.html');
  const f = page.frameLocator('#host');
  await expect(f.locator('#st-nohint')).toBeVisible();
  await expect(f.locator('#st-rec')).toBeHidden();
  const frame = page.frame({ url: /engine-skeleton/ });
  expect(await frame.evaluate(() => window.__film.studio.env.canRec)).toBe(false);
});
```

- [ ] **Step 2: Criar tests/fixtures/iframe-host.html**

```html
<!doctype html>
<title>host</title>
<style>body{margin:0;background:#222}iframe{width:1200px;height:700px;border:0}</style>
<iframe id="host" src="/plugins/product-film/references/engine-skeleton.html"></iframe>
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx playwright test studio-scaffold`
Expected: FAIL (`window.__film.studio` é undefined; `#st-rec` não existe).

- [ ] **Step 4: Aplicar os 7 hooks no engine (edits cirúrgicos)**

No `engine-skeleton.html`, com Edit (old → new exatos):

(a) Wrap do loop em `frame()`:
```js
// old
      if (t >= CUT.dur) t -= CUT.dur; /* loop */
// new
      if (t >= CUT.dur) { if (studioOnWrap()) t = CUT.dur - 0.001; else t -= CUT.dur; } /* loop */
```

(b) Fim de `play()`:
```js
// old
    raf = requestAnimationFrame(frame);
  }
  function pause() {
// new
    raf = requestAnimationFrame(frame);
    studioOnPlay();
  }
  function pause() {
```

(c) Em `pause()`:
```js
// old
    app.classList.remove('playing');
    if (started) pokeControls();
// new
    app.classList.remove('playing');
    studioOnPause();
    if (started) pokeControls();
```

(d) Em `seek()`:
```js
// old
  function seek(nt) { t = Math.max(0, Math.min(CUT.dur - 0.001, nt)); apply(t); }
// new
  function seek(nt) { t = Math.max(0, Math.min(CUT.dur - 0.001, nt)); apply(t); studioOnSeek(t); }
```

(e) Fim de `apply()`:
```js
// old
    $('#c-time').textContent = t.toFixed(1) + ' / ' + CUT.dur.toFixed(1);
  }
// new
    $('#c-time').textContent = t.toFixed(1) + ' / ' + CUT.dur.toFixed(1);
    studioOnApply(t);
  }
```

(f) Contagem — callback armazenado (Space respeitava só `play`, quebraria o REC):
```js
// old
  var counting = false, cdTimer = null;
  function startCountdown(done) {
    cancelCountdown();
    counting = true;
// new
  var counting = false, cdTimer = null, cdDone = null;
  function startCountdown(done) {
    cancelCountdown();
    counting = true;
    cdDone = done;
```
```js
// old
      if (e.key === ' ') { e.preventDefault(); finishCountdown(play); }
      else if (e.key === 'Escape') { cancelCountdown(); pokeControls(); }
// new
      if (e.key === ' ') { e.preventDefault(); finishCountdown(cdDone || play); }
      else if (e.key === 'Escape') { cancelCountdown(); studioOnCountdownCancel(); pokeControls(); }
```

- [ ] **Step 5: Inserir CSS do studio (antes de `</style>`)**

```css
/* ============ STUDIO (mobília pronta — normalmente não mexer) ============ */
.s-studio { display: flex; align-items: center; gap: 10px; font-family: var(--font-mono); font-size: 13px; }
.stbtn { display: inline-flex; align-items: center; gap: 8px; border: 1px solid var(--color-border-hover); background: var(--color-surface); color: var(--color-text); border-radius: var(--radius-full); padding: 8px 16px; font-family: var(--font-mono); font-size: 13px; cursor: pointer; transition: border-color .2s; }
.stbtn:hover { border-color: var(--color-accent); }
.stbtn .rec-dot { width: 9px; height: 9px; border-radius: 50%; background: var(--color-accent); }
#st-nohint { max-width: 560px; color: var(--color-text-dim); font-family: var(--font-body); font-size: 13px; line-height: 1.5; }
#st-toast { position: fixed; right: 18px; bottom: 18px; z-index: 210; display: none; align-items: center; gap: 10px; padding: 10px 14px; background: rgba(10,10,24,.95); border: 1px solid var(--color-border-hover); border-radius: var(--radius-md); font-family: var(--font-mono); font-size: 12.5px; color: var(--color-text); }
#st-toast.on { display: flex; }
#st-toast button { border: 1px solid var(--color-border-hover); background: transparent; color: var(--color-text); border-radius: var(--radius-full); padding: 4px 10px; font-size: 12px; cursor: pointer; }
#st-toast button:disabled { opacity: .4; cursor: default; }
#music-panel, #gif-panel { position: fixed; left: 50%; top: 50%; transform: translate(-50%,-50%); z-index: 400; display: none; flex-direction: column; gap: 10px; width: 460px; max-height: 80vh; overflow: auto; padding: 18px 20px; background: rgba(10,10,24,.97); border: 1px solid var(--color-border-hover); border-radius: var(--radius-lg); font-family: var(--font-body); font-size: 14px; color: var(--color-text); }
#music-panel.on, #gif-panel.on { display: flex; }
.mp-title, .gp-title { font-family: var(--font-display); font-weight: 700; font-size: 18px; }
.mp-row { display: flex; align-items: center; gap: 8px; }
.mp-search { display: flex; gap: 8px; }
.mp-search input, #music-panel input[type=text] { flex: 1; background: var(--color-surface-code); border: 1px solid var(--color-border); border-radius: var(--radius-md); color: var(--color-text); padding: 6px 10px; }
#mp-list { display: flex; flex-direction: column; gap: 6px; max-height: 180px; overflow: auto; }
#mp-list .mp-tk { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 8px; border: 1px solid var(--color-border); border-radius: var(--radius-md); font-size: 13px; }
#music-panel button, #gif-panel button, #gif-panel select { border: 1px solid var(--color-border-hover); background: var(--color-surface); color: var(--color-text); border-radius: var(--radius-md); padding: 5px 10px; font-size: 12.5px; cursor: pointer; }
.mp-vol { display: flex; align-items: center; gap: 10px; }
.mp-note, .gp-dim { color: var(--color-text-muted); font-size: 12.5px; }
.gp-row { display: flex; align-items: center; gap: 10px; }
#gp-prog { height: 4px; background: rgba(42,42,74,.5); border-radius: 2px; overflow: hidden; display: none; }
#gp-prog.on { display: block; }
#gp-prog i { display: block; height: 100%; width: 0; background: var(--color-accent); }
#gp-from, #gp-to { width: 70px; background: var(--color-surface-code); border: 1px solid var(--color-border); border-radius: var(--radius-md); color: var(--color-text); padding: 5px 8px; }
```

- [ ] **Step 6: Inserir HTML do studio**

(a) Linha do studio no start overlay — old → new:
```html
<!-- old -->
        <div class="s-hints"><span><b>F</b>fullscreen</span><span><b>Space</b>play/pause</span><span><b>R</b>restart</span><span><b>&larr;&nbsp;&rarr;</b>&plusmn;2s</span><span><b>Esc</b>pause</span></div>
      </div>
<!-- new -->
        <div class="s-hints"><span><b>F</b>fullscreen</span><span><b>Space</b>play/pause</span><span><b>R</b>restart</span><span><b>&larr;&nbsp;&rarr;</b>&plusmn;2s</span><span><b>Esc</b>pause</span></div>
        <div class="s-studio" id="st-row">
          <button class="stbtn" id="st-rec"><span class="rec-dot"></span>Gravar take</button>
          <button class="stbtn" id="st-cutsel">FULL</button>
          <button class="stbtn" id="st-music">&#9834; <span id="st-music-name">Nenhuma</span></button>
          <span id="st-nohint" style="display:none">Grava&ccedil;&atilde;o in-page indispon&iacute;vel neste preview &mdash; baixe o HTML e abra localmente no Chrome. A m&uacute;sica-tema continua dispon&iacute;vel.</span>
        </div>
      </div>
```

(b) Botão REC nos controles — old → new:
```html
<!-- old -->
    <button id="c-full">&#x26F6;</button>
  </div>
<!-- new -->
    <button id="c-full">&#x26F6;</button>
    <button id="c-rec">&#9679; REC</button>
  </div>
```

(c) Toast + painéis, inseridos ANTES de `<div id="fs-hint"`:
```html
  <div id="st-toast"><span id="st-toast-msg"></span><button id="tt-dl">Baixar de novo</button><button id="tt-gif">Gerar GIF</button><button id="tt-rerec">Regravar</button><button id="tt-x">&times;</button></div>

  <div id="music-panel">
    <div class="mp-title">M&uacute;sica-tema <span class="mp-note">(corte full &middot; PH &eacute; mudo por conven&ccedil;&atilde;o)</span></div>
    <label class="mp-row"><input type="radio" name="mp" value="none" checked> Nenhuma</label>
    <label class="mp-row"><input type="radio" name="mp" value="pulse"> Pulse (upbeat)</label>
    <label class="mp-row"><input type="radio" name="mp" value="glass"> Glass (corporate)</label>
    <label class="mp-row"><input type="radio" name="mp" value="drift"> Drift (lo-fi)</label>
    <label class="mp-row"><input type="radio" name="mp" value="file"> Arquivo local&hellip; <input type="file" id="mp-file" accept="audio/*"></label>
    <label class="mp-row"><input type="radio" name="mp" value="api" id="mp-api-radio"> Buscar (Openverse, CC)</label>
    <div id="mp-api" style="display:none">
      <div class="mp-search"><input id="mp-q" type="text" placeholder="ex.: upbeat electronic"><button id="mp-go">Buscar</button></div>
      <div id="mp-list"></div>
      <div class="mp-row" id="mp-credit-row" style="display:none"><span class="mp-note" id="mp-credit"></span><button id="mp-copy">copiar cr&eacute;dito</button></div>
    </div>
    <div class="mp-vol"><span class="mp-note">vol</span><input id="mp-vol" type="range" min="0" max="100" value="70"></div>
    <div class="mp-note" id="mp-note"></div>
    <div class="mp-row"><button id="mp-close">fechar</button></div>
  </div>

  <div id="gif-panel">
    <div class="gp-title">GIF do take</div>
    <div class="gp-row">largura <select id="gp-w"><option>480</option><option selected>640</option><option>800</option></select> fps <select id="gp-fps"><option>10</option><option selected>12</option><option>15</option></select></div>
    <div class="gp-row">de <input id="gp-from" type="number" min="0" step="0.5" value="0"> s at&eacute; <input id="gp-to" type="number" min="0" step="0.5"> s <span class="gp-dim">(vazio = fim)</span></div>
    <div class="gp-row"><button id="gp-make">Gerar &amp; baixar</button><button id="gp-close">fechar</button></div>
    <div id="gp-prog"><i></i></div>
    <div class="mp-note" id="gp-out"></div>
  </div>
```

- [ ] **Step 7: Inserir JS do scaffold**

Antes da linha `window.__film = {` — banner + estado + hooks vazios (declarations içam, então o engine pode chamá-los antes desta posição no fonte):

```js
  /* ============================================================
     STUDIO (mobília pronta — normalmente não mexer)
     Take one-click → MP4/WebM, música-tema mixada, GIF do take.
     Integração com o engine: só pelos hooks studioOn*.
     ============================================================ */
  var STUDIO_ENV = {
    iframe: (function () { try { return window.top !== window; } catch (e) { return true; } })(),
    gdm: !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia)
  };
  function canRec() { return !STUDIO_ENV.iframe && STUDIO_ENV.gdm; }

  var recState = {
    state: 'idle',            /* idle | arming | recording | processing */
    stream: null, recorder: null, chunks: [], mime: '', endKind: '',
    lastTake: null,           /* {blob, mime, dur, cut, audioTracks, partial} */
    autoDownload: true
  };

  /* Hooks chamados pelo engine (corpos preenchidos nas seções seguintes). */
  function studioOnPlay() {}
  function studioOnPause() {}
  function studioOnSeek(nt) {}
  function studioOnApply(tt) {}
  function studioOnWrap() { return false; }
  function studioOnCountdownCancel() {}
```

E a seção de UI/boot do studio entra no FINAL do IIFE, inserida imediatamente DEPOIS da linha existente `window.__film = { ... };` (o DOM já existe e todas as declarações do studio já içaram):

```js
  /* ---------- STUDIO: UI + boot ---------- */
  function updateStudioUi() {
    var rec = canRec();
    $('#st-rec').style.display = rec ? '' : 'none';
    $('#st-cutsel').style.display = rec ? '' : 'none';
    $('#c-rec').style.display = rec ? '' : 'none';
    $('#st-nohint').style.display = rec ? 'none' : 'inline';
    $('#st-cutsel').textContent = cutName.toUpperCase();
  }
  $('#st-cutsel').addEventListener('click', function () {
    setCut(cutName === 'full' ? 'ph' : 'full');
    updateStudioUi();
  });
  $('#tt-x').addEventListener('click', function () { $('#st-toast').classList.remove('on'); });
  $('#mp-close').addEventListener('click', function () { $('#music-panel').classList.remove('on'); });
  $('#gp-close').addEventListener('click', function () { $('#gif-panel').classList.remove('on'); });
  $('#st-music').addEventListener('click', function () { $('#music-panel').classList.add('on'); });

  var studioApi = {
    get state() { return recState.state; },
    get lastTake() { return recState.lastTake; },
    get autoDownload() { return recState.autoDownload; },
    set autoDownload(v) { recState.autoDownload = !!v; },
    get env() { return { iframe: STUDIO_ENV.iframe, gdm: STUDIO_ENV.gdm, canRec: canRec() }; }
  };
  window.__film.studio = studioApi;
  updateStudioUi();
```

- [ ] **Step 8: Rodar os testes**

Run: `npx playwright test`
Expected: `4 passed` (baseline 2 + scaffold 2).

- [ ] **Step 9: Commit**

```bash
git add plugins/product-film/references/engine-skeleton.html tests/
git commit -m "feat: scaffold do studio (env, hooks no engine, degradacao em iframe)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Captura → take one-click com download MP4/WebM

**Files:**
- Modify: `plugins/product-film/references/engine-skeleton.html`
- Create: `tests/helpers/fake-gdm.js`, `tests/e2e/capture.spec.js`

**Interfaces:**
- Consumes: Task 2 (`recState`, `canRec`, `updateStudioUi`, hooks, `cdDone`); engine (`setCut, seek, play, pause, startCountdown, started, startOv, cutName, CUT, playing, stage`).
- Produces:
  - `pickMime(isSup, withAudio) -> string` e `mimeCandidates(withAudio) -> string[]`.
  - `studioRec(cut?) -> Promise<boolean>`, `stopTake(kind)` com `kind: 'end'|'partial'`, `studioAbortArming()`.
  - `armCapture() -> Promise` (private), `wantsTabAudio() -> boolean` (Task 6 muda o retorno), `prepMusic() -> Promise` (stub aqui; Task 4 substitui).
  - `toastMsg(msg)`, `toastTake()`, `downloadTake()`, `slugTitle()`, `extFor(mime)`, `fmtMB(n)`.
  - `studioApi.rec/stop/abort/pickMime` expostos.
  - Contrato do fake-gdm de teste: define `window.__gdmOpts` com as opções recebidas; `opts.audio: true` → stream ganha 1 faixa de áudio.

- [ ] **Step 1: Criar tests/helpers/fake-gdm.js**

```js
'use strict';
/* getDisplayMedia FALSO para testes: canvas animado → captureStream.
   Grava opções em window.__gdmOpts; opts.audio true → adiciona faixa de áudio. */
function FAKE_GDM() {
  const cv = document.createElement('canvas');
  cv.width = 640; cv.height = 360;
  const cx = cv.getContext('2d');
  let h = 0;
  (function paint() { h = (h + 7) % 360; cx.fillStyle = 'hsl(' + h + ',60%,40%)'; cx.fillRect(0, 0, 640, 360); requestAnimationFrame(paint); })();
  const base = cv.captureStream(30);
  navigator.mediaDevices.getDisplayMedia = async (opts) => {
    window.__gdmOpts = JSON.parse(JSON.stringify(opts || {}));
    const s = new MediaStream([base.getVideoTracks()[0].clone()]);
    if (opts && opts.audio) {
      const ac = new AudioContext();
      const osc = ac.createOscillator();
      const dest = ac.createMediaStreamDestination();
      osc.connect(dest); osc.start();
      s.addTrack(dest.stream.getAudioTracks()[0]);
    }
    return s;
  };
}
module.exports = { FAKE_GDM };
```

- [ ] **Step 2: Escrever testes que falham (tests/e2e/capture.spec.js)**

```js
'use strict';
const { test, expect } = require('@playwright/test');
const { FAKE_GDM } = require('../helpers/fake-gdm');
const PAGE = '/plugins/product-film/references/engine-skeleton.html';

test.beforeEach(async ({ page }) => { await page.addInitScript(FAKE_GDM); });

test('pickMime: cascata mp4 → webm, com e sem áudio', async ({ page }) => {
  await page.goto(PAGE);
  const r = await page.evaluate(() => {
    const pm = window.__film.studio.pickMime;
    const firefoxLike = (m) => m.indexOf('webm') !== -1 && m.indexOf('h264') === -1;
    return {
      best: pm(() => true, true),
      bestMute: pm(() => true, false),
      firefox: pm(firefoxLike, true),
      none: pm(() => false, true)
    };
  });
  expect(r.best).toBe('video/mp4;codecs=avc1.640028,mp4a.40.2');
  expect(r.bestMute).toBe('video/mp4;codecs=avc1.640028');
  expect(r.firefox).toBe('video/webm;codecs=vp9,opus');
  expect(r.none).toBe('');
});

test('take PH one-click: começa em t=0, para no fim, sem áudio, baixável', async ({ page }) => {
  await page.goto(PAGE);
  await page.evaluate(() => { window.__film.studio.autoDownload = false; });
  await page.evaluate(() => window.__film.studio.rec('ph'));
  await page.waitForFunction(() => window.__film.studio.state === 'recording', null, { timeout: 15000 });
  await page.waitForFunction(() => window.__film.studio.state === 'idle' && !!window.__film.studio.lastTake, null, { timeout: 40000 });
  const tk = await page.evaluate(() => {
    const t = window.__film.studio.lastTake;
    return { size: t.blob.size, mime: t.mime, cut: t.cut, audio: t.audioTracks, partial: t.partial, dur: t.dur };
  });
  expect(tk.size).toBeGreaterThan(20000);
  expect(tk.mime).toContain('webm'); /* chromium do playwright não tem h264/mp4 */
  expect(tk.cut).toBe('ph');
  expect(tk.audio).toBe(0);
  expect(tk.partial).toBe(false);
  expect(tk.dur).toBeCloseTo(8, 0);
  const opts = await page.evaluate(() => window.__gdmOpts);
  expect(opts.preferCurrentTab).toBe(true);
  await expect(page.locator('#st-toast')).toBeVisible();
});

test('Esc durante o take → parcial', async ({ page }) => {
  await page.goto(PAGE);
  await page.evaluate(() => { window.__film.studio.autoDownload = false; });
  await page.evaluate(() => window.__film.studio.rec('ph'));
  await page.waitForFunction(() => window.__film.studio.state === 'recording', null, { timeout: 15000 });
  await page.waitForTimeout(1500);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__film.studio.state === 'idle' && !!window.__film.studio.lastTake, null, { timeout: 10000 });
  expect(await page.evaluate(() => window.__film.studio.lastTake.partial)).toBe(true);
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx playwright test capture`
Expected: FAIL (`pickMime`/`rec` não existem).

- [ ] **Step 4: Implementar a captura no skeleton**

Inserir na seção STUDIO, logo após os hooks vazios da Task 2 — e SUBSTITUIR os corpos de `studioOnWrap`, `studioOnPause` e `studioOnCountdownCancel`:

```js
  /* ---------- STUDIO: captura ---------- */
  function mimeCandidates(withAudio) {
    return withAudio ? [
      'video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4',
      'video/webm;codecs=h264,opus', 'video/webm;codecs=vp9,opus', 'video/webm'
    ] : [
      'video/mp4;codecs=avc1.640028', 'video/mp4',
      'video/webm;codecs=h264', 'video/webm;codecs=vp9', 'video/webm'
    ];
  }
  function pickMime(isSup, withAudio) {
    var c = mimeCandidates(withAudio);
    for (var i = 0; i < c.length; i++) if (isSup(c[i])) return c[i];
    return '';
  }
  function extFor(mime) { return mime.indexOf('mp4') !== -1 ? 'mp4' : 'webm'; }
  function slugTitle() {
    var s = (document.title || 'film').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return s || 'film';
  }
  function fmtMB(n) { return (n / 1048576).toFixed(2) + ' MB'; }

  function wantsTabAudio() { return false; } /* Task 6 (rota element da API) muda isto */
  function prepMusic() { return Promise.resolve(); } /* Task 4 substitui */
  function mixerAudioTrack() { return null; } /* Task 4 substitui */

  function armCapture() {
    var opts = {
      video: { frameRate: { ideal: 60 } },
      audio: wantsTabAudio(),
      preferCurrentTab: true,
      selfBrowserSurface: 'include'
    };
    return navigator.mediaDevices.getDisplayMedia(opts).then(function (stream) {
      var vt = stream.getVideoTracks()[0];
      var crop = (window.CropTarget && CropTarget.fromElement && vt.cropTo)
        ? CropTarget.fromElement(stage).then(function (ct) { return vt.cropTo(ct); }).catch(function () {})
        : Promise.resolve();
      return crop.then(function () {
        var mixTrack = mixerAudioTrack();
        if (mixTrack) stream.addTrack(mixTrack);
        vt.addEventListener('ended', function () {
          if (recState.state === 'recording') stopTake('partial');
          else if (recState.state === 'arming') studioAbortArming();
        });
        recState.stream = stream;
      });
    });
  }

  function startRecorder() {
    var withAudio = recState.stream.getAudioTracks().length > 0;
    recState.mime = pickMime(function (m) { return window.MediaRecorder && MediaRecorder.isTypeSupported(m); }, withAudio);
    recState.chunks = [];
    recState.recorder = new MediaRecorder(recState.stream, {
      mimeType: recState.mime || undefined,
      videoBitsPerSecond: 14000000,
      audioBitsPerSecond: 192000
    });
    recState.recorder.ondataavailable = function (e) { if (e.data && e.data.size) recState.chunks.push(e.data); };
    recState.recorder.onstop = onRecorderStop;
    /* take limpo: nada de painel/toast na guia capturada */
    $('#st-toast').classList.remove('on');
    $('#music-panel').classList.remove('on');
    $('#gif-panel').classList.remove('on');
    recState.recorder.start();
    recState.state = 'recording';
    updateStudioUi();
  }

  function stopTake(kind) {
    if (recState.state !== 'recording') return;
    recState.state = 'processing';
    recState.endKind = kind;
    try { recState.recorder.stop(); } catch (e) {}
    if (playing) pause();
  }

  function onRecorderStop() {
    var audioN = recState.stream ? recState.stream.getAudioTracks().length : 0;
    if (recState.stream) recState.stream.getTracks().forEach(function (tr) { tr.stop(); });
    var blob = new Blob(recState.chunks, { type: (recState.mime || 'video/webm').split(';')[0] });
    recState.lastTake = {
      blob: blob, mime: recState.mime || 'video/webm', dur: CUT.dur, cut: cutName,
      audioTracks: audioN, partial: recState.endKind !== 'end'
    };
    recState.stream = null; recState.recorder = null; recState.chunks = [];
    recState.state = 'idle';
    if (recState.autoDownload) downloadTake();
    toastTake();
    updateStudioUi();
  }

  function downloadTake() {
    var tk = recState.lastTake; if (!tk) return;
    var a = document.createElement('a');
    a.href = URL.createObjectURL(tk.blob);
    a.download = slugTitle() + '-' + tk.cut + '.' + extFor(tk.mime);
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
  }

  function toastMsg(msg) {
    $('#st-toast-msg').textContent = msg;
    $('#tt-dl').disabled = !recState.lastTake;
    $('#tt-gif').disabled = !recState.lastTake;
    $('#st-toast').classList.add('on');
  }
  function toastTake() {
    var tk = recState.lastTake; if (!tk) return;
    var note = extFor(tk.mime) === 'webm' ? ' · webm (mp4 indisponível neste browser)' : '';
    toastMsg((tk.partial ? 'take parcial' : 'take salvo') + ' · ' + fmtMB(tk.blob.size) + note);
  }

  function studioRec(cut) {
    if (!canRec() || recState.state !== 'idle') return Promise.resolve(false);
    if (cut) setCut(cut);
    recState.state = 'arming';
    updateStudioUi();
    return armCapture().then(function () {
      started = true;
      startOv.style.display = 'none';
      if (playing) pause();
      seek(0);
      return prepMusic().then(function () {
        startCountdown(function () { startRecorder(); play(); });
        return true;
      });
    }).catch(function (e) {
      studioAbortArming();
      toastMsg('captura cancelada (' + ((e && e.name) || 'erro') + ')');
      return false;
    });
  }

  function studioAbortArming() {
    if (recState.stream) { recState.stream.getTracks().forEach(function (tr) { tr.stop(); }); recState.stream = null; }
    if (recState.state === 'arming') recState.state = 'idle';
    updateStudioUi();
  }
```

Substituições dos hooks (old → new):

```js
// old
  function studioOnPause() {}
// new
  function studioOnPause() {
    if (recState.state === 'recording') { stopTake('partial'); return; }
  }
```
```js
// old
  function studioOnWrap() { return false; }
// new
  function studioOnWrap() {
    if (recState.state !== 'recording') return false;
    stopTake('end');
    return true;
  }
```
```js
// old
  function studioOnCountdownCancel() {}
// new
  function studioOnCountdownCancel() { studioAbortArming(); }
```

- [ ] **Step 5: Ligar UI e API**

Na seção "STUDIO: UI + boot" (Task 2), inserir antes de `var studioApi`:

```js
  $('#st-rec').addEventListener('click', function () { studioRec(cutName); });
  $('#c-rec').addEventListener('click', function () {
    if (recState.state === 'recording') stopTake('partial');
    else studioRec(cutName);
  });
  $('#tt-dl').addEventListener('click', downloadTake);
  $('#tt-rerec').addEventListener('click', function () {
    var cut = recState.lastTake ? recState.lastTake.cut : cutName;
    $('#st-toast').classList.remove('on');
    studioRec(cut);
  });
```

E SUBSTITUIR `updateStudioUi` + `studioApi` (old = versões da Task 2):

```js
  function updateStudioUi() {
    var rec = canRec();
    $('#st-rec').style.display = rec ? '' : 'none';
    $('#st-cutsel').style.display = rec ? '' : 'none';
    $('#c-rec').style.display = rec ? '' : 'none';
    $('#st-nohint').style.display = rec ? 'none' : 'inline';
    $('#st-cutsel').textContent = cutName.toUpperCase();
    $('#st-rec').disabled = recState.state !== 'idle';
    $('#c-rec').textContent = recState.state === 'recording' ? '■ STOP'
      : recState.state === 'arming' ? '…' : '● REC';
  }
```
```js
  var studioApi = {
    get state() { return recState.state; },
    get lastTake() { return recState.lastTake; },
    get autoDownload() { return recState.autoDownload; },
    set autoDownload(v) { recState.autoDownload = !!v; },
    get env() { return { iframe: STUDIO_ENV.iframe, gdm: STUDIO_ENV.gdm, canRec: canRec() }; },
    rec: studioRec,
    stop: function () { stopTake('partial'); },
    abort: studioAbortArming,
    pickMime: pickMime
  };
```

- [ ] **Step 6: Rodar os testes**

Run: `npx playwright test`
Expected: `7 passed` (o take PH leva ~13s reais: contagem 4s + 8s de corte).

- [ ] **Step 7: Commit**

```bash
git add plugins/product-film/references/engine-skeleton.html tests/
git commit -m "feat: gravacao one-click com download mp4/webm

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Mixer WebAudio + trilhas sintetizadas + painel de música

**Files:**
- Modify: `plugins/product-film/references/engine-skeleton.html`
- Create: `tests/e2e/music-synth.spec.js`

**Interfaces:**
- Consumes: Task 3 (`armCapture` chama `mixerAudioTrack()` e `prepMusic()`; hooks).
- Produces:
  - `MUSIC = { sel: {type,label,id?}, route: 'buffer'|'element', buf, el, src, gainBase, credit }`.
  - `ensureCtx()` → cria `actx, musicGain, fadeGain, masterGain, recDest` (grafo: music→fade→master→{destination, recDest}).
  - `setMusic(sel) -> Promise` com `sel.type: 'none'|'synth'|'file'|'api'`; `startMusicAt(offset)`, `stopMusic()`, `musicActive()`.
  - `renderSynth(id) -> Promise<AudioBuffer>` para `'pulse'|'glass'|'drift'` (OfflineAudioContext; cache).
  - Substitui os stubs: `prepMusic()` real, `mixerAudioTrack()` real.
  - `studioApi.setMusic/renderSynth/music` expostos.

- [ ] **Step 1: Escrever testes que falham (tests/e2e/music-synth.spec.js)**

```js
'use strict';
const { test, expect } = require('@playwright/test');
const { FAKE_GDM } = require('../helpers/fake-gdm');
const PAGE = '/plugins/product-film/references/engine-skeleton.html';

test.beforeEach(async ({ page }) => { await page.addInitScript(FAKE_GDM); });

test('renderSynth produz buffers estéreo com a duração do loop', async ({ page }) => {
  await page.goto(PAGE);
  const r = await page.evaluate(async () => {
    const b = await window.__film.studio.renderSynth('pulse');
    return { dur: b.duration, ch: b.numberOfChannels };
  });
  expect(r.ch).toBe(2);
  expect(r.dur).toBeCloseTo(16, 0); /* 8 compassos × 4 tempos ÷ 120bpm */
});

test('take full com Pulse sai com faixa de áudio; PH sai mudo', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto(PAGE);
  await page.evaluate(() => { window.__film.studio.autoDownload = false; });
  await page.evaluate(() => window.__film.studio.setMusic({ type: 'synth', id: 'pulse' }));
  await page.evaluate(() => window.__film.studio.rec('full'));
  await page.waitForFunction(() => window.__film.studio.state === 'idle' && !!window.__film.studio.lastTake, null, { timeout: 40000 });
  expect(await page.evaluate(() => window.__film.studio.lastTake.audioTracks)).toBe(1);
  /* mesmo com música selecionada, PH grava mudo */
  await page.evaluate(() => window.__film.studio.rec('ph'));
  await page.waitForFunction(() => window.__film.studio.state === 'recording', null, { timeout: 15000 });
  await page.evaluate(() => window.__film.studio.stop());
  await page.waitForFunction(() => window.__film.studio.state === 'idle', null, { timeout: 10000 });
  expect(await page.evaluate(() => window.__film.studio.lastTake.audioTracks)).toBe(0);
});

test('painel de música seleciona synth pela UI', async ({ page }) => {
  await page.goto(PAGE);
  await page.click('#st-music');
  await expect(page.locator('#music-panel')).toBeVisible();
  await page.check('input[name="mp"][value="glass"]');
  await page.waitForFunction(() => window.__film.studio.music.sel.type === 'synth');
  await expect(page.locator('#st-music-name')).toHaveText('Glass (corporate)');
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx playwright test music-synth`
Expected: FAIL (`renderSynth`/`setMusic` não existem).

- [ ] **Step 3: Implementar mixer + synths no skeleton**

Inserir após a seção de captura (Task 3):

```js
  /* ---------- STUDIO: música (mixer WebAudio) ---------- */
  var actx = null, musicGain = null, fadeGain = null, masterGain = null, recDest = null;
  var MUSIC = { sel: { type: 'none', label: 'Nenhuma' }, route: 'buffer', buf: null, el: null, src: null, gainBase: 0.7, credit: '' };
  var SYNTH_LABELS = { pulse: 'Pulse (upbeat)', glass: 'Glass (corporate)', drift: 'Drift (lo-fi)' };

  function ensureCtx() {
    if (actx) return;
    actx = new (window.AudioContext || window.webkitAudioContext)();
    musicGain = actx.createGain(); musicGain.gain.value = MUSIC.gainBase;
    fadeGain = actx.createGain();
    masterGain = actx.createGain();
    recDest = actx.createMediaStreamDestination();
    musicGain.connect(fadeGain); fadeGain.connect(masterGain);
    masterGain.connect(actx.destination); masterGain.connect(recDest);
  }
  function musicActive() { return cutName === 'full' && MUSIC.sel.type !== 'none'; }

  function startMusicAt(offset) {
    stopMusic();
    if (!musicActive()) return;
    if (MUSIC.route === 'element') {
      if (MUSIC.el) {
        try { MUSIC.el.currentTime = offset % (MUSIC.el.duration || 1e9); } catch (e) {}
        MUSIC.el.play();
      }
      return;
    }
    if (!MUSIC.buf) return;
    ensureCtx();
    if (actx.state === 'suspended') actx.resume();
    var src = actx.createBufferSource();
    src.buffer = MUSIC.buf; src.loop = true;
    src.connect(musicGain);
    src.start(0, offset % MUSIC.buf.duration);
    MUSIC.src = src;
  }
  function stopMusic() {
    if (MUSIC.src) { try { MUSIC.src.stop(); } catch (e) {} MUSIC.src = null; }
    if (MUSIC.el) MUSIC.el.pause();
  }

  function setMusic(sel) {
    stopMusic();
    MUSIC.credit = ''; MUSIC.el = null; MUSIC.buf = null; MUSIC.route = 'buffer';
    var done = Promise.resolve();
    if (!sel || sel.type === 'none') {
      MUSIC.sel = { type: 'none', label: 'Nenhuma' };
    } else if (sel.type === 'synth') {
      MUSIC.sel = { type: 'synth', id: sel.id, label: SYNTH_LABELS[sel.id] || sel.id };
      done = renderSynth(sel.id).then(function (b) { MUSIC.buf = b; });
    } else if (sel.type === 'file') {
      MUSIC.sel = { type: 'file', label: sel.label || 'arquivo' };
      MUSIC.buf = sel.buf;
    } else if (sel.type === 'api') {
      return pickApiTrack(sel.trk); /* Task 6 */
    }
    updateStudioUi();
    if (playing) startMusicAt(t);
    return done;
  }

  /* ---------- STUDIO: synths (render offline → buffer; determinístico) ---------- */
  var synthCache = {};
  var SYNTHS = {
    pulse: { bpm: 120, bars: 8, build: buildPulse },
    glass: { bpm: 96, bars: 8, build: buildGlass },
    drift: { bpm: 82, bars: 8, build: buildDrift }
  };
  function renderSynth(id) {
    if (synthCache[id]) return Promise.resolve(synthCache[id]);
    var def = SYNTHS[id];
    if (!def) return Promise.reject(new Error('synth desconhecido: ' + id));
    var dur = def.bars * 4 * 60 / def.bpm;
    var oc = new OfflineAudioContext(2, Math.ceil(44100 * dur), 44100);
    def.build(oc, def);
    return oc.startRendering().then(function (buf) { synthCache[id] = buf; return buf; });
  }
  function n2f(n) { return 440 * Math.pow(2, (n - 69) / 12); }
  function adsr(oc, t0, dur, a, r, peak) {
    var g = oc.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + a);
    g.gain.setValueAtTime(peak, Math.max(t0 + a, t0 + dur - r));
    g.gain.linearRampToValueAtTime(0, t0 + dur);
    return g;
  }
  function tone(oc, dest, type, midi, t0, dur, peak, a, r, detune) {
    var o = oc.createOscillator();
    o.type = type; o.frequency.value = n2f(midi);
    if (detune) o.detune.value = detune;
    var g = adsr(oc, t0, dur, a || 0.01, r || 0.08, peak);
    o.connect(g); g.connect(dest);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function noiseBuf(oc) {
    var b = oc.createBuffer(1, oc.sampleRate, oc.sampleRate), d = b.getChannelData(0);
    var seed = 1;
    for (var i = 0; i < d.length; i++) { seed = (seed * 16807) % 2147483647; d[i] = (seed / 2147483647) * 2 - 1; }
    return b;
  }
  function hit(oc, dest, nb, t0, dur, peak, hpHz) {
    var s = oc.createBufferSource(); s.buffer = nb;
    var f = oc.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hpHz;
    var g = adsr(oc, t0, dur, 0.001, dur * 0.8, peak);
    s.connect(f); f.connect(g); g.connect(dest);
    s.start(t0, (t0 * 7.13) % 0.8, dur + 0.02);
  }
  function kick(oc, dest, t0, peak) {
    var o = oc.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(150, t0);
    o.frequency.exponentialRampToValueAtTime(45, t0 + 0.12);
    var g = adsr(oc, t0, 0.32, 0.002, 0.22, peak);
    o.connect(g); g.connect(dest);
    o.start(t0); o.stop(t0 + 0.4);
  }
  function buildPulse(oc, def) {
    var out = oc.createGain(); out.gain.value = 0.5;
    var lp = oc.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 9000;
    out.connect(lp); lp.connect(oc.destination);
    var nb = noiseBuf(oc), spb = 60 / def.bpm;
    var chords = [57, 53, 48, 55], third = { 57: 3, 53: 4, 48: 4, 55: 4 }; /* Am F C G */
    for (var bar = 0; bar < def.bars; bar++) {
      var root = chords[bar % 4], t0 = bar * 4 * spb;
      for (var b = 0; b < 4; b++) {
        var tb = t0 + b * spb;
        kick(oc, out, tb, 0.9);
        hit(oc, out, nb, tb + spb / 2, 0.05, 0.18, 7000);
        tone(oc, out, 'square', root - 24, tb, spb * 0.45, 0.22, 0.005, 0.05);
        tone(oc, out, 'square', root - 24, tb + spb / 2, spb * 0.4, 0.16, 0.005, 0.05);
        var arp = [0, 7, third[root], 12];
        tone(oc, out, 'triangle', root + arp[b], tb, spb * 0.9, 0.12, 0.01, 0.2);
      }
    }
  }
  function buildGlass(oc, def) {
    var out = oc.createGain(); out.gain.value = 0.45;
    var lp = oc.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
    out.connect(lp); lp.connect(oc.destination);
    var spb = 60 / def.bpm;
    var chords = [[48, 55, 64], [45, 52, 60], [50, 57, 65], [43, 50, 59]]; /* C Am Dm G */
    for (var bar = 0; bar < def.bars; bar++) {
      var ch = chords[bar % 4], t0 = bar * 4 * spb, dur = 4 * spb;
      for (var i = 0; i < ch.length; i++) {
        tone(oc, out, 'sawtooth', ch[i], t0, dur, 0.07, 1.2, 1.4, -6);
        tone(oc, out, 'sawtooth', ch[i], t0, dur, 0.07, 1.2, 1.4, 6);
      }
      for (var b = 0; b < 4; b++) tone(oc, out, 'sine', ch[(b * 2) % 3] + 12, t0 + b * spb, spb * 0.5, 0.1, 0.005, 0.3);
    }
  }
  function buildDrift(oc, def) {
    var out = oc.createGain(); out.gain.value = 0.5;
    var lp = oc.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800;
    out.connect(lp); lp.connect(oc.destination);
    var nb = noiseBuf(oc);
    var bed = oc.createBufferSource(); bed.buffer = nb; bed.loop = true;
    var bf = oc.createBiquadFilter(); bf.type = 'bandpass'; bf.frequency.value = 4000; bf.Q.value = 0.4;
    var bg = oc.createGain(); bg.gain.value = 0.015;
    bed.connect(bf); bf.connect(bg); bg.connect(oc.destination); bed.start(0);
    var spb = 60 / def.bpm;
    var chords = [[45, 52, 55, 60], [41, 48, 52, 57], [43, 50, 53, 58], [45, 52, 55, 60]]; /* Am7 Fmaj7 G7 Am7 */
    for (var bar = 0; bar < def.bars; bar++) {
      var ch = chords[bar % 4], t0 = bar * 4 * spb;
      for (var i = 0; i < ch.length; i++) tone(oc, out, 'triangle', ch[i], t0 + i * 0.03, 4 * spb * 0.95, 0.09, 0.4, 1.2);
      kick(oc, out, t0, 0.8); kick(oc, out, t0 + 2.5 * spb, 0.55);
      hit(oc, out, nb, t0 + spb, 0.09, 0.22, 1500);
      hit(oc, out, nb, t0 + 3 * spb, 0.09, 0.22, 1500);
    }
  }
```

- [ ] **Step 4: Substituir stubs e hooks da captura**

```js
// old
  function wantsTabAudio() { return false; } /* Task 6 (rota element da API) muda isto */
  function prepMusic() { return Promise.resolve(); } /* Task 4 substitui */
  function mixerAudioTrack() { return null; } /* Task 4 substitui */
// new
  function wantsTabAudio() { return false; } /* Task 6 (rota element da API) muda isto */
  function prepMusic() {
    if (!musicActive()) return Promise.resolve();
    if (MUSIC.sel.type === 'synth' && !MUSIC.buf) return renderSynth(MUSIC.sel.id).then(function (b) { MUSIC.buf = b; });
    return Promise.resolve();
  }
  function mixerAudioTrack() {
    if (!musicActive() || MUSIC.route !== 'buffer' || !MUSIC.buf) return null;
    ensureCtx();
    return recDest.stream.getAudioTracks()[0];
  }
```

Hooks de sincronização (old → new):

```js
// old
  function studioOnPlay() {}
// new
  function studioOnPlay() { startMusicAt(t); }
```
```js
// old
  function studioOnPause() {
    if (recState.state === 'recording') { stopTake('partial'); return; }
  }
// new
  function studioOnPause() {
    if (recState.state === 'recording') { stopTake('partial'); return; }
    stopMusic();
  }
```
```js
// old
  function studioOnSeek(nt) {}
// new
  function studioOnSeek(nt) { if (playing) startMusicAt(nt); }
```
```js
// old
  function studioOnApply(tt) {}
// new
  function studioOnApply(tt) {
    if (!fadeGain || !CUT) return;
    /* fade-in 0.5s e fade-out 1.5s do corte full, como função de t */
    fadeGain.gain.value = (cutName === 'full') ? Math.min(win(tt, 0, 0.5), 1 - win(tt, CUT.dur - 1.5, CUT.dur)) : 1;
  }
```

E em `stopTake`, garantir silêncio ao encerrar (old → new):

```js
// old
    try { recState.recorder.stop(); } catch (e) {}
    if (playing) pause();
// new
    try { recState.recorder.stop(); } catch (e) {}
    stopMusic();
    if (playing) pause();
```

- [ ] **Step 5: Ligar painel de música e API**

Na seção UI (antes de `var studioApi`), inserir:

```js
  document.querySelectorAll('input[name="mp"]').forEach(function (r) {
    r.addEventListener('change', function () {
      var v = r.value;
      $('#mp-api').style.display = v === 'api' ? '' : 'none';
      if (v === 'none') setMusic({ type: 'none' });
      else if (v === 'pulse' || v === 'glass' || v === 'drift') setMusic({ type: 'synth', id: v });
      /* 'file' e 'api' só selecionam ao carregar arquivo / clicar Usar */
    });
  });
  $('#mp-vol').addEventListener('input', function () {
    MUSIC.gainBase = $('#mp-vol').value / 100;
    if (musicGain) musicGain.gain.value = MUSIC.gainBase;
  });
```

Em `updateStudioUi`, acrescentar ao final do corpo (old = corpo da Task 3; new = mesmo + linha):

```js
    $('#st-music-name').textContent = MUSIC.sel.label;
```

Em `studioApi`, acrescentar (old = objeto da Task 3; new = mesmo + entradas):

```js
    setMusic: setMusic,
    renderSynth: renderSynth,
    get music() { return { sel: MUSIC.sel, route: MUSIC.route, credit: MUSIC.credit }; },
```

- [ ] **Step 6: Rodar os testes**

Run: `npx playwright test`
Expected: `10 passed` (take full 10s + PH parcial: o spec de música leva ~40s reais).

- [ ] **Step 7: Commit**

```bash
git add plugins/product-film/references/engine-skeleton.html tests/
git commit -m "feat: musica-tema sintetizada com mixer webaudio no take

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Música por arquivo local

**Files:**
- Modify: `plugins/product-film/references/engine-skeleton.html`
- Create: `tests/e2e/music-file.spec.js`

**Interfaces:**
- Consumes: Task 4 (`setMusic({type:'file', buf, label})`, `ensureCtx`, `actx`), Task 1 (`wavBuffer`).
- Produces: handler do `#mp-file` (decodifica e seleciona); take full com arquivo local sai com `audioTracks: 1`.

- [ ] **Step 1: Escrever teste que falha (tests/e2e/music-file.spec.js)**

```js
'use strict';
const { test, expect } = require('@playwright/test');
const { FAKE_GDM } = require('../helpers/fake-gdm');
const { wavBuffer } = require('../helpers/wav');
const PAGE = '/plugins/product-film/references/engine-skeleton.html';

test('arquivo local: decodifica, seleciona e grava com áudio', async ({ page }) => {
  await page.addInitScript(FAKE_GDM);
  await page.goto(PAGE);
  await page.evaluate(() => { window.__film.studio.autoDownload = false; });
  await page.click('#st-music');
  await page.check('input[name="mp"][value="file"]');
  await page.setInputFiles('#mp-file', { name: 'tema.wav', mimeType: 'audio/wav', buffer: wavBuffer(1, 440) });
  await page.waitForFunction(() => window.__film.studio.music.sel.type === 'file', null, { timeout: 10000 });
  await expect(page.locator('#st-music-name')).toHaveText('tema.wav');
  await page.click('#mp-close');
  await page.evaluate(() => window.__film.studio.rec('full'));
  await page.waitForFunction(() => window.__film.studio.state === 'recording', null, { timeout: 15000 });
  await page.evaluate(() => window.__film.studio.stop());
  await page.waitForFunction(() => window.__film.studio.state === 'idle' && !!window.__film.studio.lastTake, null, { timeout: 10000 });
  expect(await page.evaluate(() => window.__film.studio.lastTake.audioTracks)).toBe(1);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx playwright test music-file`
Expected: FAIL (input sem handler; `music.sel.type` nunca vira `'file'`).

- [ ] **Step 3: Implementar handler do arquivo**

Na seção UI, junto aos handlers do painel (Task 4), inserir:

```js
  $('#mp-file').addEventListener('change', function () {
    var f = $('#mp-file').files[0];
    if (!f) return;
    f.arrayBuffer().then(function (ab) {
      ensureCtx();
      return actx.decodeAudioData(ab);
    }).then(function (buf) {
      setMusic({ type: 'file', buf: buf, label: f.name });
    }).catch(function () {
      $('#mp-note').textContent = 'não consegui decodificar esse arquivo de áudio.';
    });
  });
```

- [ ] **Step 4: Rodar os testes**

Run: `npx playwright test`
Expected: `11 passed`.

- [ ] **Step 5: Commit**

```bash
git add plugins/product-film/references/engine-skeleton.html tests/
git commit -m "feat: musica-tema por arquivo local

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Openverse — busca CC, crédito, rotas CORS buffer/element

**Files:**
- Modify: `plugins/product-film/references/engine-skeleton.html`
- Create: `tests/e2e/music-openverse.spec.js`

**Interfaces:**
- Consumes: Task 4 (`MUSIC`, `setMusic` já delega `type:'api'` a `pickApiTrack`), Task 3 (`wantsTabAudio` stub).
- Produces:
  - `openverseSearch(q) -> Promise<[{id,title,creator,license,licVer,url,dur}]>` (endpoint `https://api.openverse.org/v1/audio/?q=...&category=music&page_size=10`).
  - `pickApiTrack(trk) -> Promise` — tenta `fetch` CORS → `decodeAudioData` (rota `'buffer'`); falha → `<audio>` (rota `'element'`).
  - `creditFor(trk)`, `copyText(s)`; `wantsTabAudio()` real (true quando full + api + element).
  - `studioApi.openverseSearch/pickApiTrack` expostos.

- [ ] **Step 1: Escrever testes que falham (tests/e2e/music-openverse.spec.js)**

```js
'use strict';
const { test, expect } = require('@playwright/test');
const { FAKE_GDM } = require('../helpers/fake-gdm');
const PAGE = '/plugins/product-film/references/engine-skeleton.html';

const RESULTS = {
  results: [
    { id: '1', title: 'Neon Ride', creator: 'Ana', license: 'by', license_version: '4.0', url: 'http://localhost:4173/tests/fixtures/track.wav', duration: 30000 },
    { id: '2', title: 'Blocked Song', creator: 'Bob', license: 'by-sa', license_version: '4.0', url: 'https://blocked.example/x.mp3', duration: 30000 }
  ]
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(FAKE_GDM);
  await page.route('**/api.openverse.org/v1/audio/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(RESULTS) }));
  /* sem header ACAO → fetch(cors) falha; <audio> (no-cors) funciona */
  await page.route('https://blocked.example/**', r => r.fulfill({ status: 200, contentType: 'audio/mpeg', body: Buffer.alloc(64) }));
});

test('busca lista faixas; CORS ok vira rota buffer com crédito copiável', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:4173' });
  await page.goto(PAGE);
  await page.click('#st-music');
  await page.check('#mp-api-radio');
  await page.fill('#mp-q', 'upbeat');
  await page.click('#mp-go');
  await expect(page.locator('#mp-list .mp-tk')).toHaveCount(2);
  await page.locator('#mp-list .mp-tk button').first().click();
  await page.waitForFunction(() => window.__film.studio.music.sel.type === 'api' && window.__film.studio.music.route === 'buffer');
  const credit = await page.evaluate(() => window.__film.studio.music.credit);
  expect(credit).toContain('Neon Ride');
  expect(credit).toContain('CC BY 4.0');
  await page.click('#mp-copy');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('Neon Ride');
});

test('CORS bloqueado vira rota element e arma áudio da guia no REC', async ({ page }) => {
  await page.goto(PAGE);
  await page.evaluate(() => { window.__film.studio.autoDownload = false; });
  await page.click('#st-music');
  await page.check('#mp-api-radio');
  await page.fill('#mp-q', 'x');
  await page.click('#mp-go');
  await page.locator('#mp-list .mp-tk button').nth(1).click();
  await page.waitForFunction(() => window.__film.studio.music.route === 'element');
  await expect(page.locator('#mp-note')).toContainText('compartilhar');
  await page.click('#mp-close');
  await page.evaluate(() => window.__film.studio.rec('full'));
  await page.waitForFunction(() => window.__film.studio.state === 'recording', null, { timeout: 15000 });
  expect(await page.evaluate(() => window.__gdmOpts.audio)).toBe(true);
  await page.evaluate(() => window.__film.studio.stop());
  await page.waitForFunction(() => window.__film.studio.state === 'idle', null, { timeout: 10000 });
  expect(await page.evaluate(() => window.__film.studio.lastTake.audioTracks)).toBe(1);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx playwright test music-openverse`
Expected: FAIL (busca não implementada).

- [ ] **Step 3: Verificar a API real (uma vez, fora dos testes)**

```bash
curl -s "https://api.openverse.org/v1/audio/?q=piano&category=music&page_size=2"
```

Expected: JSON com `results[].title/creator/license/license_version/url`. Se `category=music` retornar 400/erro, consultar `https://api.openverse.org/v1/` e ajustar o parâmetro em `openverseSearch` E no stub dos testes (mesma forma).

- [ ] **Step 4: Implementar Openverse no skeleton**

Inserir após a seção de música (Task 4):

```js
  /* ---------- STUDIO: Openverse (música CC por API) ---------- */
  function openverseSearch(q) {
    var u = 'https://api.openverse.org/v1/audio/?q=' + encodeURIComponent(q) + '&category=music&page_size=10';
    return fetch(u, { headers: { 'Accept': 'application/json' } }).then(function (r) {
      if (!r.ok) throw new Error('openverse http ' + r.status);
      return r.json();
    }).then(function (j) {
      return (j.results || []).map(function (x) {
        return {
          id: x.id, title: x.title || 'sem título', creator: x.creator || '',
          license: String(x.license || '').toUpperCase(), licVer: x.license_version || '',
          url: x.url, dur: x.duration || 0
        };
      });
    });
  }
  function creditFor(trk) {
    var lic = trk.license === 'CC0' ? 'CC0' : 'CC ' + trk.license + (trk.licVer ? ' ' + trk.licVer : '');
    return '"' + trk.title + '" — ' + (trk.creator || 'autor desconhecido') + ' (' + lic + '), via Openverse';
  }
  function pickApiTrack(trk) {
    return fetch(trk.url, { mode: 'cors' }).then(function (r) {
      if (!r.ok) throw new Error('http ' + r.status);
      return r.arrayBuffer();
    }).then(function (ab) {
      ensureCtx();
      return actx.decodeAudioData(ab);
    }).then(function (buf) {
      MUSIC.buf = buf; MUSIC.el = null; MUSIC.route = 'buffer';
      finishApiSel(trk);
    }).catch(function () {
      /* CORS/decodificação falhou: toca via <audio>; gravação precisa do áudio da guia */
      MUSIC.buf = null; MUSIC.route = 'element';
      MUSIC.el = new Audio(); MUSIC.el.src = trk.url; MUSIC.el.loop = true;
      finishApiSel(trk);
    });
  }
  function finishApiSel(trk) {
    MUSIC.sel = { type: 'api', label: trk.title };
    MUSIC.credit = creditFor(trk);
    $('#mp-credit').textContent = MUSIC.credit;
    $('#mp-credit-row').style.display = '';
    $('#mp-note').textContent = MUSIC.route === 'element'
      ? 'esta faixa não permite mixagem direta (CORS): ao gravar, marque "compartilhar áudio da guia" no picker.'
      : '';
    updateStudioUi();
    if (playing) startMusicAt(t);
  }
  function copyText(s) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(s);
    var ta = document.createElement('textarea');
    ta.value = s; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    ta.remove();
    return Promise.resolve();
  }
```

Substituir `wantsTabAudio` (old → new):

```js
// old
  function wantsTabAudio() { return false; } /* Task 6 (rota element da API) muda isto */
// new
  function wantsTabAudio() {
    return cutName === 'full' && MUSIC.sel.type === 'api' && MUSIC.route === 'element';
  }
```

- [ ] **Step 5: Ligar UI da busca**

Na seção UI (junto aos handlers do painel), inserir:

```js
  $('#mp-go').addEventListener('click', function () {
    var q = $('#mp-q').value.trim();
    if (!q) return;
    $('#mp-list').textContent = 'buscando…';
    openverseSearch(q).then(function (list) {
      $('#mp-list').innerHTML = '';
      if (!list.length) { $('#mp-list').textContent = 'nada encontrado.'; return; }
      list.forEach(function (trk) {
        var row = document.createElement('div');
        row.className = 'mp-tk';
        var label = document.createElement('span');
        label.textContent = trk.title + ' — ' + (trk.creator || '?') + ' [' + trk.license + ']';
        var use = document.createElement('button');
        use.textContent = 'Usar';
        use.addEventListener('click', function () { $('#mp-list').querySelectorAll('button').forEach(function (b) { b.disabled = true; }); pickApiTrack(trk); });
        row.appendChild(label); row.appendChild(use);
        $('#mp-list').appendChild(row);
      });
    }).catch(function (e) {
      $('#mp-list').textContent = 'busca falhou (' + e.message + ') — offline ou preview com rede bloqueada.';
    });
  });
  $('#mp-copy').addEventListener('click', function () { copyText(MUSIC.credit); });
  if (STUDIO_ENV.iframe) {
    $('#mp-api-radio').disabled = true;
    $('#mp-api-radio').parentElement.title = 'indisponível no preview (rede bloqueada pelo CSP do artifact)';
  }
```

Em `studioApi`, acrescentar:

```js
    openverseSearch: openverseSearch,
    pickApiTrack: pickApiTrack,
```

- [ ] **Step 6: Rodar os testes**

Run: `npx playwright test`
Expected: `13 passed`.

- [ ] **Step 7: Commit**

```bash
git add plugins/product-film/references/engine-skeleton.html tests/
git commit -m "feat: busca de musica cc na openverse com credito e rota cors dupla

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: GIF do take (encoder próprio + painel)

**Files:**
- Modify: `plugins/product-film/references/engine-skeleton.html`
- Create: `tests/e2e/gif.spec.js`

**Interfaces:**
- Consumes: Task 3 (`recState.lastTake`, toast `#tt-gif`, `slugTitle`, `fmtMB`).
- Produces:
  - `encodeGif(frames, w, h, delayCs) -> Blob` (frames = arrays de índices `Uint8Array(w*h)`), `lzwEncode(pixels, minCode) -> number[]`, `ditherFrame(rgba, w, h) -> Uint8Array`, `GIF_PAL`.
  - `makeGif({width, fps, from, to}) -> Promise<Blob>` (pós-processa `lastTake.blob` via `<video>` + seek frame a frame; inclui workaround da duração Infinity do WebM).
  - `studioApi.makeGif/encodeGif/lzwEncode` expostos; painel `#gif-panel` funcional com aviso >3 MB.

- [ ] **Step 1: Escrever testes que falham (tests/e2e/gif.spec.js)**

```js
'use strict';
const { test, expect } = require('@playwright/test');
const { FAKE_GDM } = require('../helpers/fake-gdm');
const PAGE = '/plugins/product-film/references/engine-skeleton.html';

test('encodeGif produz GIF89a válido com loop', async ({ page }) => {
  await page.goto(PAGE);
  const r = await page.evaluate(async () => {
    const s = window.__film.studio;
    const w = 24, h = 12, a = new Uint8Array(w * h), b = new Uint8Array(w * h);
    for (let i = 0; i < a.length; i++) { a[i] = i % 200; b[i] = (i + 60) % 200; }
    const blob = s.encodeGif([a, b], w, h, 10);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let ok = true;
    try { await createImageBitmap(blob); } catch (e) { ok = false; }
    return {
      head: String.fromCharCode.apply(null, Array.from(bytes.slice(0, 6))),
      netscape: String.fromCharCode.apply(null, Array.from(bytes)).indexOf('NETSCAPE2.0') !== -1,
      trailer: bytes[bytes.length - 1],
      decoded: ok, size: blob.size
    };
  });
  expect(r.head).toBe('GIF89a');
  expect(r.netscape).toBe(true);
  expect(r.trailer).toBe(0x3B);
  expect(r.decoded).toBe(true);
  expect(r.size).toBeGreaterThan(100);
});

test('makeGif do take gera image/gif', async ({ page }) => {
  test.setTimeout(120000);
  await page.addInitScript(FAKE_GDM);
  await page.goto(PAGE);
  await page.evaluate(() => { window.__film.studio.autoDownload = false; });
  await page.evaluate(() => window.__film.studio.rec('ph'));
  await page.waitForFunction(() => window.__film.studio.state === 'idle' && !!window.__film.studio.lastTake, null, { timeout: 40000 });
  const r = await page.evaluate(async () => {
    const b = await window.__film.studio.makeGif({ width: 480, fps: 10, from: 0, to: 2 });
    return { type: b.type, size: b.size };
  });
  expect(r.type).toBe('image/gif');
  expect(r.size).toBeGreaterThan(5000);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx playwright test gif`
Expected: FAIL (`encodeGif` não existe).

- [ ] **Step 3: Implementar encoder + makeGif no skeleton**

Inserir após a seção Openverse:

```js
  /* ---------- STUDIO: GIF (encoder próprio: paleta uniforme + dither + LZW) ---------- */
  var GIF_PAL = (function () {
    var p = [];
    for (var r = 0; r < 6; r++) for (var g = 0; g < 7; g++) for (var b = 0; b < 6; b++)
      p.push([Math.round(r * 51), Math.round(g * 42.5), Math.round(b * 51)]);
    while (p.length < 256) p.push([0, 0, 0]);
    return p;
  })();
  function palIdx(r, g, b) {
    var ri = Math.round(r / 51), gi = Math.round(g / 42.5), bi = Math.round(b / 51);
    if (ri > 5) ri = 5; if (gi > 6) gi = 6; if (bi > 5) bi = 5;
    return ri * 42 + gi * 6 + bi;
  }
  function ditherFrame(rgba, w, h) {
    var d = new Float32Array(rgba.length);
    d.set(rgba);
    var out = new Uint8Array(w * h);
    function spread(x, y, er, eg, eb, f) {
      if (x < 0 || x >= w || y >= h) return;
      var j = (y * w + x) * 4;
      d[j] += er * f; d[j + 1] += eg * f; d[j + 2] += eb * f;
    }
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      var i = (y * w + x) * 4;
      var r = d[i] < 0 ? 0 : d[i] > 255 ? 255 : d[i];
      var g = d[i + 1] < 0 ? 0 : d[i + 1] > 255 ? 255 : d[i + 1];
      var b = d[i + 2] < 0 ? 0 : d[i + 2] > 255 ? 255 : d[i + 2];
      var idx = palIdx(r, g, b), c = GIF_PAL[idx];
      out[y * w + x] = idx;
      var er = r - c[0], eg = g - c[1], eb = b - c[2];
      spread(x + 1, y, er, eg, eb, 7 / 16);
      spread(x - 1, y + 1, er, eg, eb, 3 / 16);
      spread(x, y + 1, er, eg, eb, 5 / 16);
      spread(x + 1, y + 1, er, eg, eb, 1 / 16);
    }
    return out;
  }
  /* LZW do GIF (ordem canônica do omggif: emite, clear em 4096, senão bump+insere) */
  function lzwEncode(pixels, minCode) {
    var CLEAR = 1 << minCode, EOI = CLEAR + 1, MAXMAX = 4096;
    var codeSize = minCode + 1, next = EOI + 1, dict = {};
    var bytes = [], acc = 0, accBits = 0;
    function out(code) {
      acc |= code << accBits; accBits += codeSize;
      while (accBits >= 8) { bytes.push(acc & 255); acc >>= 8; accBits -= 8; }
    }
    function reset() { dict = {}; next = EOI + 1; codeSize = minCode + 1; }
    out(CLEAR);
    var prefix = pixels[0];
    for (var i = 1; i < pixels.length; i++) {
      var k = pixels[i], key = prefix * 256 + k;
      if (dict[key] !== undefined) { prefix = dict[key]; continue; }
      out(prefix);
      if (next === MAXMAX) { out(CLEAR); reset(); }
      else {
        if (next >= (1 << codeSize)) codeSize++;
        dict[key] = next++;
      }
      prefix = k;
    }
    out(prefix); out(EOI);
    if (accBits > 0) bytes.push(acc & 255);
    return bytes;
  }
  function encodeGif(frames, w, h, delayCs) {
    var out = [];
    function str(s) { for (var i = 0; i < s.length; i++) out.push(s.charCodeAt(i)); }
    function u16(v) { out.push(v & 255, (v >> 8) & 255); }
    str('GIF89a'); u16(w); u16(h);
    out.push(0xF7, 0, 0); /* GCT 256 cores */
    for (var i = 0; i < 256; i++) { var c = GIF_PAL[i]; out.push(c[0], c[1], c[2]); }
    out.push(0x21, 0xFF, 0x0B); str('NETSCAPE2.0'); out.push(3, 1); u16(0); out.push(0); /* loop ∞ */
    frames.forEach(function (px) {
      out.push(0x21, 0xF9, 4, 0); u16(delayCs); out.push(0, 0); /* GCE: delay em centissegundos */
      out.push(0x2C); u16(0); u16(0); u16(w); u16(h); out.push(0); /* descriptor sem LCT */
      out.push(8); /* min LZW code size */
      var data = lzwEncode(px, 8);
      for (var p = 0; p < data.length; p += 255) {
        var end = Math.min(p + 255, data.length);
        out.push(end - p);
        for (var q = p; q < end; q++) out.push(data[q]);
      }
      out.push(0);
    });
    out.push(0x3B);
    return new Blob([new Uint8Array(out)], { type: 'image/gif' });
  }
  function gifProgress(p) {
    $('#gp-prog').classList.add('on');
    $('#gp-prog i').style.width = Math.round(p * 100) + '%';
  }
  function makeGif(opts) {
    var tk = recState.lastTake;
    if (!tk) return Promise.reject(new Error('sem take gravado'));
    var width = opts.width || 640, fps = opts.fps || 12;
    return new Promise(function (resolve, reject) {
      var v = document.createElement('video');
      v.muted = true; v.preload = 'auto';
      v.src = URL.createObjectURL(tk.blob);
      v.addEventListener('error', function () { reject(new Error('não consegui decodificar o take')); });
      v.addEventListener('loadedmetadata', function () {
        /* WebM do MediaRecorder pode vir com duration=Infinity: seek grande corrige */
        var fix = isFinite(v.duration) ? Promise.resolve() : new Promise(function (res) {
          v.currentTime = 1e9;
          v.addEventListener('seeked', function on() { v.removeEventListener('seeked', on); res(); });
        });
        fix.then(function () {
          var dur = (isFinite(v.duration) && v.duration > 0) ? v.duration : tk.dur;
          var from = Math.max(0, opts.from || 0);
          var to = Math.min(opts.to || dur, dur);
          var w2 = Math.min(width, v.videoWidth || width);
          var h2 = Math.max(2, Math.round(w2 * (v.videoHeight || 9) / (v.videoWidth || 16) / 2) * 2);
          var cv = document.createElement('canvas'); cv.width = w2; cv.height = h2;
          var cx = cv.getContext('2d', { willReadFrequently: true });
          var frames = [], times = [];
          for (var tt = from; tt < to; tt += 1 / fps) times.push(tt);
          if (!times.length) { reject(new Error('janela vazia')); return; }
          var i = 0;
          (function step() {
            if (i >= times.length) {
              URL.revokeObjectURL(v.src);
              resolve(encodeGif(frames, w2, h2, Math.round(100 / fps)));
              return;
            }
            v.currentTime = times[i];
            v.addEventListener('seeked', function on() {
              v.removeEventListener('seeked', on);
              cx.drawImage(v, 0, 0, w2, h2);
              frames.push(ditherFrame(cx.getImageData(0, 0, w2, h2).data, w2, h2));
              gifProgress((i + 1) / times.length);
              i++;
              setTimeout(step, 0);
            });
          })();
        });
      });
    });
  }
```

- [ ] **Step 4: Ligar painel GIF**

Na seção UI, inserir:

```js
  $('#tt-gif').addEventListener('click', function () {
    if (!recState.lastTake) return;
    $('#gp-to').placeholder = recState.lastTake.dur.toFixed(1);
    $('#gp-out').textContent = '';
    $('#gif-panel').classList.add('on');
  });
  $('#gp-make').addEventListener('click', function () {
    var tk = recState.lastTake; if (!tk) return;
    $('#gp-make').disabled = true;
    $('#gp-out').textContent = 'gerando…';
    var to = parseFloat($('#gp-to').value);
    makeGif({
      width: parseInt($('#gp-w').value, 10),
      fps: parseInt($('#gp-fps').value, 10),
      from: parseFloat($('#gp-from').value) || 0,
      to: isNaN(to) ? undefined : to
    }).then(function (blob) {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = slugTitle() + '-' + tk.cut + '.gif';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
      $('#gp-out').textContent = fmtMB(blob.size) + (blob.size > 3145728
        ? ' — acima de 3 MB: para o GIF oficial, use ffmpeg/gifski sobre o MP4 (qualidade superior).'
        : '');
    }).catch(function (e) {
      $('#gp-out').textContent = 'falhou: ' + e.message;
    }).then(function () {
      $('#gp-make').disabled = false;
      $('#gp-prog').classList.remove('on');
    });
  });
```

Em `studioApi`, acrescentar:

```js
    makeGif: makeGif,
    encodeGif: encodeGif,
    lzwEncode: lzwEncode,
```

- [ ] **Step 5: Rodar os testes**

Run: `npx playwright test`
Expected: `15 passed`.

- [ ] **Step 6: Commit**

```bash
git add plugins/product-film/references/engine-skeleton.html tests/
git commit -m "feat: export de gif do take com encoder proprio embutido

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Docs (SKILL.md, README, versões) + QA manual

**Files:**
- Modify: `plugins/product-film/SKILL.md`, `plugins/product-film/README.md`, `plugins/product-film/.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`

**Interfaces:**
- Consumes: comportamento final das Tasks 2–7.
- Produces: documentação alinhada; versão do plugin `1.1.0`.

- [ ] **Step 1: SKILL.md — reescrever o passo 6 "Entregue"**

old:
```
6. **Entregue:** artifact (avise que preview em iframe **nega fullscreen** — o hint do skeleton
   oferece aba standalone/arquivo local/OBS região) + cópia no repo (`docs/marketing/demo-film/`)
   + instruções: F → escolher corte → contagem dá a folga → cortar o vídeo no fim do "1".
   Derivados depois: re-encode ffmpeg (CRF ~26 + faststart) p/ landing, GIF <3MB, stills.
```
new:
```
6. **Entregue:** artifact (preview em iframe **nega fullscreen E gravação** — o studio embutido
   degrada num hint com as saídas) + cópia no repo (`docs/marketing/demo-film/`). Gravação:
   abrir o HTML baixado no Chrome → `● Gravar take` (picker já sugere "esta guia"; contagem dá
   a folga; o arquivo sai cortado em t=0→fim — MP4 no Chrome/Edge/Safari, WebM no Firefox).
   Música-tema opcional mixada no take (synth embutida / MP3 local / Openverse CC com crédito —
   corte PH permanece mudo). GIF: botão "Gerar GIF" do take (conveniência); para o GIF oficial
   <3MB use ffmpeg/gifski sobre o MP4. OBS/ffmpeg seguem p/ gravar fora do browser e re-encode
   (CRF ~26 + faststart).
```

- [ ] **Step 2: SKILL.md — quick reference: acrescentar 2 linhas na tabela de UX de gravação**

```
| REC in-page | ● arma captura ("esta guia" + crop do palco) → contagem → grava t=0→fim → baixa MP4/WebM |
| Música | Mixada no take via WebAudio; PH sempre mudo; fade-in 0.5s, fade-out 1.5s no fim do full |
```

- [ ] **Step 3: SKILL.md — common mistakes: acrescentar 2 linhas**

```
| Overlay/painel do studio visível durante o take | Captura de guia grava TUDO que está nela: startRecorder esconde toast/painéis; nunca desenhe indicador REC no palco |
| Música armada no corte PH | PH é mudo por convenção: `musicActive()` exige corte full — não burlar |
```

- [ ] **Step 4: README.md — atualizar tabela de arquivos e adicionar seção**

Na linha da tabela sobre `references/engine-skeleton.html`, acrescentar ao final da descrição existente: `Inclui o STUDIO embutido: take one-click → MP4/WebM, música-tema mixada (synth/arquivo/Openverse) e export de GIF.`

Após a seção "Invocação", acrescentar:

```
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
```

- [ ] **Step 5: Bump de versões**

`plugins/product-film/.claude-plugin/plugin.json`: `"version": "1.0.0"` → `"version": "1.1.0"`.
`.claude-plugin/marketplace.json`: em `plugins[0]`, `"version": "1.0.0"` → `"version": "1.1.0"`.

- [ ] **Step 6: Suite completa + QA manual**

Run: `npx playwright test`
Expected: `15 passed`.

QA manual (real, fora do harness — checklist do spec):
1. Abrir `plugins/product-film/references/engine-skeleton.html` via duplo clique (`file://`) no Chrome real → `● Gravar take` com Pulse → escolher "esta guia" → conferir: MP4 com áudio, sem contagem no arquivo, crop sem letterbox (Chrome ≥104), fade-out no fim.
2. Corte PH → arquivo sem áudio.
3. Firefox: take sai `.webm` com aviso no toast.
4. Openverse com rede real: buscar "piano", tocar preview, crédito copiável (se a API divergir do stub, ajustar `openverseSearch` + stub e re-rodar suite).
5. `tests/fixtures/iframe-host.html` servido → hint de degradação (já coberto pelo teste automatizado; olhar visualmente uma vez).

Registrar qualquer débito encontrado no PR/commit final.

- [ ] **Step 7: Commit**

```bash
git add plugins/product-film/SKILL.md plugins/product-film/README.md plugins/product-film/.claude-plugin/plugin.json .claude-plugin/marketplace.json
git commit -m "docs: studio de gravacao no skill e readme, bump 1.1.0

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Self-review do plano (executado na escrita)

- **Cobertura do spec:** REC one-click (T3), cascata MP4/WebM (T3), Region Capture com fallback (T3), Esc parcial (T3), toast (T3), synth 3 trilhas (T4), fades f(t) (T4), PH mudo (T4), arquivo local (T5), Openverse + crédito + rota CORS dupla + áudio da guia (T6), GIF + aviso 3MB + workaround duration Infinity (T7), degradação iframe (T2), docs/versões (T8), `__film.studio` para smoke (T2–T7). Item do spec deliberadamente alterado: gifenc → encoder próprio (ver "Desvio consciente").
- **Sem placeholders:** todo step de código tem o código; os dois únicos pontos "a confirmar" são verificações explícitas com comando e critério (curl da Openverse, QA manual).
- **Consistência de nomes/tipos:** `recState/MUSIC/studioApi/hooks` idênticos entre tasks; stubs da T3 (`wantsTabAudio/prepMusic/mixerAudioTrack`) substituídos com old→new exatos na T4/T6.
