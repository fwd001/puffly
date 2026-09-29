/**
 * Touch evidence on real phone shapes — SPEC.md §66, §81 (4).
 *
 * The unit suite can prove that a tap resolves to the right anchor; it cannot prove that a
 * break is playable with a finger on a 393 px screen. This drives an actual browser, portrait
 * and landscape, and asserts the things a screenshot cannot lie about: that the canvas fills
 * the device, that a coarse pointer gets finger-sized targets, that double-tapping does not
 * zoom the scene, that the main screen still contains no words, and that a drawn breath is
 * actually visible in the air.
 *
 *   node tests/smoke/touch-device.mjs http://localhost:5175/
 *
 * Playwright and a Chrome-compatible binary are resolved from the environment, because neither
 * is a dependency of the game:
 *   PUFFLY_PLAYWRIGHT=/path/to/playwright/index.mjs  PUFFLY_CHROME=/path/to/chrome
 *
 * It exits 1 with a message when a check fails, and 3 when it could not run at all — a check
 * that silently skips is worse than one that does not exist.
 */

const URL_ARG = process.argv[2] ?? 'http://localhost:5175/';
const PLAYWRIGHT_SPEC = process.env['PUFFLY_PLAYWRIGHT'] ?? 'playwright';
const CHROME = process.env['PUFFLY_CHROME'];

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

let chromium;
try {
  ({ chromium } = await import(PLAYWRIGHT_SPEC));
} catch {
  console.error(
    `cannot import Playwright from ${JSON.stringify(PLAYWRIGHT_SPEC)}.\n` +
      'Set PUFFLY_PLAYWRIGHT to a playwright entry point (an absolute path to its index.mjs is\n' +
      'always fine) and PUFFLY_CHROME to a Chrome/Chromium binary. Not run, so nothing is proven.',
  );
  process.exit(3);
}

const launchOptions = CHROME ? { executablePath: CHROME } : {};
let browser;
try {
  browser = await chromium.launch(launchOptions);
} catch (error) {
  console.error(
    `cannot launch the browser: ${error.message}\nSet PUFFLY_CHROME to a Chrome binary.`,
  );
  process.exit(3);
}

/** Where the tall (portrait) and wide (landscape) prop tables put things, in stage units. */
const LAYOUTS = {
  tall: { rod: [0.5, 0.9], lighter: [0.12, 0.71], held: [0.5, 0.58], tray: [0.7, 0.855] },
  wide: { rod: [0.33, 0.86], lighter: [0.075, 0.66], held: [0.52, 0.5], tray: [0.815, 0.8] },
};

async function openPhone({ width, height, dpr }) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: dpr,
    isMobile: true,
    hasTouch: true,
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

  const layout = LAYOUTS.tall;
  const rod = await stagePoint(page, ...layout.rod);
  await page.touchscreen.tap(rod.x, rod.y);
  await page.waitForTimeout(300);
  const lighter = await stagePoint(page, ...layout.lighter);
  await page.touchscreen.tap(lighter.x, lighter.y);
  // The clock's visibility is not the evidence: §10 dims the chrome, including the clock, once
  // the player is inside the moment. The state machine is what a break starting means.
  const litState = await waitScene(page, /burning|puffing|resting|ash_ready|near_end/);
  check('two taps start the break on their own', litState !== '', litState);

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

  const words = await page.evaluate(() => document.body.innerText);
  check(
    'the screen is still wordless',
    (words.match(/[A-Za-z\u4e00-\u9fff]{2,}/g) ?? []).length === 0,
  );

  const zoomBefore = await page.evaluate(() => window.visualViewport?.scale ?? 1);
  await page.touchscreen.tap(rod.x, rod.y);
  await page.touchscreen.tap(rod.x, rod.y);
  await page.waitForTimeout(300);
  const zoomAfter = await page.evaluate(() => window.visualViewport?.scale ?? 1);
  check('double-tap does not zoom the scene', Math.abs(zoomAfter - zoomBefore) < 0.01);

  // An open sheet must leave the bar that opened it reachable. The bottom-anchored panel used to
  // paint over all three chrome buttons, so on a phone the middle one went dead once it was open.
  await page.locator('.chrome button[aria-label="collection"]').tap();
  await page.waitForTimeout(500);
  const covered = await page.evaluate(() =>
    ['break', 'collection', 'settings']
      .filter((label) => {
        const btn = document.querySelector(`.chrome button[aria-label="${label}"]`);
        const r = btn.getBoundingClientRect();
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        // The button's own glyph span is a hit on the button; anything else is something on top.
        return !btn.contains(hit);
      })
      .map((label) => `${label} covered`),
  );
  check(
    'a chrome button stays tappable under an open sheet',
    covered.length === 0,
    covered.join(', '),
  );

  await page.locator('.chrome button[aria-label="settings"]').tap();
  await page.waitForTimeout(500);
  const switched = await page.evaluate(() =>
    [...document.querySelectorAll('.sheet[data-open="true"]')].map((el) =>
      el.getAttribute('aria-label'),
    ),
  );
  check(
    'the bar switches from one sheet to another',
    switched.join(',') === 'Settings',
    switched.join(','),
  );

  // The browser's own long-press menu is another app appearing over the scene (§66: the canvas
  // owns the surface). The iOS callout is asserted in the unit suite instead: Chromium drops
  // `-webkit-touch-callout` at parse time, so nothing observable here could prove it.
  const defaults = await page.evaluate(() => {
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
  check(
    'the native context menu, callout and drag defaults are refused',
    defaults.menuFired === 1 && defaults.menuPrevented === 1 && defaults.dragPrevented === true,
    JSON.stringify(defaults),
  );

  await page.locator('.chrome button[aria-label="settings"]').tap();
  await page.waitForTimeout(500);
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

  await page.locator('.chrome button[aria-label="settings"]').tap();
  await page.waitForTimeout(500);
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

await browser.close();
const failed = results.filter((entry) => !entry.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
