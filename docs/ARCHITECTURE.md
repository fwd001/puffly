# Architecture

One rule explains the whole layout (SPEC.md §86): **any future platform must be able to reuse the
game, and only re-implement input, rendering and platform integration.** Everything below exists to
keep that sentence true, rather than merely written down.

```
                    apps/web  (Vue shell: input, chrome, sheets, PWA)
                       │
        ┌──────────────┼──────────────┐
        ↓              ↓              ↓
   game-renderer   game-audio     game-storage      ← adapters (may touch the platform)
        └──────────────┼──────────────┘
                       ↓
                  game-core                          ← pure TypeScript, no platform APIs
                       │
              game-content (data only)
                       │
                  shared (math, rng, clock, colour)
```

## The direction of dependence is enforced, not decorated

`tests/architecture.test.ts` reads the shipped source of every package and fails on
`window`, `document`, `indexedDB`, `AudioContext`, `requestAnimationFrame`, `canvas` types,
`fetch`, `crypto`, `Math.random()`, `Date.now()`, `new Date(`, plus imports of `vue`,
`@tauri-apps/*`, or any adapter package from inside the pure layer. It also fails if an adapter
imports `createEngine` — an adapter observes, it does not drive (SPEC.md §48).

Two details are deliberate, because both have produced fake green before:

- **Comments are stripped before matching.** The pure layer's own doc comments contain the words
  "Vue", "DOM" and "Canvas". Without stripping, the guard would have forced those explanations to
  be deleted to get a green run — the documentation sacrificed to the metric.
- **String literals are not stripped, and every matcher has a positive control.** Import
  specifiers live in strings; an earlier version blanked string literals while removing comments,
  which made all twelve import checks pass *nothing*. A guard that cannot fail is decoration, so
  `the scanner itself reports every shape it claims to catch` feeds each matcher text it must
  report, and the renderer is asserted to *contain* `document.` and `CanvasRenderingContext2D` so
  the same scanner is proven able to see platform usage at all.

`eslint.config.mjs` enforces the same boundary while writing code (`no-restricted-globals`,
`no-restricted-imports`, `no-restricted-syntax` on the pure packages), so the failure arrives at
save time rather than at test time. The linter is the early warning; the test is the door.

## State is continuous, happenings are discrete

SPEC.md §11 names eleven lifecycle states. Game Core splits them in two kinds, because the
alternative — letting a handler decide what "burning" means — produces four slightly different
definitions of the same word:

- **interaction-driven** (`IDLE`, `PICKED_UP`, `LIGHTING`, `PUFFING`, `EXTINGUISHING`,
  `EXTINGUISHED`, `DISCARDED`) are entered and left by input handlers; they last exactly as long as
  the player is doing the thing;
- **derived** (`NEAR_END` → `ASH_READY` → `RESTING` → `BURNING`, in that priority order) are
  recomputed from the simulation every step by `deriveAmbientState`.

The legal edges live in one table, `stateMachine.ts:TRANSITIONS`, and `setState` refuses an
illegal edge instead of throwing: a stranded cigarette is a worse user experience than a missed
transition, and the exhaustive table test is what keeps the table honest.

Adapters therefore consume two different things and never mix them:

| | what it is | who reads it |
| --- | --- | --- |
| `GameState` | continuous fields, read every frame | renderer, audio (beds), shell chrome |
| `EngineEvent` | discrete `burst` / `world` / `session` / `transition` / `unlock` | renderer (particles), audio (cues), storage (log) |

`GameStateView = DeepReadonly<GameState>` is what the core hands out, so the §48 rule "the renderer
must not modify game state" is a compile error rather than a convention. `rendering.test.ts` then
proves it at runtime by handing the renderer a **deep-frozen live snapshot** and driving a whole
break through it: any write would throw a TypeError instead of corrupting the simulation.

## One copy of every fact

- Geometry lives in the core: `stage.ts` owns the stage box (`stageBoxFor`), the prop table for
  each shape (`StageLayout`, `layoutFor`) and the one distance metric (`stageDistance`) that both
  hit-testing and drawing use, so they cannot drift apart on a phone any more than they can on a
  desktop (SPEC.md §55, §79). The renderer's `createViewport` calls the same `stageBoxFor` rather
  than keeping its own letterbox maths, and `engine.setStageAspect` is the only way the core learns
  the shape — which is also why `LAYOUT` is now just the regular table inside that file.
- Content→visual conversion lives in the core too: `state.style` (`SceneStyle`) is assembled from
  content by the engine, so a renderer stays a pure function of state and never imports content.
