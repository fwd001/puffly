<script setup lang="ts">
/**
 * The 3D stage, under construction (2026-10-09).
 *
 * Mounted only when the URL asks for it (`?scene=3d`, `&gl=1` forces the WebGL2 path), so the
 * shipped interface is untouched while this grows.
 *
 * Everything here is *read*: the positions come from `.stage[data-aim]` / `.stage[data-stage-box]`
 * (the same mirrors a check outside the page reads), the sizes from the core's anchors and the 2D
 * layer's exported constants, and the smoke from the state view — how many puffs a second, how they
 * rise and what colour they are all arrive in `state.smoke`. Nothing in this file is a second copy
 * of a layout or a recipe; that is the mistake this repository has paid for twice.
 */
import { TresCanvas } from '@tresjs/core';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { GameStateView } from '@puffly/game-core';
import { FIELD_SCALE, ParticlePool } from '@puffly/game-renderer';
import {
  ashtrayRadiusWorld,
  canvasToWorld,
  createPufflyRenderer,
  isAlight,
  LIGHTER_SIZE,
  PACK_SIZE,
  parseAim,
  parsePropScale,
  parseStageBox,
  plumeSpawn,
  rodBetweenInBox,
  stageToWorld,
  stageWorldSize,
  toWorldSize,
  TRAY_FLATTEN,
  WORLD_HEIGHT,
  type RendererChoice,
  type StageBox,
} from '@puffly/game-scene';
import * as THREE from 'three';

const props = defineProps<{
  aim: string;
  stageBox: string;
  propScale: string;
  state: GameStateView | null;
}>();

const params = new URLSearchParams(window.location.search);
const forceWebGL = params.get('gl') === '1';

interface SceneProbe {
  backend: RendererChoice['backend'] | 'pending';
  frames: number;
  particles: number;
}
const probe: SceneProbe = { backend: 'pending', frames: 0, particles: 0 };
(window as unknown as { __pufflyScene?: SceneProbe }).__pufflyScene = probe;

const rendererFactory = (ctx: Parameters<typeof createPufflyRenderer>[0]) =>
  createPufflyRenderer(ctx, { forceWebGL, onChoice: (choice) => (probe.backend = choice.backend) });

/** The canvas fills the viewport, so the viewport's own aspect is the canvas aspect. */
const aspect = ref(window.innerWidth / Math.max(1, window.innerHeight));
const viewportHeightPx = ref(window.innerHeight);
const onResize = (): void => {
  aspect.value = window.innerWidth / Math.max(1, window.innerHeight);
  viewportHeightPx.value = window.innerHeight;
};

/**
 * A puff's size, in screen pixels.
 *
 * The 2D layer draws a puff at `radius * unit` pixels, where one stage unit is the stage's height, so
 * measuring the plume in pixels is the same convention rather than a new one. PointsMaterial has one
 * size for the whole cloud, so every puff is drawn at the average radius; per-particle size needs the
 * TSL material the design already calls for (P3), not a second number invented here.
 */
const puffPx = computed(() => Math.max(6, Math.round(0.03 * viewportHeightPx.value)));

/**
 * The material is built here, not declared as a child element.
 *
 * Measured: a 200-pixel `size` written as a child prop changed the picture not at all. Passing a real
 * `PointsMaterial` (the geometry already travels this way) is the honest form either way.
 *
 * **What is still missing, and it is most of the picture**: the puffs come out as a speck rather than
 * a plume. Two suspects, both of which the TSL pass (P3) has to settle: `PointsMaterial.size` does
 * not appear to be honoured on this WebGPU points path, and there is no soft sprite behind the point
 * — a plume is a stack of soft discs, not dots. The pool also carries a `layer` tag
 * (`core`/`edge`/`curl`) that the 2D recipe fills in and this spawn leaves null.
 */
const material = new THREE.PointsMaterial({
  size: puffPx.value,
  vertexColors: true,
  transparent: true,
  depthWrite: false,
  sizeAttenuation: false,
});
watch(puffPx, (next) => {
  material.size = next;
});
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

// ------------------------------------------------------------------- the smoke

const CAPACITY = 900;
const pool = new ParticlePool(CAPACITY);

/** A small seeded generator: the scene's own jitter, so nothing here reads Math.random. */
let seed = 0x9e3779b9;
const spread = (): number => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const positions = new Float32Array(CAPACITY * 3);
const colours = new Float32Array(CAPACITY * 3);
const geometry = new THREE.BufferGeometry();
geometry.setAttribute(
  'position',
  new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage),
);
geometry.setAttribute(
  'color',
  new THREE.BufferAttribute(colours, 3).setUsage(THREE.DynamicDrawUsage),
);
geometry.setDrawRange(0, 0);

let clockMs = 0;
let carry = 0;

/** Where the cherry is, in world units, from the core's own anchor. */
function emberWorld(): readonly [number, number, number] {
  const anchor = props.state?.anchors.ember;
  return anchor === undefined ? [0, 0, 0] : stageToWorld(anchor, frame.value);
}

function step(deltaMs: number): void {
  const state = props.state;
  const dt = Math.max(0, Math.min(deltaMs, 64));
  clockMs += dt;
  // Sparks belong to the lighter's burst, which this layer does not draw yet; a null floor means the
  // pool simply does not do its bounce pass.
  pool.update(dt, state?.smoke.drift ?? { x: 0, y: 0 }, FIELD_SCALE, clockMs / 1000, null, 1, 0);

  if (state !== null && isAlight(state)) {
    carry += state.smoke.emissionRate * (dt / 1000);
    let guard = 0;
    while (carry >= 1 && guard < 16) {
      carry -= 1;
      guard += 1;
      const ember = emberWorld();
      pool.spawn(plumeSpawn(state, { x: ember[0], y: ember[1], z: 0 }, spread));
    }
  } else {
    carry = 0;
  }

  const size = frame.value;
  let n = 0;
  pool.forEachActive((particle) => {
    if (n >= CAPACITY) return;
    // The pool works in stage units; the camera's frame is the only conversion from here on.
    positions[n * 3] = (particle.x - 0.5) * size.width;
    positions[n * 3 + 1] = (0.5 - particle.y) * size.height;
    positions[n * 3 + 2] = 0.02 + particle.depth;
    const a = Math.max(0, Math.min(1, particle.alpha));
    colours[n * 3] = particle.tint[0] * a;
    colours[n * 3 + 1] = particle.tint[1] * a;
    colours[n * 3 + 2] = particle.tint[2] * a;
    n += 1;
  });
  geometry.setDrawRange(0, n);
  geometry.getAttribute('position').needsUpdate = true;
  geometry.getAttribute('color').needsUpdate = true;
  probe.particles = n;
  probe.frames += 1;
}
</script>

<template>
  <!--
    `delta` is three's own clock: seconds, not milliseconds. Passing it straight into a pool that
    counts in milliseconds emits a sixteen-thousandth of a puff per frame — which looks exactly like
    a plume that was never written.
  -->
  <TresCanvas
    class="scene3d"
    :renderer="rendererFactory"
    window-size
    clear-color="#101010"
    @loop="({ delta }) => step((delta ?? 0) * 1000)"
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

    <!--
      The plume: one point per live particle, coloured by the core's own tint and faded by its own
      alpha. The pool, its noise field and its lifetimes are the Canvas 2D layer's `ParticlePool` —
      the half of that renderer worth keeping — and how many puffs a second come out is the core's
      `smoke.emissionRate`, not this file's opinion.
    -->
    <TresPoints :geometry="geometry" :material="material" />
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
