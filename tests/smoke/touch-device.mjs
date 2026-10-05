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

/** Where the tall (portrait) and wide (landscape) prop tables put things, in stage units. */
const LAYOUTS = {
  tall: { rod: [0.26, 0.855], lighter: [0.13, 0.655], held: [0.5, 0.58], tray: [0.72, 0.78] },
  wide: { rod: [0.33, 0.86], lighter: [0.075, 0.66], held: [0.52, 0.5], tray: [0.815, 0.8] },
};

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

/** The two facts a break is made of: what state it is in, and what its clock says. */
const scene = (page) =>
  page.evaluate(() => ({
    state: document.querySelector('canvas')?.getAttribute('aria-label') ?? '',
    clock: document.querySelector('.clock-wrap .digits')?.textContent?.trim() ?? '',
  }));

/** Which stage of the break the scene is in, read the way a screen reader hears it. */
const sceneState = (page) =>
  page.evaluate(() => document.querySelector('canvas')?.getAttribute('aria-label') ?? '');

/**
 * Wait for the scene to reach one of these stages.
 *
 * A wheel lighter takes over a second to catch, and that length is a design number, not a
 * constant of this test — a fixed sleep here passed by luck and failed by 200 ms.
 */
async function waitScene(page, pattern, withinMs = 4000) {
  const deadline = Date.now() + withinMs;
  for (;;) {
    const state = await sceneState(page);
    if (pattern.test(state)) return state;
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
 * The words a player can read on the stage. There is one of them, and it names the gesture the
 * scene is already nudging (§28); everything else the game says is an `aria-label`.
 */
const stageWords = (page) =>
  page.evaluate(() => {
    const hint = (document.querySelector('.hint')?.textContent ?? '').trim().toLowerCase();
    // The word is its own block, so it is its own line. Drop that line: whatever is left and
    // looks like a word is prose, which the product is not allowed to have.
    const rest = document.body.innerText
      .split('\n')
      .filter((line) => line.trim().toLowerCase() !== hint)
      .join(' ');
    const tokens = rest.match(/[A-Za-z\u4e00-\u9fff]{2,}/g)?.map((word) => word.toLowerCase());
    return { hint, other: tokens ?? [] };
  });

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
async function openSheet(page, id, mouse = false) {
  const mark = page.locator('.chrome .menu');
  if (mouse) await mark.click();
  else await mark.tap();
  await page.waitForTimeout(420);
  const entry = page.locator(`.sheet--menu .entry[data-entry="${id}"]`);
  if (mouse) await entry.click();
  else await entry.tap();
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
    untouched.hint === 'tap' && untouched.other.length === 0,
    JSON.stringify(untouched),
  );

  const layout = LAYOUTS.tall;
  const rod = await stagePoint(page, ...layout.rod);
  await page.touchscreen.tap(rod.x, rod.y);
  await page.waitForTimeout(300);
  const inHand = await stageWords(page);
  check(
    'once it is in hand the word changes to the next gesture',
    inHand.hint === 'light' && inHand.other.length === 0,
    JSON.stringify(inHand),
  );
  const lighter = await stagePoint(page, ...layout.lighter);
  await page.touchscreen.tap(lighter.x, lighter.y);
  // The clock's visibility is not the evidence: §10 dims the chrome, including the clock, once
  // the player is inside the moment. The state machine is what a break starting means.
  const litState = await waitScene(page, /burning|puffing|resting|ash_ready|near_end/);
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

  const held = await stagePoint(page, ...layout.held);
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
    await page.waitForTimeout(800);
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
  check(
    'the rod is still in hand, not in the tray',
    (
      await page.evaluate(() => document.querySelector('canvas')?.getAttribute('aria-label') ?? '')
    ).match(/burning|puffing|resting|ash_ready|near_end/) !== null,
  );

  // The whole vocabulary the product owns (§28). Anything else on the screen is a bug.
  const GESTURES = ['tap', 'light', 'hold', 'flick', 'press', 'drop'];
  const words = await stageWords(page);
  check(
    'the screen carries no prose, at most one gesture word',
    words.other.length === 0 && (words.hint === '' || GESTURES.includes(words.hint)),
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

  // An open sheet must leave the bar that opened it reachable. The bottom-anchored panel used to
  // paint over all three chrome buttons, so on a phone the middle one went dead once it was open.
  await openSheet(page, 'shelf');
  const covered = await page.evaluate(() =>
    ['.chrome .menu', '.sheet[data-open="true"] .close'].filter((selector) => {
      const btn = document.querySelector(selector);
      const r = btn.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      // The button's own glyph span is a hit on the button; anything else is something on top.
      return !btn.contains(hit);
    }),
  );
  check('the mark and the sheet stay tappable together', covered.length === 0, covered.join(', '));

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

  // §18: the stage carries no numbers. The break's clock lives inside the sheet now.
  const onStage = await page.evaluate(
    () =>
      [...document.querySelectorAll('.stage > *:not(.sheet):not(.chrome)')]
        .map((el) => el.textContent ?? '')
        .join(' ')
        .match(/\\d/g)?.length ?? 0,
  );
  check('nothing on the stage is a number', onStage === 0, `${onStage} digits`);

  // §64: the word is a setting, not a fixture. Off has to mean off on the stage too, not just
  // in the sheet, and turning it off must not leave any other text behind.
  await page.locator('.sheet[data-open="true"] [data-setting="hints"]').tap();
  await page.locator('.sheet[data-open="true"] .close').tap();
  await page.waitForTimeout(600);
  const quiet = await stageWords(page);
  check(
    'the hint word is a setting that can be turned off',
    quiet.hint === '' && quiet.other.length === 0,
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
    /burning|puffing|resting|ash_ready|near_end/.test(afterReload.state) &&
      afterSeconds > 0 &&
      afterSeconds <= beforeReload + 3 &&
      afterSeconds >= beforeReload - 30,
    `${afterReload.state} at ${afterSeconds}s, was ${beforeReload}s before the reload`,
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
    chrome: document.querySelector('.chrome')?.dataset.visible ?? '?',
    hint: !!document.querySelector('.hint'),
    sheets: document.querySelectorAll('.sheet[data-open="true"]').length,
    state: document.querySelector('canvas')?.getAttribute('aria-label') ?? '',
  }));
  check(
    'a swipe down over nothing puts the interface away and leaves the break burning',
    folded.chrome === 'false' &&
      !folded.hint &&
      folded.sheets === 0 &&
      /burning/.test(folded.state),
    JSON.stringify(folded),
  );

  check('portrait: nothing threw', errors.length === 0, errors.slice(0, 2).join(' | '));
  await context.close();
}

