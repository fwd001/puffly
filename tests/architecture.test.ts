/**
 * Architecture guard tests — SPEC.md §73.
 *
 * §47 says what Game Core may not know about, §81 (10/11/12) says the same for the whole pure
 * layer, and §86 says every future platform must reuse it. Rules written only in prose decay,
 * so this file enforces them on the source text.
 *
 * Two things this file is careful about, because both have burned this codebase before:
 *  - comments are stripped before matching, so the layer's own documentation ("no Vue, no DOM")
 *    does not count as a violation;
 *  - string literals are NOT stripped, because import specifiers live in strings. An earlier
 *    version blanked them and every import-based check below silently passed nothing. Each
 *    matcher therefore has a positive control in `the scanner itself` — a feed of text that MUST
 *    be reported. A guard that cannot fail is decoration.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');

const PURE_PACKAGES = [
  'packages/shared',
  'packages/game-core',
  'packages/game-content',
  'packages/game-statistics',
];
const ADAPTER_PACKAGES = ['packages/game-renderer', 'packages/game-audio', 'packages/game-storage'];

/** Platform objects the pure layer may not reach for. Matched as uses, not as words in prose. */
const BANNED_USES = [
  { name: 'window', pattern: /\bwindow\s*[.[]|\btypeof\s+window\b/ },
  { name: 'document', pattern: /\bdocument\s*[.[]|\btypeof\s+document\b/ },
  { name: 'navigator', pattern: /\bnavigator\s*[.[]/ },
  { name: 'localStorage', pattern: /\blocalStorage\s*[.[]/ },
  { name: 'sessionStorage', pattern: /\bsessionStorage\s*[.[]/ },
  { name: 'indexedDB', pattern: /\bindexedDB\s*[.[]/ },
  { name: 'AudioContext', pattern: /\bnew\s+AudioContext\b|\bAudioContext\b\s*\(/ },
  { name: 'requestAnimationFrame', pattern: /\brequestAnimationFrame\s*\(/ },
  { name: 'cancelAnimationFrame', pattern: /\bcancelAnimationFrame\s*\(/ },
  { name: 'matchMedia', pattern: /\bmatchMedia\s*\(/ },
  { name: 'ResizeObserver', pattern: /\bnew\s+ResizeObserver\b/ },
  { name: 'fetch', pattern: /\bfetch\s*\(/ },
  { name: 'crypto', pattern: /\bcrypto\s*\./ },
  { name: 'process', pattern: /\bprocess\s*[.[]/ },
  { name: 'globalThis', pattern: /\bglobalThis\s*[.[]/ },
  {
    name: 'canvas type',
    pattern: /\bCanvasRenderingContext2D\b|\bHTMLCanvasElement\b|\bOffscreenCanvas\b/,
  },
  { name: 'Math.random', pattern: /\bMath\s*\.\s*random\s*\(/ },
  { name: 'Date.now', pattern: /\bDate\s*\.\s*now\s*\(/ },
  { name: 'new Date', pattern: /\bnew\s+Date\s*\(/ },
  { name: 'require', pattern: /\brequire\s*\(/ },
];

const BANNED_IMPORT_PREFIXES = [
  'vue',
  '@vue/',
  'pinia',
  'vite',
  '@tauri-apps/',
  'idb',
  'fake-indexeddb',
  'sharp',
  'canvas',
];

/** The layering rule of SPEC.md §45: adapters are downstream of the core, never upstream. */
const BANNED_PACKAGE_IMPORTS = [
  '@puffly/game-renderer',
  '@puffly/game-audio',
  '@puffly/game-storage',
  '@puffly/web',
];

/** What an adapter must never do: drive the simulation it is supposed to observe (§48). */
const FORBIDDEN_FOR_ADAPTERS = ['createEngine', 'replaySession', 'EngineOptions'];

function sources(dir: string): string[] {
  const absolute = join(root, dir);
  const found: string[] = [];
  const walk = (path: string): void => {
    for (const entry of readdirSync(path)) {
      const full = join(path, entry);
      if (statSync(full).isDirectory()) {
        if (entry === 'node_modules' || entry === 'dist') continue;
        walk(full);
        continue;
      }
      // Tests may speak to the platform they are testing; shipped source may not.
      if (entry.endsWith('.ts') && !entry.endsWith('.test.ts') && !full.includes('__tests__')) {
        found.push(full);
      }
    }
  };
  walk(absolute);
  return found;
}

/** Strip line and block comments, keeping every string literal intact. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\S\s]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
}

function importSpecifiers(code: string): string[] {
  const out: string[] = [];
  for (const match of code.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)) {
    if (match[1]) out.push(match[1]);
  }
  for (const match of code.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    if (match[1]) out.push(match[1]);
  }
  return out;
}

export function scanSource(rel: string, raw: string): string[] {
  const code = stripComments(raw);
  const found: string[] = [];

  for (const use of BANNED_USES) {
    if (use.pattern.test(code)) found.push(`${rel}: ${use.name}`);
  }

  for (const specifier of importSpecifiers(code)) {
    if (
      BANNED_IMPORT_PREFIXES.some((prefix) => specifier === prefix || specifier.startsWith(prefix))
    ) {
      found.push(`${rel}: imports ${specifier}`);
    }
    if (BANNED_PACKAGE_IMPORTS.includes(specifier)) {
      found.push(`${rel}: imports ${specifier} (adapters are downstream, §45)`);
    }
    if (specifier.startsWith('@puffly/') && specifier.includes('/src/')) {
      found.push(`${rel}: deep-imports ${specifier} instead of the package index`);
    }
  }

  return found;
}

function scanPure(dir: string): string[] {
  return sources(dir).flatMap((file) =>
    scanSource(relative(root, file), readFileSync(file, 'utf8')),
  );
}

function scanAdapter(dir: string): string[] {
  const files = sources(dir);
  const code = files.map((file) => stripComments(readFileSync(file, 'utf8'))).join('\n');
  const problems: string[] = [];
  for (const symbol of FORBIDDEN_FOR_ADAPTERS) {
    const imported = new RegExp(
      `import[^;]*\\b${symbol}\\b[^;]*from\\s+['"]@puffly/game-core['"]`,
    ).test(code);
    if (imported) problems.push(`${dir}: imports ${symbol} from Game Core`);
  }
  return problems;
}

describe('§73 architecture guards', () => {
  it('finds the pure layer at all, so the scan is not empty', () => {
    for (const dir of PURE_PACKAGES) {
      expect(sources(dir).length, dir).toBeGreaterThan(0);
    }
  });

  it.each(PURE_PACKAGES)('%s never touches a platform API', (dir) => {
    expect(scanPure(dir)).toEqual([]);
  });

  it('the scanner itself reports every shape it claims to catch', () => {
    // Positive controls, one per matcher family. If any of these stops firing, the
    // corresponding "no violations" result above has become meaningless.
    const cases: readonly { label: string; code: string }[] = [
      { label: 'window', code: 'const w = window.innerWidth;' },
      { label: 'document', code: 'const c = document.createElement("canvas");' },
      { label: 'indexedDB', code: 'indexedDB.open("puffly");' },
      { label: 'requestAnimationFrame', code: 'requestAnimationFrame(step);' },
      { label: 'Math.random', code: 'const s = Math.random();' },
      { label: 'Date.now', code: 'const t = Date.now();' },
      { label: 'new Date', code: 'const d = new Date();' },
      { label: 'canvas type', code: 'let ctx: CanvasRenderingContext2D;' },
      { label: 'crypto', code: 'crypto.getRandomValues(box);' },
      { label: 'vue import', code: "import { ref } from 'vue';" },
      { label: 'tauri import', code: "import { invoke } from '@tauri-apps/api/core';" },
      {
        label: 'adapter import',
        code: "import { createCanvasRenderer } from '@puffly/game-renderer';",
      },
      { label: 'deep import', code: "import { stuff } from '@puffly/game-core/src/engine';" },
    ];

    for (const item of cases) {
      expect(scanSource('sample.ts', item.code), item.label).not.toEqual([]);
    }

    // And the negative direction: clean code must not be reported.
    expect(
      scanSource(
        'sample.ts',
        "import type { Settings } from './types/settings';\nexport const x = 1;",
      ),
    ).toEqual([]);
  });

  it('the renderer is where platform APIs belong, and the guard can see them there', () => {
    const code = sources('packages/game-renderer')
      .map((file) => stripComments(readFileSync(file, 'utf8')))
      .join('\n');
    expect(/\bdocument\s*\./.test(code), 'sprite factory should still use document').toBe(true);
    expect(/\bCanvasRenderingContext2D\b/.test(code)).toBe(true);
  });

  it.each(ADAPTER_PACKAGES)('%s depends only one way: core is not its servant', (dir) => {
    expect(scanAdapter(dir)).toEqual([]);
  });

  it('the web shell really does drive the engine (adapter guard positive control)', () => {
    const shell = sources('apps/web/src')
      .map((file) => stripComments(readFileSync(file, 'utf8')))
      .join('\n');
    expect(/import[^;]*createEngine[^;]*from\s+['"]@puffly\/game-core['"]/.test(shell)).toBe(true);
  });

  it('no shipped source reaches past a package index', () => {
    const all = [...PURE_PACKAGES, ...ADAPTER_PACKAGES, 'apps/web/src'].flatMap((dir) =>
      sources(dir).flatMap((file) =>
        scanSource(relative(root, file), readFileSync(file, 'utf8')).filter((line) =>
          line.includes('deep-imports'),
        ),
      ),
    );
    expect(all).toEqual([]);
  });
});