- Counters live in one place. `Progress` is owned by the engine and exposed as
  `engine.progressSnapshot()`; the shell mirrors it into storage and does not keep a second tally.
  `Statistics` is **derived from the session log** on demand (SPEC.md §70), so no counter can
  disagree with the events that produced it.
- A flare is produced by one function (`ember.forceFlare`), reached both by the ember's own
  `flareChance` and by a pooled `ember_flare` world event; `dropAsh` likewise. The `lighter_failure`
  rule keeps weight `0` in the scheduler precisely so it cannot become a second coin flip competing
  with `LighterContent.failureChance`.
- The ashtray catch radius, the flick threshold and the particle budget are each named once and
  read from there.
- A fact that is derived from something else is not also stored. `LighterSnapshot` carried an `at`
  point copied from the default layout at construction; the hit anchor was recomputed from the live
  layout every time the stage changed shape, so on a phone the lighter was drawn 63px from where a
  tap would land and on top of the pack. The field is gone and both sides read
  `state.stage.layout.lighter`. A stored copy is only safe with a writer, and this one had none —
  which is also why no test failed: nothing read the field, so nothing could notice it was stale.
  The guard reads the draw call's emitted coordinates back rather than asking the layout where the
  prop is (`prop-placement.test.ts`), because the weaker version of that test passed on the broken
  build.
- A rebuild-by-hand drops every field it does not name, so it may only drop one it has a replacement
  for. Two instances, one shape: `readSettings` and `cloneSettings` both rebuild `Settings` from a
  typed-out list of keys, which is how a player's chosen item and their chosen language came to
  vanish on the next reload while the memory fallback — which hands back the object it was given —
  kept both; the two adapters are now pinned to the same fixture (`makeChosenSettings`), so a field
  that is not listed in both places is a failing test rather than a silent loss. And
  `BedController.sync` rebuilt a `BedTarget` as `{ gain, cutoff }`, which computed, wired and then
  discarded the draw bed's `formant` one step before it reached the graph — no type error, no red
  test, just a filter nobody was driving. It spreads the target now and overrides only the field the
  trim touches. Where a rebuild has to enumerate (validation, where every field needs a bound), the
  enumeration is pinned by a fixture; where it does not, spread it.
- A colour layer that reaches only a nearly transparent gradient is a layer nobody can see.
  `applySkin` wrote a skin's 烟羽 into `view.smoke.tint`, and the only reader of that field was the
  density veil, whose alpha tops out at 0.033; the plume's colour had already been decided in the
  core and frozen into each particle when it was born. `skin.test.ts` said "the four layers land"
  and was right — about the view — and no test could tell the difference between that and a picture
  that never changed. What measures it instead (`plume-palette.test.ts`): hand the renderer a palette
  whose only non-default layer is the one under test (the other three are copied back from the
  unskinned view), record every colour the renderer asks a sprite for, and compare two runs of the
  same seeded puff index-aligned. Then a difference can only have come from that layer, and "0 of 60
  sprites changed" is a number rather than an impression.

## Determinism and replay

All randomness flows through `shared/rng.ts` (sfc32, integer-only). `Math.random()` is forbidden by
the guard, and `Date.now()` / `new Date()` are forbidden in the core: the shell supplies wall-clock
time and the UTC offset, so a save replays identically on another machine.

`GameEngine.send()` does not apply an input immediately. It resolves the target — a keyboard or
shortcut input names an anchor and borrows its position, a pointer keeps the pixel it was pressed
at (§65) — then
**snaps the input to the next fixed step** (`STEP_MS = 1000/60`) and queues it. That is what makes
§71 real rather than aspirational: `replaySession(session, content)` rebuilds an engine from
`seed`, `engineStartWallClockMs` and the content ids, advances to each recorded step, and reproduces
the event stream — `replay.test.ts` asserts the replayed `SessionEvent` sequence equals the recorded
one, including `SESSION_START`/`SESSION_END`, which replay re-issues at the same steps.

`rendering.test.ts` adds the visual half of the same promise: the same `Burst` seed expands into the
same particle layout, so a reproduced bug looks like the bug.