// ------------------------------------------------------------------- landscape
{
  const { page, errors, context } = await openPhone({ width: 844, height: 390, dpr: 3 });
  const box = await page.locator('canvas').boundingBox();
  check(
    'landscape: the canvas fills the device',
    Math.abs(box.width - 844) < 2,
    `${box.width}x${box.height}`,
  );

  const layout = LAYOUTS.wide;
  const chromeTop = await page.evaluate(
    () => document.querySelector('.chrome')?.getBoundingClientRect().top ?? 9999,
  );
  const tray = await stagePoint(page, ...layout.tray);
  check(
    'landscape: the tray is not under the chrome',
    tray.y < chromeTop,
    `tray y=${Math.round(tray.y)}, chrome starts ${Math.round(chromeTop)}`,
  );

  const rod = await stagePoint(page, ...layout.rod);
  const lighter = await stagePoint(page, ...layout.lighter);
  await page.touchscreen.tap(rod.x, rod.y);
  await page.waitForTimeout(300);
  await page.touchscreen.tap(lighter.x, lighter.y);
  check(
    'landscape: a break lights with two taps',
    (await waitScene(page, /burning/)) !== '',
    await sceneState(page),
  );

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

  const layout = LAYOUTS.wide;
  // 0.26 along a 0.34-unit rod lying at its 6° rest angle. That is past the body radius around
  // the midpoint and short of the cherry's own radius, so the only thing which can answer here
  // is the rod — which is exactly what a hit test measuring the midpoint alone cannot do.
  const LIE = { x: Math.cos((6 * Math.PI) / 180), y: Math.sin((6 * Math.PI) / 180) };
  const farEnd = await stagePoint(page, layout.rod[0] + 0.26 * LIE.x, layout.rod[1] + 0.26 * LIE.y);
  await page.mouse.click(farEnd.x, farEnd.y);
  await page.waitForTimeout(300);
  const pickedUp = await sceneState(page);
  check(
    'desktop: a click on the far end of the rod picks it up',
    pickedUp.includes('held'),
    pickedUp,
  );

  const lighter = await stagePoint(page, ...layout.lighter);
  // A cheap wheel lighter sometimes fails to catch — that is the design (§13), and a sound.
  // Lighting is therefore "keep trying", not "one tap and pray".
  let lit = '';
  for (let attempt = 0; attempt < 3 && lit === ''; attempt += 1) {
    await page.mouse.click(lighter.x, lighter.y);
    lit = await waitScene(page, /burning|puffing|resting|ash_ready|near_end/);
  }
  check('desktop: the lighter catches a mouse click', lit !== '', lit);

  const held = await stagePoint(page, ...layout.held);
  await page.mouse.move(held.x, held.y);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  await page.waitForTimeout(400);
  const drew = await sceneState(page);
  check('desktop: holding the mouse draws', /burning|puffing|resting/.test(drew), drew);

  const refused = await nativeDefaults(page);
  check(
    'desktop: right-clicking the scene is refused',
    refused.menuFired === 1 && refused.menuPrevented === 1 && refused.dragPrevented,
    JSON.stringify(refused),
  );

  await openSheet(page, 'settings', true);
  const opened = await page.evaluate(
    () => document.querySelector('.sheet[data-open="true"]')?.getAttribute('aria-label') ?? '',
  );
  check(
    'desktop: the bar answers a mouse click',
    opened === 'Settings',
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

  const rod = await stagePoint(page, ...LAYOUTS.tall.rod);
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
    zh.hint === '点' && zh.other.length === 0,
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
    Math.abs(arHint.x - zhHint.x) < 2 && Math.abs(arHint.y - zhHint.y) < 2 && arWord.hint === 'tap',
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
    quiet.hint === '' && quiet.other.length === 0,
    JSON.stringify(quiet),
  );

  // The choice is a preference, so it comes back — which is the same read path that dropped the
  // player's chosen rod until this round.
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  const after = await page.evaluate(() => ({
    lang: document.documentElement.lang,
    hint: document.querySelector('.hint')?.textContent?.trim() ?? '',
    menu: document.querySelector('.chrome .menu')?.getAttribute('aria-label') ?? '',
  }));
  check(
    'a wordless interface comes back wordless, still named for a screen reader',
    after.lang === 'en' && after.hint === '' && after.menu === 'menu',
    JSON.stringify(after),
  );

  check('three tiers: nothing threw', errors.length === 0, errors.slice(0, 2).join(' | '));
  await context.close();
}

await browser.close();
const failed = results.filter((entry) => !entry.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
