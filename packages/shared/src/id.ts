import type { Rng } from './rng';

/**
 * Monotonic ids instead of `crypto.randomUUID()`: the pure layer must stay
 * platform-free (SPEC.md §47) and replay comparisons want readable, ordered ids.
 */
export interface IdGenerator {
  next(prefix?: string): string;
}

export function createIdGenerator(rng: Rng, start = 0): IdGenerator {
  let counter = start;
  return {
    next(prefix = 'id') {
      counter += 1;
      const tag = rng.int(0, 4095).toString(36);
      return `${prefix}-${counter.toString(36)}-${tag}`;
    },
  };
}
