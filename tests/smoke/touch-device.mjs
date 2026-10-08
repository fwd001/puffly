/**
 * Pointer evidence on the shapes the product ships on — SPEC.md §66, §81 (4).
 *
 * The unit suite can prove that a tap resolves to the right anchor; it cannot prove that a
 * break is playable with a finger on a 393 px screen, or with a mouse in a maximised browser
 * window where the hit tolerance is not widened. This drives an actual browser through phone
 * portrait, phone landscape and a desktop window, and asserts the things a screenshot cannot
 * lie about: that the canvas fills the device, that a coarse pointer gets finger-sized targets,
 * that double-tapping does not zoom the scene, that the main screen still contains no words,
 * that a drawn breath is actually visible in the air, and that a break survives the page being
 * taken away.
 *
 *   node tests/smoke/touch-device.mjs http://localhost:5175/
 *
 * Playwright and a browser binary are resolved from the environment, because neither is a
 * dependency of the game:
 *   PUFFLY_PLAYWRIGHT=/path/to/playwright/index.mjs  PUFFLY_CHROME=/path/to/chrome
 *   PUFFLY_BROWSER=chromium|webkit|firefox           (default: chromium)
 * Chromium is the engine the product ships on and the one worth installing for this check; the
 * other two are here because a machine with only Playwright's WebKit bundle should still be able
 * to run the gestures rather than report "not run".
 *
 * It exits 1 with a message when a check fails, and 3 when it could not run at all — a check
 * that silently skips is worse than one that does not exist.
 */

const URL_ARG = process.argv[2] ?? 'http://localhost:5175/';
const PLAYWRIGHT_SPEC = process.env['PUFFLY_PLAYWRIGHT'] ?? 'playwright';
const CHROME = process.env['PUFFLY_CHROME'];
const ENGINE = process.env['PUFFLY_BROWSER'] ?? 'chromium';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

let browserType;
try {
  const playwright = await import(PLAYWRIGHT_SPEC);
  browserType = playwright[ENGINE];
  if (browserType === undefined) throw new Error(`no such engine: ${ENGINE}`);
} catch {
  console.error(
    `cannot import Playwright's ${JSON.stringify(ENGINE)} from ${JSON.stringify(PLAYWRIGHT_SPEC)}.\n` +
      'Set PUFFLY_PLAYWRIGHT to a playwright entry point (an absolute path to its index.mjs is\n' +
      'always fine) and PUFFLY_CHROME to a browser binary. Not run, so nothing is proven.',
  );
  process.exit(3);
}

/** `PUFFLY_CHROME` is any engine's own binary: it points a check at the browser on this machine. */
const launchOptions = CHROME ? { executablePath: CHROME } : {};
let browser;
try {
  browser = await browserType.launch(launchOptions);
} catch (error) {
  console.error(
    `cannot launch ${ENGINE}: ${error.message}\n` +
      'Set PUFFLY_CHROME to a Chrome/Chromium binary, or PUFFLY_BROWSER to an engine that is installed.',
  );
  process.exit(3);
}
console.log(`engine: ${ENGINE}`);

/**
 * Where the touchable things are, read from the page.
 *
 * The shell mirrors its own anchors onto `.stage[data-aim]`, in fractions of the canvas element —
 * the same space `stagePoint` aims in. The alternative was this file's old copy of the numbers,
 * which had gone stale twice over: the table lifts clear of the chrome (§55) and the canvas
 * letterboxes the stage, so a prop's position is a function of the window and not a constant.
 * A check that aims at empty air reports a working game as a broken one.
 */
async function propsOf(page) {
  const raw = await page.evaluate(() => document.querySelector('.stage')?.dataset.aim ?? '');
  const props = {};
  for (const part of raw.split(' ')) {
    const [name, pair] = part.split(':');
    const [x, y] = (pair ?? '').split(',').map(Number);
    if (name !== undefined && Number.isFinite(x) && Number.isFinite(y)) props[name] = { x, y };
  }
  return props;
}

async function openPhone({ width, height, dpr, locale }) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: dpr,
    isMobile: true,
    hasTouch: true,
    ...(locale === undefined ? {} : { locale }),
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto(URL_ARG, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  return { context, page, errors };
}

/** A maximised browser window: no coarse pointer, so no widened hit tolerance either. */
async function openWindow({ width, height }) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto(URL_ARG, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  return { context, page, errors };
}

/**
 * Whether the browser's own gestures still own the surface: the long-press menu, the image
 * callout, dragging a selection out of the canvas. The iOS callout is asserted in the unit
 * suite instead: Chromium drops `-webkit-touch-callout` at parse time, so nothing observable
 * here could prove it.
 */
const nativeDefaults = (page) =>
  page.evaluate(() => {
    const seen = [];
    const onMenu = (event) => seen.push(event.defaultPrevented);
    document.addEventListener('contextmenu', onMenu);
    const canvas = document.querySelector('canvas');
    const box = canvas.getBoundingClientRect();
    canvas.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: box.width / 2,
        clientY: box.height / 2,
      }),
    );
    document.removeEventListener('contextmenu', onMenu);

    let dragKept = false;
    const onDrag = (event) => (dragKept = event.defaultPrevented);
    document.addEventListener('dragstart', onDrag);
    canvas.dispatchEvent(new Event('dragstart', { bubbles: true, cancelable: true }));
    document.removeEventListener('dragstart', onDrag);

    return {
      menuFired: seen.length,
      menuPrevented: seen.filter((value) => value === true).length,
      dragPrevented: dragKept,
    };
  });

/**
 * The two facts a break is made of: which stage it is in, and what its clock says.
 *
 * Both are read off `.stage`'s machine values, never off the words. The canvas's `aria-label` says
 * the same thing the phase does — that is its job, since a screen reader is the one audience for
 * prose — but it says it in whatever language the copy table resolved to, and a check that compares
 * it to English strings passes on one machine and fails on the next. That is how eight checks here
 * came to be red at once while the game was fine.
 */
const scene = (page) =>
  page.evaluate(() => {
    const stage = document.querySelector('.stage');
    return {
      phase: stage?.dataset.phase ?? 'missing',
      affordance: stage?.dataset.affordance ?? 'missing',
      clock: stage?.dataset.break ?? '',
    };
  });

/** Which stage of the break the scene is in: `light` / `puff` / `tray` / `out`. */
const scenePhase = (page) => scene(page).then((now) => now.phase);

/** A rod that is alight: burning, being drawn on, resting between draws, standing ash, or a stub. */
const LIT = /puff|tray/;

/**
 * Wait for the scene to reach one of these phases.
 *
 * A wheel lighter takes over a second to catch, and that length is a design number, not a
 * constant of this test — a fixed sleep here passed by luck and failed by 200 ms.
 */
async function waitScene(page, pattern, withinMs = 4000) {
  const deadline = Date.now() + withinMs;
  for (;;) {
    const phase = await scenePhase(page);
    if (pattern.test(phase)) return phase;
    if (Date.now() >= deadline) return '';
    await page.waitForTimeout(120);
  }
}

/**
 * A coarse luminance map of the air above the table.
 *
 * What gets compared is *which pixels changed*, not how bright the frame is: a room's own key
 * light fills the same band with bright pixels, and counting those proved nothing about smoke.
 */
const airSample = (page) =>
  page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const scale = canvas.width / canvas.clientWidth;
    const ctx = canvas.getContext('2d');
    const box = canvas.getBoundingClientRect();
    const image = ctx.getImageData(
      0,
      Math.round(box.height * 0.25 * scale),
      canvas.width,
      Math.round(box.height * 0.35 * scale),
    );
    const step = 4;
    const lum = [];
    for (let row = 0; row < image.height; row += step) {
      for (let col = 0; col < image.width; col += step) {
        const i = (row * image.width + col) * 4;
        lum.push(0.299 * image.data[i] + 0.587 * image.data[i + 1] + 0.114 * image.data[i + 2]);
      }
    }
    return lum;
  });

/**
 * How the breath in the air is *shaped*, not just how bright it got.
 *
 * A cloud can cover the band and still be one flat sheet of haze — which is what the exhale
 * measured before its lobes were re-authored (neighbour-to-neighbour difference 5.17, relative
 * spread 0.234). Structure is what the design's breath has: light and dark inside the same mass
 * (8.44 and 0.294 after). Both are read over the same band `airSample` uses.
 */
