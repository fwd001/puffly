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
 * Where the rod's paper is, read off the drawn canvas rather than off the state.
 *
 * The state can be checked for free (it is mirrored onto `.stage[data-aim]`), so this exists for the
 * one thing the state cannot prove: that nothing between the state and the pixels turned the scene
 * around.
 *
 * It was written twice, and the first version was blind in exactly the way it was meant to catch.
 * `getImageData` reads the canvas's *backing store*, and a CSS `transform: scaleX(-1)` flips what the
 * page composites without touching that buffer — so the injected counter-example (a right-to-left
 * rule that mirrors the canvas) passed the check while the player's screen was upside-side round.
 * What a player sees is therefore read two ways: the paper's position in the buffer, and every
 * transform the element carries on the way up to `<html>`.
 */
/** Any horizontal flip applied to the canvas by the page's own styles, at any ancestor level. */
const sceneFlip = (page) =>
  page.evaluate(() => {
    const offenders = [];
    for (let el = document.querySelector('canvas'); el; el = el.parentElement) {
      const matrix = getComputedStyle(el).transform;
      if (!matrix || matrix === 'none') continue;
      const nums = (matrix.match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/g) ?? []).map(Number);
      // A 2-D matrix reports [a, b, c, d] (and [e, f] for a 3-D one); `a < 0` with no shear is a
      // mirror, and it is the only way the scene gets turned around without the state knowing.
      if (nums.length >= 2 && nums[0] < 0 && Math.abs(nums[1]) < 0.01) {
        offenders.push(`${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''} ${matrix}`);
      }
    }
    return offenders;
  });

const paperMass = (page) =>
  page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let n = 0;
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    for (let y = 0; y < image.height; y += 2) {
      for (let x = 0; x < image.width; x += 2) {
        const i = (y * image.width + x) * 4;
        const r = image.data[i];
        const g = image.data[i + 1];
        const b = image.data[i + 2];
        // Paper: the one large object in the frame that is white in all three channels. The cherry
        // is orange (blue low) and the pill's glow is too, so neither joins the sample.
        if (r > 200 && g > 200 && b > 190) {
          n += 1;
          sumX += x;
          sumY += y;
          sumXY += x * y;
        }
      }
    }
    if (n < 50) return { n, meanX: 0, meanY: 0, tilt: 0 };
    const meanX = sumX / n;
    const meanY = sumY / n;
    return { n, meanX, meanY, tilt: sumXY / n - meanX * meanY };
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
      sheets: document.querySelectorAll('.sheet[data-open="true"]').length,
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
 * The interface folds itself away 2.6 s after the last input (§10, `controlsIdleMs` — measured: a
 * hint word held ~1.6 s of that window, then went with the rail and stayed gone until a press), so a
 * control that was there a moment ago can be `display: none` by the time a check reaches for it. A
 * press on empty sky wakes it without touching a prop: the upper-left of the stage is above every
 * anchor, and the shell sends a tap whatever it lands on, which is what resets the core's idle clock.
 *
 * The test is on **the control that is about to be pressed**, not on the rail. Waking the rail and
 * then tapping the head-up row is how two runs of this file died — once in Playwright's own 30 s
 * retry loop (`element is not visible`) and once with three sheet checks reading a state the wake had
 * not produced. Three presses then a named failure: a control that genuinely cannot be woken is a
 * product defect worth a message, not a half-minute of retries.
 */
async function wakeChrome(page, target = '.rail') {
  const control = page.locator(target);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (await control.isVisible().catch(() => false)) return;
    await page
      .locator('canvas')
      .click({ position: { x: 24, y: 24 }, force: true, noWaitAfter: true });
    await page.waitForTimeout(120);
  }
  throw new Error(`wakeChrome: ${target} stayed hidden through three presses on the sky`);
}

