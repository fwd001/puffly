<script setup lang="ts">
/**
 * The 3D stage, under construction (2026-10-09).
 *
 * It renders nothing a player recognises yet — P1 proves the two things that are expensive to get
 * wrong later: that the frame loop runs, and that the machine reports which backend it actually
 * used. It is mounted only when the URL asks for it (`?scene=3d`, plus `&gl=1` to force the WebGL2
 * path), so the shipped interface is untouched while this grows; the canvas renderer stays the live
 * one until the scene reaches parity with the 24-screen ledger.
 */
import { TresCanvas } from '@tresjs/core';
import { createPufflyRenderer, type RendererChoice } from '@puffly/game-scene';

const params = new URLSearchParams(window.location.search);
const forceWebGL = params.get('gl') === '1';

interface SceneProbe {
  backend: RendererChoice['backend'] | 'pending';
  frames: number;
  error: string | null;
}
const probe: SceneProbe = { backend: 'pending', frames: 0, error: null };
(window as unknown as { __pufflyScene?: SceneProbe }).__pufflyScene = probe;

/** The factory TresJS calls once, when it builds the renderer for this canvas. */
const rendererFactory = (ctx: Parameters<typeof createPufflyRenderer>[0]) =>
  createPufflyRenderer(ctx, {
    forceWebGL,
    onChoice: (choice) => {
      probe.backend = choice.backend;
    },
  });
</script>

<template>
  <TresCanvas
    class="scene3d"
    :renderer="rendererFactory"
    window-size
    clear-color="#101010"
    @loop="probe.frames += 1"
  >
    <TresPerspectiveCamera :position="[0, 0, 3]" :look-at="[0, 0, 0]" />
    <!-- P2 replaces this placeholder with the table, the props and the rod. -->
    <TresMesh>
      <TresBoxGeometry :args="[1.2, 0.08, 0.7]" />
      <TresMeshStandardMaterial color="#55412f" />
    </TresMesh>
    <TresDirectionalLight :position="[2, 3, 2]" :intensity="1.4" />
    <TresAmbientLight :intensity="0.5" />
  </TresCanvas>
</template>

<style scoped>
/* Over the live canvas for now, and deaf to the pointer: the 2D stage still owns every gesture. */
.scene3d {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
</style>
