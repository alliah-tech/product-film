# Studio de gravação embutido no engine-skeleton — design

Data: 2026-07-16 · Status: aprovado em brainstorming · Escopo: plugin `product-film`

## Contexto e objetivo

O engine-skeleton produz um HTML único que É o vídeo (estado visual = `f(t)`), e hoje o
usuário grava a tela por fora (OBS etc.) depois de baixar o arquivo — o preview em iframe
do artifact nega fullscreen e captura de tela por Permissions Policy.

Objetivo: o próprio HTML grava o take e entrega o arquivo, além de tocar música-tema.
Três capacidades novas, embutidas como "mobília pronta" do skeleton (abordagem A aprovada):

1. **REC → MP4**: gravar a guia via `getDisplayMedia` + `MediaRecorder` e baixar o take
   já cortado (começa em `t=0`, para no fim do corte), sem editor.
2. **GIF**: derivar um `.gif` do take gravado, por pós-processamento, com encoder embutido.
3. **Música-tema**: mixer WebAudio com três fontes (trilhas sintetizadas embutidas,
   arquivo local do usuário, busca em API externa de música CC), mixada DENTRO do MP4.

Decisões de sourcing de música (usuário): **as três fontes** — embutida + arquivo local
+ API externa.

## Fora de escopo (v1)

- Jamendo API direta (exige client_id); a Openverse já agrega Jamendo.
- Persistência de preferências entre sessões (localStorage).
- Atalho de teclado novo para REC (evitar conflito com os existentes).
- Remux para corrigir metadado de duração do WebM (limitação conhecida documentada).
- Narração/voz, ducking, múltiplas faixas simultâneas.

## UX

### Superfícies

- **Start overlay**: nova linha studio abaixo dos hints — botão `● Gravar take` e seletor
  `♪ Música: Nenhuma ▾`.
- **Barra de controles**: novo botão REC (regravar sem voltar ao start).
- **Toast pós-take** (fora do palco, mesma família visual dos controles):
  `take salvo · 00:42 · 38 MB` + ações `Baixar de novo · Gerar GIF · Regravar`.

### Fluxo do take

1. Usuário clica REC (no start ou nos controles) com um corte escolhido/ativo.
2. `getDisplayMedia` abre o picker do browser. Chrome/Edge: `preferCurrentTab: true`
   pré-seleciona "esta guia". Se Region Capture disponível (Chromium),
   `CropTarget.fromElement(#stage)` + `track.cropTo` → o arquivo sai só com o palco,
   16:9, sem letterbox.
3. Contagem 4·3·2·1 existente (tempo de fechar o picker e tirar a mão; Space pula,
   Esc cancela e descarta o stream).
4. No mesmo tick síncrono do fim da contagem: `recorder.start()` + `play()`.
   O arquivo começa exatamente em `t=0` — sem contagem, sem sobra.
5. No primeiro wrap do loop (`t >= CUT.dur`), o studio para o recorder (1 passada).
   Full: fade-out de música nos últimos 1.5s. PH: sem faixa de áudio.
6. Blob pronto → download automático `<slug>-<cut>.<ext>` (slug de `document.title`
   slugificado, fallback `film`; ext conforme container real) → toast pós-take.
7. Take fica em memória (`lastTake`) até `Regravar` ou reload — permite `Baixar de novo`
   e `Gerar GIF` sem regravar.

### Durante o take

- Nenhum elemento de studio visível dentro da viewport (a captura da guia inclui tudo
  que estiver nela; o badge "compartilhando" do Chrome fica na UI do browser, fora da
  área capturada). Vale a regra existente: controles somem NA HORA, `cursor: none`.
- **Esc** durante gravação: pausa o filme, para o recorder e mostra toast
  `take interrompido` com `Baixar parcial · Descartar`.
- Usuário pode escolher outra superfície no picker (janela/tela): funciona, mas o hint
  recomenda "esta guia"; letterbox/chrome do SO passam a ser responsabilidade dele.
- Hint de resolução: gravar em fullscreen (F) maximiza a resolução do crop
  (Region Capture captura pixels na tela × DPR).