The other half of that promise is a *counting* rule, and it constrains how the world may be made
calmer: a per-frame dice roll is allowed to stop being read as a value, but not to stop being
drawn. `tickWorld` still samples `wind.variance` every frame and `tickSmoke` still rolls its ±0.3
turbulence jitter — the sample is now the *target* of an `approach()` rather than the field itself,
which is what removes the shiver (§22) without touching how many draws a frame consumes. Note what
guards this and what it does not: `replay.test.ts` compares the replayed event **type sequence and
length**, not the rng call count, so it catches a shifted sequence only because shifted draws pick
different events. Removing a draw is the mistake the rule forbids precisely because nothing would
say so loudly.

A break the app never got to watch is the one place the wall clock is allowed to overrule the
simulation. `openBreakSnapshot()` writes down the burn position and the moment the cherry caught;
the next boot hands that record back and `restoreOpenBreak(record, now)` spends
`now - litAtWallMs` on the rod (§81 4). It is a restore, not a replay: nothing that happened during
the unseen gap is invented, so the resumed session's `inputs` hold only what the player did after the
page came back. The clock is put back by the same arithmetic, which is why a resumed break shows the
minute it is really in instead of a fresh `03:00`, and why a break that would have ended in a pocket
comes back ended.

## Where the interface ends and the scene begins

The stage owns everything a player touches. The shell owns three readings of the same state
machine — the head-up row, the pill, and a rail whose first three cells are indicators, not
buttons — and all three fold together on the core's word (`ui.controlsVisible`). Two rules keep
that split from rotting back into an app:

- **the core decides visibility, once.** `ui.controlsVisible` folds together "has the player ever
  touched anything", "how long since they did", "are they mid-draw" and "did they just swipe the
  interface away". The shell renders a boolean; it never invents its own fade, so a desktop pet
  gets the same behaviour for free (§10);
