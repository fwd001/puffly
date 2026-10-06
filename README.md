# Puffly

**Take a break. Skip the smoke.**

A wordless, offline-first smoke-break game. A table, a lighter, a tray, a rod of paper that was
never tobacco. Tap it, light it, draw, and watch the smoke take the shape that particular cigarette
makes. Nothing to read, nothing to sign up for, nothing leaves the device.

| Phone, 393×852                                                                   | Desktop, 1280×800                                                  |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| ![Smoke on a phone](docs/images/phone-smoke.jpg)                                 | ![The scene on a desktop](docs/images/desktop-smoke.jpg)           |
| Three draws in: the column takes shape, and the cherry lights the air around it. | The same break on a wide stage, where the props spread apart.      |
| ![Landscape phone](docs/images/phone-landscape-smoke.jpg)                        | ![Settings](docs/images/desktop-settings.jpg)                      |
| 844×390: the props spread apart instead of crowding everything into a column.    | A word per row, and a control beside it. Nothing here is required. |

**Play it now: <https://fwd001.github.io/puffly/>** — the same build `main` publishes on every
push, installable to a phone home screen and usable offline afterwards.

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

Every row is a word and a control, reached from the rail’s `settings` tab. None of it is required:

- **Quality** `◌ auto · •• ✦` — `auto` is not a guess. The shell measures its own frame times and
  walks the particle budget `high → balanced → light`, stepping down twice as eagerly as it climbs
  back. A touch device also caps the canvas at 2× DPR instead of 3×.
- **Reduced motion** — fewer particles, no grain, no rain, no rings. The scene still lives.
- **High contrast** — brighter smoke and a lit edge on the rod, for a readable silhouette in a dark
  room.
- **Clock, hint words, text scale, break length, volume, ambient, mute** — and **haptics**, which
  only appears on a device that has a motor to ask. Muting is not a degraded mode: when nothing can
  be heard — muted, blocked by the browser's autoplay policy, or no Web Audio at all — the discrete
  cues are drawn larger and a beat longer, so the picture says what the mix would have said.
- **Language** `◌ A 中 ع ∅` — three tiers, in this order: the language you asked for, then English,
  then no words at all. Untouched, it follows the device. `∅` is a real interface rather than a
  broken one: the sheets lose every label and keep every `aria-label`, because an unnamed control
  is the one thing this product is not allowed to ship. A language never reaches the simulation —
  the rod burns the same way whichever way you read.
- **Limit** — how many sticks a day the ring counts against, set to `—` (no line drawn) by
  default. It is a drawing decision and nothing more: no code that runs the rod may read it, and
  `tests/architecture.test.ts` fails the build if a pure package ever does.
- **Data** `⤓ ⤒ ⌫` — export the save, re-import one, or erase every record on this device.
- **Rod, room, lighter, tray** — eleven rods, seven rooms, eight props, five smoke styles. The
  eleven are the ladder of the brief: seven inhaled, three savoured, one filtered, unlocked at 0 /
  8 / 20 / 40 / 65 / 95 / 135 / 190 / 250 / 320 / 420 cumulative sticks, and the cabinet groups them
  by what the hand does with them. Each rod has a plume character (column, haze, curls, pour, bloom),
  so a Mist pours down the table while an Ember blooms upward. Recount them with
  `grep -c "^    id: " packages/game-content/src/{cigarettes,environments,props}.ts`.
- **The rooms** — the seven places a break can happen are a ladder of their own, not colour chips on
  the props row: a card is the room's own light, its name, and the number of the rung that opens it
  (`3`, `7`, `14`, `21`, `30` days). One room is counted in breaks instead, and says so with the
  break mark — `◷14` — because two cards printing a bare `14` would be the same door twice. Days
  carry no mark: the day ladder is the axis the whole interface already counts on. What the number
  _counts_ is never printed, only spoken (`第 14 天` / `14 breaks`), so the row survives the wordless
  tier as digits and marks. It lives under `skins` in the sidebar, because changing the background
  has always had two halves — the four palette layers and the room. Rerun the rungs with
  `grep -n "unlock:" packages/game-content/src/environments.ts`.