async function openSheet(page, id, mouse = false) {
  const selector = SHEET_HANDLE[id];
  await wakeChrome(page, selector);
  const handle = page.locator(selector);
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
  // Drawing on the rod left the scene nudging the next gesture, and the hint names it. This reading
  // is taken *first* among the post-breath checks, and that is the whole point: the chrome folds
  // itself 2.6 s after the last input (§10, `controlsIdleMs`) and the word goes away with it — a
  // probe run measured the word holding ~1.6 s and then leaving with the rail (`hints=0 rail=down`)
  // until a press brought it back. Sampling after two pixel reads put this line across that rule, and
  // it went red once in two runs; waking the chrome instead added a press and a second of waiting,
  // which pushed three later sheet checks off their timing. The word needs three things to be absent
  // (the setting off, the chrome folded, a sheet on top), so `sheets` travels with the reading.
  const words = await stageWords(page);
  check(
    'the screen carries no prose, and the hint still names the gesture being nudged',
    words.offenders.length === 0 && words.hints === 1 && words.affordance === 'puff',
    JSON.stringify(words),
  );
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
  /**
   * The shelf's four groups have to be one tap away on a phone, not two screens of scrolling away.
   *
   * The sheet has always contained 烟 / 盒 / 皮肤 / 配件 stacked vertically, and the machinery that
   * lands on one of them exists — the desk column uses it. What a phone never got was an entry that
   * names it: one button opens the sheet at the top, and a player who wants a skin scrolls past two
   * screens of rods with nothing saying the list continues. So this measures the burial first, then
   * asks for a jump and checks it actually landed.
   */
  await openSheet(page, 'shelf');
  const buried = await page.evaluate(() => {
    const sheet = document.querySelector('.sheet[data-open="true"]');
    const skins = sheet?.querySelector('[data-group="skins"]');
    if (!sheet || !skins) return { error: 'no sheet or no skins group' };
    return {
      jumps: sheet.querySelectorAll('[data-jump]').length,
      sheetHeight: sheet.clientHeight,
      skinsTop: Math.round(skins.getBoundingClientRect().top - sheet.getBoundingClientRect().top),
    };
  });
  console.log(`JUMPS buried ${JSON.stringify(buried)}`);
  check(
    'the skins group is out of sight until something is tapped — so the jump below is not free',
    buried.skinsTop > buried.sheetHeight,
    JSON.stringify(buried),
  );

  const jumps = await page.evaluate(() => {
    const sheet = document.querySelector('.sheet[data-open="true"]');
    const chips = [...sheet.querySelectorAll('[data-jump]')];
    const strip = chips[0]?.parentElement;
    const cs = strip === undefined ? null : getComputedStyle(strip);
    return {
      ids: chips.map((c) => c.getAttribute('data-jump')),
      tall: chips.map((c) => Math.round(c.getBoundingClientRect().height)),
      words: chips.map((c) => (c.textContent ?? '').trim().length),
      overflowX: cs?.overflowX ?? '',
      touchAction: cs?.touchAction ?? '',
    };
  });
  console.log(`JUMPS strip ${JSON.stringify(jumps)}`);
  check(
    'a phone gets one chip per group, each finger-sized and each named',
    jumps.ids.join(',') === 'rods,packs,skins,kit' &&
      jumps.tall.every((h) => h >= 44) &&
      jumps.words.every((w) => w > 0),
    JSON.stringify(jumps),
  );
  check(
    'the strip that carries them is allowed to be panned sideways, so a long word is reachable',
    jumps.overflowX === 'auto' && /pan-x|auto/.test(jumps.touchAction),
    JSON.stringify(jumps),
  );

  const tapJump = (id) =>
    page.evaluate((which) => {
      const chip = document
        .querySelector('.sheet[data-open="true"]')
        ?.querySelector(`[data-jump="${which}"]`);
      if (chip === null || chip === undefined) return false;
      chip.click();
      return true;
    }, id);

  /** Where a group sits relative to the bottom of the jump bar, in the sheet's own pixels. */
  const gapOf = (group) =>
    page.evaluate((which) => {
      const sheet = document.querySelector('.sheet[data-open="true"]');
      const bar = sheet?.querySelector('[data-jump]')?.parentElement;
      const el = sheet?.querySelector(`[data-group="${which}"]`);
      if (!sheet || !bar || !el) return null;
      return Math.round(el.getBoundingClientRect().top - bar.getBoundingClientRect().bottom);
    }, group);

  const tappedSkins = await tapJump('skins');
  await page.waitForTimeout(900);
  const landed = {
    tappedSkins,
    open: await page.evaluate(
      () => document.querySelector('.sheet[data-open="true"]')?.dataset.open === 'true',
    ),
    gap: await gapOf('skins'),
    current: await page.evaluate(
      () =>
        document
          .querySelector('.sheet[data-open="true"] [data-jump="skins"]')
          ?.getAttribute('aria-current') ?? '',
    ),
  };
  check(
    'tapping 皮肤 lands that group at the top of the sheet and leaves the sheet open',
    landed.tappedSkins &&
      landed.open &&
      landed.gap !== null &&
      Math.abs(landed.gap) <= 8 &&
      landed.current !== '',
    JSON.stringify(landed),
  );

  const tappedKit = await tapJump('kit');
  await page.waitForTimeout(900);
  const moved = { tappedKit, skinsGap: await gapOf('skins') };
  check(
    'and it moves again when asked for something else — the jump is not stuck on one group',
    moved.tappedKit && moved.skinsGap !== null && Math.abs(moved.skinsGap) > 8,
    JSON.stringify(moved),
  );

  /**
   * Nothing a phone player is shown may sit where a finger cannot reach it.
   *
   * A sheet pans vertically by finger, and its `touch-action: pan-y` refuses horizontal panning on
   * purpose — a sideways drag belongs to the stage, not to the panel. So a row wider than its sheet
   * is not a strip you can scroll: it is content parked out of reach. The same is true of a word
   * ended with an ellipsis, which is a name the player has no way to finish reading. Both shapes
   * were measured live on a 393 phone: the settings sheet stood 23px wider than its own box with
   * `scrollLeft` stuck at 0, and eight room names lost 7-57px of themselves to `text-overflow`.
   */
  const unreachable = () =>
    page.evaluate(() => {
      const sheet = document.querySelector('.sheet[data-open="true"]');
      if (sheet === null) return { error: 'no sheet open' };
      const cut = [];
      for (const el of sheet.querySelectorAll('*')) {
        const over = el.scrollWidth - el.clientWidth;
        if (over <= 1) continue;
        const cs = getComputedStyle(el);
        // A strip the finger is allowed to pan sideways is a legitimate design; say so and skip it.
        if (cs.overflowX === 'auto' && /pan-x|auto/.test(cs.touchAction)) continue;
        cut.push({
          path: `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]}`,
          over,
          ellipsis: cs.textOverflow === 'ellipsis',
          text: (el.textContent ?? '').trim().slice(0, 16),
        });
      }
      return {
        sheetOver: sheet.scrollWidth - sheet.clientWidth,
        count: cut.length,
        cut: cut.slice(0, 5),
      };
    });

  for (const which of ['settings', 'shelf']) {
    await openSheet(page, which);
    const read = await unreachable();
    console.log(`REACH ${which} ${JSON.stringify(read)}`);
    check(
      `${which}: nothing on the sheet is cut short or parked where a finger cannot reach`,
      read.sheetOver <= 1 && read.count === 0,
      JSON.stringify(read),
    );
  }

  // Positive control for the scan above: force a room name back onto one line and the same walk has
  // to see it. A guard that cannot be reddened by the thing it guards is not a guard.
  // The shelf is already open from the loop, and its handle is a toggle — pressing it again would
  // close the very sheet this is about to measure.
  if ((await page.locator('.sheet[data-open="true"]').count()) === 0)
    await openSheet(page, 'shelf');
  const control = await page.evaluate(() => {
    const style = document.createElement('style');
    style.textContent = '.room-name { white-space: nowrap !important; }';
    document.head.append(style);
    const sheet = document.querySelector('.sheet[data-open="true"]');
    const names = [...sheet.querySelectorAll('.room-name')];
    const over = names.map((n) => n.scrollWidth - n.clientWidth);
    const flagged = over.filter((d) => d > 1).length;
    style.remove();
    const after = [...sheet.querySelectorAll('.room-name')].map(
      (n) => n.scrollWidth - n.clientWidth,
    );
    return {
      names: names.length,
      flagged,
      maxForced: Math.max(...over, 0),
      maxRestored: Math.max(...after, 0),
    };
  });
  check(
    'the same scan sees a name forced onto one line, and lets go when the style is removed',
    control.names > 0 && control.flagged > 0 && control.maxForced > 1 && control.maxRestored <= 1,
    JSON.stringify(control),
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

  // S4 吐烟: the ring wears the strength of the draw that just ended, and the bar under the pill is
  // its legend. Both are read in one sample so a number and a position that disagree cannot pass.
  const readForce = () =>
    page.evaluate(() => {
      const digits = document.querySelector('.hud .ring .digits')?.textContent?.trim() ?? '';
      const bar = document.querySelector('.cta .art.force');
      const track = bar?.querySelector('.floor');
      const x1 = Number(track?.getAttribute('x1') ?? '-1');
      const x2 = Number(track?.getAttribute('x2') ?? '-1');
      return {
        phase: document.querySelector('.stage')?.dataset.phase ?? '',
        digits,
        mark: document.querySelector('.hud .ring .mark')?.textContent?.trim() ?? '',
        threads: bar ? bar.querySelectorAll('.thread').length : -1,
        lobes: bar ? bar.querySelectorAll('.lobe').length : -1,
        words: bar ? (bar.textContent ?? '').trim() : '',
        knob: Number(bar?.querySelector('.knob')?.getAttribute('cx') ?? '-1'),
        x1,
        x2,
      };
    });

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
  // Wait for the row's OWN clock before letting go: `advance()` runs one step per frame, so on a
  // loaded machine (this session: load 14–20) 900 ms of wall time can be a handful of simulated
  // milliseconds, and a press plus a release that land in the same frame buy no draw at all. The row
  // prints the hold as `3.2s`, which is the draw's own time — so that is what this waits on. If it
  // never appears, the checks below fail on their own numbers rather than on a guessed duration.
  try {
    await page.waitForFunction(
      () => {
        const text = (document.querySelector('.hud .num.alt')?.textContent ?? '').trim();
        return /\d+(\.\d+)?s$/.test(text) && Number(text.replace('s', '')) >= 1;
      },
      null,
      { timeout: 20_000, polling: 'raf' },
    );
  } catch {
    // No hold ever registered: leave it to the checks below to name that, with the values they read.
  }
  const drawing = await chrome();
  const heldForce = await readForce();
  await page.mouse.up();
  // The window is finite (`restSettleMs`), so this polls for the sample the deck is about rather than
  // sleeping a guessed number of milliseconds and reading whatever happens to be on screen.
  // The bar lives exactly as long as the settle window, which is simulated time: on a loaded machine
  // (this session measured load 12–16) a 900 ms window stretches over several seconds of wall clock, so
  // the wait is Playwright's own in-page raf poll rather than a Node loop of CDP round trips — each
  // round trip was itself eating the wall clock it was measuring. The read after it is a single
  // round trip inside a window that is several times longer than one.
  let exhale = null;
  let sighted = true;
  try {
    await page.waitForFunction(() => document.querySelector('.cta .art.force') !== null, null, {
      timeout: 10_000,
      polling: 'raf',
    });
  } catch {
    sighted = false;
  }
  if (sighted) exhale = await readForce();
  check(
    'holding the pill draws, and the row says so in seconds',
    /\d+\.\d+s/.test(drawing.alt) && drawing.arc !== lit.arc,
    `lit=${lit.arc} drawing=${drawing.arc} alt=${drawing.alt}`,
  );

  check(
    'S4: the exhale wears that draw’s force in the ring, and the bar says it without a word',
    heldForce.digits === '' &&
      heldForce.mark === '≡' &&
      exhale !== undefined &&
      /^\d+$/.test(exhale.digits) &&
      Number(exhale.digits) >= 1 &&
      Number(exhale.digits) <= 100 &&
      exhale.threads === 3 &&
      exhale.lobes === 3 &&
      exhale.words === '' &&
      Math.abs(
        exhale.knob - (exhale.x1 + (Number(exhale.digits) / 100) * (exhale.x2 - exhale.x1)),
      ) <= 0.7,
    `held=${JSON.stringify(heldForce)} sighted=${String(sighted)} ` +
      `exhale=${JSON.stringify(exhale ?? null)}`,
  );

  // 拍板 ① (2026-10-08): the press owns the draw, and each draw has a ceiling — so a finger that
  // never lifts still gets only one 口. The core pins the line itself; what only a real browser can
  // show is that the row the player reads follows the mouth off the rod, and that the release which
  // eventually comes does not buy a second count.
  //
  // Polled rather than timed: the ceiling is this rod's own draw window × 1.6, and the shipped rods
  // roll anywhere from 2.2 s to 4.2 s — a fixed wait would be measuring a guess. (The first version
  // waited 3.6 s and reported 1 → 1, which was the *rod* being wrong rather than the code.)
  //
  // 2026-10-09, known and unfixed here: this bound is 6 s of WALL clock while the thing it waits for
  // is up to 6.72 s of SIMULATED hold (4.2 × 1.6), so it cannot cover the longest rod even at a clean
  // 60 fps, and it reddens outright when frames drop (measured load 12–14.5 on this machine). Widening
  // it was tried and is the wrong shape of fix: the extra hold pushed a later tap past the 2.6 s idle
  // fold, and the suite died on an invisible element instead of reporting. The right fix is to stop
  // racing a held finger at all — set the player's own 单口时长 to its shortest detent first, so the
  // ceiling lands at ~1.6 s and the whole press fits inside one idle window. Tracked as #99.
  const countOf = (text) => Number(/^(\d+)\s*\//.exec(text)?.[1] ?? -1);
  const beforeCeiling = await chrome();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  let stillHeld = beforeCeiling;
  let waitedMs = 0;
  while (waitedMs < 6000 && countOf(stillHeld.primary) === countOf(beforeCeiling.primary)) {
    await page.waitForTimeout(150);
    waitedMs += 150;
    stillHeld = await chrome();
  }
  await page.mouse.up();
  await page.waitForTimeout(400);
  const afterRelease = await chrome();
  check(
    'a draw held past its ceiling ends itself, and the release afterwards buys nothing',
    countOf(stillHeld.primary) > countOf(beforeCeiling.primary) &&
      stillHeld.phase === 'puff' &&
      countOf(afterRelease.primary) === countOf(stillHeld.primary),
    `held=${beforeCeiling.primary} → ${stillHeld.primary} after ${String(waitedMs)}ms of wall clock ` +
      `(the row's own clock read ${stillHeld.alt}), released=${afterRelease.primary}`,
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
      // 「还没有」 in real pixels. The cell used to be dimmed whole, which took the room's name and its
      // 差几支 figure to 4.02:1 against the floor; the dim belongs on the colour chip and the words go
      // to the declared 次级色 (`--ash-gray`, 4.89 by `text-contrast.test.ts`).
      roomLook: (() => {
        const room = sheet.querySelector('.room[data-locked="true"]');
        const name = room?.querySelector('.room-name');
        const chip = room?.querySelector('.chip');
        return {
          colour: name ? getComputedStyle(name).color : 'no name rendered',
          roomOpacity: room ? Number(getComputedStyle(room).opacity) : -1,
          chipOpacity: chip ? Number(getComputedStyle(chip).opacity) : -1,
        };
      })(),
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

  // The dim moved onto the chip, so the name is the declared 次级色 and the cell itself is at full
  // strength. Reading it here matters because the CSS is a computed value: a whole-cell `opacity` and
  // a colour look the same in a source file and different in a browser.
  check(
    '图鉴: a locked cell dims its colour chip, not its name',
    cabinet.roomLook.roomOpacity === 1 &&
      Math.abs(cabinet.roomLook.chipOpacity - 0.45) < 0.02 &&
      cabinet.roomLook.colour === 'rgb(126, 126, 130)',
    JSON.stringify(cabinet.roomLook),
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
      presets: cards.map((card) => card.dataset.preset ?? '').filter((preset) => preset !== ''),
      selectedRoom: [...document.querySelectorAll('.room')]
        .filter((room) => room.dataset.selected === 'true')
        .map((room) => room.dataset.room ?? room.textContent.trim()),
    };
  });
  check(
    'a skin is four colour layers, and exactly one is worn',
    skins.cards === 6 && skins.layers === 4 && skins.worn.length === 1 && skins.locked === 5,
    JSON.stringify(skins),
  );

  // S17's 环境预设 (2026-10-08 拍板): one skin brings a place. What the browser can prove is that the
  // card says so, that wearing it is not an error, and that it cannot open a room the ladder has not
  // opened — so the claim is written as the space of allowed endings rather than one fixed outcome.
  const presetSkin = await page.evaluate(() => {
    const card = [...document.querySelectorAll('.skin')].find(
      (entry) => (entry.dataset.preset ?? '') !== '',
    );
    card?.click();
    return { id: card?.dataset.skin ?? '', preset: card?.dataset.preset ?? '' };
  });
  await page.waitForTimeout(420);
  const afterPreset = await page.evaluate(() => ({
    worn: [...document.querySelectorAll('.skin')]
      .filter((card) => card.dataset.selected === 'true')
      .map((card) => card.dataset.skin),
    // A room that is both selected and locked is the failure this exists to catch: it would mean a
    // colour opened a door the ladder had not.
    selectedLocked: [...document.querySelectorAll('.room')].filter(
      (room) => room.dataset.selected === 'true' && room.dataset.locked === 'true',
    ).length,
    selected: [...document.querySelectorAll('.room')].filter(
      (room) => room.dataset.selected === 'true',
    ).length,
  }));
  check(
    'S17: the skin that brings a place says which one, and wearing it never opens a locked door',
    skins.presets.length === 1 &&
      presetSkin.id !== '' &&
      presetSkin.preset !== '' &&
      afterPreset.worn.join() === presetSkin.id &&
      afterPreset.selected === 1 &&
      afterPreset.selectedLocked === 0,
    JSON.stringify({ ...skins, presetSkin, afterPreset }),
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
  const zhScene = await paperMass(page);
  const zhAim = await propsOf(page);

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

  // S24's own 反例验证: 「烟本身可以镜像，但『燃烧推进方向』建议保持物理正确，不做镜像，避免用户误判」.
  // Two halves, because a mirror can come from either side of the seam: the state's geometry (which
  // the page publishes) and the pixels (which the web layer is free to restyle).
  const arScene = await paperMass(page);
  const arAim = await propsOf(page);
  const zhLean = zhAim.ember.x - zhAim.body.x;
  const arLean = arAim.ember.x - arAim.body.x;
  console.log(
    `RTL zh n=${String(zhScene.n)} x=${zhScene.meanX.toFixed(1)} tilt=${zhScene.tilt.toFixed(0)} | ` +
      `ar n=${String(arScene.n)} x=${arScene.meanX.toFixed(1)} tilt=${arScene.tilt.toFixed(0)} | ` +
      `lean zh=${zhLean.toFixed(4)} ar=${arLean.toFixed(4)}`,
  );
  check(
    'right-to-left: the burning end stays on the same side, in the state and on the canvas',
    // The state's own numbers, byte for byte.
    Math.abs(zhLean - arLean) < 1e-4 &&
      zhLean > 0 &&
      // The drawn rod: the same place, and the same lean rather than its mirror image. A rod lying
      // at 6° has a tilt this side of a thousand pixels squared, and a flip turns it negative.
      Math.abs(arScene.meanX - zhScene.meanX) <= 2 &&
      Math.abs(arScene.meanY - zhScene.meanY) <= 2 &&
      Math.sign(arScene.tilt) === Math.sign(zhScene.tilt) &&
      Math.abs(zhScene.tilt) > 1000 &&
      // The half the buffer cannot see: a stylesheet is allowed to turn the composited picture
      // around, and this is the check that says it may not.
      (await sceneFlip(page)).length === 0 &&
      (await sceneFlip(page)).length === 0,
    `lean ${zhLean.toFixed(4)}→${arLean.toFixed(4)}, x ${zhScene.meanX.toFixed(1)}→${arScene.meanX.toFixed(1)}, tilt ${zhScene.tilt.toFixed(0)}→${arScene.tilt.toFixed(0)}, flipped=${JSON.stringify(await sceneFlip(page))}`,
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
      // S6's wordless carrier: the waveform icon and the bars it draws for the row's own level.
      waves: sheet.querySelectorAll('.wave-icon').length,
      bars: sheet.querySelectorAll('.wave-icon .bar').length,
      level: Number(
        document
          .querySelector('.wave-icon')
          ?.closest('.row')
          ?.querySelector('.digits')
          ?.textContent?.trim() ?? '-1',
      ),
    };
  });
  check(
    'the third tier leaves no words and no unnamed control behind, with the sheet still there',
    icons.labels === 0 &&
      icons.subs === 0 &&
      icons.blank === 0 &&
      icons.named >= 8 &&
      icons.controls === zhControls &&
      // The 触觉 row is either absent (no `navigator.vibrate`) or wearing its icon; and the bar count
      // is the level, read off the digits the same row shows.
      icons.waves === (icons.level >= 0 ? 1 : 0) &&
      icons.bars === Math.round((Math.max(0, icons.level) / 100) * 4),
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
    'with no words the stage says the gesture without any',
    quiet.hint === '' && quiet.offenders.length === 0,
    JSON.stringify(quiet),
  );

  // S15's other half, on the tier that has no words to lean on: the strip still has to say 按住, and it
  // says it as the diagram the deck asked for — the same shape the rod itself collapses into. Aimed off
  // the machine mirror, because in this tier there is nothing on screen to read.
  const aim = await propsOf(page);
  const rodSpot = await stagePoint(page, aim.body.x, aim.body.y);
  await page.touchscreen.tap(rodSpot.x, rodSpot.y);
  await page.waitForTimeout(260);
  const lamp = await stagePoint(page, aim.lighter.x, aim.lighter.y);
  let wordlessLit = '';
  for (let attempt = 0; attempt < 3 && wordlessLit === ''; attempt += 1) {
    await page.touchscreen.tap(lamp.x, lamp.y);
    wordlessLit = await waitScene(page, LIT);
  }
  await wakeChrome(page);
  const drawn = await page.evaluate(() => {
    const hint = document.querySelector('.hint');
    const d = hint?.querySelector('svg path')?.getAttribute('d') ?? '';
    const numbers = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
    const xs = numbers.filter((value, index) => index % 2 === 0);
    const ys = numbers.filter((value, index) => index % 2 === 1);
    return {
      affordance: document.querySelector('.stage')?.dataset.affordance ?? 'missing',
      words: (hint?.textContent ?? '').trim(),
      boxes: document.querySelectorAll('.hint svg').length,
      bowed: ys.filter((value) => value > 0.5 && value < 12.5).length,
      flat: ys.filter((value) => value === 0 || value === 13).length,
      waist: xs.filter((value) => value > 30 && value < 40).length,
      d,
    };
  });
  console.log(`HINTART ${JSON.stringify(drawn)}`);
  check(
    'the wordless tier carries the 纸面塌陷 diagram, and no word',
    wordlessLit !== '' &&
      drawn.affordance === 'puff' &&
      drawn.boxes === 1 &&
      drawn.words === '' &&
      drawn.bowed === 2 &&
      drawn.flat === 4 &&
      drawn.waist === 2,
    JSON.stringify(drawn),
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
  // Awake on both sides of the comparison. `atRest` was taken with the chrome up; once the sheet is
  // closed nothing holds it up any more, so 2.6 s of stillness folds the head-up row and its rect
  // goes to zero — which is the rule working, not the scene failing to come back. One run read it
  // the wrong way and reported `{"canvasY":0,"hudY":0,…,"sheets":0}` as a broken restore.
  await wakeChrome(page, '.hud');
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

// ------------------------------------------------------------------ the 成就 ladder (拍板 ⑤)
{
  // The ladder is the same four local numbers read as rungs, so the check is that the screen agrees
  // with the core table on a fresh save: nothing reached, and each axis showing what its first rung
  // costs. The goals are written here as the numbers the deck's pacing produces (25 分钟/天 × 60 天),
  // and `achievements.test.ts` judges that arithmetic in core — this is the row that proves the
  // shell is printing it rather than its own idea of a ladder.
  const { page, errors, context } = await openPhone({ width: 393, height: 852, dpr: 3 });
  await openSheet(page, 'break');
  const ladder = await page.evaluate(() => {
    const block = document.querySelector('[data-hook="achievements"]');
    return {
      present: !!block,
      rows: [...(block?.querySelectorAll('.line') ?? [])].map((row) => ({
        name: (row.querySelector('.name')?.textContent ?? '').trim(),
        count: (row.querySelector('.count')?.textContent ?? '').trim(),
      })),
    };
  });
  const axes = ladder.rows.filter((row) => /^\d+\/\d+ · \d+$/.test(row.count));
  console.log(`LADDER ${JSON.stringify(ladder.rows.map((row) => `${row.name}=${row.count}`))}`);
  check(
    '成就: the ladder is on the ledger screen, and its four rows are the core table',
    ladder.present &&
      ladder.rows[0]?.count === '0 / 23' &&
      axes.map((row) => row.count).join(' | ') === '0/5 · 13 | 0/5 · 150 | 0/5 · 4 | 0/5 · 125' &&
      axes.every((row) => row.name !== ''),
    JSON.stringify(ladder.rows.slice(0, 6)),
  );
  check('成就: nothing threw', errors.length === 0, errors.slice(0, 2).join(' | '));

  // The reveal, on real pixels rather than in the source. Two things the built app can answer and a
  // regex cannot: whether arriving on the ladder is silently treated as a batch of achievements
  // (nothing here should be animating the moment the sheet opens), and whether the styles that make
  // the two states visible actually reached the built CSS the phone is loading.
  const reveal = await page.evaluate(() => {
    const block = document.querySelector('[data-hook="achievements"]');
    const rows = [...(block?.querySelectorAll('.line') ?? [])];
    let fade = false;
    let gated = false;
    for (const sheet of Array.from(document.styleSheets)) {
      let rules;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }
      for (const rule of Array.from(rules)) {
        if (/prefers-reduced-motion/.test(rule.media?.mediaText ?? '')) {
          for (const inner of Array.from(rule.cssRules ?? [])) {
            if (/data-fresh/.test(inner.selectorText ?? '') && /none/.test(inner.cssText)) {
              gated = true;
            }
          }
        } else if (/data-fresh/.test(rule.selectorText ?? '') && /rung-lit/.test(rule.cssText)) {
          fade = true;
        }
      }
    }
    return {
      animating: rows.filter((row) => getComputedStyle(row).animationName !== 'none').length,
      marked: rows.filter((row) => row.getAttribute('data-fresh') === 'true').length,
      // 未抽到 reads as a colour, not a dim: the name has to stay on the AA 次级色, and an opacity
      // would have to be read off the whole row instead of off the word.
      moments: rows
        .filter((row) => row.classList.contains('moment'))
        .map((row) => getComputedStyle(row.querySelector('.name')).color),
      locked: rows
        .filter((row) => !row.classList.contains('moment'))
        .map((row) => Number(getComputedStyle(row).opacity)),
      fade,
      gated,
    };
  });
  console.log(`REVEAL ${JSON.stringify(reveal)}`);
  check(
    '成就: opening the ladder reveals nothing',
    reveal.animating === 0 && reveal.marked === 0,
    `animating=${String(reveal.animating)} marked=${String(reveal.marked)}`,
  );
  check(
    '成就: a gust that was never drawn reads as 还没有, and nothing on the row is dimmed',
    reveal.moments.length > 0 &&
      reveal.moments.every((colour) => colour === 'rgb(126, 126, 130)') &&
      reveal.locked.every((value) => value === 1),
    `moments=${String(reveal.moments)} plain=${String(reveal.locked)}`,
  );
  check(
    '成就: the built style sheet carries the fade and its reduced-motion gate',
    reveal.fade && reveal.gated,
    `fade=${String(reveal.fade)} gated=${String(reveal.gated)}`,
  );
  await context.close();
}

// ------------------------------------------- the 3D stage, on both backends (SPEC §76 rewrite)
//
// The scene is opt-in (`?scene=3d`), and the acceptance is "两条后端出帧": whatever the machine has
// faces the default path, and `&gl=1` must land on the WebGL2 backend rather than silently using
// WebGPU anyway. The digits' check is the atlas's own — the DOM's ink is transparent under the
// flag, so a bright pixel inside the clock's box is the scene's text and nothing else.
{
  const context = await browser.newContext({ viewport: { width: 393, height: 852 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (event) => errors.push(String(event).slice(0, 120)));
  for (const [label, query, wanted] of [
    ['default', '?scene=3d', null],
    ['forced WebGL2', '?scene=3d&gl=1', 'webgl2'],
  ]) {
    await page.goto(`${URL_ARG}${query}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2600);
    const before = await page.evaluate(() => window.__pufflyScene?.frames ?? -1);
    await page.waitForTimeout(700);
    const state = await page.evaluate(() => ({
      frames: window.__pufflyScene?.frames ?? -1,
      backend: window.__pufflyScene?.backend ?? '',
    }));
    check(
      `3D: the ${label} path renders frames`,
      state.frames > before + 5,
      `frames ${String(before)}→${String(state.frames)}, backend=${state.backend}`,
    );
    if (wanted !== null) {
      check(`3D: ${label} reports the ${wanted} backend`, state.backend === wanted, state.backend);
    } else {
      check(
        '3D: the default path took one of the two backends',
        state.backend === 'webgpu' || state.backend === 'webgl2',
        state.backend,
      );
    }
  }
  const shot = await page.screenshot();
  const digits = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const box = [100, 16, 55, 24];
    const d = ctx.getImageData(box[0], box[1], box[2], box[3]).data;
    let max = 0;
    const inked = new Set();
    for (let i = 0; i < d.length; i += 4) {
      const level = Math.max(d[i], d[i + 1], d[i + 2]);
      max = Math.max(max, level);
      if (level > 120) inked.add(Math.floor(i / 4 / box[2]));
    }
    const clock = document.querySelector('.hud .num');
    return {
      max,
      rows: inked.size,
      fontSize: clock === null ? -1 : Number.parseFloat(getComputedStyle(clock).fontSize),
    };
  }, shot.toString('base64'));
  check(
    '3D: the clock is drawn by the scene (bright pixels inside its box)',
    digits.max >= 180,
    `max ${String(digits.max)}`,
  );
  // §8's 字号换算: S19's old "数字 ≥15px" was a DOM reading; under the rewrite the digits' *ink*
  // has to land at that size on the glass. The clock's font is 15 px and its ink measures 12 rows
  // (0.8 life-size — digit figures); the bounds are that measurement with slack for anti-aliasing.
  // |control|: halving every run mesh's y scale drops this to ~6 and must redden it.
  check(
    "3D: the clock's ink lands at the DOM font's own size (the ≥15 px conversion)",
    digits.rows >= 9 && digits.rows <= 15 && digits.fontSize >= 15,
    `ink rows ${String(digits.rows)} of a ${String(digits.fontSize)}px font (max ${String(digits.max)})`,
  );
  // S19's card, held open: the runs sit nearer than every chrome plate (`RUN_TEXT_Z`) and the DOM
  // copy gives up its ink — `animation: none` first, because the card's own 220 ms arrival outranks
  // a static opacity in the cascade. Both mutations measured: pushing the runs back behind the
  // plate dims the name to 103, and putting the arrival animation back lifts the DOM to opacity 1.
  const mark = await page.locator('.hud [data-hook="category"]').boundingBox();
  await page.mouse.move(mark.x + mark.width / 2, mark.y + mark.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(950);
  const heldShot = await page.screenshot();
  const card = await page.evaluate(async (b64) => {
    const el = document.querySelector('[data-hook="archive"]');
    if (el === null) return { opacity: 'missing', name: 0 };
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const r = el.querySelector('.name').getBoundingClientRect();
    const d = ctx.getImageData(
      Math.round(r.left) - 2,
      Math.round(r.top) - 2,
      Math.round(r.width) + 4,
      Math.round(r.height) + 4,
    ).data;
    let max = 0;
    for (let i = 0; i < d.length; i += 4) max = Math.max(max, d[i], d[i + 1], d[i + 2]);
    return { opacity: getComputedStyle(el).opacity, name: max };
  }, heldShot.toString('base64'));
  await page.mouse.up();
  check(
    "3D: the held card's DOM copy gives up its ink (a static mask beats the arrival animation)",
    card.opacity === '0',
    `computed opacity ${card.opacity}`,
  );
  check(
    "3D: the card's name is painted by the scene, over its own plate",
    card.name >= 170,
    `name max ${String(card.name)}`,
  );
  // The room's dust is always on — the painted layer's 26 motes per venue, through the same
  // `dustMotes`, so a talk of weather never switches it off.
  const dustCount = await page.evaluate(() => {
    const ctx = window.__pufflyScene.context;
    const scene = 'value' in ctx.scene ? ctx.scene.value : ctx.scene;
    let dust = -1;
    scene.traverse((o) => {
      if (o.name === 'dust') dust = o.count;
    });
    return dust;
  });
  check(
    "3D: the room's dust motes are drawn (the always-on half of the air)",
    dustCount > 0,
    `dust ${String(dustCount)}`,
  );
  // S2's ignition: the flame on the lighter, from the same metrics the painted layer draws it
  // with (`flameMetrics`). Read as a state pair rather than pixels — the flame's screen size and
  // place move with the sim's flicker, and a fixed band once read the *hint word* instead — while
  // the pixel evidence lives in the probe notes: 223 in the flame's band, 41 with the mesh
  // hidden. The flame mesh is the only one whose texture is 2 px wide. |control|: hiding that
  // mesh makes `lit` false and reddens this.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const affordance = await page.evaluate(
      () => document.querySelector('.stage')?.dataset.affordance ?? '',
    );
    if (affordance === 'lighter') break;
    await page.locator('.pill').click();
    await page.waitForTimeout(650);
  }
  const flameRead = () =>
    page.evaluate(() => {
      const ctx = window.__pufflyScene.context;
      const scene = 'value' in ctx.scene ? ctx.scene.value : ctx.scene;
      let visible = false;
      let lid = 0;
      scene.traverse((o) => {
        if (o.isMesh && o.material?.map?.image?.width === 2) visible = visible || o.visible;
        if (o.name === 'lighter-lid') lid = o.rotation.x;
      });
      return { visible, lid };
    });
  const flameIdle = await flameRead();
  await page.locator('.pill').click();
  await page.waitForTimeout(220);
  const flameLit = await flameRead();
  // The flint's sparks arrive on the sim's own clock (~1 s after the strike here), so this waits
  // for the pass rather than sampling at a guessed moment; the streaks themselves were probe-
  // checked (7 of them, short dashes off the chimney).
  const sparksSeen = await page
    .waitForFunction(
      () => {
        const ctx = window.__pufflyScene.context;
        const scene = 'value' in ctx.scene ? ctx.scene.value : ctx.scene;
        let count = 0;
        scene.traverse((o) => {
          if (o.name === 'sparks') count = o.count;
        });
        return count > 0;
      },
      null,
      { timeout: 4000, polling: 'raf' },
    )
    .then(() => true)
    .catch(() => false);
  // The same strike throws the cap open — `lighter.lid` through LID_THROW_DEG (78°), one input,
  // same as the painted cap. Measured at this sample: −1.24 of −1.36 rad; shut again by rest.
  check(
    "3D: the ignition's flame, open cap and sparks are drawn by the scene (S2)",
    !flameIdle.visible && flameLit.visible && flameLit.lid < -0.5 && sparksSeen,
    `idle=${String(flameIdle.visible)} lit=${String(flameLit.visible)} lid=${flameLit.lid.toFixed(2)} sparks=${String(sparksSeen)}`,
  );
  // The plume's rung on the ladder: the pool's `depth` is simulation (0.25..1), not a z. The first
  // version handed it to the scene right after 0.02, so every puff sat at 0.3..1.0 — in front of
  // the whole chrome ladder (0.034..0.10), and a plume crossing the HUD painted over it, which the
  // canvas can never do because the chrome is DOM above it. `particleZ` now keeps the near half at
  // 0.021..0.03 (under the chrome's first plate, over the flame's 0.02) and sends the far half
  // behind the props (table's front face is −0.25). |control|: putting `0.02 + depth` back reads
  // ~1.0 here and reddens this.
  const plumeZ = await page
    .waitForFunction(
      () => {
        const ctx = window.__pufflyScene.context;
        const scene = 'value' in ctx.scene ? ctx.scene.value : ctx.scene;
        let node = null;
        scene.traverse((o) => {
          if (o.name === 'smoke') node = o;
        });
        if (node === null || node.count === 0) return null;
        const arr = node.instanceMatrix.array;
        let max = -Infinity;
        let min = Infinity;
        for (let i = 0; i < node.count; i += 1) {
          const z = arr[i * 16 + 14];
          if (z > max) max = z;
          if (z < min) min = z;
        }
        return { count: node.count, min, max };
      },
      null,
      { timeout: 8000, polling: 120 },
    )
    .then((handle) => handle.jsonValue())
    .catch(() => null);
  check(
    '3D: the plume sits on the ladder, under the chrome — depth is simulation, not a z',
    plumeZ !== null && plumeZ.max < 0.032 && plumeZ.min >= -0.2,
    `count ${String(plumeZ?.count ?? 'none')} z ${plumeZ === null ? 'none' : `${plumeZ.min.toFixed(3)}..${plumeZ.max.toFixed(3)}`}`,
  );
  // The rain pass is wired (`rainLines` shared with the canvas, one streak per instance) and obeys
  // the field's own gate: this profile stands indoors (quiet-room declares no sky), so it draws
  // nothing — the same answer the canvas gives. The positive arm lives in `rain-fall.test.ts`,
  // where the same helper is measured through the same pixels; the nearest sky-visible venue is
  // smoking-corner at unlock level 3 (balcony is 18, rainy-window 10) and this suite's profile
  // cannot reach one — see §12.
  const rainCount = await page.evaluate(() => {
    const ctx = window.__pufflyScene.context;
    const scene = 'value' in ctx.scene ? ctx.scene.value : ctx.scene;
    let count = -1;
    scene.traverse((o) => {
      if (o.name === 'rain') count = o.count;
    });
    return count;
  });
  check(
    '3D: the rain pass is wired and gated — an indoor profile draws no streaks',
    rainCount === 0,
    `rain count ${String(rainCount)}`,
  );
  // The film grain: one plane wearing the painted layer's own tile (`createGrainTile`), at the
  // shared `grainAlpha`. quiet-room declares grain 0.5, so the floor here is the formula's own
  // 0.5 × 0.09 = 0.045 (band-pinned, not equality: the venue's number is content). |control|:
  // widening `grainAlpha` to `grain * 0.9` reads 0.45 and reddens this.
  const grain = await page.evaluate(() => {
    const ctx = window.__pufflyScene.context;
    const scene = 'value' in ctx.scene ? ctx.scene.value : ctx.scene;
    let found = null;
    scene.traverse((o) => {
      if (o.name === 'grain') {
        found = {
          visible: o.visible,
          opacity: o.material?.opacity ?? -1,
          repeatX: o.material?.map?.repeat?.x ?? -1,
        };
      }
    });
    return found;
  });
  check(
    '3D: the film grain is on the scene, at the shared amount (S23/§56)',
    grain !== null &&
      grain.visible &&
      grain.opacity > 0 &&
      grain.opacity <= 0.14 &&
      grain.repeatX > 1,
    grain === null
      ? 'no grain mesh'
      : `visible ${String(grain.visible)} opacity ${grain.opacity.toFixed(3)} repeatX ${grain.repeatX.toFixed(2)}`,
  );
  // The break sheet wears the same mirror: its root gives up its own paint (visibility, so the
  // surface's computed background stays readable), its mirrorable rows give up their ink inline,
  // and the rows the atlas cannot carry keep theirs. Two mutations measured: putting the root's
  // visibility back reads `visible` here, and hiding the scene's sheet ink drops the row pixels.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const handle = await page
      .locator('.hud [data-hook="break"]')
      .boundingBox()
      .catch(() => null);
    if (handle !== null) break;
    await page.mouse.click(196, 280);
    await page.waitForTimeout(420);
  }
  await page.locator('.hud [data-hook="break"]').click();
  await page.waitForSelector('.sheet[data-open="true"]', {
    state: 'attached',
    timeout: 4000,
    polling: 10,
  });
  await page.waitForTimeout(700);
  const sheetShot = await page.screenshot();
  const sheet = await page.evaluate(async (b64) => {
    const element = document.querySelector('.sheet[data-open="true"]');
    if (element === null) return { visibility: 'missing', fill: null, nameMax: 0 };
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const row = element.querySelector('.stats .name');
    const r = row.getBoundingClientRect();
    const d = ctx.getImageData(
      Math.round(r.left) - 2,
      Math.round(r.top) - 2,
      Math.round(r.width) + 4,
      Math.round(r.height) + 4,
    ).data;
    let max = 0;
    for (let i = 0; i < d.length; i += 4) max = Math.max(max, d[i], d[i + 1], d[i + 2]);
    const marked = element.querySelector('[data-scene-surface]');
    const close = element.querySelector('.close');
    return {
      visibility: getComputedStyle(element).visibility,
      fill: row.style.getPropertyValue('-webkit-text-fill-color'),
      nameMax: max,
      surfaces: element.querySelectorAll('[data-scene-surface]').length,
      markedPaint:
        marked === null
          ? null
          : [getComputedStyle(marked).backgroundColor, getComputedStyle(marked).borderTopColor],
      closeFill: close === null ? '' : close.style.getPropertyValue('-webkit-text-fill-color'),
    };
  }, sheetShot.toString('base64'));
  await page.locator('.sheet[data-open="true"] .close').click();
  await page.waitForTimeout(420);
  check(
    '3D: the open sheet hands its ink over (root hidden, the row fill taken)',
    sheet.visibility === 'hidden' &&
      sheet.fill === 'transparent' &&
      sheet.closeFill === 'transparent',
    JSON.stringify(sheet),
  );
  check(
    "3D: the controls' own paint is handed over too (a marked surface is masked transparent)",
    sheet.surfaces >= 1 &&
      Array.isArray(sheet.markedPaint) &&
      sheet.markedPaint[0] === 'rgba(0, 0, 0, 0)' &&
      sheet.markedPaint[1] === 'rgba(0, 0, 0, 0)',
    JSON.stringify(sheet),
  );
  check(
    '3D: a sheet row is painted by the scene',
    sheet.nameMax >= 140,
    `name max ${String(sheet.nameMax)}`,
  );
  check('3D: none of it threw', errors.length === 0, errors.slice(0, 2).join(' | '));
  await context.close();
}

await browser.close();
const failed = results.filter((entry) => !entry.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
