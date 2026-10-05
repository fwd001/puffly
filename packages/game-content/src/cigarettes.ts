/**
 * Fictional cigarettes — SPEC.md §12, §13.
 *
 * Six originals, no real brands (§84). Each one differs in smoke, ember, burn, ash,
 * sound and which environments it suits, so "trying another one" is a real change of
 * texture rather than a recoloured sprite.
 */

import { rgb } from '@puffly/shared';
import type { CigaretteContent } from '@puffly/game-core';

const COMMON_EVENTS = ['wind', 'ember_flare', 'light_change', 'shadow_change', 'ambient_event'];
const ASHY_EVENTS = [...COMMON_EVENTS, 'ash_fall', 'smoke_swirl'];
const STORMY_EVENTS = [...ASHY_EVENTS, 'wind', 'environment_noise'];

export const CIGARETTES: CigaretteContent[] = [
  {
    id: 'classic',
    name: 'Classic',
    // The one everyone recognises: a narrow, lazy column off the cherry.
    character: 'column',
    burnDuration: { min: 168_000, max: 214_000 },
    puffProfile: { intensityMin: 0.34, intensityMax: 0.86, durationMin: 780, durationMax: 2100 },
    smokeProfile: { density: 0.92, turbulence: 0.9, riseSpeed: 0.3, dispersion: 0.85 },
    emberProfile: { brightness: 0.74, flicker: 0.32, flareChance: 0.016 },
    ashProfile: { minLength: 0.022, maxLength: 0.072 },
    physical: {
      lengthMm: 84,
      ashGrams: 2.1,
      centerTempC: [700, 800],
      puffs: { target: 12, min: 8, max: 15 },
    },
    eventPool: ASHY_EVENTS,
    palette: {
      paper: rgb(238, 233, 222),
      band: rgb(196, 68, 52),
      filter: rgb(206, 150, 96),
      ash: rgb(122, 122, 128),
    },
    smokeStyleId: 'grey-classic',
    soundProfileId: 'draw-warm',
    environmentBias: ['quiet-room', 'late-night-desk', 'balcony'],
    unlock: { kind: 'default' },
  },
  {
    id: 'silver',
    name: 'Silver',
    // Wide, faint and slow: it fills the air and mostly refuses to be noticed.
    character: 'haze',
    burnDuration: { min: 150_000, max: 196_000 },
    puffProfile: { intensityMin: 0.28, intensityMax: 0.72, durationMin: 640, durationMax: 1700 },
    smokeProfile: { density: 0.72, turbulence: 0.62, riseSpeed: 0.36, dispersion: 0.6 },
    emberProfile: { brightness: 0.66, flicker: 0.22, flareChance: 0.011 },
    ashProfile: { minLength: 0.018, maxLength: 0.058 },
    physical: {
      lengthMm: 99,
      ashGrams: 1.8,
      centerTempC: [690, 780],
      puffs: { target: 11, min: 8, max: 14 },
    },
    eventPool: COMMON_EVENTS,
    palette: {
      paper: rgb(246, 246, 248),
      band: rgb(150, 158, 168),
      filter: rgb(222, 224, 228),
      ash: rgb(150, 152, 158),
    },
    smokeStyleId: 'silver-veil',
    soundProfileId: 'draw-cool',
    environmentBias: ['neon-street', 'night-city'],
    unlock: { kind: 'day', day: 3 },
  },
  {
    id: 'night',
    name: 'Night',
    // Restless: the column rolls and eddies instead of climbing.
    character: 'curls',
    burnDuration: { min: 122_000, max: 164_000 },
    puffProfile: { intensityMin: 0.4, intensityMax: 0.94, durationMin: 900, durationMax: 2400 },
    smokeProfile: { density: 1.08, turbulence: 1.24, riseSpeed: 0.24, dispersion: 1.05 },
    emberProfile: { brightness: 0.86, flicker: 0.44, flareChance: 0.026 },
    ashProfile: { minLength: 0.026, maxLength: 0.084 },
    physical: {
      lengthMm: 84,
      ashGrams: 2.0,
      centerTempC: [720, 800],
      puffs: { target: 13, min: 9, max: 16 },
    },
    eventPool: STORMY_EVENTS,
    palette: {
      paper: rgb(196, 198, 210),
      band: rgb(38, 42, 62),
      filter: rgb(96, 92, 116),
      ash: rgb(88, 88, 96),
    },
    smokeStyleId: 'night-blue',
    soundProfileId: 'draw-deep',
    environmentBias: ['night-city', 'rainy-window'],
    unlock: { kind: 'day', day: 7 },
  },
  {
    id: 'long',
    name: 'Long',
    character: 'column',
    burnDuration: { min: 240_000, max: 312_000 },
    puffProfile: { intensityMin: 0.24, intensityMax: 0.64, durationMin: 1000, durationMax: 2600 },
    smokeProfile: { density: 0.66, turbulence: 0.54, riseSpeed: 0.42, dispersion: 0.52 },
    emberProfile: { brightness: 0.6, flicker: 0.18, flareChance: 0.008 },
    ashProfile: { minLength: 0.03, maxLength: 0.108 },
    physical: {
      lengthMm: 100,
      ashGrams: 2.6,
      centerTempC: [690, 790],
      puffs: { target: 14, min: 10, max: 18 },
    },
    eventPool: ASHY_EVENTS,
    palette: {
      paper: rgb(240, 238, 232),
      band: rgb(120, 132, 118),
      filter: rgb(228, 214, 188),
      ash: rgb(132, 132, 134),
    },
    smokeStyleId: 'mist-thin',
    soundProfileId: 'draw-cool',
    environmentBias: ['balcony', 'mountain'],
    unlock: { kind: 'sessions', count: 6 },
  },
  {
    id: 'ember',
    name: 'Ember',
    // Balloons outward on the exhale and is gone, with sparks to cover for it.
    character: 'bloom',
    burnDuration: { min: 108_000, max: 146_000 },
    puffProfile: { intensityMin: 0.46, intensityMax: 1, durationMin: 620, durationMax: 1500 },
    smokeProfile: { density: 1.16, turbulence: 1.42, riseSpeed: 0.34, dispersion: 1.2 },
    emberProfile: { brightness: 0.94, flicker: 0.52, flareChance: 0.042 },
    ashProfile: { minLength: 0.016, maxLength: 0.05 },
    physical: {
      lengthMm: 84,
      ashGrams: 1.9,
      centerTempC: [740, 800],
      puffs: { target: 13, min: 9, max: 16 },
    },
    eventPool: STORMY_EVENTS,
    palette: {
      paper: rgb(232, 206, 176),
      band: rgb(214, 96, 40),
      filter: rgb(176, 92, 44),
      ash: rgb(104, 88, 82),
    },
    smokeStyleId: 'ember-warm',
    soundProfileId: 'draw-crackle',
    environmentBias: ['late-night-desk', 'mountain'],
    unlock: { kind: 'puffs', count: 120 },
  },
  {
    id: 'mist',
    name: 'Mist',
    // Cold and heavy: it pours off the cherry and lies on the table.
    character: 'curtain',
    burnDuration: { min: 196_000, max: 246_000 },
    puffProfile: { intensityMin: 0.2, intensityMax: 0.58, durationMin: 1100, durationMax: 2800 },
    smokeProfile: { density: 1.3, turbulence: 0.42, riseSpeed: 0.16, dispersion: 1.35 },
    emberProfile: { brightness: 0.58, flicker: 0.14, flareChance: 0.006 },
    ashProfile: { minLength: 0.024, maxLength: 0.09 },
    physical: {
      lengthMm: 90,
      ashGrams: 2.3,
      centerTempC: [660, 740],
      puffs: { target: 10, min: 7, max: 13 },
    },
    eventPool: [...COMMON_EVENTS, 'smoke_swirl', 'rain'],
    palette: {
      paper: rgb(228, 234, 236),
      band: rgb(132, 172, 178),
      filter: rgb(196, 210, 212),
      ash: rgb(140, 146, 150),
    },
    smokeStyleId: 'mist-thin',
    soundProfileId: 'draw-soft',
    environmentBias: ['rainy-window', 'mountain'],
    unlock: { kind: 'day', day: 14 },
  },
];
