# product-film (skill)

A Claude Code skill that builds a **self-playing prototype that IS the video** demoing the
product: a faithful replica that navigates itself (staged cursor, kinetic captions,
zoom/spotlight, 4·3·2·1 countdown, loop). All the user does is **record the screen**.

Core principle: **all visual state is a pure function of `t`** — an idempotent `apply(t)` makes
seek, loop and testing trivial (no scheduler that "fires" beats, no `resetStage()`).

## Files

| File | What it is |
|---|---|
| `SKILL.md` | Process, fidelity rules and recording UX. It's what Claude reads when invoking `/product-film`. |
| `references/engine-skeleton.html` | Ready-made engine: scenes with crossfade, captions, fake cursor, camera with zoom, spotlight, scroll, countdown, controls, fullscreen fallback, `?cut&t&paused`, `window.__film`. Build the film on top of it by filling in tokens, scenes and `defFull()/defPh()`. Includes the built-in STUDIO: one-click take → MP4/WebM, theme music mixed in (synth/file/Openverse) and GIF export. |

## Invocation

`/product-film` — describe the product/flow to demo. The skill runs the real flow, replicates
the screens faithfully, builds the script in cuts, builds the film and verifies each beat by seek
before delivering.

Recommended: **most capable model available (Opus 4.8 / Fable 5) with effort `high`** — UI
fidelity and choreography in `apply(t)` suffer with mid-tier models. `xhigh` only as an
occasional escalation in hard choreography debugging; small touch-ups do fine with `medium`.

## Built-in studio (in-page recording)

Every generated film ships with a studio: `● Record take` captures its own tab
(`getDisplayMedia`), starts recording exactly at t=0 and stops at the end of the cut —
the MP4 (Chrome/Edge/Safari; WebM on Firefox) downloads ready, no editor. Optional theme
music mixed into the file (built-in synthesized tracks, local MP3 or CC search on
Openverse with copyable credit; the PH cut stays muted). From the take you can
derive a GIF (256 palette + dithering) right in the browser. In the artifact preview
(iframe) recording is blocked by the browser — download the HTML and open it locally.

Dev: `npm install && npx playwright install chromium && npm test` runs the suite
(Playwright headed with a fake getDisplayMedia — deterministic, no picker).
