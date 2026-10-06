/**
 * The count starts at the first light — the wiring, not just the rule.
 *
 * `anchor.test.ts` proves what the rule is: the first cherry sets the anchor, no later light moves
 * it, and a date the player chose is never overwritten. That rule does nothing on its own — the
 * player only ever meets it through six lines inside the shell's event handler, and those six lines
 * had no guard at all: deleting them, or moving them into the wrong branch, kept 586 tests green.
 *
 * Driving `usePuffly` for real needs a component instance and a browser window (it touches
 * `navigator.vibrate`, `visualViewport`, `devicePixelRatio`, and registers `onBeforeUnmount`), and
 * this is the only place in the suite that would need one. So this is a structural check, and here
 * is exactly what a structural check buys and what it does not: it reddens when the call disappears
 * or leaves the LIGHT branch, and when the save that follows it is dropped. It does not redden on a
 * wrong argument, a thrown exception, or a persistence layer that silently swallows the write —
 * those need the composable mounted, which is a separate piece of scaffolding to decide on.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const SOURCE = readFileSync(new URL('../composables/usePuffly.ts', import.meta.url), 'utf8');

/** The body of the first `if` whose condition matches, taken by brace matching rather than by line. */
function blockAfter(condition: RegExp): string {
  const found = condition.exec(SOURCE);
  if (!found) throw new Error(`no branch matching ${condition}`);
  const open = SOURCE.indexOf('{', found.index + found[0].length - 1);
  if (open < 0) throw new Error('branch has no body');
  let depth = 0;
  for (let index = open; index < SOURCE.length; index++) {
    if (SOURCE[index] === '{') depth += 1;
    else if (SOURCE[index] === '}' && --depth === 0) return SOURCE.slice(open, index + 1);
  }
  throw new Error('unbalanced braces');
}

describe('the first light actually sets the anchor (§10)', () => {
  const lightBranch = blockAfter(/if\s*\(type === SessionEventType\.LIGHT\)/);

  it('asks the rule on the light, not somewhere else', () => {
    expect(lightBranch).toContain('anchorAtLight(');
    // A second call site would mean two things decide the anchor.
    expect(SOURCE.match(/anchorAtLight\(/g) ?? []).toHaveLength(1);
  });

  it('writes the answer down, or the break is forgotten on the next load', () => {
    expect(lightBranch).toContain('quitAnchorTimestamp');
    expect(lightBranch).toContain('saveSettings(');
    // And only when there is something to write: the rule returns undefined once an anchor exists.
    expect(lightBranch).toMatch(/anchor !== undefined/);
  });

  it('still reads the saved anchor back into the engine', () => {
    // The other half of the loop: a value that is written but never handed to the core is a field
    // the player set and the app ignored.
    expect(SOURCE).toMatch(/quitAnchorTimestamp\s*\n?\s*\?\s*\{\s*quitAnchorTimestamp/);
  });
});