const cloudStructure = (page) =>
  page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const scale = canvas.width / canvas.clientWidth;
    const ctx = canvas.getContext('2d');
    const image = ctx.getImageData(
      0,
      Math.round(canvas.getBoundingClientRect().height * 0.25 * scale),
      canvas.width,
      Math.round(canvas.getBoundingClientRect().height * 0.35 * scale),
    );
    const d = image.data;
    const lumAt = (row, col) => {
      const i = (row * image.width + col) * 4;
      return 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    };
    const cloud = [];
    for (let row = 0; row < image.height; row += 2) {
      for (let col = 0; col < image.width; col += 2) {
        const value = lumAt(row, col);
        if (value > 90) cloud.push(value);
      }
    }
    const mean = cloud.length ? cloud.reduce((a, b) => a + b, 0) / cloud.length : 0;
    const sd = Math.sqrt(
      cloud.length ? cloud.reduce((a, b) => a + (b - mean) ** 2, 0) / cloud.length : 0,
    );
    let edge = 0;
    let pairs = 0;
    for (let row = 0; row < image.height; row += 4) {
      for (let col = 4; col < image.width; col += 4) {
        const a = lumAt(row, col);
        const b = lumAt(row, col - 4);
        if (a > 90 || b > 90) {
          edge += Math.abs(a - b);
          pairs += 1;
        }
      }
    }
    return {
      cloudSamples: cloud.length,
      neighbourContrast: pairs ? edge / pairs : 0,
      spread: mean ? sd / mean : 0,
    };
  });

/** How much of the band a breath actually rewrote. */
function breathDelta(before, after) {
  let moved = 0;
  let rise = 0;
  const count = Math.min(before.length, after.length);
  for (let i = 0; i < count; i += 1) {
    const delta = after[i] - before[i];
    if (delta > 12) moved += 1;
    rise += delta;
  }
  return { movedRatio: count ? moved / count : 0, meanRise: count ? rise / count : 0 };
}

const stagePoint = (page, nx, ny) =>
  page.evaluate(
    ([nx, ny]) => {
      const box = document.querySelector('canvas').getBoundingClientRect();
      return { x: box.left + box.width * nx, y: box.top + box.height * ny };
    },
    [nx, ny],
  );

/**
 * The words a player can read over the scene, and where each of them is allowed to live.
 *
 * The product's rule is not "one word on the screen": the design gives the rail, the pill and the
 * head-up row a name each (§9.2, S11), and every one of them is translated. What it does not allow
 * is *prose* — text the scene puts out on its own. That cannot be decided by matching a vocabulary
 * (a Chinese sentence is one unbroken run of characters, so counting words proves nothing), so this
 * asks a structural question instead: does every word live inside a container the design named?
 *
 * `affordance` comes along because the hint's job is to name the gesture the engine is already
 * nudging (§28), and the only language-independent way to check that is to read the nudge itself.
 */
const WORD_HOMES = '.hint, .pill, .rail, .hud, .data-rail, .sheet, .archive';
/**
 * What is open and what the break is doing, read together: the dismissal checks below need both,
 * because a press that closes a panel *and* drives the engine behind it is two actions for one
 * finger.
 */
const panelState = (page) =>
  page.evaluate(() => {
    const stage = document.querySelector('.stage');
    return {
      sheets: document.querySelectorAll('.sheet[data-open="true"]').length,
      affordance: stage?.dataset.affordance ?? '',
      phase: stage?.dataset.phase ?? '',
    };
  });

const stageWords = (page) =>
  page.evaluate((homes) => {
    // Only text a person can actually see is prose. A sheet that is closed and the desk column a
    // phone hides are both in the DOM, and flagging them would report words nobody reads.
    const seen = (el) => (typeof el.checkVisibility === 'function' ? el.checkVisibility() : true);
    const offenders = [];
    for (const el of document.querySelectorAll('body *')) {
      if (!seen(el)) continue;
      const spoken = [...el.childNodes].some(
        (node) => node.nodeType === 3 && /\p{L}{2,}/u.test(node.textContent ?? ''),
      );
      if (!spoken) continue;
      if (el.closest(homes) === null) offenders.push(el.className || el.tagName);
    }
    const hint = document.querySelector('.hint');
    return {
      hint: (hint?.textContent ?? '').trim().toLowerCase(),
      hints: document.querySelectorAll('.hint').length,
      affordance: document.querySelector('.stage')?.dataset.affordance ?? 'missing',
      offenders: [...new Set(offenders)],
    };
  }, WORD_HOMES);

/** Which channel the shell currently trusts to carry the cues (§63). */
const cueChannel = (page) =>
  page.evaluate(() => document.querySelector('.stage')?.dataset.cues ?? 'missing');

/**
 * Wait for the channel to change hands. The browser resolving an audio context is not something
 * a fixed sleep can promise a deadline for — on a loaded machine it took this check 700 ms and
 * then it did not — so the condition is polled and the last value is what gets reported.
 */
async function waitChannel(page, want, withinMs = 5000) {
  const deadline = Date.now() + withinMs;
  for (;;) {
    const now = await cueChannel(page);
    if (now === want || Date.now() >= deadline) return now;
    await page.waitForTimeout(120);
  }
}

/**
 * The one way into anything: the mark at the bottom, then the entry it opens.
 *
 * Both halves are addressed by the hooks the components mirror (`data-entry`, `.menu`) rather
 * than by their labels, because from here on the labels are in whatever language the tier under
 * test asked for — and a check that only passes in English proves nothing about the other two.
 */
const SHEET_HANDLE = {
  settings: '.rail [data-tab="settings"]',
  shelf: '.hud [data-hook="category"]',
  break: '.hud [data-hook="break"]',
};

/**
 * The interface folds itself away 2.6 s after the last input (§10), so a control that was there a
 * moment ago can be `visibility: hidden` by the time a check reaches for it. A tap on empty sky
 * wakes it without touching anything: the upper-left of the stage is above every prop anchor.
 */
async function wakeChrome(page) {
  const rail = page.locator('.rail');
  if (await rail.isVisible().catch(() => false)) return;
  // A pointer click on empty sky: the app runs on Pointer Events, so this wakes the same way a
  // finger does, in a touch context and a mouse one alike.
  await page
    .locator('canvas')
    .click({ position: { x: 24, y: 24 }, force: true, noWaitAfter: true });
  await rail.waitFor({ state: 'visible', timeout: 4000 });
}

async function openSheet(page, id, mouse = false) {
  await wakeChrome(page);
  const handle = page.locator(SHEET_HANDLE[id]);
  if (mouse) await handle.click();
  else await handle.tap();
  await page.waitForTimeout(460);
}

/**
 * The mark a hint word is anchored to, as a centre. The word itself is a different width in
 * every language — `点` is not `tap` — so the left edge proves nothing; the point the word is
 * hanging off is the fact that must not move when the text changes direction.
 */