## Pipeline de captura

- `getDisplayMedia({ video: { frameRate: { ideal: 60 } }, audio: <ver §música>,
  preferCurrentTab: true, selfBrowserSurface: 'include' })` — opções ignoradas por
  browsers que não as conhecem.
- Detecção de codec em cascata via `MediaRecorder.isTypeSupported`:
  1. `video/mp4;codecs=avc1.640028,mp4a.40.2`
  2. `video/mp4`
  3. `video/webm;codecs=h264,opus`
  4. `video/webm;codecs=vp9,opus`
  5. `video/webm`
- `videoBitsPerSecond: 14_000_000`, `audioBitsPerSecond: 192_000`.
- `recorder.start()` sem timeslice → blob único no stop.
- Container ≠ mp4 → aviso discreto no toast: "este browser não grava MP4; arquivo .webm".
- Sem faixa de áudio quando corte é PH ou música = Nenhuma (arquivo video-only).
- Encerramento: `onstop` monta o blob; falha/permission-denied no `getDisplayMedia`
  → toast com o motivo, estado volta a `idle`, countdown nem inicia.

## Música

### Mixer

`AudioContext` singleton com grafo: fonte → `gainFonte` → `masterGain` → destino duplo:
`ctx.destination` (monitor/alto-falantes) e `createMediaStreamDestination()` (recorder).
A track de áudio do recorder vem **ou** do mixer **ou** do áudio da guia — nunca ambos
(evita duplicação):

| Fonte selecionada | Rota de áudio no take |
|---|---|
| Nenhuma / corte PH | sem faixa de áudio |
| Embutida ou arquivo local | track do `MediaStreamDestination` (não pede áudio da guia) |
| API com CORS liberado | idem (buffer via fetch) |
| API com CORS bloqueado | `<audio>` direto + `getDisplayMedia({audio: true})`; hint pede para marcar "compartilhar áudio da guia" |

Detecção de CORS: `fetch(url, {mode: 'cors'})` na seleção da faixa; sucesso →
`decodeAudioData` → rota buffer; falha → rota elemento (NUNCA conectar
`MediaElementSource` de origem opaca ao mixer — sairia silêncio).

### Fontes

1. **Embutidas (sintetizadas)**: 3 trilhas geradas por osciladores/noise com padrões
   determinísticos (sem asset): `Pulse` (upbeat), `Glass` (corporate calm), `Drift`
   (lo-fi). Loop infinito, tocáveis inclusive no preview do artifact.
2. **Arquivo local**: `<input type=file accept="audio/*">` → `decodeAudioData` →
   buffer em memória da sessão. Licença por conta do usuário.
3. **API externa — Openverse** (`api.openverse.org/v1/audio/`, sem chave, rate-limit
   anônimo): campo de busca + lista de resultados com preview, filtro de música
   (parâmetro exato de categoria a confirmar na implementação). Seleção exibe
   título/autor/licença + botão "copiar crédito" (CC-BY exige atribuição na descrição
   do vídeo). Indisponível offline/artifact → item do seletor desabilitado com motivo.

### Sincronização

- Música parte no `play()` do take/playback, pausa no `pause()`, seek reposiciona o
  offset do buffer (rota buffer; rota elemento usa `currentTime`).
- Fade-in 0.5s no início; fade-out nos últimos 1.5s do corte full (amarrado a `t`).
- Corte PH: seletor mostra "PH é mudo por convenção" e não arma música.
- Volume: slider único no seletor (default 70%).

## GIF (pós-processamento)

- Botão `Gerar GIF` no toast pós-take abre mini-painel: largura `480/640/800` (default
  640), fps `10/12/15` (default 12), período `corte inteiro` ou janela `t0–t1`.
- Pipeline: blob do take num `<video>` oculto → step-seek frame a frame (`currentTime`
  + evento `seeked`) → canvas reduzido → **gifenc** (embutido minificado, ~8 KB, MIT,
  atribuição em comentário no código) → `.gif` com loop infinito → download + tamanho
  final no toast.
