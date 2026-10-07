/**
 * Smoke looks and sound beds — SPEC.md §15, §26, §38.
 *
 * `SoundProfileContent` is a recipe of synthesised voices, not a file: no MP3 loop
 * anywhere (§26, §87). Ambient beds are deliberately quiet — the player should feel the
 * room rather than hear a track (§27).
 */

import { rgb } from '@puffly/shared';
import type { SmokeStyleContent, SoundProfileContent } from '@puffly/game-core';

export const SMOKE_STYLES: SmokeStyleContent[] = [
  {
    id: 'grey-classic',
    name: 'Grey',
    tint: rgb(198, 196, 198),
    opacity: 1,
    blur: 1,
    swirl: 1,
    unlock: { kind: 'default' },
  },
  {
    id: 'silver-veil',
    name: 'Veil',
    tint: rgb(216, 222, 230),
    opacity: 0.82,
    blur: 1.25,
    swirl: 0.7,
    unlock: { kind: 'day', day: 3 },
  },
  {
    id: 'night-blue',
    name: 'Blue Hour',
    tint: rgb(176, 188, 214),
    opacity: 1.1,
    blur: 0.9,
    swirl: 1.4,
    unlock: { kind: 'day', day: 7 },
  },
  {
    id: 'ember-warm',
    name: 'Warm',
    tint: rgb(224, 196, 168),
    opacity: 1.15,
    blur: 1.05,
    swirl: 1.2,
    unlock: { kind: 'puffs', count: 120 },
  },
  {
    id: 'mist-thin',
    name: 'Thin',
    tint: rgb(206, 214, 214),
    opacity: 0.66,
    blur: 1.5,
    swirl: 0.55,
    unlock: { kind: 'day', day: 14 },
  },
];

