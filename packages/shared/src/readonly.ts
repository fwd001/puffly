/**
 * The renderer/audio/storage side only ever receives a read-only view of state, so
 * "Renderer should not modify game state" (SPEC.md §48) is a compile error rather than a
 * convention.
 *
 * Tuples are handled before arrays on purpose: colours like `Rgb` and gradient stops are
 * fixed-length, and flattening them into `readonly number[]` would push every consumer into
 * `| undefined` handling for values that always exist.
 */
export type DeepReadonly<T> = T extends readonly [unknown, ...unknown[]]
  ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
  : T extends (infer U)[]
    ? readonly DeepReadonly<U>[]
    : T extends ReadonlyArray<infer U>
      ? readonly DeepReadonly<U>[]
      : T extends object
        ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
        : T;
