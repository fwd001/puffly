# Puffly

**Take a break. Skip the smoke.**

A wordless, offline-first smoke-break game. A table, a lighter, a tray, a rod of paper that was
never tobacco. Tap it, light it, draw, and watch the smoke take the shape that particular cigarette
makes. Nothing to read, nothing to sign up for, nothing leaves the device.

| Phone, 393×852                                                                   | Desktop, 1280×800                                                       |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| ![Smoke on a phone](docs/images/phone-smoke.jpg)                                 | ![The scene on a desktop](docs/images/desktop-smoke.jpg)                |
| Three draws in: the column takes shape, and the cherry lights the air around it. | The same break on a wide stage, where the props spread apart.           |
| ![Landscape phone](docs/images/phone-landscape-smoke.jpg)                        | ![Settings](docs/images/desktop-settings.jpg)                           |
| 844×390: the props spread apart instead of crowding everything into a column.    | Icons, sliders, toggles. The words live in `aria-label`, not on screen. |

The full product and engineering contract is [`docs/SPEC.md`](docs/SPEC.md); the reasoning behind
the shape of the code is [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). This file is the
operator's page.

## Run it

```bash
npm install
npm run dev        # http://localhost:5175
npm test           # core, renderer, audio, storage, statistics, architecture guards
npm run build      # typecheck every workspace, then build the PWA into apps/web/dist
npm run preview    # serve the production build
npm run lint       # eslint, warnings fail
npm run format     # prettier
```

Node 22.12+ (`engines` in the root `package.json`); the toolchain used here is Node 26 / npm 11.

### On a phone

`npm run dev -- --host`, then open the printed LAN address — the dev server binds localhost by
default. Once the real build is served over HTTPS it is installable from the browser menu, and it
starts offline afterwards.

Touch is a surface in its own right, not a shrunken desktop:

| Touch                                                                                                    | Keyboard                                  |
| -------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Tap the rod, the lighter, the tray or the ash column. A finger gets a target 60 % wider than a cursor's. | `Space` hold · `Enter` tap                |
| Hold and drag the rod anywhere; let go over the tray to drop it in.                                      | `Esc` put it out                          |
| Flick the ash column with a swipe.                                                                       | Arrows move the rod in 0.05-unit steps    |
| Press the rod into the tray and hold to stub it out — the longer the press, the deader the cherry.       | `Tab` is left to the browser's focus ring |
| The canvas owns the surface: no pinch zoom, no double-tap zoom, no scroll, no text selection.            |                                           |

The stage keeps its own shape: a phone fills the screen, a desktop gets a 3:4 stage, an ultrawide
monitor gets a centred band — and Game Core is told which one it is, so hit-testing and drawing can
never disagree (`engine.setStageAspect`, called on every resize).

## What changes how it feels

All of it is behind the gear icon, none of it is required:

- **Quality** `◌ auto · •• ✦` — `auto` is not a guess. The shell measures its own frame times and
  walks the particle budget `high → balanced → light`, stepping down twice as eagerly as it climbs
  back. A touch device also caps the canvas at 2× DPR instead of 3×.
- **Reduced motion** — fewer particles, no grain, no rain, no rings. The scene still lives.
- **High contrast** — brighter smoke and a lit edge on the rod, for a readable silhouette in a dark
  room.
- **Clock, text scale, break length, volume, ambient, mute** — and **haptics**, which only appears
  on a device that has a motor to ask.
- **Rod, room, lighter, tray** — six rods, seven rooms, eight props, five smoke styles. Each rod
  has a plume character (column, haze, curls, pour, bloom), so a Mist pours down the table while an
  Ember blooms upward. Recount them with
  `grep -c "^    id: " packages/game-content/src/{cigarettes,environments,props}.ts`.

## Architecture in one paragraph

`game-core` simulates and owns the state; it has never heard of a browser. `game-renderer` turns
state into pixels and cannot write back — the types forbid it, and a test renders a deep-frozen live
snapshot to prove it at runtime. `game-audio` does the same for sound. `apps/web` is a thin Vue
shell that exists to hand a canvas, a pointer and IndexedDB to those three, so a desktop or native
shell replaces only the shell. The rule is enforced rather than documented:
`tests/architecture.test.ts` fails if a pure package so much as names `window`, `document`,
`Math.random`, `Date.now` or an AudioContext, and it carries positive controls so the guard cannot
pass by accident.