export const SOUND_PROFILES: SoundProfileContent[] = [
  {
    id: 'lighter-wheel',
    name: 'Wheel',
    layers: [
      { voice: 'click', gain: 0.5, pitchSpread: 1.5, timingSpreadMs: 12, pan: -0.25, loop: false },
      { voice: 'flame', gain: 0.36, pitchSpread: 2, timingSpreadMs: 30, pan: -0.2, loop: true },
    ],
    unlock: { kind: 'default' },
  },
  {
    id: 'lighter-clip',
    name: 'Clip',
    layers: [
      { voice: 'click', gain: 0.62, pitchSpread: 2.5, timingSpreadMs: 8, pan: -0.2, loop: false },
      { voice: 'flame', gain: 0.3, pitchSpread: 2.5, timingSpreadMs: 26, pan: -0.15, loop: true },
    ],
    unlock: { kind: 'day', day: 3 },
  },
  {
    id: 'lighter-brass',
    name: 'Brass',
    layers: [
      { voice: 'click', gain: 0.44, pitchSpread: 1, timingSpreadMs: 16, pan: -0.3, loop: false },
      { voice: 'flame', gain: 0.42, pitchSpread: 1.5, timingSpreadMs: 34, pan: -0.24, loop: true },
    ],
    unlock: { kind: 'sessions', count: 10 },
  },
  {
    id: 'lighter-storm',
    name: 'Storm',
    layers: [
      { voice: 'click', gain: 0.5, pitchSpread: 3, timingSpreadMs: 6, pan: -0.18, loop: false },
      { voice: 'flame', gain: 0.34, pitchSpread: 4, timingSpreadMs: 20, pan: -0.1, loop: true },
      { voice: 'crackle', gain: 0.18, pitchSpread: 5, timingSpreadMs: 40, pan: 0.1, loop: true },
    ],
    unlock: { kind: 'day', day: 30 },
  },
  {
    id: 'draw-warm',
    name: 'Warm draw',
    layers: [
      { voice: 'draw', gain: 0.4, pitchSpread: 1.5, timingSpreadMs: 20, pan: 0.1, loop: true },
      { voice: 'crackle', gain: 0.16, pitchSpread: 3, timingSpreadMs: 60, pan: 0.15, loop: true },
      { voice: 'puff', gain: 0.34, pitchSpread: 2, timingSpreadMs: 24, pan: 0.05, loop: false },
    ],
    unlock: { kind: 'default' },
  },
  {
    id: 'draw-cool',
    name: 'Cool draw',
    layers: [
      { voice: 'draw', gain: 0.32, pitchSpread: 2.5, timingSpreadMs: 18, pan: 0.18, loop: true },
      { voice: 'puff', gain: 0.28, pitchSpread: 3, timingSpreadMs: 20, pan: 0.12, loop: false },
    ],
    unlock: { kind: 'day', day: 3 },
  },
  {
    id: 'draw-deep',
    name: 'Deep draw',
    layers: [
      { voice: 'draw', gain: 0.46, pitchSpread: 1, timingSpreadMs: 26, pan: 0, loop: true },
      { voice: 'crackle', gain: 0.22, pitchSpread: 2, timingSpreadMs: 50, pan: 0.2, loop: true },
      { voice: 'puff', gain: 0.4, pitchSpread: 1.5, timingSpreadMs: 30, pan: 0, loop: false },
    ],
    unlock: { kind: 'day', day: 7 },
  },
  {
    id: 'draw-crackle',
    name: 'Crackle',
    layers: [
      { voice: 'draw', gain: 0.36, pitchSpread: 3, timingSpreadMs: 14, pan: 0.2, loop: true },
      { voice: 'crackle', gain: 0.34, pitchSpread: 4, timingSpreadMs: 40, pan: 0.25, loop: true },
      { voice: 'ember', gain: 0.2, pitchSpread: 5, timingSpreadMs: 70, pan: 0.3, loop: true },
    ],
    unlock: { kind: 'puffs', count: 120 },
  },
  {
    id: 'draw-soft',
    name: 'Soft draw',
    layers: [
      { voice: 'draw', gain: 0.26, pitchSpread: 1, timingSpreadMs: 30, pan: 0.08, loop: true },
      { voice: 'puff', gain: 0.22, pitchSpread: 1.5, timingSpreadMs: 34, pan: 0.08, loop: false },
    ],
    unlock: { kind: 'day', day: 14 },
  },
  {
    id: 'tray-stone',
    name: 'Stone tray',
    layers: [
      { voice: 'ash', gain: 0.4, pitchSpread: 2, timingSpreadMs: 22, pan: 0.35, loop: false },
    ],
    unlock: { kind: 'default' },
  },
  {
    id: 'tray-glass',
    name: 'Glass tray',
    layers: [
      { voice: 'ash', gain: 0.34, pitchSpread: 3, timingSpreadMs: 18, pan: 0.35, loop: false },
      { voice: 'chime', gain: 0.12, pitchSpread: 4, timingSpreadMs: 40, pan: 0.4, loop: false },
    ],
    unlock: { kind: 'day', day: 7 },
  },
  {
    id: 'tray-tin',
    name: 'Tin tray',
    layers: [
      { voice: 'ash', gain: 0.44, pitchSpread: 4, timingSpreadMs: 12, pan: 0.3, loop: false },
      { voice: 'chime', gain: 0.2, pitchSpread: 6, timingSpreadMs: 30, pan: 0.42, loop: false },
    ],
    unlock: { kind: 'puffs', count: 60 },
  },
  {
    id: 'tray-porcelain',
    name: 'Porcelain tray',
    layers: [
      { voice: 'ash', gain: 0.3, pitchSpread: 1.5, timingSpreadMs: 20, pan: 0.32, loop: false },
      { voice: 'chime', gain: 0.26, pitchSpread: 2, timingSpreadMs: 26, pan: 0.38, loop: false },
    ],
    unlock: { kind: 'day', day: 45 },
  },
  {
    id: 'extinguish',
    name: 'Stub out',
    layers: [
      { voice: 'hiss', gain: 0.5, pitchSpread: 3, timingSpreadMs: 10, pan: 0.2, loop: false },
      { voice: 'ash', gain: 0.2, pitchSpread: 2, timingSpreadMs: 30, pan: 0.3, loop: false },
    ],
    unlock: { kind: 'default' },
  },
  {
    // One per material, because that is the whole difference between the four of them: the hiss is
    // the same steam, but what it lands in is not. `unlock: default` on the stone one keeps it the
    // fallback `byPrefix('extinguish')` reaches for when a bundle has no per-tray entry.
    id: 'extinguish-stone',
    name: 'Stub out on stone',
    layers: [
      { voice: 'hiss', gain: 0.46, pitchSpread: 2, timingSpreadMs: 12, pan: 0.2, loop: false },
      { voice: 'ash', gain: 0.24, pitchSpread: 1.5, timingSpreadMs: 30, pan: 0.3, loop: false },
    ],
    unlock: { kind: 'default' },
  },
  {
    id: 'extinguish-glass',
    name: 'Stub out on glass',
    layers: [
      { voice: 'hiss', gain: 0.42, pitchSpread: 3, timingSpreadMs: 12, pan: 0.2, loop: false },
      { voice: 'chime', gain: 0.2, pitchSpread: 5, timingSpreadMs: 24, pan: 0.36, loop: false },
    ],
    unlock: { kind: 'default' },
  },
  {
    id: 'extinguish-tin',
    name: 'Stub out on tin',
    layers: [
      { voice: 'hiss', gain: 0.48, pitchSpread: 4, timingSpreadMs: 10, pan: 0.2, loop: false },
      { voice: 'chime', gain: 0.26, pitchSpread: 7, timingSpreadMs: 20, pan: 0.4, loop: false },
    ],
    unlock: { kind: 'default' },
  },
  {
    id: 'extinguish-porcelain',
    name: 'Stub out on porcelain',
    layers: [
      { voice: 'hiss', gain: 0.44, pitchSpread: 2.5, timingSpreadMs: 12, pan: 0.2, loop: false },
      { voice: 'chime', gain: 0.3, pitchSpread: 2.5, timingSpreadMs: 26, pan: 0.38, loop: false },
    ],
    unlock: { kind: 'default' },
  },
  {
    id: 'room-quiet',
    name: 'Quiet room',
    layers: [
      { voice: 'room', gain: 0.5, pitchSpread: 0, timingSpreadMs: 0, pan: 0, loop: true },
      { voice: 'ember', gain: 0.1, pitchSpread: 2, timingSpreadMs: 900, pan: 0.4, loop: true },
    ],
    unlock: { kind: 'default' },
  },
  {
    id: 'room-desk',
    name: 'Desk night',
    layers: [
      { voice: 'room', gain: 0.42, pitchSpread: 0, timingSpreadMs: 0, pan: 0, loop: true },
      { voice: 'click', gain: 0.06, pitchSpread: 6, timingSpreadMs: 2600, pan: -0.5, loop: true },
    ],
    unlock: { kind: 'day', day: 21 },
  },
  {
    id: 'city-far',
    name: 'City far',
    layers: [
      { voice: 'city', gain: 0.44, pitchSpread: 0, timingSpreadMs: 0, pan: -0.2, loop: true },
      { voice: 'wind', gain: 0.24, pitchSpread: 2, timingSpreadMs: 400, pan: 0.2, loop: true },
    ],
    unlock: { kind: 'day', day: 3 },
  },
  {
    id: 'city-night',
    name: 'City night',
    layers: [
      { voice: 'city', gain: 0.5, pitchSpread: 0, timingSpreadMs: 0, pan: -0.35, loop: true },
      { voice: 'wind', gain: 0.2, pitchSpread: 3, timingSpreadMs: 500, pan: 0.3, loop: true },
      { voice: 'chime', gain: 0.06, pitchSpread: 5, timingSpreadMs: 4200, pan: 0.5, loop: true },
    ],
    unlock: { kind: 'day', day: 14 },
  },
  {
    id: 'street-neon',
    name: 'Neon street',
    layers: [
      { voice: 'city', gain: 0.42, pitchSpread: 1, timingSpreadMs: 0, pan: 0.3, loop: true },
      { voice: 'rain', gain: 0.22, pitchSpread: 2, timingSpreadMs: 200, pan: -0.3, loop: true },
      { voice: 'chime', gain: 0.08, pitchSpread: 7, timingSpreadMs: 3000, pan: -0.4, loop: true },
    ],
    unlock: { kind: 'day', day: 30 },
  },
  {
    id: 'rain-window',
    name: 'Rain on glass',
    layers: [
      { voice: 'rain', gain: 0.6, pitchSpread: 2, timingSpreadMs: 90, pan: 0.15, loop: true },
      { voice: 'room', gain: 0.26, pitchSpread: 0, timingSpreadMs: 0, pan: -0.1, loop: true },
    ],
    unlock: { kind: 'day', day: 7 },
  },
  {
    id: 'mountain-air',
    name: 'Mountain air',
    layers: [
      { voice: 'wind', gain: 0.5, pitchSpread: 3, timingSpreadMs: 300, pan: 0.1, loop: true },
      { voice: 'room', gain: 0.16, pitchSpread: 0, timingSpreadMs: 0, pan: 0, loop: true },
    ],
    unlock: { kind: 'sessions', count: 14 },
  },
];
