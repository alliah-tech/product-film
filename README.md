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

## Usar

No Claude Code, rode `/product-film` e descreva o produto/fluxo a demonstrar. O skill:
1. Roda o fluxo **real** (Playwright) e captura screenshots + valores exatos (verdade primeiro);
2. Replica as telas com fidelidade (tokens/fontes/dados reais), monta o roteiro em cortes;
3. Constrói o filme sobre o motor `engine-skeleton.html` (cenas, cursor, câmera, legendas, loop);
4. Verifica cada beat por seek e entrega um HTML único para você gravar.

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

`version` está fixado em `1.0.0` nos manifestos — os colegas só recebem atualização quando
você **incrementa** o número e dá push. (Omitir `version` faria o Claude Code seguir o SHA do
git e auto-atualizar a cada commit — útil durante desenvolvimento.)

## Licença

MIT.