- **All four layers are layers** — a skin is 纸面, 余烬, 烟羽 and 光池, and the third one used to
  reach only the haze behind the smoke, where its alpha tops out at 0.033. That was measured by
  recording every colour the renderer asks a sprite for: with a palette whose only non-default layer
  is 烟羽, 0 of 60 plume sprites changed colour. The plume now takes the skin's colour at the moment
  each puff is born, while the filter, the ash and the dust off the tray keep what the tobacco has.
  What is already in the air when you switch stays as it was for a few seconds — smoke that has left
  the rod does not get a second colour. Rerun with
  `npx vitest run packages/game-renderer/src/__tests__/plume-palette.test.ts`.

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

There is no help screen. There is one word, and only when the scene is already pointing at
something. Everything below is discoverable by pointing at it; this list exists only for people
maintaining the code.

| You do                           | You see                                                          |
| -------------------------------- | ---------------------------------------------------------------- |
| tap the cigarette                | it lifts into the hand                                           |
| tap the lighter                  | flame, then the cherry catches                                   |
| hold on the rod                  | draw: ember brightens, smoke thickens, sound rises               |
| release, while still moving      | the drawn smoke expands out _that way_                           |
| watch the ash column grow        | it bends, then asks to be flicked                                |
| tap or flick the ash             | it falls under gravity and rotation, and the tray fills up       |
| press it into the tray           | flare → burst → hiss → thin smoke → dark                         |
| close two fingers on the cherry  | the same thing, by a different hand                              |
| drag it over the tray and let go | its rim warms as you approach; smothered, discarded, a fresh rod |
| swipe down over nothing at all   | the interface folds away and the rod keeps burning               |
| stop touching anything           | the mark fades out, the scene keeps living (wind, light, flares) |

## How to play it

At rest there is nothing on the screen but the table. One mark appears at the bottom in the
seconds after you touch something, and it goes away when you stop. Everything else is a physical
object, and it answers to being touched the way the object would — the gesture _is_ the control.

**The four things you can touch**

| Object         | One tap                                                 | Hold                                                                    |
| -------------- | ------------------------------------------------------- | ----------------------------------------------------------------------- |
| The cigarette  | pick it up (or, if it is already out, take a fresh one) | draw — the cherry brightens and smoke gathers                           |
| The lighter    | a spark, then a flame that dies on its own              | keep the flame alive                                                    |
| The ash column | flick it: ash falls into the tray                       | —                                                                       |
| The ashtray    | put the cigarette out in it, or drop it in              | press the rod into the tray and hold: the harder and longer, the deader |

**The one word you may see**

While the chrome is awake, the object the game thinks you are about to use breathes with a faint
halo, and the halo gets a name: `tap`, `light`, `hold`, `flick`, `press`, `drop`. That is the whole
vocabulary — a verb, never a sentence, gone the moment you act, and switchable off in settings for
people who would rather be shown nothing. The word is not a button and takes no taps: the object
underneath it is what answers. Set the language to `∅` and this is the state of the game: six verbs
that only exist as a halo, and a table that says the rest.

**One break, start to finish**

1. Tap the cigarette. It lifts into the hand — a ring marks where you touched it.
2. Tap the lighter. Sparks, then flame. Bring the rod near it and the cherry catches; a cheap
   wheel lighter sometimes fails, and that is also a sound.
3. Hold on the rod and release. The drawn smoke expands when you let go. Every rod exhales
   differently: one pours down the table, one blooms upward, one curls.
4. Let the ash grow. It bends as it lengthens, and asks to be flicked.
5. Put it out: press it into the tray and hold. The cherry dies in stages — flare, burst, hiss,
   thin smoke, dark.
6. Drop it in the tray. **The break is over at this moment**: the clock goes away, and a fresh
   rod turns up on the table a beat later. That is not a reset — ending the break is the point of
   the loop, and the record of it (how long, how many draws, how much ash) is what accumulates.

You never have to finish a rod. Walk away mid-break and the session closes itself quietly after
about 90 seconds of stillness; nothing is scored, nothing is lost.

Putting the phone in a pocket is not walking away, and it does not end the break either. The
moment the cherry catches, the burn is tied to the system clock, so when the page comes back the
rod has burnt to wherever that clock says it should be — and a break that would have finished
while the phone was away comes back finished and counted, rather than waiting for someone to
notice it.