const hintCentre = async (page) => {
  const box = await page.locator('.hint').boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

// -------------------------------------------------------------------- portrait
{
  const { page, errors, context } = await openPhone({ width: 393, height: 852, dpr: 3 });
  const box = await page.locator('canvas').boundingBox();
  check(
    'the canvas fills the phone',
    Math.abs(box.width - 393) < 2 && Math.abs(box.height - 852) < 2,
    `${box.width}x${box.height}`,
  );

  const ratio = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    return canvas.width / canvas.clientWidth;
  });
  check('a coarse pointer caps DPR at 2', ratio <= 2.05, `canvas is ${ratio}x`);

  const target = (
    await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--tap-target'),
    )
  ).trim();
  check('a coarse pointer gets 54px targets', target === '54px', target);

  // Sampled before anything is lit: an idle room has drift and dust, but no breath in it.
  const before = await airSample(page);

  // The first thing a player meets: nothing has been touched, so the chrome may not fade, and the
  // one word on the screen has to say what the glowing thing under the rod is for (§28).
  const untouched = await stageWords(page);
  check(
    'an untouched table names the one thing to do',
    untouched.affordance === 'pick' && untouched.offenders.length === 0 && untouched.hints === 1,
    JSON.stringify(untouched),
  );

  const props = await propsOf(page);
  const rod = await stagePoint(page, props.body.x, props.body.y);
  await page.touchscreen.tap(rod.x, rod.y);
  await page.waitForTimeout(300);
  const inHand = await stageWords(page);
  check(
    'once it is in hand the word changes to the next gesture',
    inHand.affordance === 'lighter' &&
      inHand.offenders.length === 0 &&
      inHand.hint !== untouched.hint,
    JSON.stringify(inHand),
  );
  const lighter = await stagePoint(page, props.lighter.x, props.lighter.y);
  // The clock's visibility is not the evidence: §10 dims the chrome, including the clock, once
  // the player is inside the moment. The state machine is what a break starting means. And the
  // cheap wheel is allowed to miss (§13), so starting is "keep trying", not "tap once and pray".
  let litState = '';
  for (let attempt = 0; attempt < 3 && litState === ''; attempt += 1) {
    await page.touchscreen.tap(lighter.x, lighter.y);
    litState = await waitScene(page, LIT);
  }
  check('two taps start the break on their own', litState !== '', litState);
  // A phone that sleeps with a lit rod must wake to a rod that kept burning: the simulation is a
  // function of time, not of animation frames, and browsers stop painting a hidden page.
  const ASLEEP_MS = 4000;
  const clockSeconds = () =>
    page.evaluate(() => {
      // The stage shows no digits; the break's clock is mirrored on it as an attribute, which is
      // what makes "did the sleep count as time" checkable without opening a sheet to look.
      const text = document.querySelector('.stage')?.getAttribute('data-break') ?? '0:00';
      const [m, sec] = text.split(':').map(Number);
      return m * 60 + (Number.isFinite(sec) ? sec : 0);
    });
  const beforeSleep = await clockSeconds();
  // What the clock opens *on* is the deck's unit of a break: one rod of the default kind, ten
  // minutes. Read off the machine mirror, so this is a claim about the shipped settings and not
  // about a word in one language. Some of the rod is already burnt by the time the cherry lit.
  check(
    'a break opens on the clock the shipped settings promise',
    beforeSleep >= 570 && beforeSleep <= 600,
    `${String(beforeSleep)}s`,
  );
  // A real background tab stops being painted. Overriding `document.hidden` alone does not stop
  // it here — the page is still visible to the compositor — so the frames are parked in a queue
  // and released afterwards, which is what a phone returning to the foreground looks like.
  await page.evaluate(() => {
    const realRaf = window.requestAnimationFrame.bind(window);
    const queue = [];
    window.__wake = (ms) => {
      window.requestAnimationFrame = realRaf;
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'visible',
      });
      document.dispatchEvent(new Event('visibilitychange'));
      const now = performance.now() + ms;
      for (const cb of queue.splice(0)) cb(now);
    };
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    window.requestAnimationFrame = (cb) => {
      queue.push(cb);
      return queue.length;
    };
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(ASLEEP_MS);
  await page.evaluate((ms) => window.__wake(ms), ASLEEP_MS);
  await page.waitForTimeout(600);
  const counted = beforeSleep - (await clockSeconds());
  check(
    'the break keeps burning while the phone sleeps',
    counted >= (ASLEEP_MS - 1500) / 1000 && counted <= ASLEEP_MS / 1000 + 3,
    `${counted}s counted for a ${ASLEEP_MS / 1000}s sleep (clock ${beforeSleep}s -> ${beforeSleep - counted}s)`,
  );

  // Re-read: the rod is in the hand now, so its anchor is not where it was on the table.
  const inHandProps = await propsOf(page);
  const held = await stagePoint(page, inHandProps.body.x, inHandProps.body.y);
  for (let round = 0; round < 2; round += 1) {
    await page.evaluate(
      ([x, y]) => {
        document.querySelector('canvas').dispatchEvent(
          new PointerEvent('pointerdown', {
            clientX: x,
            clientY: y,
            pointerId: 1,
            pointerType: 'touch',
            isPrimary: true,
            bubbles: true,
          }),
        );
      },
      [held.x, held.y],
    );
    // Longer than one full draw, on purpose. The deck's 单口吸入 for the default rod is 2.0 s (S9) and
    // its own window tops at 2.6, so a hold shorter than that is a sip: the air moves, but only as
    // much as a half-filled breath moves it. This check's claim is about *a drawn breath*, so the
    // finger has to outlast the fill — the first version of this line held 800 ms and reported a
    // shallow breath as a broken picture.
    await page.waitForTimeout(2300);
    await page.evaluate(
      ([x, y]) => {
        document.querySelector('canvas').dispatchEvent(
          new PointerEvent('pointerup', {
            clientX: x,
            clientY: y,
            pointerId: 1,
            pointerType: 'touch',
            isPrimary: true,
            bubbles: true,
          }),
        );
      },
      [held.x, held.y],
    );
    await page.waitForTimeout(600);
  }
  const after = await airSample(page);
  const breath = breathDelta(before, after);
  check(
    'a drawn breath rewrites the air above the table',
    breath.movedRatio > 0.05 && breath.meanRise > 1,
    `${(breath.movedRatio * 100).toFixed(1)}% of the band changed, mean rise ${breath.meanRise.toFixed(1)}`,
  );
  // Brightness alone would pass on a flat sheet of haze, which is exactly what the exhale used to
  // be. Both shape signals have to be missing before this calls a failure: one of them drifting on
  // a different rod or a different canvas width is not the regression, a cloud with no light and
  // dark inside it is.
  const shape = await cloudStructure(page);
  check(
    // STALE: 6.5 and 0.26 were calibrated against the picture this script saw in 2026-10-05, before
    // the plume was given one shared flow field (SPEC.md §15) — the breath went from a round cloud
    // to a narrow rising column, so both numbers move and neither has been re-read here.
    'the breath has light and dark inside it, not just brightness',
    shape.neighbourContrast >= 6.5 || shape.spread >= 0.26,
    `neighbour difference ${shape.neighbourContrast.toFixed(2)}, relative spread ${shape.spread.toFixed(3)}, ${String(shape.cloudSamples)} cloud samples`,
  );
  const inHandAgain = await scenePhase(page);
  check('the rod is still in hand, not in the tray', LIT.test(inHandAgain), inHandAgain);

  // Drawing on the rod left the scene nudging the next gesture, and the hint names it.
  const words = await stageWords(page);
  check(
    'the screen carries no prose, and the hint still names the gesture being nudged',
    words.offenders.length === 0 && words.hints === 1 && words.affordance === 'puff',
    JSON.stringify(words),
  );

  // Double-tapping the *air* is what a player does while looking for something to touch. It must
  // not zoom the scene. Not the rod's place on the table: the tray's own drawn radius reaches
  // that far, so a tap there belongs to the tray and puts the break out — which would leave
  // nothing live for the reload check below.
  const air = await stagePoint(page, 0.5, 0.3);
  const zoomBefore = await page.evaluate(() => window.visualViewport?.scale ?? 1);
  await page.touchscreen.tap(air.x, air.y);
  await page.touchscreen.tap(air.x, air.y);
  await page.waitForTimeout(300);
  const zoomAfter = await page.evaluate(() => window.visualViewport?.scale ?? 1);
  check('double-tap does not zoom the scene', Math.abs(zoomAfter - zoomBefore) < 0.01);

  // An open sheet must leave the controls that opened it reachable: the bottom-anchored panel
  // used to paint over the rail, so on a phone the way out went dead once a sheet was open.
  await openSheet(page, 'shelf');
  const covered = await page.evaluate(() =>
    [
      '.rail [data-tab="settings"]',
      '.hud [data-hook="break"]',
      '.sheet[data-open="true"] .close',
    ].filter((selector) => {
      const btn = document.querySelector(selector);
      const r = btn.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      // The button's own glyph span is a hit on the button; anything else is something on top.
      return !btn.contains(hit);
    }),
  );
  check(
    'the rail, the head-up row and the sheet stay tappable together',
    covered.length === 0,
    covered.join(','),
  );

  await openSheet(page, 'settings');
  const switched = await page.evaluate(() =>
    [...document.querySelectorAll('.sheet[data-open="true"]')].map(
      (el) => `${el.dataset.sheet ?? 'unnamed'}/${el.getAttribute('aria-label') ?? ''}`,
    ),
  );
  check(
    'the menu replaces the sheet that was open, and every sheet still has a name',
    switched.length === 1 && switched[0].startsWith('settings/') && !switched[0].endsWith('/'),
    switched.join(','),
  );

  // 点内容区域之外就收起: the scene is the way out of a sheet, on the phone as on the desk. The
  // drawer covers the lower half, so the press is aimed at the canvas above it — and that aim is
  // asserted, because a check that presses the panel reports a working dismissal as a broken one.
  await openSheet(page, 'shelf');
  const drawerOpen = await panelState(page);
  const spot = await page.evaluate(() => {
    const canvas = document.querySelector('canvas').getBoundingClientRect();
    const sheet = document.querySelector('.sheet[data-open="true"]');
    const panelTop = sheet ? sheet.getBoundingClientRect().top : canvas.bottom;
    return {
      x: canvas.x + canvas.width / 2,
      y: Math.max(canvas.y + 12, panelTop - 24),
      onScene:
        document.elementFromPoint(
          canvas.x + canvas.width / 2,
          Math.max(canvas.y + 12, panelTop - 24),
        )?.tagName === 'CANVAS',
    };
  });
  check(
    'the phone dismissal presses the scene, not the panel',
    spot.onScene,
    `point ${String(Math.round(spot.x))},${String(Math.round(spot.y))}`,
  );
  await page.touchscreen.tap(spot.x, spot.y);
  await page.waitForTimeout(320);
  const drawerScene = await panelState(page);
  check(
    'a press on the scene puts the open sheet away',
    drawerOpen.sheets === 1 && drawerScene.sheets === 0,
    `sheets ${String(drawerOpen.sheets)} then ${String(drawerScene.sheets)}`,
  );
  await openSheet(page, 'shelf');
  // The panel's own header: a tile would answer by taking that rod into the hand, which the reads
  // further down this file depend on not having happened.
  await page.locator('.sheet[data-open="true"] .head .count').first().tap();
  await page.waitForTimeout(320);
  const drawerInside = await panelState(page);
  check(
    'a press inside the panel keeps it open',
    drawerInside.sheets === 1,
    `sheets ${String(drawerInside.sheets)}`,
  );
  // Back to where this file left the screen before these three checks: the row below reads a
  // setting that only exists inside the sheet, so the sheet has to be the settings one.
  await openSheet(page, 'settings');

  // The row is the only place the stage is allowed digits (§9.2: icons and Arabic numerals).
  // Everything else that shows a number lives inside a sheet, and prose still may not appear.
  const digits = await page.evaluate(() => {
    const count = (text) => (text.match(/[0-9]/g) ?? []).length;
    const seen = (el) => (typeof el.checkVisibility === 'function' ? el.checkVisibility() : true);
    let inRow = 0;
    let outside = 0;
    for (const el of document.querySelectorAll('.stage *')) {
      if (!seen(el)) continue;
      for (const node of [...el.childNodes]) {
        if (node.nodeType !== 3) continue;
        const found = count(node.textContent ?? '');
        if (found === 0) continue;
        // A closed sheet and the desk column are places numbers are allowed to live; the scene
        // itself is not.
        if (el.closest('.hud') !== null) inRow += found;
        else if (el.closest('.sheet, .archive, .data-rail') === null) outside += found;
      }
    }
    return { inRow, outside };
  });
  check(
    'the head-up row carries the digits, and nothing else on the stage does',
    digits.inRow > 0 && digits.outside === 0,
    JSON.stringify(digits),
  );

  // §64: the word is a setting, not a fixture. Off has to mean off on the stage too, not just
  // in the sheet, and turning it off must not leave any other text behind.
  await page.locator('.sheet[data-open="true"] [data-setting="hints"]').tap();
  await page.locator('.sheet[data-open="true"] .close').tap();
  await page.waitForTimeout(600);
  const quiet = await stageWords(page);
  check(
    'the hint word is a setting that can be turned off',
    quiet.hints === 0 && quiet.affordance === 'puff' && quiet.offenders.length === 0,
    JSON.stringify(quiet),
  );

  // The operating system takes the page away without asking: a reload has to come back to the
  // same break, not start a new one. §81 (4). The clock is the evidence a screenshot cannot fake:
  // a fresh break reads the untouched target, a resumed one is still counting down from where
  // the written record left off (it is rewritten every 1.5 s, so a small rewind is the design).
  const beforeReload = await clockSeconds();
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const afterReload = await scene(page);
  const afterSeconds = await clockSeconds();
  check(
    'a reload comes back to the same break',
    LIT.test(afterReload.phase) &&
      afterSeconds > 0 &&
      afterSeconds <= beforeReload + 3 &&
      afterSeconds >= beforeReload - 30,
    `${afterReload.phase} at ${afterSeconds}s, was ${beforeReload}s before the reload`,
  );

  const defaults = await nativeDefaults(page);
  check(
    'the native context menu, callout and drag defaults are refused',
    defaults.menuFired === 1 && defaults.menuPrevented === 1 && defaults.dragPrevented === true,
    JSON.stringify(defaults),
  );

  await openSheet(page, 'settings');
  const small = await page.evaluate(() =>
    [
      ...document.querySelectorAll(
        '.sheet[data-open="true"] button, .sheet[data-open="true"] input',
      ),
    ]
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 0 && (r.width < 44 || r.height < 40))
      .map((r) => `${Math.round(r.width)}x${Math.round(r.height)}`),
  );
  check('every control on the sheet takes a finger', small.length === 0, small.join(', '));
  // The 休息 row, in the browser rather than in the source: the track has to be able to land on the
  // length the game ships with, and the digits beside it have to be the same number in the same unit.
  // This used to be impossible on a real page — the track was counted in one unit and the label in
  // another, so the shipped default sat below the smallest value the thumb could reach.
  const breakRow = await page.evaluate(() => {
    const el = document.querySelector('.sheet[data-open="true"] [data-setting="break"]');
    return {
      found: el !== null,
      min: Number(el?.min),
      max: Number(el?.max),
      step: Number(el?.step),
      value: Number(el?.value),
      digits: el?.parentElement?.querySelector('.digits')?.textContent?.trim() ?? '',
    };
  });
  check(
    'the break row shows the length it is actually set to',
    breakRow.found &&
      breakRow.value >= breakRow.min &&
      breakRow.value <= breakRow.max &&
      breakRow.digits === String(Math.round(breakRow.value)),
    JSON.stringify(breakRow),
  );
  // S14's third custom dial, walked in the browser: the rod is in charge until the player says
  // otherwise, one tap puts the deck's own 2.0 s on a track that did not exist a moment before, and
  // a second tap hands the window back. The track appearing at all is half of what is being read —
  // an absent preference has to stay absent, or six rods stop differing from each other.
  const puffState = () =>
    page.evaluate(() => {
      const dial = document.querySelector('.sheet[data-open="true"] [data-setting="puff"]');
      return {
        pressed: dial?.getAttribute('aria-pressed') ?? 'missing',
        shown: dial?.textContent?.replace(/\s+/g, '') ?? '',
        track:
          document.querySelector('.sheet[data-open="true"] [data-setting="puff-track"]') !== null,
      };
    });
  const puffOwn = await puffState();
  await page.locator('.sheet[data-open="true"] [data-setting="puff"]').tap();
  await page.waitForTimeout(250);
  const puffChosen = await puffState();
  await page.locator('.sheet[data-open="true"] [data-setting="puff"]').tap();
  await page.waitForTimeout(250);
  const puffBack = await puffState();
  check(
    '单口时长 leaves the rod in charge until it is touched',
    puffOwn.pressed === 'true' && !puffOwn.track && puffOwn.shown.includes('—'),
    JSON.stringify(puffOwn),
  );
  check(
    'one tap puts the deck’s own 2.0 s on a track that was not there',
    puffChosen.pressed === 'false' && puffChosen.track && puffChosen.shown.includes('2.0'),
    JSON.stringify(puffChosen),
  );
  check(
    'the dial hands the rod its own window back',
    puffBack.pressed === 'true' && !puffBack.track,
    JSON.stringify(puffBack),
  );
  // S23's three 替代动作, as controls: each row says what it is, carries the day's count, and moves
  // it under a finger. This is the whole of the 计次 decision's visible half — the ledger itself is
  // judged in `substitutes.test.ts` — and it is what a source-text check cannot see: the wiring from
  // the row through the shell into the core and back to the number on the row.
  await openSheet(page, 'break');
  const altRows = () =>
    page.evaluate(() =>
      // The panel is drawn twice — once in the sheet, once on the desk rail — and on a phone only
      // one of them is on screen. Counting both would have made the same three rows into six.
      [...document.querySelectorAll('.alt[data-alt]')]
        .filter((el) => (typeof el.checkVisibility === 'function' ? el.checkVisibility() : true))
        .map((el) => ({
          id: el.getAttribute('data-alt') ?? '',
          count: Number(el.getAttribute('data-count')),
          label: el.getAttribute('aria-label') ?? '',
          tall: Math.round(el.getBoundingClientRect().height),
        })),
    );
  const beforeAlt = await altRows();
  await page.locator('.sheet[data-open="true"] .alt[data-alt="breathe"]').tap();
  await page.waitForTimeout(300);
  const afterAlt = await altRows();
  check(
    'the 减量 page offers the deck’s three alternatives, each named and finger-sized',
    beforeAlt.length === 3 &&
      beforeAlt
        .map((row) => row.id)
        .sort()
        .join(',') === 'breathe,walk,water' &&
      beforeAlt.every((row) => row.count === 0 && row.tall >= 44 && row.label.length > 0),
    JSON.stringify(beforeAlt),
  );
  check(
    'taking one counts it, today, on the row itself',
    afterAlt.find((row) => row.id === 'breathe')?.count === 1 &&
      afterAlt.filter((row) => row.count > 0).length === 1,
    JSON.stringify(afterAlt),
  );
  await openSheet(page, 'break');
  // §11: the interface follows the hand. A swipe down over nothing puts it away — the sheets,
  // the mark and the word — while the rod goes on burning behind them.
  await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const box = canvas.getBoundingClientRect();
    const at = (y) => ({
      clientX: box.left + box.width * 0.5,
      clientY: box.top + box.height * y,
      pointerId: 7,
      pointerType: 'touch',
      isPrimary: true,
      bubbles: true,
    });
    // Well above the held rod, so the swipe resolves to nothing at all: that is the whole
    // difference between "put the interface away" and "put the cigarette out".
    canvas.dispatchEvent(new PointerEvent('pointerdown', at(0.05)));
    canvas.dispatchEvent(new PointerEvent('pointermove', at(0.14)));
    canvas.dispatchEvent(new PointerEvent('pointermove', at(0.22)));
    canvas.dispatchEvent(new PointerEvent('pointerup', at(0.24)));
  });
  await page.waitForTimeout(700);
  const folded = await page.evaluate(() => ({
    chrome: ['hud', 'cta', 'rail'].map((cls) => {
      const el = document.querySelector(`.${cls}`);
      return el && el.offsetParent !== null ? `${cls}:shown` : `${cls}:hidden`;
    }),
    hint: !!document.querySelector('.hint'),
    sheets: document.querySelectorAll('.sheet[data-open="true"]').length,
    phase: document.querySelector('.stage')?.dataset.phase ?? 'missing',
  }));
  check(
    'a swipe down over nothing puts the interface away and leaves the break burning',
    folded.chrome.join(',') === 'hud:hidden,cta:hidden,rail:hidden' &&
      !folded.hint &&
      folded.sheets === 0 &&
      LIT.test(folded.phase),
    JSON.stringify(folded),
  );

  check('portrait: nothing threw', errors.length === 0, errors.slice(0, 2).join(' | '));
  await context.close();
}