- Tamanho > 3 MB → aviso com o caminho de qualidade superior (ffmpeg/gifski), que o
  SKILL.md já documenta como derivado oficial.
- Processamento roda com indicador de progresso; palco fica utilizável depois (não
  durante — painel modal simples).

## Degradação por ambiente

Detecção no boot do studio:

- `window.top !== window` (iframe/artifact) **ou** sem `navigator.mediaDevices.getDisplayMedia`
  → REC colapsa em hint: "Gravação in-page indisponível neste preview — baixe o HTML
  (download do artifact) e abra localmente". Música embutida/local continua funcional
  para preview; Openverse fica desabilitada em artifact (CSP bloqueia rede).
- `file://` é secure context: fluxo completo funciona no arquivo baixado.
- Sem Region Capture → grava a guia inteira (letterbox incluso) + hint do fullscreen.
- Firefox → cascata cai em WebM; aviso no toast.
- Safari → sem `preferCurrentTab` (usuário escolhe superfície manualmente); MP4 ok.

## Mudanças por arquivo

| Arquivo | Mudança |
|---|---|
| `plugins/product-film/references/engine-skeleton.html` | Bloco STUDIO na zona "mobília pronta — não mexer": ~100 linhas CSS/HTML (linha no start overlay, botão REC nos controles, toast, painel GIF, seletor de música) + ~550 linhas JS (captura, codecs, mixer, synth, Openverse, gifenc embutido, degradação) + `window.__film.studio` |
| `plugins/product-film/SKILL.md` | Passo "Entregue" reescrito (take one-click como caminho primário; OBS/ffmpeg quando gravar fora do browser ou derivar GIF de alta qualidade); linhas novas no quick-reference (REC, música); common mistakes += "overlay de studio visível dentro do palco durante o take" e "música armada em corte PH" |
| `plugins/product-film/README.md` | Studio citado na descrição e na tabela de arquivos |

### API de teste (`window.__film.studio`)

```js
{
  state,            // 'idle' | 'arming' | 'recording' | 'processing'
  rec(cut?), stop(), abort(),
  setMusic({type: 'none'|'synth'|'file'|'api', ...}),
  lastTake,         // {blob, mime, dur} | null
  makeGif({width, fps, from, to})  // Promise<Blob>
}
```

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| CORS dos áudios da Openverse varia por origem | Rota dupla buffer/elemento já no design; UI explica o checkbox de áudio da guia |
| WebM do MediaRecorder sem metadado de duração (Chrome) | Preferência por MP4; limitação documentada no aviso do fallback |
| `getDisplayMedia` bloqueado em algum contexto `file://` | Hint alternativo: servir local (`npx serve`/`python -m http.server`) |
| Skeleton +~30 KB | Aceito na abordagem A; synth é código, GIF encoder ~8 KB |
| Claude construtor quebrar a mobília nova | Mesma regra existente ("pronta — normalmente não mexer") + comentários de fronteira no bloco STUDIO |
| Parâmetros exatos da Openverse (categoria/paginação) | Confirmar na implementação com chamadas reais; encapsular num adapter único |

## Critérios de aceite

1. Chrome `file://`: REC → contagem → take do corte full com música embutida → download
   `.mp4` com áudio, começando em `t=0` e terminando no fim do corte, sem contagem e
   sem sobra perceptível (≤100 ms).
2. Corte PH: arquivo sem faixa de áudio.
3. Arquivo local MP3: toca em preview e sai dentro do MP4.
4. Openverse: busca retorna faixas; faixa CORS-ok sai no MP4; faixa CORS-bloqueada
   toca e o fluxo instrui o áudio da guia; crédito copiável.
5. `Gerar GIF` 640px/12fps de um take de ~8s baixa `.gif` funcional em loop; aviso
   aparece quando > 3 MB.
6. Artifact/iframe: botões de REC substituídos pelo hint de download; trilhas embutidas
   ainda tocam; nada quebra no restante do filme.
7. Firefox: take sai `.webm` com aviso.
8. `window.__film.studio` reflete os estados e permite smoke via Playwright
   (flags de auto-aceite de captura).