```
apps/web/                     Vue 3 + Vite shell: canvas, chrome, sheets, PWA
packages/shared/              math, seeded RNG, colour, clock/calendar, DeepReadonly
packages/game-core/           state machine, simulation, events, sessions, replay, growth
packages/game-content/        fictional cigarettes, environments, lighters, trays, smoke, sounds
packages/game-renderer/       Canvas 2D: particles, ember, ash, environment, viewport
packages/game-audio/          Web Audio synthesis, ambient beds, silent fallback
packages/game-storage/        StorageAdapter, IndexedDB, memory fallback, export/import
packages/game-statistics/     every number on screen, derived from the session log
tests/                        architecture guards, a whole break end to end, smoke checks
docs/                         SPEC.md, ARCHITECTURE.md, images/
```

## How it plays

There is no help screen and there is nothing to read. Everything below is discoverable by pointing
at it; this list exists only for people maintaining the code.

| You do                           | You see                                                        |
| -------------------------------- | -------------------------------------------------------------- |
| tap the cigarette                | it lifts into the hand                                         |
| tap the lighter                  | flame, then the cherry catches                                 |
| hold on the rod                  | draw: ember brightens, smoke thickens, sound rises             |
| release                          | the drawn smoke expands out                                    |
| watch the ash column grow        | it bends, then asks to be flicked                              |
| tap or flick the ash             | it falls under gravity and rotation, and the tray fills up     |
| press it into the tray           | flare → burst → hiss → thin smoke → dark                       |
| drag it over the tray and let go | smothered first, then discarded; a fresh rod turns up          |
| stop touching anything           | chrome fades out, the scene keeps living (wind, light, flares) |

## How it is verified

| Command                                                 | What it proves                                                                                                  |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `npm test`                                              | The simulation and its state machine, replay determinism, statistics derived from the log, the boundaries above |
| `npm run typecheck`                                     | Every workspace, including the Vue shell                                                                        |
| `npm run build` then `bash tests/smoke/served-build.sh` | The built app is servable from its subpath: entry script, manifest and service worker all answer                |
| `node tests/smoke/touch-device.mjs <url>`               | A whole break performed with taps on an emulated phone, portrait and landscape                                  |

The served-build check exists because a wrong base path passes every unit test and shows up in
production as a blank page. It was verified to fail loudly, not just to pass: _index.html loads
`/puffly/assets/…`, which is not under `/wrong/`_.

The touch check drives a real browser and asserts the things a screenshot cannot lie about: the
canvas fills the viewport, a coarse pointer gets 54 px targets, double-tap does not zoom, the main
screen stays free of words, and a drawn breath is visible in the air (lit pixels before and after).
It resolves Playwright and a browser binary from `PUFFLY_PLAYWRIGHT` and `PUFFLY_CHROME`, and exits
with a message rather than a false pass when either is missing.

## Shipping

`.github/workflows/deploy.yml` builds `main` and publishes it to GitHub Pages, deriving the base
path from the repository name. `.github/workflows/ci.yml` runs format, lint, types, tests, the
subpath build and the served-build check on every push and pull request.

To ship somewhere else, build with your own prefix:

```bash
PUBLIC_BASE=/any/prefix/ npm run build
```

## Product boundaries

Puffly is an entertainment and stress-relief object: a substitute ritual. It does not claim to treat
anything, shows no medical data, and never references a real tobacco brand — every object in it is
original and fictional (SPEC.md §13, §84).

Data never leaves the device. No account, no login, no upload, no analytics; the save file is JSON
you can export and re-import (SPEC.md §51, §52).

## Not built

Honest gaps, so nobody rediscovers them as bugs:

- No desktop or mobile native shell yet. The architecture is built for one (SPEC.md §79, §86); the
  app that would host it is not here.
- No accounts, sync or cloud of any kind — by design.
- Sound is synthesised from oscillators, filtered noise and envelopes. There are no samples, so a
  voice is only as close to the real object as its filter and envelope make it.
- No `LICENSE` file has been chosen for the repository yet.