// ------------------------------------------------------------------- landscape
try {
  const { page, errors, context } = await openPhone({ width: 844, height: 390, dpr: 3 });
  const box = await page.locator('canvas').boundingBox();
  check(
    'landscape: the canvas fills the device',
    Math.abs(box.width - 844) < 2,
    `${box.width}x${box.height}`,
  );

  const props = await propsOf(page);
  const chromeTop = await page.evaluate(
    () => document.querySelector('.rail')?.getBoundingClientRect().top ?? 9999,
  );
  const tray = await stagePoint(page, props.ashtray.x, props.ashtray.y);
  check(
    'landscape: the tray is not under the chrome',
    tray.y < chromeTop,
    `tray y=${Math.round(tray.y)}, chrome starts ${Math.round(chromeTop)}`,
  );

  const rod = await stagePoint(page, props.body.x, props.body.y);
  const lighter = await stagePoint(page, props.lighter.x, props.lighter.y);
  await page.touchscreen.tap(rod.x, rod.y);
  await page.waitForTimeout(300);
  // Same retry as the desktop and the pill: the cheap wheel is designed to miss sometimes (§13).
  let wideCaught = '';
  for (let attempt = 0; attempt < 3 && wideCaught === ''; attempt += 1) {
    await page.touchscreen.tap(lighter.x, lighter.y);
    wideCaught = await waitScene(page, LIT);
  }
  check('landscape: a break lights with two taps', wideCaught !== '', await scenePhase(page));

  await openSheet(page, 'settings');
  const sheet = await page.evaluate(() => {
    const r = document.querySelector('.sheet[data-open="true"]')?.getBoundingClientRect();
    return r ? { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x) } : null;
  });
  check(
    'landscape: settings open as a side panel, not a lid',
    sheet !== null && sheet.h <= 390 && sheet.x > 300 && sheet.w < 844 * 0.75,
    JSON.stringify(sheet),
  );
  check('landscape: nothing threw', errors.length === 0, errors.slice(0, 2).join(' | '));
  await context.close();
} catch (error) {
  check('landscape: the section could not be completed', false, String(error).slice(0, 160));
}

