<script setup lang="ts">
/**
 * The 3D stage, under construction (2026-10-09).
 *
 * Mounted only when the URL asks for it (`?scene=3d`, `&gl=1` forces the WebGL2 path), so the
 * shipped interface is untouched while this grows. It reads the two mirrors a check outside the
 * page reads — `.stage[data-aim]` (five anchors, canvas fractions) and `.stage[data-stage-box]`
 * (the letterboxed stage rectangle) — and nothing else: the core owns the geometry (SPEC §79), and a
 * second copy of it is the mistake this repository has already paid for twice.
 */
import { TresCanvas } from '@tresjs/core';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import {
  ashtrayRadiusWorld,
  canvasToWorld,
  createPufflyRenderer,
  LIGHTER_SIZE,
  PACK_SIZE,
  parseAim,
  parsePropScale,
  parseStageBox,
  rodBetweenInBox,
  stageWorldSize,
  toWorldSize,
  TRAY_FLATTEN,
  WORLD_HEIGHT,
  type RendererChoice,
  type StageBox,
} from '@puffly/game-scene';

const props = defineProps<{ aim: string; stageBox: string; propScale: string }>();

const params = new URLSearchParams(window.location.search);
const forceWebGL = params.get('gl') === '1';

interface SceneProbe {
  backend: RendererChoice['backend'] | 'pending';
  frames: number;
}
const probe: SceneProbe = { backend: 'pending', frames: 0 };
(window as unknown as { __pufflyScene?: SceneProbe }).__pufflyScene = probe;

const rendererFactory = (ctx: Parameters<typeof createPufflyRenderer>[0]) =>
  createPufflyRenderer(ctx, { forceWebGL, onChoice: (choice) => (probe.backend = choice.backend) });

/** The canvas fills the viewport, so the viewport's own aspect is the canvas aspect. */
const aspect = ref(window.innerWidth / Math.max(1, window.innerHeight));
const onResize = (): void => {
  aspect.value = window.innerWidth / Math.max(1, window.innerHeight);
};
onMounted(() => window.addEventListener('resize', onResize));
onBeforeUnmount(() => window.removeEventListener('resize', onResize));

/** Until the shell publishes a box, treat the canvas as the stage — never crash, never assume more. */
const FALLBACK_BOX: StageBox = { x: 0, y: 0, width: 1, height: 1 };
const box = computed(() => parseStageBox(props.stageBox) ?? FALLBACK_BOX);
/** The camera frames the stage box, not the canvas: the letterbox is not part of the picture. */
const frame = computed(() => stageWorldSize(box.value, aspect.value));

const points = computed(() => parseAim(props.aim));
const at = (key: 'lighter' | 'ashtray' | 'pack'): readonly [number, number, number] => {
  const p = points.value[key];
  return p === undefined ? [0, -99, 0] : canvasToWorld(p, box.value, aspect.value);
};
const rod = computed(() => {
  const { body, ember } = points.value;
  return body === undefined || ember === undefined
    ? null
    : rodBetweenInBox(body, ember, box.value, aspect.value);
});
/**
 * Sizes in world units. One stage unit is the stage's own height (see `props.ts`), so every number
 * the core or the 2D props module owns multiplies `WORLD_HEIGHT` and nothing is re-invented here.
 */
const lighter = computed(() => ({
  w: toWorldSize(LIGHTER_SIZE.width, WORLD_HEIGHT),
  h: toWorldSize(LIGHTER_SIZE.height, WORLD_HEIGHT),
}));
const pack = computed(() => ({
  w: toWorldSize(PACK_SIZE.width, WORLD_HEIGHT),
  h: toWorldSize(PACK_SIZE.height, WORLD_HEIGHT),
}));
const FALLBACK_TRAY_RADIUS = 0.1;
const trayRadius = computed(() =>
  ashtrayRadiusWorld(parsePropScale(props.propScale) ?? FALLBACK_TRAY_RADIUS, WORLD_HEIGHT),
);
/** The table sits under the props: a touch below the stage's own middle. */
const tableY = computed(() => -WORLD_HEIGHT * 0.42);
</script>

<template>
  <TresCanvas
    class="scene3d"
    :renderer="rendererFactory"
    window-size
    clear-color="#101010"
    @loop="probe.frames += 1"
  >
    <!--
      An orthographic stage box, not a perspective camera: the mirror's fractions describe the stage,
      so the camera's frame is the stage's world size and a point lands where the core says it is.
      A perspective camera put the tray in the wrong place and at the wrong size.
    -->
    <TresOrthographicCamera
      :args="[-frame.width / 2, frame.width / 2, frame.height / 2, -frame.height / 2, 0.1, 100]"
      :position="[0, 0, 3]"
      :look-at="[0, 0, 0]"
    />
    <TresDirectionalLight :position="[2, 3, 2]" :intensity="1.6" />
    <TresAmbientLight :intensity="0.5" />

    <!-- The table: a slab, not a plane, so it catches the key light the way the 2D one does. -->
    <TresMesh :position="[0, tableY, -0.4]">
      <TresBoxGeometry :args="[frame.width * 1.2, WORLD_HEIGHT * 0.6, 0.3]" />
      <TresMeshStandardMaterial color="#241c17" :roughness="0.85" />
    </TresMesh>

    <TresMesh :position="at('lighter')">
      <TresBoxGeometry :args="[lighter.w, lighter.h, lighter.w]" />
      <TresMeshStandardMaterial color="#b08a52" :metalness="0.5" :roughness="0.35" />
    </TresMesh>
    <TresMesh :position="at('pack')">
      <TresBoxGeometry :args="[pack.w, pack.h, pack.w * 0.6]" />
      <TresMeshStandardMaterial color="#a63a2c" :roughness="0.6" />
    </TresMesh>
    <!--
      A disc facing the camera, squashed by the 2D layer's own ratio: the canvas draws the tray as an
      ellipse because its drawing implies a view from a little above, and the 3D layer reproduces that
      convention as geometry. Tilting the camera would have reproduced the look by breaking the 1:1
      mapping between the mirror's fractions and the screen.
    -->
    <!-- The squash is on the LOCAL z axis on purpose: scale is applied before the rotation, and this
         disc is turned a quarter turn about x — so its local z is what the screen reads as vertical.
         Squashing local y instead (the obvious guess) squashes the tray's thickness into the screen
         and leaves a perfect circle on it. -->
    <TresMesh
      :position="at('ashtray')"
      :rotation="[-Math.PI / 2, 0, 0]"
      :scale="[1, 1, TRAY_FLATTEN]"
    >
      <TresCylinderGeometry :args="[trayRadius, trayRadius, trayRadius * 0.28, 32]" />
      <TresMeshStandardMaterial color="#6b6b70" :metalness="0.3" :roughness="0.5" />
    </TresMesh>

    <!-- The rod: a cylinder between the two published points, rotated by the angle it implies. -->
    <TresMesh v-if="rod !== null" :position="rod.mid" :rotation="[0, 0, rod.angle - Math.PI / 2]">
      <TresCylinderGeometry :args="[0.018, 0.018, rod.length, 12]" />
      <TresMeshStandardMaterial color="#e8e2d6" emissive="#ff5a1f" :emissive-intensity="0.6" />
    </TresMesh>
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
