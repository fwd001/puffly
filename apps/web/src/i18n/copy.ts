/**
 * The copy table — SPEC.md §9 of the Smoke Ritual brief: three tiers, target language →
 * English → icons only.
 *
 * English is the anchor, not a translation: every key exists here, because a control with no
 * name at all is the one failure this layer must never cause. `zh-CN` is complete. `ar` is
 * deliberately partial — it is the proof that the fallback works, and the rest of it is a
 * translator's job, not something to invent here.
 */

export const EN = {
  'app.name': 'Puffly',

  'hint.pick': 'tap',
  'hint.lighter': 'light',
  'hint.puff': 'hold',
  'hint.flick': 'flick',
  'hint.extinguish': 'press',
  'hint.discard': 'drop',

  'menu.break': 'this break',
  'menu.shelf': 'the shelf',
  'menu.settings': 'settings',

  'settings.sound': 'Sound',
  'settings.ambient': 'Ambient',
  'settings.smoke': 'Smoke',
  'settings.break': 'Break',
  'settings.word': 'Word',
  'settings.look': 'Look',
  'settings.vibration': 'Vibration',
  'settings.anchor': 'Anchor',
  'settings.data': 'Data',
  'settings.sound.enough': 'enough',
  'settings.sound.little': 'a little',
  'settings.sound.none': 'none',
  'settings.smoke.auto': 'auto',
  'settings.smoke.soft': 'soft',
  'settings.smoke.normal': 'normal',
  'settings.smoke.dense': 'dense',
  'settings.language': 'Language',
  'settings.language.auto': 'auto',
  'settings.language.icons': 'icons',

  'a11y.menu': 'menu',
  'a11y.close': 'close',
  'a11y.export': 'export',
  'a11y.import': 'import',
  'a11y.ambient': 'ambient',
  'a11y.soundLevel': 'sound level',
  'a11y.hintWords': 'hint words',
  'a11y.haptics': 'haptics',
  'a11y.motion': 'reduced motion',
  'a11y.contrast': 'high contrast',
  'a11y.textSize': 'text size',
  'a11y.breakLength': 'break length in minutes',
  'a11y.anchorDate': 'quit anchor date',
  'a11y.language': 'language',
  'a11y.audioUnavailable': 'audio unavailable',
  'a11y.memoryOnly': 'memory only',
  'a11y.smokeOption': 'smoke {word}',
  'a11y.sheetBreak': 'Break',
  'a11y.sheetShelf': 'Collection',
  'a11y.sheetSettings': 'Settings',
  'a11y.sheetMenu': 'Menu',
  'a11y.cravingBefore': 'how strong is the craving now',
  'a11y.cravingAfter': 'how strong is it now',
  'a11y.endBreak': 'end this break',
  'a11y.journey': 'journey',

  'a11y.trigger.coffee': 'coffee',
  'a11y.trigger.drink': 'drink',
  'a11y.trigger.work': 'work',
  'a11y.trigger.angry': 'angry',
  'a11y.trigger.night': 'night',
  'a11y.trigger.people': 'people',
  'a11y.trigger.drive': 'drive',
  'a11y.trigger.meal': 'meal',

  'state.idle': 'a cigarette rests on the table',
  'state.pickedUp': 'held, not lit',
  'state.lighting': 'lighting',
  'state.burning': 'burning',
  'state.puffing': 'drawing',
  'state.resting': 'resting between puffs',
  'state.ashReady': 'the ash is long',
  'state.nearEnd': 'nearly finished',
  'state.extinguishing': 'putting it out',
  'state.extinguished': 'out',
  'state.discarded': 'in the tray',

  'unit.stick': 'stick',
  'unit.puff': 'puff',
} as const;

export type CopyKey = keyof typeof EN;
type Table = Partial<Record<CopyKey, string>>;