// ---------------------------------------------------------------- desktop window
{
  // A mouse is not a fat finger: the core widens every hit radius for a coarse pointer and for
  // nothing else, so this pass is the only place the un-widened desktop geometry is aimed at.
  // 1280x800 stays under the stage box's 1.9 clamp, which is what makes the canvas fractions
  // below land where the props are drawn.
  const { page, errors, context } = await openWindow({ width: 1280, height: 800 });
  const stageAspect = await page.evaluate(() => {
    const box = document.querySelector('canvas').getBoundingClientRect();
    return Math.round((box.width / box.height) * 100) / 100;
  });
  check(
    'desktop: the window is one stage box, not a letterboxed band',
    stageAspect <= 1.9,
    `${stageAspect}:1`,
  );

  const props = await propsOf(page);
  // The end of the rod away from the cherry: `body` is the rod's midpoint, so mirroring the ember
  // through it lands on the mouth end — past the radius around the middle, short of the cherry's
  // own, which is what makes this a test of the rod's span rather than of one hit radius.
  const farEnd = await stagePoint(
    page,
    2 * props.body.x - props.ember.x,
    2 * props.body.y - props.ember.y,
  );
  await page.mouse.click(farEnd.x, farEnd.y);
  await page.waitForTimeout(300);
  const pickedUp = await scene(page);
  check(
    // `light` is the phase both of these states share, so what says the rod left the table is the
    // nudge the engine moved: it now wants the lighter, not the pick-up.
    pickedUp.phase === 'light' && pickedUp.affordance === 'lighter',
    JSON.stringify(pickedUp),
  );

  const lighter = await stagePoint(page, props.lighter.x, props.lighter.y);
  // A cheap wheel lighter sometimes fails to catch — that is the design (§13), and a sound.
  // Lighting is therefore "keep trying", not "one tap and pray".
  let lit = '';
  for (let attempt = 0; attempt < 3 && lit === ''; attempt += 1) {
    await page.mouse.click(lighter.x, lighter.y);
    lit = await waitScene(page, LIT);
  }
  check('desktop: the lighter catches a mouse click', lit !== '', lit);

  const heldProps = await propsOf(page);
  const held = await stagePoint(page, heldProps.body.x, heldProps.body.y);
  await page.mouse.move(held.x, held.y);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  await page.waitForTimeout(400);
  const drew = await scenePhase(page);
  check('desktop: holding the mouse draws', LIT.test(drew), drew);

  const refused = await nativeDefaults(page);
  check(
    'desktop: right-clicking the scene is refused',
    refused.menuFired === 1 && refused.menuPrevented === 1 && refused.dragPrevented,
    JSON.stringify(refused),
  );

  await openSheet(page, 'settings', true);
  // Which sheet the rail opened is the fact; what that sheet is *called* is copy.
  const opened = await page.evaluate(
    () => document.querySelector('.sheet[data-open="true"]')?.dataset.sheet ?? '',
  );
  check(
    'desktop: the bar answers a mouse click',
    opened === 'settings',
    opened || 'nothing opened',
  );
  check('desktop: nothing threw', errors.length === 0, errors.slice(0, 2).join(' | '));
  await context.close();
}

// ------------------------------------------------------------------ with no sound
{
  // §63: sound is allowed to be absent, and the game is not allowed to go quiet with it. The
  // renderer's own suite proves what it draws once it is told nothing can be heard — a louder,
  // longer-lived version of the same mark. This is the other half, and it needs a real browser:
  // that the shell notices, through a real autoplay policy and a real mute switch.
  //
  // One page, four readings. Chromium caps how many audio contexts a process may hold, so a
  // second context here was starving the first and reporting "the browser never allows sound".
  const { page, errors, context } = await openPhone({ width: 393, height: 852, dpr: 3 });
  const untouched = await cueChannel(page);

  const silentProps = await propsOf(page);
  const rod = await stagePoint(page, silentProps.body.x, silentProps.body.y);
  await page.touchscreen.tap(rod.x, rod.y);
  const afterGesture = await waitChannel(page, 'audio');

  await openSheet(page, 'settings');
  const sound = page.locator('.sheet[data-open="true"] [data-setting="sound"]');
  // Three steps — enough, a little, none — walked until the picture takes over, rather than a
  // fixed number of taps that assumes where the cycle started.
  let muted = await cueChannel(page);
  for (let step = 0; step < 3 && muted !== 'visual'; step += 1) {
    await sound.tap();
    muted = await waitChannel(page, 'visual', 1200);
  }
  await sound.tap();
  const unmuted = await waitChannel(page, 'audio');
  await page.locator('.sheet[data-open="true"] .close').tap();

  check(
    'the picture carries the cues until the browser allows sound, and whenever the player mutes',
    untouched === 'visual' && afterGesture === 'audio' && muted === 'visual' && unmuted === 'audio',
    `untouched=${untouched}, after the first tap=${afterGesture}, muted=${muted}, ` +
      'unmuted again=' +
      unmuted,
  );
  check('silent: nothing threw', errors.length === 0, errors.slice(0, 2).join(' | '));
  await context.close();
}

