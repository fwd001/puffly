/**
 * Props you tap: lighters and ashtrays — SPEC.md §28, §38, §44.
 *
 * The lighter is the first thing a player sees and instinctively presses (§0), so it is
 * always on stage and never behind a label.
 */

import { rgb } from '@puffly/shared';
import type { AshtrayContent, LighterContent } from '@puffly/game-core';

export const LIGHTERS: LighterContent[] = [
  {
    id: 'wheel',
    name: 'Wheel',
    ignitionTimeMs: { min: 620, max: 940 },
    failureChance: 0.06,
    flame: { height: 0.052, flicker: 0.5, hue: rgb(255, 170, 74), sparkles: 3 },
    soundProfileId: 'lighter-wheel',
    unlock: { kind: 'default' },
  },
  {
    id: 'clip',
    name: 'Clip',
    ignitionTimeMs: { min: 480, max: 720 },
    failureChance: 0.1,
    flame: { height: 0.044, flicker: 0.72, hue: rgb(255, 190, 110), sparkles: 5 },
    soundProfileId: 'lighter-clip',
    unlock: { kind: 'day', day: 3 },
  },
  {
    id: 'brass',
    name: 'Brass',
    ignitionTimeMs: { min: 900, max: 1400 },
    failureChance: 0.03,
    flame: { height: 0.062, flicker: 0.32, hue: rgb(255, 148, 52), sparkles: 2 },
    soundProfileId: 'lighter-brass',
    unlock: { kind: 'sessions', count: 10 },
  },
  {
    id: 'storm',
    name: 'Storm',
    ignitionTimeMs: { min: 360, max: 560 },
    failureChance: 0.02,
    flame: { height: 0.07, flicker: 0.24, hue: rgb(120, 190, 255), sparkles: 8 },
    soundProfileId: 'lighter-storm',
    unlock: { kind: 'day', day: 30 },
  },
];

export const ASHTRAYS: AshtrayContent[] = [
  {
    id: 'stone',
    name: 'Stone',
    catchRadius: 0.1,
    material: { base: rgb(78, 76, 74), rim: rgb(116, 112, 106), reflect: 0.12 },
    soundProfileId: 'tray-stone',
    unlock: { kind: 'default' },
  },
  {
    id: 'glass',
    name: 'Glass',
    catchRadius: 0.11,
    material: { base: rgb(120, 136, 148), rim: rgb(188, 206, 216), reflect: 0.4 },
    soundProfileId: 'tray-glass',
    unlock: { kind: 'day', day: 7 },
  },
  {
    id: 'tin',
    name: 'Tin',
    catchRadius: 0.12,
    material: { base: rgb(96, 92, 84), rim: rgb(158, 150, 136), reflect: 0.28 },
    soundProfileId: 'tray-tin',
    unlock: { kind: 'puffs', count: 60 },
  },
  {
    id: 'porcelain',
    name: 'Porcelain',
    catchRadius: 0.095,
    material: { base: rgb(214, 212, 206), rim: rgb(240, 238, 234), reflect: 0.34 },
    soundProfileId: 'tray-porcelain',
    unlock: { kind: 'day', day: 45 },
  },
];