const ZH: Table = {
  // The name is not transliterated in any locale, so it maps to itself rather than falling back.
  'app.name': 'Puffly',

  'hint.pick': '点',
  'hint.lighter': '点着',
  'hint.puff': '按住',
  'hint.flick': '弹',
  'hint.extinguish': '摁',
  'hint.discard': '丢',

  'menu.break': '休息中',
  'menu.shelf': '烟架',
  'menu.settings': '设置',

  'settings.sound': '声音',
  'settings.ambient': '环境',
  'settings.smoke': '烟雾',
  'settings.break': '休息',
  'settings.word': '提示词',
  'settings.look': '观感',
  'settings.vibration': '震动',
  'settings.anchor': '起点',
  'settings.data': '数据',
  'settings.sound.enough': '正常',
  'settings.sound.little': '轻一点',
  'settings.sound.none': '静音',
  'settings.smoke.auto': '自动',
  'settings.smoke.soft': '稀',
  'settings.smoke.normal': '中',
  'settings.smoke.dense': '浓',
  'settings.language': '语言',
  'settings.language.auto': '自动',
  'settings.language.icons': '纯图标',

  'a11y.menu': '菜单',
  'a11y.close': '关闭',
  'a11y.export': '导出',
  'a11y.import': '导入',
  'a11y.ambient': '环境音',
  'a11y.soundLevel': '音量',
  'a11y.hintWords': '提示词',
  'a11y.haptics': '震动反馈',
  'a11y.motion': '减少动效',
  'a11y.contrast': '高对比度',
  'a11y.textSize': '文字大小',
  'a11y.breakLength': '休息时长（分钟）',
  'a11y.anchorDate': '起点日期',
  'a11y.language': '语言',
  'a11y.audioUnavailable': '没有可用的音频',
  'a11y.memoryOnly': '只存在内存里',
  'a11y.smokeOption': '烟雾 {word}',
  'a11y.sheetBreak': '这次休息',
  'a11y.sheetShelf': '烟架',
  'a11y.sheetSettings': '设置',
  'a11y.sheetMenu': '菜单',
  'a11y.cravingBefore': '现在有多想抽',
  'a11y.cravingAfter': '现在还剩多少',
  'a11y.endBreak': '结束这次休息',
  'a11y.journey': '这段日子',

  'a11y.trigger.coffee': '咖啡',
  'a11y.trigger.drink': '喝酒',
  'a11y.trigger.work': '工作',
  'a11y.trigger.angry': '烦躁',
  'a11y.trigger.night': '深夜',
  'a11y.trigger.people': '有人',
  'a11y.trigger.drive': '开车',
  'a11y.trigger.meal': '饭后',

  'state.idle': '烟躺在桌上',
  'state.pickedUp': '拿在手里，还没点',
  'state.lighting': '正在点',
  'state.burning': '在烧',
  'state.puffing': '正在吸',
  'state.resting': '歇着，等下一抽',
  'state.ashReady': '灰已经很长',
  'state.nearEnd': '快烧到头了',
  'state.extinguishing': '正在掐灭',
  'state.extinguished': '已经灭了',
  'state.discarded': '在烟灰缸里',

  'unit.stick': '支',
  'unit.puff': '口',
};

/**
 * Partial on purpose. Everything missing here falls through to English, and the browser checks
 * assert that the fall-through is what a player sees — not a blank label.
 */
const AR: Table = {
  'menu.settings': 'الإعدادات',
  'a11y.close': 'إغلاق',
  'settings.sound': 'الصوت',
  'settings.smoke': 'الدخان',
};

export const COPY: Record<string, Table> = { en: EN, 'zh-CN': ZH, ar: AR };

/** The languages a player can pick, plus the third tier as a choice of its own. */
export const LOCALES = ['en', 'zh-CN', 'ar', 'icons'] as const;
export type LocaleCode = (typeof LOCALES)[number];

/** Written right-to-left: the layout mirrors, the burn never does. */
const RTL = new Set(['ar', 'he', 'fa', 'ur']);

export function isRtl(locale: string): boolean {
  return RTL.has(locale);
}

/**
 * §28: the one word the scene is allowed to say, per affordance. The affordance is the engine's
 * own name for "what this finger should do next", so the mapping belongs beside the words rather
 * than in the component that happens to draw them.
 */
export const HINT_KEYS: Record<string, CopyKey> = {
  pick: 'hint.pick',
  lighter: 'hint.lighter',
  puff: 'hint.puff',
  flick: 'hint.flick',
  extinguish: 'hint.extinguish',
  discard: 'hint.discard',
};

/** §4: what a screen reader hears, keyed off `GameState.cigarette.state`. */
export const STATE_KEYS: Record<string, CopyKey> = {
  IDLE: 'state.idle',
  PICKED_UP: 'state.pickedUp',
  LIGHTING: 'state.lighting',
  BURNING: 'state.burning',
  PUFFING: 'state.puffing',
  RESTING: 'state.resting',
  ASH_READY: 'state.ashReady',
  NEAR_END: 'state.nearEnd',
  EXTINGUISHING: 'state.extinguishing',
  EXTINGUISHED: 'state.extinguished',
  DISCARDED: 'state.discarded',
};

export interface LanguageChoice {
  /** What goes into `Settings.language`; `auto` means the player has not said. */
  readonly code: LocaleCode | 'auto';
  /**
   * The name a language calls itself. Deliberately outside the copy table: naming 中文 "Chinese"
   * is the mistake this row exists to avoid, and a player who cannot read the current script has
   * no way to recognise a translated name.
   */
  readonly endonym: string;
  readonly glyph: string;
  /** Set when the chip's word is a translation rather than a self-name. */
  readonly copyKey?: CopyKey;
}

/** The row's order is the fallback order: undecided, then the two complete tables, then none. */
export const LANGUAGES: readonly LanguageChoice[] = [
  { code: 'auto', endonym: 'auto', glyph: '◌', copyKey: 'settings.language.auto' },
  { code: 'en', endonym: 'English', glyph: 'A' },
  { code: 'zh-CN', endonym: '中文', glyph: '中' },
  { code: 'ar', endonym: 'العربية', glyph: 'ع' },
  { code: 'icons', endonym: 'icons', glyph: '∅', copyKey: 'settings.language.icons' },
];