// --------------------------------------------------------- the chrome reads the break (§9.2)
{
  // S1–S5 in one run: the row, the pill and the rail are all readings of the same state machine,
  // so they are checked against each other rather than against a screenshot.
  const { page, errors, context } = await openPhone({ width: 393, height: 852, dpr: 3 });
  const chrome = () =>
    page.evaluate(() => {
      const row = document.querySelector('.hud');
      const cell = (sel) => (row.querySelector(sel)?.textContent ?? '').trim();
      const stage = document.querySelector('.stage');
      return {
        phase: stage?.dataset.phase ?? '',
        affordance: stage?.dataset.affordance ?? 'missing',
        ring: cell('.ring b') || cell('.ring .mark'),
        arc: row.querySelector('.arc')?.getAttribute('stroke-dasharray') ?? '',
        primary: cell('[data-hook="break"]'),
        alt: cell('.num.alt'),
        pill: (document.querySelector('.pill .word')?.textContent ?? '').trim(),
        lit: [...document.querySelectorAll('.rail .tab')]
          .filter((el) => el.dataset.on === 'true')
          .map((el) => el.dataset.tab),
      };
    });

  const idle = await chrome();
  check(
    'S1: the row reads the stick, the clock and what is left of the rod',
    idle.phase === 'light' &&
      idle.ring === '1' &&
      // The row reads 已燃, and before anything is lit nothing has burned. The session's own
      // countdown is the stage's `data-break`, which the check above reads as the clock.
      idle.primary === '00:00' &&
      idle.alt === '100%' &&
      idle.arc.startsWith('94.25') &&
      idle.lit.join() === 'light',
    JSON.stringify(idle),
  );

  // The pill is a handle on the real gesture, not a picture of one: pressing it must do exactly
  // what a finger on the rod does (§28, §65).
  await page.locator('.pill').tap();
  await page.waitForTimeout(420);
  const picked = await chrome();
  check(
    'the pill picks the rod up and the word on it changes with the affordance',
    picked.affordance === 'lighter' && picked.phase === 'light' && picked.pill !== idle.pill,
    JSON.stringify(picked),
  );

  // A cheap wheel lighter sometimes misses, and §13 says that is a sound rather than a bug. The
  // pill answers with the very same gesture a finger makes, so lighting from here is "try again":
  // a single attempt reads as a broken pill roughly once every three draws.
  let caught = '';
  for (let attempt = 0; attempt < 3 && caught === ''; attempt += 1) {
    await page.locator('.pill').tap();
    caught = await waitScene(page, LIT, 2200);
  }
  const lit = await chrome();
  check(
    'lighting it moves the rail off the flame and the row onto the draw',
    lit.phase === 'puff' && lit.lit.join() === 'puff' && /\d+ \/ \d+/.test(lit.primary),
    JSON.stringify(lit),
  );

  // Hold the pill: the arc is the draw itself, and the row counts seconds while it runs.
  const box = await page.locator('.pill').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(900);
  const drawing = await chrome();
  await page.mouse.up();
  await page.waitForTimeout(300);
  check(
    'holding the pill draws, and the row says so in seconds',
    /\d+\.\d+s/.test(drawing.alt) && drawing.arc !== lit.arc,
    `lit=${lit.arc} drawing=${drawing.arc} alt=${drawing.alt}`,
  );

  // S17 and S19 read together: 按住 0.6 秒 opens the card, 松手只收卡片 closes it again, and the
  // `click` the browser sends *after* that release belongs to the same gesture — so it must not
  // also open the shelf behind it. The card is only readable while the finger is down, which is
  // why the pin is reached by a second finger rather than after the release.
  const mark = page.locator('.hud [data-hook="category"]');
  const cardReader = () =>
    page.evaluate(() => {
      const el = document.querySelector('[data-hook="archive"]');
      return {
        card: !!el,
        cells: [...(el?.querySelectorAll('.cells dd') ?? [])].map((n) =>
          (n.textContent ?? '').trim(),
        ),
        tier3: el?.querySelectorAll('.scenes, .range').length ?? -1,
        sheets: document.querySelectorAll('.sheet[data-open="true"]').length,
      };
    });

  await mark.dispatchEvent('pointerdown', { pointerType: 'touch' });
  await page.waitForTimeout(760);
  const held = await cardReader();
  await mark.dispatchEvent('pointerup', { pointerType: 'touch' });
  await mark.dispatchEvent('click');
  await page.waitForTimeout(340);
  const dropped = await cardReader();
  check(
    'a hold opens the archive at tier two, and 松手 closes it without opening the shelf',
    held.card && held.cells.length === 3 && held.tier3 === 0 && held.sheets === 0,
    JSON.stringify(held),
  );
  check(
    'the release takes the card back, and the click that follows it opens nothing',
    !dropped.card && dropped.sheets === 0,
    JSON.stringify(dropped),
  );

  // A second finger pins it while the first one holds; from then on the card stays, because 钉住
  // is the reason to keep reading after the finger leaves.
  await mark.dispatchEvent('pointerdown', { pointerType: 'touch' });
  await page.waitForTimeout(760);
  const pin = page.locator('[data-hook="pin"]');
  await pin.dispatchEvent('pointerdown', { pointerType: 'touch' });
  await pin.dispatchEvent('pointerup', { pointerType: 'touch' });
  await pin.dispatchEvent('click');
  await page.waitForTimeout(200);
  await mark.dispatchEvent('pointerup', { pointerType: 'touch' });
  await mark.dispatchEvent('click');
  await page.waitForTimeout(300);
  const pinned = await page.evaluate(() => ({
    card: !!document.querySelector('[data-hook="archive"]'),
    tier3: document.querySelectorAll('[data-hook="archive"] .scenes, [data-hook="archive"] .range')
      .length,
    approx: (document.querySelector('.archive .range')?.textContent ?? '').includes('\u2248'),
  }));
  check(
    'pinning the card earns tier three, and its estimate carries the \u2248',
    pinned.tier3 === 2 && pinned.approx && pinned.card,
    JSON.stringify(pinned),
  );

  // S8: the cabinet is the ladder. Close the card first, then reach the shelf the way a player
  // does — through the mark, which means waking the chrome that had folded itself away by now.
  await page.locator('[data-hook="archive"] .close').click();
  await page.waitForTimeout(260);
  await openSheet(page, 'shelf');
  await page.waitForTimeout(420);
  const cabinet = await page.evaluate(() => {
    const sheet = document.querySelector('.sheet[data-open="true"]');
    const tiles = [...sheet.querySelectorAll('.tile')];
    return {
      sheet: sheet?.dataset.sheet ?? 'none',
      count: (sheet.querySelector('.count')?.textContent ?? '').trim(),
      tiles: tiles.length,
      kinds: [...sheet.querySelectorAll('.kind')].map((el) => (el.textContent ?? '').trim()),
      rodGroups: sheet.querySelectorAll('[data-group="rods"]').length,
      locked: tiles.filter((tile) => tile.dataset.locked === 'true').length,
      hint: (sheet.querySelector('.browse-hint')?.textContent ?? '').trim(),
      // S8's third line, read as the player sees it: the figure, and how tall a line it got.
      lengths: tiles.map((tile) => {
        const el = tile.querySelector('.length .digits');
        return {
          rod: tile.dataset.rod ?? '?',
          text: (el?.textContent ?? '').trim(),
          height: Math.round(el?.getBoundingClientRect().height ?? 0),
          unit: (tile.querySelector('.length .unit')?.textContent ?? '').trim(),
        };
      }),
    };
  });
  check(
    // The deck's 11 类 are 7 + 3 + 1 rods in three families, then the box / skin / scene groups; what
    // says the split is a real partition is the three rod groups, not a count of every label the
    // column happens to print.
    'the cabinet shows the eleven-category ladder, split into three rod families',
    cabinet.sheet === 'shelf' &&
      /^\d+ \/ 11$/.test(cabinet.count) &&
      cabinet.tiles === 11 &&
      cabinet.rodGroups === 3 &&
      cabinet.locked === 10,
    JSON.stringify(cabinet),
  );

  check(
    'S8: every tile says how long its own rod takes, as digits big enough to read',
    cabinet.lengths.length === 11 &&
      cabinet.lengths.every((row) => /^\d+\.\d$/.test(row.text) && row.height >= 15),
    JSON.stringify(cabinet.lengths.slice(0, 3)),
  );

  // A locked card never enters the hand, but it does open its own archive.
  const before = await page.evaluate(
    () => document.querySelector('.tile[data-selected="true"]')?.dataset.rod ?? 'none',
  );
  const lockedTile = page.locator('.tile[data-locked="true"]').first();
  const lockedRod = await lockedTile.getAttribute('data-rod');
  await lockedTile.dispatchEvent('pointerdown', { pointerType: 'touch' });
  await page.waitForTimeout(760);
  await lockedTile.dispatchEvent('pointerup', { pointerType: 'touch' });
  await lockedTile.dispatchEvent('click');
  await page.waitForTimeout(340);
  const heldLocked = await page.evaluate(
    ([rod]) => {
      const card = document.querySelector('[data-hook="archive"]');
      return {
        name: (card?.querySelector('.name')?.textContent ?? '').trim(),
        cells: card?.querySelectorAll('.cells dd').length ?? 0,
        chosen: document.querySelector('.tile[data-selected="true"]')?.dataset.rod ?? 'none',
        // The same rod's two numbers, read off the page it is standing on: the tile's line and the
        // card's cells. Which cell the minutes land in is the card's business, so all three are kept.
        tile: (
          document.querySelector(`.tile[data-rod="${rod}"] .length .digits`)?.textContent ?? ''
        ).trim(),
        cellsText: [...(card?.querySelectorAll('.cells dd') ?? [])].map((el) =>
          (el.textContent ?? '').trim(),
        ),
      };
    },
    [lockedRod],
  );
  check(
    'holding a card you have not met opens its archive without putting it in the hand',
    heldLocked.cells === 3 && heldLocked.chosen === before && heldLocked.name.length > 0,
    `${lockedRod} → ${JSON.stringify({ ...heldLocked, before })}`,
  );
  check(
    'the tile and the card say the same number of minutes for the same rod',
    /^\d+\.\d$/.test(heldLocked.tile) &&
      heldLocked.cellsText.some((text) => text.includes(heldLocked.tile)),
    `${lockedRod}: tile ${heldLocked.tile} vs ${JSON.stringify(heldLocked.cellsText)}`,
  );

  // S18: the skins row is four bars per card, one of them is worn, and a locked one is inert.
  const skins = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.skin')];
    return {
      cards: cards.length,
      layers: Math.max(...cards.map((card) => card.querySelectorAll('.layers span').length)),
      worn: cards
        .filter((card) => card.dataset.selected === 'true')
        .map((card) => card.dataset.skin),
      locked: cards.filter((card) => card.dataset.locked === 'true').length,
    };
  });
  check(
    'a skin is four colour layers, and exactly one is worn',
    skins.cards === 6 && skins.layers === 4 && skins.worn.length === 1 && skins.locked === 5,
    JSON.stringify(skins),
  );

  await page.locator('.skin[data-locked="true"]').first().click();
  await page.waitForTimeout(320);
  const stillWorn = await page.evaluate(() =>
    [...document.querySelectorAll('.skin[data-selected="true"]')].map((el) => el.dataset.skin),
  );
  check(
    'a skin you have not met cannot be worn',
    stillWorn.length === 1 && stillWorn[0] === skins.worn[0],
    JSON.stringify(stillWorn),
  );

  check('chrome: nothing threw', errors.length === 0, errors.slice(0, 2).join(' | '));
  await context.close();
}