The room is meant to keep moving while you are not touching anything — a draught picking up, the
light changing, a swirl in the plume. What it must not do is _tremble_. Two of those numbers were
being re-rolled from scratch every frame at 60 Hz, which is a jitter with no cause behind it: the
smoke in the background leaned one way and then the other, and a still scene never looked still.
They are now sampled the same way but _approached_ rather than assigned, so the wind arrives at its
changes instead of switching on them. Measured on the same seed over thirty seconds, the largest
one-frame change in the wind went from 0.159 to 0.00064 and in the smoke's turbulence from 0.311 to
0.0033; on a real phone screen, the average per-frame pixel difference in a patch of pure background
went from 0.150 to about 0.02. Calm, not frozen — the same test also fails if the field stops
drifting altogether, because a dead world is not a restful one.

**The row, the pill and the rail**

The chrome is three things, and all three are readings of the same state machine rather than three
ways to navigate:

- **the row** across the top — which stick of the day this is, inside a ring that empties as the
  rod burns, then the break's clock and what is left of the stick: `1 · 03:00 · 100%`. While it is
  being lit the ring counts the flame (`0.4s`), while it is drawn it counts the draws (`6 / 12`),
  and when the ash is standing it measures the ash (`18mm · 1.1g`). Icons and Arabic digits: nothing
  in that row needs translating, which is why it survives the wordless tier.
- **the pill** above the rail — the same gesture the scene accepts, as a handle. It says `pick up`,
  `light it`, `inhale`, `flick the ash`, `put it out`. Holding it draws; tapping it decides. The
  short label stays on purpose: it is the anchor a translation hangs on, so a rail of pure marks
  would leave localisation with nothing to hold. It is not always `inhale`, though: pick up a
  cigarillo, a cigar or a pipe and the handle reads `savour`, because those three are smoked from
  the mouth — the draw fills on a fixed two seconds instead of on the rod's own draw length, the
  ring follows that filling, and nothing carries over into the next draw. The pill learns this
  from the rod's measurement (`savourMs`), not from a list of categories the shell would have to
  keep true. What comes out is the other half of the same sentence: a mouthed draw is breathed out
  slowly — the cloud lives twice as long, leaves at half the speed and stops climbing.
- **the rail** along the bottom — three phases and settings. The phases are indicators: the
  cigarette lights one of them, and no finger is required or invited.

On a desk-width window the same chrome gains a fourth piece: a standing 260px column on the inline-end
with the seven destinations and the day's numbers in it, and the scene shrinks to what is left rather
than being covered. It is a second density of one set of facts — the panel in that column is the very
component the break sheet renders, and each entry opens the same sheet the chrome opens, landing on
the group it names.

The row's numbers are the stage's only numbers, and they live in the row rather than on the scene
because a measurement of the simulation is not a thing to tap. Two of its cells are buttons: the
stick mark opens the shelf, the clock opens the break. A new unlock is a dot on the stick mark —
no dialog, no text.

**What the break sheet adds: the player's own week**

Opening the break gives the counts it cannot fit on the row — how many sticks today against the
ceiling the player set, the last seven days as seven bars with today in a cooler colour, and the
difference against the same span a week ago (`较上周同期 少吸 2 支`). That is the whole of the
reduction page, and it is the reason the ceiling exists: it is never a permission. Reaching it
still lets the break start; the ring only goes grey and swaps its digit for `◇`, there is no
dialog, nothing locks, and no streak can be broken because there is no streak. The words on that
page are scanned by a test rather than by review: no line may assert anything about health, and no
line may tell the player what they should do. The ceiling itself is a preference the simulation is
not allowed to read — an architecture test fails the build if `game-core` or the renderer ever
looks at it.

## How it is verified

