/**
 * The rail's mapping, proven once rather than inferred from a screenshot: every state the
 * cigarette can be in belongs to exactly one of the three phases the design names, and the pill
 * knows which of them are held rather than tapped.
 */

import { describe, expect, it } from 'vitest';
import type { CigaretteStateId } from '@puffly/game-core';
import { isSustained, phaseOf } from '../phase';

const STATES: readonly CigaretteStateId[] = [
  'IDLE',
  'PICKED_UP',
  'LIGHTING',
  'BURNING',
  'PUFFING',
  'RESTING',
  'ASH_READY',
  'NEAR_END',
  'EXTINGUISHING',
  'EXTINGUISHED',
  'DISCARDED',
];

describe('the three phases and the pill (§9.2)', () => {
  it('every state belongs to exactly one phase, and no phase is unreachable', () => {
    const seen = new Set(STATES.map(phaseOf));
    expect(seen).toEqual(new Set(['light', 'puff', 'tray', 'out']));
    expect(phaseOf('IDLE')).toBe('light');
    expect(phaseOf('LIGHTING')).toBe('light');
    expect(phaseOf('PUFFING')).toBe('puff');
    expect(phaseOf('NEAR_END')).toBe('puff');
    expect(phaseOf('ASH_READY')).toBe('tray');
    expect(phaseOf('DISCARDED')).toBe('out');
  });

  it('only the sustained verbs are held, and they are the same ones the space bar holds (§65)', () => {
    expect(['puff', 'extinguish'].every(isSustained)).toBe(true);
    expect(['pick', 'lighter', 'flick', 'discard', 'none'].some(isSustained)).toBe(false);
  });
});