- **the scene's numbers live inside the scene's sheets.** The break's clock is a row in `this
  break`, not an overlay, and the stage mirrors it as `data-break` for the same reason the cue
  channel is mirrored as `data-cues`: a fact nothing can read is a fact nothing can check;
- **a language is a preference the core carries and never reads.** `Settings.language` travels with
  the save so a phone and a desktop agree after a sync, and every word is chosen in
  `apps/web/src/i18n` — target language, then English, then no visible word at all. Two things
  follow, and both are enforced: a test scans the pure layer for any read of a language, because a
  simulation that picked words could burn differently on two machines and would break §71's replay;
  and right-to-left mirrors the sheets (logical CSS properties only) and never the stage, because
  the rod burns the same way whichever way you read;
- **the stage's box sizes the canvas, not the window.** `resize()` reads the stage element's own
  rect and lets `visualViewport` only take space away (the mobile chrome case), so the desk column
  can take 260px out of the scene without the canvas sliding underneath it — hit-testing, the stage
  aspect and the renderer all keep agreeing on one box;
- **a sheet takes the handle's place.** The pill is the scene's gesture handle, and it sits exactly
  where a sheet's rows are: opening any sheet folds the pill away (the rail stays, because it is
  how the sheet closes). The archive card is not a sheet, so a rod held mid-draw keeps its handle;
- **the type floor is a source rule.** Nothing the shell can put on screen is declared below 15px
  (Smoke Ritual `accessibility.minFontSize`), in any of the three shapes the styles write sizes in —
  `apps/web/src/styles/__tests__/font-floor.test.ts` scans every shipped `.vue`/`.css` for it, and
  the scan carries its own positive control so it cannot pass by matching nothing;
- **a ceiling is a number the page obeys and the break does not.** `Settings.dailyLimitSticks` is
  set in the settings sheet and read in exactly one shell function, `isOverLimit`: reaching it
  greys the ring and swaps its digit for `◇`, and the next break starts as easily as the first.
  The scan that watches the language watches this field through the pure layer too, because a
  simulation that obeyed a ceiling would be a lock wearing a statistic's clothes — and the copy
  table is scanned for the sentences that would praise or threaten.

## Performance

SPEC.md §54 and §81 (6/9) are why the renderer is structured the way it is:

- no DOM particles, and Vue never drives a particle: the rAF loop calls `engine.tick(dt)` and
  `renderer.render(state, dt)`, while a summary is republished to the UI at 5 Hz so components
  re-render on a human timescale;
- a single fixed-capacity `ParticlePool` with ring-buffer allocation and zero per-frame allocation;
  over budget, the oldest slot is recycled rather than the frame stalling;
- smoke sprites are baked once per quantised tint (radial gradients are never built per particle per
  frame), and `blur` is the sprite's own falloff rather than `ctx.filter`, which is slow and
  inconsistently supported;
- quality tiers set the budget (1400 / 800 / 380, and 160 under `reducedMotion`) — SPEC.md §64;
- `quality: 'auto'` is measured, not guessed: the shell keeps an exponential average of its own
  frame times and walks the tier down twice as eagerly as it climbs back, and a coarse pointer
  caps the canvas at 2× DPR instead of 3× (§54, §66);
- `dt` is clamped to 250 ms per frame and 50 ms per render step, so a backgrounded tab neither
  fast-forwards the burn nor teleports smoke.

## Extension seams

The interfaces a new platform implements are declared in the pure layer, so the seam is part of the
contract rather than an afterthought: `RendererAdapter`, `AudioAdapter`, `InputSink`, `ClockSource`,
and `StorageAdapter` (`game-storage`).

- **Desktop pet (SPEC.md §40-44, §78)**: `apps/desktop` would create a transparent, frameless,
  always-on-top window, put the *same* `createCanvasRenderer` on its canvas, convert native mouse
  events into `GameInput`, and reuse `game-storage` with a filesystem `StorageAdapter`. No game
  logic is copied; `game-core` is imported once. This is not a paragraph claim: `game-renderer`'s
  `platform.test.ts` deletes `document`, `window` and `navigator` from the global object and then
  plays a whole break through the engine and the renderer. It draws, because it never needed them.
- **Renderer swap (§79)**: only if a transparent-window or GPU requirement actually appears does a
  `DesktopRenderer` get added; the core does not change, because it never knew which renderer existed.
- **New content (§77)**: adding a cigarette, room, lighter, tray, smoke style or sound bed is an
  entry in `game-content` plus an `UnlockRule`. Nothing in `game-core` is edited — the pools,
  weights, and effects are looked up by id.
- **New world event**: the id is listed in SPEC.md §21, so it already has a rule in
  `WORLD_EVENT_RULES`; adding one means a rule plus an `applyStart` case, not a new protocol.
- **Haptics (§30)**: `Settings.haptics` exists and is unread on the web. A native shell consumes it
  without touching the simulation.

## Verification layers

Each layer proves something the one below it cannot. Layers 1-4 run on every push and pull request
through `.github/workflows/ci.yml`; layer 5 needs a real browser, so it is run by hand against
whatever URL you point it at:

1. **Per-package unit tests** — the state machine, the systems, the particle pool, the cue planner.
2. **`tests/architecture.test.ts`** — the dependency rule, with positive controls so a guard cannot
   pass by matching nothing.
3. **`tests/sessionLoop.test.ts`** — one whole break on the shipped content, through the real
   renderer, and then the statistics that reach the screen are checked against the log (§70).
4. **`tests/smoke/served-build.sh`** — the built artefact served the way Pages will serve it. A wrong
   base path is invisible to every layer above and is a blank page in production.
5. **`tests/smoke/touch-device.mjs`** — a real browser, on the shapes the product ships on: phone
   portrait, phone landscape, and a desktop window driven with a mouse (the only pass where the hit
   radii are not widened for a finger, so it is the only one that can see a rod whose far half has
   gone untappable). A break completed with pointers, targets that fit a finger, no double-tap zoom,
   no prose and no digits on the stage — at most the one gesture word, which is checked to change
   with the affordance and to disappear when settings say so — a drawn breath that measurably
   changes the pixels, the interface folding under a swipe down over nothing while the rod keeps
   burning, and the two ways the operating system takes a phone away: frames that stop (it wakes to
   a rod that kept burning) and a page that is reloaded (it comes back to the same break, at the
   minute the clock says).

## Deliberately not built

Not every idea in the spec is a feature to ship on day one, and pretending otherwise would add
complexity for hypothetical futures (SPEC.md §89, 9-10):

- **no desktop or mobile shell yet** — only the seams above, which is why `apps/` holds `web` alone;
- **no accounts, sync or telemetry** (§52) — there is no network code in the repository;
- **no i18n in the game core** (§5) — the core is language independent by construction. The visible
  text in the whole product is one gesture verb (`tap` / `light` / `hold` / `flick` / `press` /
  `drop`) that the *shell* draws over the object the core is already nudging, plus `aria-label` for
  screen readers and the PWA manifest. The core never sees a word: it publishes an affordance, and
  the shell decides what language, if any, that affordance wears;
- **no game engine dependency** (§76) — Canvas 2D and `requestAnimationFrame` only;
- **no medical claims or recovery percentages** (§84) — `smokeFreeDays` is a count of days on an
  anchor the player sets themselves, and nothing in the UI turns it into a health statement.