| Command                                                 | What it proves                                                                                                                          |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`                                              | The simulation and its state machine, replay determinism, statistics derived from the log, the boundaries above                         |
| `npm run typecheck`                                     | Every workspace, including the Vue shell                                                                                                |
| `npm run build` then `bash tests/smoke/served-build.sh` | The built app is servable from its subpath: entry script, manifest and service worker all answer                                        |
| `node tests/smoke/touch-device.mjs <url>`               | A whole break performed with taps on an emulated phone and with a mouse in a desktop window, and a breath with light and dark inside it |

The served-build check exists because a wrong base path passes every unit test and shows up in
production as a blank page. It was verified to fail loudly, not just to pass: _index.html loads
`/puffly/assets/…`, which is not under `/wrong/`_.

The touch check drives a real browser and asserts the things a screenshot cannot lie about: the
canvas fills the viewport, a coarse pointer gets 54 px targets, double-tap does not zoom, the stage
carries no prose — at most the one gesture word — and a drawn breath is visible in the air (lit
pixels before and after). It also checks the two ways the operating system takes a phone away:
frames that stop, and a page that comes back.
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

|               |                                            |
| ------------- | ------------------------------------------ |
| Live site     | <https://fwd001.github.io/puffly/>         |
| Workflow runs | <https://github.com/fwd001/puffly/actions> |
| Repository    | <https://github.com/fwd001/puffly>         |

A 404 at the live address after a push means Pages is not set to **GitHub Actions** as its
source for this repository — the deploy job cannot change that setting itself.

## Product boundaries

Puffly is an entertainment and stress-relief object: a substitute ritual. It does not claim to treat
anything and shows no medical data. Everything you can hold is original and fictional — no real
tobacco brand is ever an object in the scene, a thing to unlock, or a thing to want. Real brands
appear only as archive material (a name, an origin, a year, an ≈ figure) in the sections that are
reference rather than shopfront (SPEC.md §13, §84).

Data never leaves the device. No account, no login, no upload, no analytics; the save file is JSON
you can export and re-import (SPEC.md §51, §52).

Deleting it is a setting too: `⌫` in the data row erases every record on the device. It is the one
control in the app that cannot be undone, so it asks for the same tap twice — the button turns
amber and its word becomes `again`, and it forgets after six seconds or when you leave the sheet.
There is no confirmation dialog, and no write from the still-running simulation comes back after the
wipe: a reset that the next animation frame undoes is not a reset.

## Not built

Honest gaps, so nobody rediscovers them as bugs:

- No desktop or mobile native shell yet. The architecture is built for one (SPEC.md §79, §86); the
  app that would host it is not here.
- No accounts, sync or cloud of any kind — by design.
- Sound is synthesised from oscillators, filtered noise and envelopes. There are no samples, so a
  voice is only as close to the real object as its filter and envelope make it. The beds are at least
  measurable: `createAudioEngine` takes an injected context, so pointing it at an
  `OfflineAudioContext` renders the shipped synth and its spectrum can be compared before and after a
  change — that is how the draw's tube-to-body balance and its spectral movement were tuned (§26).
  What that cannot settle is whether it sounds right. Nobody has listened to these numbers.
- **Whether the smoke is _the_ smoke.** The plume's thinness, structure and colour are all measured
  now (SPEC.md §15), and not one of those numbers answers the only question that matters: is this the
  picture. The design's frames are reachable in a signed-in browser — S3 吸烟 is node `3:127`, S4 吐烟
  is `3:187`, both 390×844 — but at the zoom that fits the whole page a frame is 27×59 CSS pixels
  (≈55×119 in a screenshot at this display's scale), and
  making one bigger needs real wheel or keyboard input, which the editor does not accept from
  synthetic events. That last look has not been had by anyone.
- No `LICENSE` file has been chosen for the repository yet.
- The 12-box collection reserves three boxes for the cinnabar skin's finale (中华硬 / 黄鹤楼1916 /
  和天下). They are real rows that the roll skips; nothing about them is a placeholder in the data.
- The touch check below is the one gate that cannot run on this machine (no Playwright browser in
  the local cache), so the sections written this round — the row, the pill, the rail, the archive's
  three densities, the cabinet ladder, the skins, the boxes, the three language tiers, the rooms
  ladder and the check that a breath has structure rather than only brightness — have not been
  executed _as that script_. The last one was run verbatim against a known picture instead (the
  shipped function, pointed at a rendered exhale: 9806 cloud samples, neighbour difference 8.44,
  relative spread 0.294, where the old cloud measured 5.17 and 0.234), so its thresholds are
  calibrated rather than guessed — but the script itself has not been run end to end here. Each one was checked by hand against a connected Chrome on the
  dev server instead: a whole break performed through the keyboard path, the ash readings
  (`15.7mm · 0.65g`), the reduction page's seven bars and its delta, and every visible string
  measured at ≥ 15 px. Run the script with `PUFFLY_BROWSER=chromium` to fold those claims back into
  CI.
