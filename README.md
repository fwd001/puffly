# Puffly

**Take a break. Skip the smoke.**

A cross-platform, wordless, immersive virtual smoke-break game. Open it, see a lighter, tap it,
watch the smoke. No tutorial, no instructions, no account.

The full product and engineering contract lives in [`docs/SPEC.md`](docs/SPEC.md) (88 sections).
This README is the operator's page; the design reasoning is in
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Run it

```bash
npm install
npm run dev        # http://localhost:5175
npm test           # vitest: game core, renderer, audio, storage, statistics, architecture guards
npm run build      # typecheck every workspace, then build the PWA into apps/web/dist
npm run preview    # serve the production build locally
npm run lint       # eslint
npm run format     # prettier
```

Requirements: Node 22.12+ (the toolchain in use here is Node 26 / npm 11).

## How it plays

There is no help screen and there is nothing to read. Everything below is discoverable by
pointing at it; this list exists only for people maintaining the code.

| You do                           | You see                                                        |
| -------------------------------- | -------------------------------------------------------------- |
| tap the cigarette                | it lifts into the hand                                         |
| tap the lighter                  | flame, then the cherry catches                                 |
| hold on the rod                  | draw: ember brightens, smoke thickens, sound rises             |
| release                          | the drawn smoke expands out                                    |
| watch the ash column grow        | it bends, then asks to be flicked                              |
| tap or flick the ash             | it falls under gravity and rotation                            |
| press it into the tray           | flare → burst → hiss → thin smoke → dark                       |
| drag it over the tray and let go | smothered first, then discarded; a fresh rod turns up          |
| stop touching anything           | chrome fades out, the scene keeps living (wind, light, flares) |

Keyboard (never required, always available): `Space` = hold the suggested action, `Enter` = tap
it, `Esc` = put it out, arrows = move the rod.

## Layout

```
apps/web/                     Vue 3 + Vite shell: canvas, chrome, sheets, PWA
packages/shared/              math, seeded RNG, colour, clock/calendar, DeepReadonly
packages/game-core/           state machine, simulation, events, sessions, replay, growth
packages/game-content/        fictional cigarettes, environments, lighters, trays, smoke, sounds
packages/game-renderer/       Canvas 2D: particles, ember, ash, environment, viewport
packages/game-audio/          Web Audio synthesis, ambient beds, silent fallback
packages/game-storage/        StorageAdapter, IndexedDB, memory fallback, export/import
packages/game-statistics/     every number on screen, derived from the session log
tests/                        architecture guards
docs/                         SPEC.md, ARCHITECTURE.md
```

## Product boundaries

Puffly is an entertainment and stress-relief object: a substitute ritual. It does not claim to
treat anything, shows no medical data, and never references a real tobacco brand — all objects
in it are original and fictional (SPEC.md §13, §84).

Data never leaves the device. No account, no login, no upload; the save file is JSON you can
export and re-import (SPEC.md §51, §52).
