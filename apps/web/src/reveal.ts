/**
 * Which of the lit ids lit *just now*, as one look at the screen sees it.
 *
 * The achievement ladder wants §39's 「它自己亮一下」 and has nowhere honest to keep the answer: core's
 * `collection.fresh` is a persisted field for content drops, and giving the rungs their own saved
 * "what was lit before" would be a second account of numbers the ledger already prints (§70). So this
 * holds nothing but the ids that were lit the last time the sheet looked, and it lives only while that
 * sheet is mounted — seeded when it opens (arriving is not an achievement), raised by a rung that
 * changes after that, and wiped when it closes (a fade from five minutes ago is not news).
 */
import { ref, watch } from 'vue';

/**
 * @param litIds A getter over the ids that are lit right now. A getter rather than a value because the
 *   caller derives it every time the ledger moves, and the diff has to see each of those.
 * @param isOpen Whether the sheet carrying the reveal is open.
 * @returns The ids that lit since the sheet opened, as a set a class or attribute can test against.
 */
export function useJustLit(litIds: () => string[], isOpen: () => boolean) {
  const fresh = ref<Set<string>>(new Set());
  let seen: string[] = [];

  watch(litIds, (ids) => {
    const justLit = ids.filter((id) => !seen.includes(id));
    seen = [...ids];
    if (justLit.length > 0) fresh.value = new Set([...fresh.value, ...justLit]);
  });

  // `immediate` so the rule does not depend on how the caller mounts: a watcher that only ever fires on
  // a *change* would let the first ledger tick read a whole ladder of old rungs as freshly lit.
  watch(
    isOpen,
    (open) => {
      seen = open ? [...litIds()] : [];
      fresh.value = new Set();
    },
    { immediate: true },
  );

  return fresh;
}
