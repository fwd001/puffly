/**
 * 点内容区域之外就收起 —— the rule behind every sheet's dismissal, kept as one predicate so the
 * device layer can drive the whole gesture and this file can prove which presses count.
 *
 * Only a press that lands on the scene itself closes a sheet. A press on the panel, the rail, the
 * head-up row or the bottom bar has its own meaning already (a row being dragged, an entry that
 * switches to another sheet), and taking it away would make the interface less capable, not more.
 * The scene press is also *not* taken from the break: holding to draw and swiping down to fold the
 * chrome both run over the same surface, so closing and acting are two honest answers to one press.
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest';
import { isScenePress } from '../dismiss';

function tree(): { scene: HTMLCanvasElement; inside: HTMLElement; rail: HTMLElement } {
  const stage = document.createElement('main');
  const scene = document.createElement('canvas');
  const sheet = document.createElement('section');
  sheet.setAttribute('data-sheet', 'shelf');
  const inside = document.createElement('button');
  sheet.append(inside);
  const rail = document.createElement('nav');
  stage.append(scene, sheet, rail);
  document.body.append(stage);
  return { scene, inside, rail };
}

describe('the press that puts a sheet away', () => {
  it('counts the scene itself', () => {
    const { scene } = tree();
    expect(isScenePress(scene, scene)).toBe(true);
  });

  it('ignores the panel, however deep inside it the press lands', () => {
    const { scene, inside } = tree();
    expect(isScenePress(scene, inside)).toBe(false);
  });

  it('ignores the chrome that already answers the press', () => {
    const { scene, rail } = tree();
    expect(isScenePress(scene, rail)).toBe(false);
  });

  it('is false before there is a canvas to press', () => {
    const { scene } = tree();
    expect(isScenePress(null, scene)).toBe(false);
    expect(isScenePress(scene, null)).toBe(false);
  });
});
