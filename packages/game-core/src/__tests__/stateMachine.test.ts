import { describe, expect, it } from 'vitest';
import {
  AMBIENT_STATES,
  CIGARETTE_STATES,
  TRANSITIONS,
  allowedNext,
  canTransition,
  deriveAmbientState,
  isLit,
} from '@puffly/game-core';

describe('§11 state machine', () => {
  it('knows all eleven states from the spec, by name', () => {
    expect(CIGARETTE_STATES).toEqual([
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
    ]);
  });

  it('gives every state at least one way out, so nothing can be stranded', () => {
    for (const state of CIGARETTE_STATES) {
      expect(allowedNext(state).length, state).toBeGreaterThan(0);
    }
  });

  it('only names states that exist', () => {
    for (const [from, targets] of Object.entries(TRANSITIONS)) {
      expect(CIGARETTE_STATES).toContain(from);
      for (const target of targets) expect(CIGARETTE_STATES).toContain(target);
    }
  });

  it('lets every lit state be put out or dropped', () => {
    for (const state of CIGARETTE_STATES) {
      if (!isLit(state)) continue;
      expect(canTransition(state, 'EXTINGUISHING'), state).toBe(true);
      expect(canTransition(state, 'DISCARDED'), state).toBe(true);
    }
  });

  it('refuses nonsense edges', () => {
    expect(canTransition('IDLE', 'PUFFING')).toBe(false);
    expect(canTransition('DISCARDED', 'BURNING')).toBe(false);
    expect(canTransition('EXTINGUISHED', 'PUFFING')).toBe(false);
    expect(canTransition('PICKED_UP', 'RESTING')).toBe(false);
  });

  it('treats a state as always transitionable to itself', () => {
    for (const state of CIGARETTE_STATES) expect(canTransition(state, state)).toBe(true);
  });

  describe('§18/§11 derived-state priority', () => {
    const base = { rodRemaining: 0.8, ashRatio: 0.1, sinceReleaseMs: 5000 };

    it('smoulders when nothing else is true', () => {
      expect(deriveAmbientState(base)).toBe('BURNING');
    });

    it('prefers the settling beat after a puff', () => {
      expect(deriveAmbientState({ ...base, sinceReleaseMs: 300 })).toBe('RESTING');
    });

    it('prefers a long ash column over plain burning', () => {
      expect(deriveAmbientState({ ...base, ashRatio: 0.9, sinceReleaseMs: 300 })).toBe('ASH_READY');
    });

    it('prefers the stub over everything else', () => {
      expect(deriveAmbientState({ rodRemaining: 0.1, ashRatio: 0.95, sinceReleaseMs: 100 })).toBe(
        'NEAR_END',
      );
    });

    it('covers exactly the four derived states', () => {
      const produced = new Set<string>();
      for (const rodRemaining of [0.9, 0.15]) {
        for (const ashRatio of [0.1, 0.9]) {
          for (const sinceReleaseMs of [100, 5000]) {
            produced.add(deriveAmbientState({ rodRemaining, ashRatio, sinceReleaseMs }));
          }
        }
      }
      expect([...produced].sort()).toEqual([...AMBIENT_STATES].sort());
    });
  });
});