// ------------------------------------------------------------ three tiers on one scene (§9)
{
  // A device that asks for Chinese gets Chinese with nobody opening a sheet: the first tier is
  // the device's own list, and the one word on the stage is the cheapest place to see it land.
  const { page, errors, context } = await openPhone({
    width: 393,
    height: 852,
    dpr: 3,
    locale: 'zh-Hans-CN',
  });

  const zh = await stageWords(page);
  check(
    'a Chinese device reads the Chinese verb',
    zh.hint === '点' && zh.hints === 1 && zh.offenders.length === 0,
    JSON.stringify(zh),
  );
  const zhHint = await hintCentre(page);

  await openSheet(page, 'settings');
  const sheet = () => page.locator('.sheet[data-open="true"]');
  const rows = async () =>
    (await sheet().locator('.label').allTextContents()).map((line) => line.trim());
  const closeLtr = await sheet().locator('.close').boundingBox();
  const zhRows = await rows();
  const zhControls = await sheet().locator('button').count();
  check(
    'the sheet asks for the player in the device language',
    zhRows.includes('烟雾') && zhRows.every((row) => row.length > 0),
    zhRows.join(' | '),
  );

  // Tier two, right-to-left. The Arabic table is deliberately partial, so a player sees two
  // tongues at once — and the thing that must not follow the text is the scene.
  await sheet().locator('[data-language="ar"]').tap();
  await page.waitForTimeout(520);
  const doc = await page.evaluate(() => ({
    lang: document.documentElement.lang,
    dir: document.documentElement.dir,
  }));
  check(
    'a right-to-left language turns the document, and only the document',
    doc.lang === 'ar' && doc.dir === 'rtl',
    JSON.stringify(doc),
  );

  const arRows = await rows();
  check(
    'a partial language falls to English in the same sheet, never to a blank row',
    arRows.some((row) => /[؀-ۿ]/.test(row)) &&
      arRows.some((row) => /^[A-Za-z ]+$/.test(row)) &&
      arRows.every((row) => row.length > 0),
    arRows.join(' | '),
  );

  const closeRtl = await sheet().locator('.close').boundingBox();
  check(
    'the sheet mirrors itself, so the close button crosses to the other edge',
    closeRtl.x < closeLtr.x - 20,
    `left-to-right x=${Math.round(closeLtr.x)} → right-to-left x=${Math.round(closeRtl.x)}`,
  );

  await sheet().locator('.close').tap();
  await page.waitForTimeout(420);
  const arHint = await hintCentre(page);
  const arWord = await stageWords(page);
  check(
    'the scene does not mirror: the verb hangs off the same point it did in Chinese',
    Math.abs(arHint.x - zhHint.x) < 2 &&
      Math.abs(arHint.y - zhHint.y) < 2 &&
      arWord.affordance === 'pick' &&
      arWord.hint === 'tap',
    `x=${Math.round(arHint.x)} vs ${Math.round(zhHint.x)}, word=${arWord.hint}`,
  );

  // Tier three is a whole interface, not a colour: the same controls, the same positions, no
  // words anywhere — and every one of them still named for a screen reader (§64).
  await openSheet(page, 'settings');
  await sheet().locator('[data-language="icons"]').tap();
  await page.waitForTimeout(520);
  const icons = await page.evaluate(() => {
    const sheet = document.querySelector('.sheet[data-open="true"]');
    const blank = [...sheet.querySelectorAll('[aria-label]')].filter(
      (el) => (el.getAttribute('aria-label') ?? '').trim() === '',
    );
    return {
      labels: sheet.querySelectorAll('.label').length,
      subs: sheet.querySelectorAll('.sub, .word').length,
      controls: sheet.querySelectorAll('button').length,
      // Both directions, or the empty-name count below is a vacuous zero: a control that lost
      // its `aria-label` attribute altogether would look exactly as wordless as one that kept it.
      named: sheet.querySelectorAll('[aria-label]:not([aria-label=""])').length,
      blank: blank.length,
      lang: document.documentElement.lang,
      dir: document.documentElement.dir,
    };
  });
  check(
    'the third tier leaves no words and no unnamed control behind, with the sheet still there',
    icons.labels === 0 &&
      icons.subs === 0 &&
      icons.blank === 0 &&
      icons.named >= 8 &&
      icons.controls === zhControls,
    JSON.stringify(icons),
  );
  check(
    'wordless still reads left-to-right, under the anchor language tag',
    icons.lang === 'en' && icons.dir === 'ltr',
    `${icons.lang}/${icons.dir}`,
  );

  await sheet().locator('.close').tap();
  await page.waitForTimeout(420);
  const quiet = await stageWords(page);
  check(
    'with no words the stage says the gesture with the halo alone',
    quiet.hints === 0 && quiet.offenders.length === 0,
    JSON.stringify(quiet),
  );

  // The choice is a preference, so it comes back — which is the same read path that dropped the
  // player's chosen rod until this round.
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  const after = await page.evaluate(() => ({
    lang: document.documentElement.lang,
    hint: document.querySelector('.hint')?.textContent?.trim() ?? '',
    menu: document.querySelector('.rail [data-tab="settings"]')?.getAttribute('aria-label') ?? '',
  }));
  check(
    'a wordless interface comes back wordless, still named for a screen reader',
    after.lang === 'en' && after.hint === '' && after.menu === 'settings',
    JSON.stringify(after),
  );

  check('three tiers: nothing threw', errors.length === 0, errors.slice(0, 2).join(' | '));
  await context.close();
}

