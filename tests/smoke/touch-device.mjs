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

/** Lit pixels in a band of the canvas: smoke has to change them, nothing else does. */
const airLit = (page) =>
  page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const scale = canvas.width / canvas.clientWidth;
    const ctx = canvas.getContext('2d');
    const box = canvas.getBoundingClientRect();
    const image = ctx.getImageData(
      0,
      box.height * 0.25 * scale,
      canvas.width,
      box.height * 0.35 * scale,
    );
    let lit = 0;
    for (let i = 0; i < image.data.length; i += 4) if (image.data[i] > 58) lit += 1;
    return lit;
  });

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
  const before = await airLit(page);

  const layout = LAYOUTS.tall;
  const rod = await stagePoint(page, ...layout.rod);
  await page.touchscreen.tap(rod.x, rod.y);
  await page.waitForTimeout(300);
  const lighter = await stagePoint(page, ...layout.lighter);
  await page.touchscreen.tap(lighter.x, lighter.y);
  await page.waitForTimeout(1000);
  check(
    'two taps start the break on their own',
    await page.evaluate(() => document.querySelector('.clock-wrap')?.dataset.visible === 'true'),
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
  const after = await airLit(page);
  check(
    'a drawn breath is visible in the air',
    after > before * 1.2,
    `${before} → ${after} lit px`,
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
  await page.waitForTimeout(1200);
  check(
    'landscape: a break lights with two taps',
    await page.evaluate(() => document.querySelector('.clock-wrap')?.dataset.visible === 'true'),
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
