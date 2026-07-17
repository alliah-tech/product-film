# product-film — Claude Code plugin marketplace

A single-plugin marketplace: **`product-film`**, a Claude Code skill that builds a
**self-playing prototype that IS the video** demoing your product — a faithful replica that
navigates itself (staged cursor, kinetic captions, zoom/spotlight, 4·3·2·1 countdown, loop).
All you do is **record the screen**.

## Install

**Public** repository — anyone in the community can install it, no special access needed. Two
ways:

### A) From the command line (CLI / terminal)

```
/plugin marketplace add alliah-tech/product-film
/plugin install product-film@product-film-marketplace
```

Reload the plugins (`/reload-plugins`) or restart Claude Code.

> URL alternative: `/plugin marketplace add https://github.com/alliah-tech/product-film.git`

### B) From the graphical interface (Claude Code extension in VS Code)

1. In the input bar, click the **`/`** button (or type `/`) → type **`plugins`** → click
   **Manage plugins**.
2. Go to the **Marketplaces** tab → in the *"GitHub repo, URL, or path"* field paste
   **`alliah-tech/product-film`** (or the URL `https://github.com/alliah-tech/product-film`) →
   click **Add**. It shows up as **`product-film-marketplace`**.
3. Go to the **Plugins** tab → under **AVAILABLE**, find **`product-film`** → click **Install**.

Either path gets you there: the skill becomes available as **`/product-film`** — just type it in
the chat (it shows up under *Slash Commands*).

## Update

Whoever already installed it does **not** get the new version automatically: auto-update is on
only for Anthropic's official marketplaces; for third-party ones (this one) it comes off. To get
the latest version:

```
/plugin marketplace update product-film-marketplace
/plugin update product-film@product-film-marketplace
```

Both commands are needed — the first pulls the new catalog from git, the second compares the
version and downloads the plugin. In the interface, `/plugin` → **Manage plugins** does both from
the update button.

With a session open, run `/reload-plugins` (or restart Claude Code) after updating: changes to
`SKILL.md` take effect immediately, but those in `references/` only after the reload.

### Getting the next versions automatically

Turn auto-update on **once** and you no longer need the commands above: `/plugin` →
**Marketplaces** tab → `product-film-marketplace` → **Enable auto-update**.

Once that's done, every `version` bump arrives on its own. Claude Code checks for updates after
the session starts, with a random delay of up to 10 minutes; the new version comes in at the next
launch — or right away, if you accept the `/reload-plugins` it suggests. The session in progress
stays on the version it loaded, on purpose.

The author **cannot** turn this on for you: there is no field in `marketplace.json` or in
`plugin.json` that controls auto-update. The toggle is yours (or your organization admin's, via
`extraKnownMarketplaces` with `"autoUpdate": true` in the *managed settings*).

## Use

In Claude Code, run `/product-film` and describe the product/flow to demo. The skill:
1. Runs the **real** flow (Playwright) and captures screenshots + exact values (truth first);
2. Replicates the screens faithfully (real tokens/fonts/data), builds the script in cuts;
3. Builds the film on top of the `engine-skeleton.html` engine (scenes, cursor, camera, captions, loop);
4. Verifies each beat by seek and delivers a single HTML for you to record.

### Recommended model and effort

Run it with the **most capable model available** (Opus 4.8 / Fable 5) and effort `high`. The
expensive steps of the skill — replicating the real UI without inventing states, choreographing
everything as a pure function of `t`, verifying beat by beat — depend on the model's discipline
and capability; mid-tier models tend to "prettify" the UI and break the fidelity rule.

`high` is enough as a default: above that it turns into latency/cost with no gain, because the
bottleneck is the verification cycle (navigate, screenshot, compare), not single-shot reasoning.
Escalate to `xhigh` only occasionally, for hard choreography debugging (flying cursor, loop
splice, camera easing); `max` is not necessary. Small touch-ups on a finished film (swapping a
caption, adjusting a beat) work with `medium` or even Sonnet 5.

## Structure

```
.claude-plugin/marketplace.json     ← catalog (this marketplace)
plugins/product-film/
├── .claude-plugin/plugin.json      ← plugin manifest
├── SKILL.md                        ← the skill (invoked as /product-film)
├── references/engine-skeleton.html ← ready-made engine (scenes, captions, cursor, camera…)
└── README.md
```

## Versioning

Current version: **1.1.2**, pinned in both manifests (`plugin.json` and the plugin's entry in
`marketplace.json`). Being pinned, whoever already installed it only gets an update when you
**increment** the number and push — a push without a bump changes nothing for whoever already has
the plugin cached, because Claude Code sees the same version. (Omitting `version` would make
Claude Code follow the git SHA and treat every commit as a new version — useful during
development.)

Claude Code resolves the version by the first one that exists: `version` from `plugin.json` →
`version` from the entry in `marketplace.json` → the commit SHA. Keep both manifests on the same
number.

## License

MIT.
