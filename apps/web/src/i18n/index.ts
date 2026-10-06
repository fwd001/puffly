/**
 * The three tiers — §9 of the Smoke Ritual brief: target language → English → icons only.
 *
 * Two readers of one table. What a player *sees* may fall all the way to nothing, because the
 * core loop is meant to be walkable on icons and digits alone. What a screen reader *hears*
 * never falls to nothing: an unnamed control is a broken control, and §64 outranks the aesthetic.
 */

import { COPY, LOCALES, isRtl, type CopyKey, type LocaleCode } from './copy';

export { COPY, isRtl, LOCALES };
export type { CopyKey, LocaleCode };
export { CTA_KEYS, ctaKeyFor, HINT_KEYS, LANGUAGES, STATE_KEYS, type LanguageChoice } from './copy';

/** English is the anchor every key is defined against, and the tag `icons` still reads under. */
export const ANCHOR_LOCALE = 'en';

/** How many strings the anchor carries: the denominator every other tier is measured against. */
export const TIER_TOTAL = Object.keys(COPY[ANCHOR_LOCALE] ?? {}).length;

/**
 * `4 / 139` for a tier that is offered but not finished; `null` for one that is.
 *
 * A language button spells its name in its own script, and العربية reads as a promise. §9 lets a
 * partial table fall back to English — that part is the design — but the row may not hide a
 * three-percent table behind an endonym. Digits, so the answer reads in every tier.
 */
export function coverageOf(code: string): string | null {
  const table = COPY[code];
  if (!table) return null;
  const done = Object.keys(table).length;
  return done >= TIER_TOTAL ? null : `${String(done)} / ${String(TIER_TOTAL)}`;
}

/** The languages with a table of their own; `icons` is a tier, not a language. */
const SPOKEN: readonly LocaleCode[] = LOCALES.filter((code) => code !== 'icons');

/**
 * Which language the interface actually speaks, from what the player asked for and what the
 * device offers. Unknown values fall back to the device rather than to a half-translated table,
 * so a save written by a future build with more languages still reads correctly here.
 */
export function resolveLocale(
  stored: string | undefined,
  deviceLanguages: readonly string[],
): LocaleCode {
  if (stored === 'icons') return 'icons';
  if (stored !== undefined && (SPOKEN as readonly string[]).includes(stored)) {
    return stored as LocaleCode;
  }
  for (const tag of deviceLanguages) {
    const exact = SPOKEN.find((code) => code.toLowerCase() === tag.toLowerCase());
    if (exact !== undefined) return exact;
    const family = tag.split('-')[0]?.toLowerCase();
    const related = SPOKEN.find((code) => code.toLowerCase().split('-')[0] === family);
    if (related !== undefined) return related;
  }
  return ANCHOR_LOCALE;
}

type Params = Record<string, string>;

function fill(value: string, params?: Params): string {
  if (params === undefined) return value;
  return value.replace(/\{(\w+)\}/g, (match, name: string) => params[name] ?? match);
}

/** The visible word, or `null` when the scene should say it with an icon instead. */
export function translate(locale: string, key: CopyKey, params?: Params): string | null {
  if (locale === 'icons') return null;
  const own = COPY[locale]?.[key];
  return fill(own ?? COPY[ANCHOR_LOCALE]?.[key] ?? '', params) || null;
}

/** The announced name: always something, whatever tier the visuals are on. */
export function announce(locale: string, key: CopyKey, params?: Params): string {
  const spoken = translate(locale === 'icons' ? ANCHOR_LOCALE : locale, key, params);
  return spoken ?? key;
}

export interface I18n {
  t(key: CopyKey, params?: Params): string | null;
  say(key: CopyKey, params?: Params): string;
  rtl: boolean;
}

export function createI18n(locale: string): I18n {
  return {
    t: (key, params) => translate(locale, key, params),
    say: (key, params) => announce(locale, key, params),
    rtl: isRtl(locale),
  };
}
