import { describe, expect, it } from 'vitest';
import { SessionEventType } from '@puffly/game-core';
import { harness, lit, sessionTypes } from './harness';

describe('the break, end to end (§8, §11)', () => {
  it('starts on the table with nothing lit — no tutorial needed (§0)', () => {
    const h = harness();
    expect(h.state().cigarette.state).toBe('IDLE');
    expect(h.state().cigarette.ember.lit).toBe(false);
    expect(h.state().smoke.density).toBe(0);
  });

  it('a tap lifts the cigarette', () => {
    const h = harness();
    h.tap('cigarette');
    h.run(16);
    expect(h.state().cigarette.state).toBe('PICKED_UP');
    expect(sessionTypes(h)).toContain(SessionEventType.PICK_UP);
  });

  it('a tap on the lighter catches, and the cherry comes up on its own', () => {
    const h = harness();
    h.tap('cigarette');
    h.run(16);
    h.tap('lighter');
    h.run(200);
    expect(h.state().cigarette.state).toBe('LIGHTING');
    expect(h.state().lighter.flame).toBeGreaterThan(0.5);

    h.run(900);
    expect(h.state().cigarette.state).toBe('BURNING');
    expect(h.state().cigarette.ember.lit).toBe(true);
    expect(sessionTypes(h)).toContain(SessionEventType.LIGHT);
  });

  it('burning eats the rod over its own burn duration (§12)', () => {
    const h = harness();
    lit(h);
    const before = h.state().cigarette.rodRemaining;
    h.run(1000);
    const after = h.state().cigarette.rodRemaining;
    // 4000ms rod, give or take the per-rod smoulder jitter.
    expect(before - after).toBeGreaterThan(0.18);
    expect(before - after).toBeLessThan(0.32);
  });

  it('a hold draws: ember and intensity rise together, a release exhales (§14)', () => {
    const h = harness();
    lit(h);
    const emberBefore = h.state().cigarette.ember.brightness;

    h.press('cigarette');
    h.run(500);
    const held = h.state();
    expect(held.cigarette.state).toBe('PUFFING');
    expect(held.cigarette.puff.intensity).toBeGreaterThan(0.3);
    expect(held.cigarette.ember.brightness).toBeGreaterThan(emberBefore);

    h.release('cigarette');
    expect(sessionTypes(h)).toContain(SessionEventType.PUFF);
    expect(h.state().cigarette.puff.count).toBe(1);
    const exhale = h.bursts.filter(
      (event) => event.kind === 'burst' && event.burst.kind === 'exhale',
    );
    expect(exhale.length).toBe(1);

    h.run(300);
    expect(h.state().cigarette.state).toBe('RESTING');
    h.run(900);
    expect(['BURNING', 'ASH_READY']).toContain(h.state().cigarette.state);
  });

  it('a tap is only a sip (§14)', () => {
    const h = harness();
    lit(h, 1200);
    h.tap('cigarette');
    h.run(16);
    const puff = h.sessionEvents.find((event) => event.type === SessionEventType.PUFF);
    expect(puff?.payload?.['intensity']).toBeLessThan(0.4);
    expect(h.state().cigarette.puff.active).toBe(false);
  });

  it('ash grows, asks to be flicked, and comes off when flicked (§18)', () => {
    const h = harness();
    lit(h);
    expect(h.state().cigarette.ash.length).toBeGreaterThan(0);

    h.until(() => h.state().cigarette.ash.ready, 3000);
    expect(h.state().cigarette.state).toBe('ASH_READY');
    expect(h.state().cigarette.ash.bend).toBeGreaterThan(0);

    const before = h.state().cigarette.ash.dropped;
    h.tap('ash');
    const after = h.state().cigarette.ash;
    // One step of burning has already started a new column; it is the *ask* that ended.
    expect(after.length).toBeLessThan(after.criticalLength);
    expect(after.ready).toBe(false);
    expect(after.dropped).toBe(before + 1);
    expect(after.falling.length).toBeGreaterThan(0);
    expect(sessionTypes(h)).toContain(SessionEventType.ASH);
  });

  it('a column nobody flicks falls on its own (§18)', () => {
    const h = harness();
    lit(h, 1200);
    expect(h.state().cigarette.ash.dropped).toBeGreaterThanOrEqual(1);
    expect(sessionTypes(h)).toContain(SessionEventType.ASH_FALL);
  });

  it('falling ash obeys gravity rather than a canned loop (§18)', () => {
    const h = harness();
    lit(h);
    h.until(() => h.state().cigarette.ash.ready, 3000);
    h.tap('ash');
    const fragment = h.state().cigarette.ash.falling[0];
    expect(fragment).toBeDefined();
    const startY = fragment?.origin.y ?? 0;
    h.run(600);
    const later = h.state().cigarette.ash.falling.find((item) => item.id === fragment?.id);
    if (later) expect(later.origin.y).toBeGreaterThan(startY);
    h.run(4000);
    expect(h.state().cigarette.ash.falling.every((item) => item.settledAtMs > 0)).toBe(true);
  });

  it('pressing it into the tray puts it out with a burst (§19)', () => {
    const h = harness();
    lit(h, 400);
    h.press('ashtray');
    h.run(400);
    expect(h.state().cigarette.state).toBe('EXTINGUISHING');
    expect(
      h.bursts.some((event) => event.kind === 'burst' && event.burst.kind === 'extinguish'),
    ).toBe(true);

    h.run(700);
    expect(h.state().cigarette.state).toBe('EXTINGUISHED');
    expect(h.state().cigarette.ember.lit).toBe(false);
    expect(sessionTypes(h)).toContain(SessionEventType.EXTINGUISH);
  });

  it('letting go early does not put it out (§19: pressure, not a button)', () => {
    const h = harness();
    lit(h, 400);
    h.press('ashtray');
    h.run(150);
    h.release('ashtray');
    h.run(300);
    expect(h.state().cigarette.state).not.toBe('EXTINGUISHED');
    expect(h.state().cigarette.ember.lit).toBe(true);
  });

  it('a rod that burns to the end goes out by itself (§11)', () => {
    const h = harness();
    lit(h);
    h.run(5200);
    expect(h.state().cigarette.rodRemaining).toBe(0);
    expect(h.state().cigarette.state).toBe('EXTINGUISHED');
  });

  it('stubbing out in the tray, then letting go, discards it and turns up a fresh rod (§20)', () => {
    const h = harness();
    lit(h, 400);
    h.tap('ashtray');
    h.until(() => h.state().cigarette.state === 'EXTINGUISHED', 2000);
    expect(sessionTypes(h)).toContain(SessionEventType.EXTINGUISH);

    h.tap('ashtray');
    h.until(() => h.state().cigarette.state === 'DISCARDED', 500);
    expect(h.state().cigarette.pose.inTray).toBe(true);
    expect(sessionTypes(h)).toContain(SessionEventType.DISCARD);

    h.run(2600);
    expect(h.state().cigarette.state).toBe('IDLE');
    expect(h.state().cigarette.rodRemaining).toBe(1);
  });

  it('a lit rod dragged over the tray is smothered first, never tossed burning (§20, §84)', () => {
    const h = harness();
    lit(h);
    const body = h.state().anchors.body;
    const tray = h.state().anchors.ashtray;

    h.pointerDown(body.x, body.y);
    h.dragTo(tray.x, tray.y);
    h.pointerUp(tray.x, tray.y);
    h.run(1200);

    expect(h.state().cigarette.state).toBe('DISCARDED');
    expect(h.state().cigarette.ember.lit).toBe(false);
    expect(sessionTypes(h)).toContain(SessionEventType.EXTINGUISH);
    expect(sessionTypes(h)).toContain(SessionEventType.DISCARD);

    // And then, without being asked, a fresh rod turns up on the table (§42).
    h.run(2000);
    expect(h.state().cigarette.state).toBe('IDLE');
    expect(h.state().cigarette.rodRemaining).toBe(1);
  });

  it('dragging lifts the rod toward the finger, so movement feels held (§14 drag)', () => {
    const h = harness();
    h.tap('cigarette');
    const body = h.state().anchors.body;
    const before = h.state().cigarette.pose.pivot.y;
    h.pointerDown(body.x, body.y);
    h.dragTo(0.4, 0.3);
    h.run(200);
    expect(h.state().cigarette.pose.pivot.y).toBeLessThan(before);
    h.pointerUp(0.4, 0.3);
    h.run(400);
    expect(h.state().cigarette.pose.dragged).toBe(false);
  });

  it('a dead stub is not re-lit — it has to be thrown away', () => {
    const h = harness();
    lit(h, 400);
    h.tap('ashtray');
    h.run(1000);
    h.tap('ashtray');
    h.run(600);
    expect(h.state().cigarette.state).toBe('DISCARDED');
  });

  it('a lighter that will not catch just makes you try again (§21)', () => {
    const h = harness({ lighterId: 'test-flaky' });
    h.tap('cigarette');
    h.run(16);
    h.tap('lighter');
    h.run(900);
    expect(sessionTypes(h)).toContain(SessionEventType.LIGHT_FAIL);
    expect(sessionTypes(h)).not.toContain(SessionEventType.LIGHT);
    expect(h.state().cigarette.state).toBe('PICKED_UP');
    expect(h.state().lighter.sputter).toBeGreaterThan(0);
  });

  it('chrome fades out once the player stops touching it (§10)', () => {
    const h = harness();
    h.tap('cigarette');
    h.run(100);
    expect(h.state().ui.controlsVisible).toBe(true);
    h.run(4000);
    expect(h.state().ui.controlsVisible).toBe(false);
    h.tap('lighter');
    h.run(50);
    expect(h.state().ui.controlsVisible).toBe(true);
  });

  it('a swipe ends whatever was in progress, so a gesture is never counted twice (§20)', () => {
    const h = harness();
    lit(h);

    // Draw and flick at the same time: the release must come from the swipe, not after it.
    h.press('cigarette');
    h.run(400);
    expect(h.state().cigarette.puff.active).toBe(true);
    h.swipe('cigarette', 0.8, 0.1);
    expect(h.state().cigarette.puff.active).toBe(false);
    expect(sessionTypes(h)).toContain(SessionEventType.PUFF);

    // A flick toward the tray is the §20 discard, and it happens once.
    h.run(60);
    const before = sessionTypes(h).filter((type) => type === SessionEventType.DISCARD).length;
    h.swipe('cigarette', 1.2, 0.2);
    h.run(900);
    const after = sessionTypes(h).filter((type) => type === SessionEventType.DISCARD).length;
    expect(after).toBe(before + 1);
    expect(h.state().cigarette.state).toBe('DISCARDED');

    // And a fresh rod turns up without being asked, which is what keeps the loop closed (§42).
    h.run(1500);
    expect(h.state().cigarette.state).toBe('IDLE');
  });

  it('suggests one next affordance, without words (§28)', () => {
    const h = harness();
    h.tap('cigarette');
    expect(h.state().ui.affordance).toBe('lighter');
    lit(h);
    h.until(() => h.state().cigarette.state === 'ASH_READY', 3000);
    expect(h.state().ui.affordance).toBe('flick');
  });
});
