# product-film — Claude Code plugin marketplace

Marketplace de um plugin só: **`product-film`**, um skill do Claude Code que constrói um
**protótipo auto-reproduzível que É o vídeo** de demonstração do seu produto — uma réplica
fiel que se navega sozinha (cursor cenográfico, legendas cinéticas, zoom/spotlight, contagem
4·3·2·1, loop). Você só **grava a tela**.

## Instalar

Repositório **público** — qualquer pessoa da comunidade pode instalar, sem precisar de acesso
especial. Dois jeitos:

### A) Pela linha de comando (CLI / terminal)

```
/plugin marketplace add alliah-tech/product-film
/plugin install product-film@product-film-marketplace
```

Recarregue os plugins (`/reload-plugins`) ou reinicie o Claude Code.

> Alternativa por URL: `/plugin marketplace add https://github.com/alliah-tech/product-film.git`

### B) Pela interface gráfica (extensão Claude Code no VS Code)

1. Na barra de input, clique no botão **`/`** (ou digite `/`) → digite **`plugins`** → clique em
   **Manage plugins**.
2. Vá na aba **Marketplaces** → no campo *"GitHub repo, URL, or path"* cole
   **`alliah-tech/product-film`** (ou a URL `https://github.com/alliah-tech/product-film`) →
   clique **Add**. Ele aparece como **`product-film-marketplace`**.
3. Vá na aba **Plugins** → na seção **AVAILABLE**, ache **`product-film`** → clique **Install**.

Pronto pelos dois caminhos: o skill fica disponível como **`/product-film`** — é só digitar no
chat (aparece em *Slash Commands*).

## Atualizar

Quem já instalou **não** recebe versão nova sozinho: auto-update vem ligado só nos marketplaces
oficiais da Anthropic; nos de terceiros (este) vem desligado. Para pegar a versão mais recente:

```
/plugin marketplace update product-film-marketplace
/plugin update product-film@product-film-marketplace
```

Os dois comandos são necessários — o primeiro puxa o catálogo novo do git, o segundo compara a
versão e baixa o plugin. Pela interface, `/plugin` → **Manage plugins** faz os dois no botão de
update.

Com uma sessão aberta, rode `/reload-plugins` (ou reinicie o Claude Code) depois de atualizar:
mudanças no `SKILL.md` pegam na hora, mas as de `references/` só depois do reload.

### Receber as próximas versões sozinho

Ligue o auto-update **uma vez** e não precisa mais dos comandos acima: `/plugin` → aba
**Marketplaces** → `product-film-marketplace` → **Enable auto-update**.

Feito isso, todo bump de `version` chega sozinho. O Claude Code checa por atualizações depois
que a sessão inicia, com atraso aleatório de até 10 minutos; a versão nova entra no próximo
launch — ou na hora, se você aceitar o `/reload-plugins` que ele sugere. A sessão em andamento
continua com a versão que carregou, de propósito.

O autor **não** consegue ligar isso por você: não há campo no `marketplace.json` nem no
`plugin.json` que controle auto-update. O toggle é seu (ou do admin da sua organização, via
`extraKnownMarketplaces` com `"autoUpdate": true` nas *managed settings*).

## Usar

No Claude Code, rode `/product-film` e descreva o produto/fluxo a demonstrar. O skill:
1. Roda o fluxo **real** (Playwright) e captura screenshots + valores exatos (verdade primeiro);
2. Replica as telas com fidelidade (tokens/fontes/dados reais), monta o roteiro em cortes;
3. Constrói o filme sobre o motor `engine-skeleton.html` (cenas, cursor, câmera, legendas, loop);
4. Verifica cada beat por seek e entrega um HTML único para você gravar.

### Modelo e effort recomendados

Rode com o **modelo mais capaz disponível** (Opus 4.8 / Fable 5) e **effort `high`**. As etapas
caras do skill — replicar a UI real sem inventar estados, coreografar tudo como função pura de
`t`, verificar beat a beat — dependem de disciplina e capacidade do modelo; modelos médios
tendem a "embelezar" a UI e quebrar a regra de fidelidade.

`high` basta como padrão: acima disso vira latência/custo sem ganho, porque o gargalo é o ciclo
de verificação (navegar, screenshot, comparar), não raciocínio de tacada única. Escale para
`xhigh` só pontualmente, em debugging difícil de coreografia (cursor voando, emenda de loop,
easing de câmera); `max` não é necessário. Retoques pequenos num filme pronto (trocar legenda,
ajustar um beat) funcionam com `medium` ou até Sonnet 5.

## Estrutura

```
.claude-plugin/marketplace.json     ← catálogo (este marketplace)
plugins/product-film/
├── .claude-plugin/plugin.json      ← manifesto do plugin
├── SKILL.md                        ← o skill (invocado como /product-film)
├── references/engine-skeleton.html ← motor pronto (cenas, legendas, cursor, câmera…)
└── README.md
```

## Versionamento

Versão atual: **1.1.0**, fixada nos dois manifestos (`plugin.json` e a entrada do plugin em
`marketplace.json`). Estando fixada, quem já instalou só recebe atualização quando você
**incrementa** o número e dá push — push sem bump não muda nada para quem já tem o plugin em
cache, porque o Claude Code vê a mesma versão. (Omitir `version` faria o Claude Code seguir o
SHA do git e tratar cada commit como versão nova — útil durante desenvolvimento.)

O Claude Code resolve a versão pelo primeiro que existir: `version` do `plugin.json` → `version`
da entrada no `marketplace.json` → SHA do commit. Mantenha os dois manifestos no mesmo número.

## Licença

MIT.