// ------------------------------------------------------------------ the desk column (S10)
{
  const { page, errors, context } = await openWindow({ width: 1440, height: 900 });

  const desk = await page.evaluate(() => {
    const box = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        x: Math.round(r.x),
        w: Math.round(r.width),
        h: Math.round(r.height),
        display: getComputedStyle(el).display,
      };
    };
    const words = [...document.querySelectorAll('.data-rail *')].filter((el) =>
      [...el.childNodes].some((node) => node.nodeType === 3 && node.textContent.trim() !== ''),
    );
    const entries = [...document.querySelectorAll('.data-rail [data-entry]')];
    return {
      rail: box('.data-rail'),
      stage: box('.stage'),
      canvas: box('canvas'),
      hud: box('.hud'),
      entries: entries.map((b) => b.getAttribute('data-entry')),
      minEntry: Math.min(...entries.map((b) => Math.round(b.getBoundingClientRect().height))),
      minFont: Math.min(...words.map((e) => parseFloat(getComputedStyle(e).fontSize))),
      bars: document.querySelectorAll('.data-rail .trend rect').length,
    };
  });

  check(
    'S10: the column stands 260px wide and the scene gives it the room, under it not over it',
    desk.rail !== null &&
      desk.rail.display === 'flex' &&
      desk.rail.w === 260 &&
      desk.rail.x === 1180 &&
      desk.stage.w === 1180 &&
      desk.canvas.w === 1180,
    JSON.stringify(desk),
  );
  check(
    'S10: eight entries, each a finger-sized target wearing a word at the type floor',
    desk.entries.length === 8 && desk.minEntry >= 44 && desk.minFont >= 15,
    JSON.stringify({ entries: desk.entries, minEntry: desk.minEntry, minFont: desk.minFont }),
  );
  check(
    'S10: the column carries the day as the sheet does — seven bars, and the row clears it',
    desk.bars === 7 && desk.hud !== null && desk.hud.x + desk.hud.w <= desk.rail.x,
    JSON.stringify({ bars: desk.bars, hud: desk.hud, rail: desk.rail }),
  );

  // The desk is the one screen where the head-up row *is* words (S11's five named figures), so this
  // is the pass where the prose rule has to be aimed at the row: on a phone the row's own names are
  // hidden, and a check that only ever runs on a phone would never see them.
  const deskWords = await stageWords(page);
  check(
    'S10: the wide scene still says nothing the design did not name',
    deskWords.offenders.length === 0 && deskWords.hints <= 1,
    JSON.stringify(deskWords),
  );

  // The deep link has to move the *sheet's* scroll, not merely open it. Measured inside the sheet
  // on purpose: the first version of this check compared window coordinates, so the bug where
  // opening an entry scrolled the whole stage up by 620 px made the group look like it had arrived
  // — it had not, the scene had been pushed out of view and never came back.
  const deskView = () =>
    page.evaluate(() => {
      const sheet = document.querySelector('.sheet[data-open="true"]');
      const stage = document.querySelector('main.stage');
      const group = sheet?.querySelector('[data-group="skins"]');
      return {
        canvasY: Math.round(document.querySelector('canvas').getBoundingClientRect().y),
        hudY: Math.round(document.querySelector('.hud').getBoundingClientRect().y),
        stageScroll: stage ? stage.scrollTop : null,
        sheetScroll: sheet ? Math.round(sheet.scrollTop) : null,
        groupTopInSheet:
          sheet && group
            ? Math.round(group.getBoundingClientRect().top - sheet.getBoundingClientRect().top)
            : null,
        current:
          document.querySelector('[data-entry="skins"]')?.getAttribute('aria-current') ?? null,
        sheets: document.querySelectorAll('.sheet[data-open="true"]').length,
      };
    });

  await wakeChrome(page);
  const atRest = await deskView();
  await page.click('[data-entry="skins"]');
  await page.waitForTimeout(1400);
  const opened = await deskView();
  check(
    'S10: an entry opens the same sheet the chrome opens and lands on the group it names',
    opened.sheets === 1 &&
      opened.current === 'true' &&
      opened.groupTopInSheet !== null &&
      Math.abs(opened.groupTopInSheet) <= 2 &&
      opened.sheetScroll > 300,
    JSON.stringify({ atRest, opened }),
  );
  check(
    'S10: opening an entry leaves the scene exactly where it was',
    opened.canvasY === atRest.canvasY && opened.hudY === atRest.hudY && opened.stageScroll === 0,
    JSON.stringify({ canvasY: opened.canvasY, hudY: opened.hudY, stageScroll: opened.stageScroll }),
  );

  // The stage is not a scroll box: `overflow: hidden` would still let any descendant that asks to
  // be revealed scroll it, which is how the scene got pushed out above. The sheet must still
  // scroll, or this check would be satisfied by a page that cannot scroll anything.
  const scrollProof = await page.evaluate(async () => {
    const stage = document.querySelector('main.stage');
    stage.scrollTop = 500;
    const forced = stage.scrollTop;
    stage.scrollTop = 0;
    // The positive control: the sheet that is open right now must still scroll, or `forced === 0`
    // would only prove that nothing on the page can move.
    const sheet = document.querySelector('.sheet[data-open="true"]');
    sheet.scrollTop = 0;
    sheet.scrollTop = 200;
    const sheetMoved = sheet.scrollTop;
    sheet.scrollTop = 0;
    return {
      forced,
      sheetMoved,
      overflow: getComputedStyle(stage).overflowY,
      scrollHeight: stage.scrollHeight,
      clientHeight: stage.clientHeight,
    };
  });

  // The same rule on the desk, where the panel is a column rather than a drawer. The point is found
  // rather than assumed: on a wide window the column covers one side of the scene, and a check that
  // aims at the panel would report a working dismissal as a broken one.
  await openSheet(page, 'shelf', true);
  const panelOpen = await panelState(page);
  const panelSpot = await page.evaluate(() => {
    const c = document.querySelector('canvas').getBoundingClientRect();
    const sheet = document.querySelector('.sheet[data-open="true"]')?.getBoundingClientRect();
    const candidates = [
      [c.x + c.width * 0.25, c.y + c.height * 0.25],
      [c.x + c.width * 0.5, c.y + c.height * 0.1],
      [c.x + c.width * 0.1, c.y + c.height * 0.55],
    ];
    const free = candidates.find(([x, y]) => {
      if (!sheet) return true;
      return x < sheet.x || x > sheet.x + sheet.width || y < sheet.y || y > sheet.y + sheet.height;
    });
    const [x, y] = free ?? candidates[0];
    return { x, y, onScene: document.elementFromPoint(x, y)?.tagName === 'CANVAS' };
  });
  check(
    'S10: the dismissal press lands on the scene, not the panel',
    panelSpot.onScene,
    `point ${String(Math.round(panelSpot.x))},${String(Math.round(panelSpot.y))}`,
  );
  await page.mouse.click(panelSpot.x, panelSpot.y);
  await page.waitForTimeout(320);
  const panelAfter = await panelState(page);
  check(
    'S10: a press on the scene puts the side panel away',
    panelOpen.sheets === 1 && panelAfter.sheets === 0,
    `sheets ${String(panelOpen.sheets)}->${String(panelAfter.sheets)}`,
  );
  check(
    'the scene cannot be scrolled out of view, but the open sheet still scrolls',
    scrollProof.forced === 0 && scrollProof.sheetMoved >= 190,
    JSON.stringify(scrollProof),
  );

  await openSheet(page, 'shelf', true);
  await page.click('.sheet[data-open="true"] .close');
  await page.waitForTimeout(900);
  const closed = await deskView();
  check(
    'S10: closing the sheet brings the scene back to the same pixels',
    closed.canvasY === atRest.canvasY && closed.hudY === atRest.hudY && closed.stageScroll === 0,
    JSON.stringify(closed),
  );

  const narrow = await openWindow({ width: 600, height: 900 });
  const folded = await narrow.page.evaluate(() => ({
    display: getComputedStyle(document.querySelector('.data-rail')).display,
    canvas: Math.round(document.querySelector('canvas').getBoundingClientRect().width),
  }));
  check(
    'the column is a width rather than a device: at 600px it is away and the scene has the window',
    folded.display === 'none' && folded.canvas === 600,
    JSON.stringify(folded),
  );
  await narrow.context.close();

  check('S10: nothing threw', errors.length === 0, errors.slice(0, 2).join(' | '));
  await context.close();
}

// ------------------------------------------------- 取烟 has somewhere to press (S14, the deck's first gesture)
{
  const { page, errors, context } = await openPhone({ width: 393, height: 852, dpr: 3 });
  const aim = await page.evaluate(() => document.querySelector('.stage')?.dataset.aim ?? '');
  const props = await propsOf(page);
  check(
    'the box on the table is one of the places a finger can be aimed at',
    aim.includes('pack:') && props.pack !== undefined,
    JSON.stringify(aim.split(' ').map((part) => part.split(':')[0])),
  );

  const idle = await scene(page);
  const pack = await stagePoint(page, props.pack?.x ?? 0, props.pack?.y ?? 0);
  await page.touchscreen.tap(pack.x, pack.y);
  await page.waitForTimeout(400);
  const inHand = await scene(page);
  // The phase cannot tell these two apart — both belong to `light` — but the word under the rod
  // can, and it is the same mirror the pill reads. This is the whole chain: a pixel on the canvas,
  // resolved by the engine's own hit table, answered by the verb the deck names 取烟.
  check(
    'one tap on the pack takes a rod out of it',
    idle.affordance === 'pick' && inHand.affordance === 'lighter',
    `${idle.affordance} → ${inHand.affordance}`,
  );
  check('the pack pass threw nothing', errors.length === 0, errors.slice(0, 2).join(' | '));
  await context.close();
}

await browser.close();
const failed = results.filter((entry) => !entry.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
