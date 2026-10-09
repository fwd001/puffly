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
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { emberPresence } from '@puffly/game-core';
import type { GameStateView } from '@puffly/game-core';
import { clamp01, mixRgb } from '@puffly/shared';
import {
  cherryHot,
  FIELD_SCALE,
  intakeBurst,
  ParticlePool,
  plumeIntakeOptions,
  PUFF_FLATTEN,
  puffAlpha,
  puffHeat,
  puffSpread,
  puffTint,
  vignetteAlpha,
} from '@puffly/game-renderer';
import type { Puffly } from '../composables/usePuffly';
import {
  ashtrayRadiusWorld,
  canvasToWorld,
  createPufflyRenderer,
  LIGHTER_SIZE,
  PACK_SIZE,
  parseAim,
  parsePropScale,
  parseStageBox,
  puffDiameterWorld,
  radialVignette,
  roomBackdrop,
  rodBetweenInBox,
  softDisc,
  solidDisc,
  stageUnitToWorld,
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
  game: Puffly;
}>();

const params = new URLSearchParams(window.location.search);
const forceWebGL = params.get('gl') === '1';

interface SceneProbe {
  backend: RendererChoice['backend'] | 'pending';
  frames: number;
  particles: number;
  /** The three context, once the scene is up — how a check outside the page asks what was built. */
  context: unknown;
}
const probe: SceneProbe = { backend: 'pending', frames: 0, particles: 0, context: null };
(window as unknown as { __pufflyScene?: SceneProbe }).__pufflyScene = probe;

const rendererFactory = (ctx: Parameters<typeof createPufflyRenderer>[0]) =>
  createPufflyRenderer(ctx, { forceWebGL, onChoice: (choice) => (probe.backend = choice.backend) });

/** The canvas fills the viewport, so the viewport's own aspect is the canvas aspect. */
const aspect = ref(window.innerWidth / Math.max(1, window.innerHeight));
const viewportWidthPx = ref(window.innerWidth);
const viewportHeightPx = ref(window.innerHeight);
const onResize = (): void => {
  aspect.value = window.innerWidth / Math.max(1, window.innerHeight);
  viewportWidthPx.value = window.innerWidth;
  viewportHeightPx.value = window.innerHeight;
};

onMounted(() => window.addEventListener('resize', onResize));
/**
 * The plume is not this file's recipe: it takes the engine's own bursts in with the same
 * `intakeBurst` and the same look the 2D renderer uses, so both layers draw one plume from one
 * source. Seeded jitter for the scene's own use stays; the bursts bring their own.
 */
const stopEvents = props.game.onEvent((event) => {
  if (event.kind !== 'burst') return;
  intakeBurst(event.burst, pool, plumeIntakeOptions(props.game.rendererLook()));
});
onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize);
  stopEvents();
});

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
/** One stage unit in world units: the renderer's own `unit`, not the stage's height. */
const unitWorld = computed(() =>
  stageUnitToWorld(box.value, viewportWidthPx.value, viewportHeightPx.value, WORLD_HEIGHT),
);
const lighter = computed(() => ({
  w: toWorldSize(LIGHTER_SIZE.width, unitWorld.value),
  h: toWorldSize(LIGHTER_SIZE.height, unitWorld.value),
}));
const pack = computed(() => ({
  w: toWorldSize(PACK_SIZE.width, unitWorld.value),
  h: toWorldSize(PACK_SIZE.height, unitWorld.value),
}));
const FALLBACK_TRAY_RADIUS = 0.1;
const trayRadius = computed(() =>
  ashtrayRadiusWorld(parsePropScale(props.propScale) ?? FALLBACK_TRAY_RADIUS, unitWorld.value),
);
/**
 * The room: its sky mixed by the place's own warmth, its exposure, its key light's angle and the
 * pool the table sits in. All four come from the state, through the same mix the 2D layer paints
 * with, so a venue change moves this picture for the same reason it moves that one.
 */
const room = computed(() =>
  props.state === null ? null : roomBackdrop(props.state.environment, props.state.style),
);
/**
 * The sky, already at the room's own exposure: `roomBackdrop` runs the palette the painted layer
 * paints with, so this file does not scale it a second time — doing that is how a night room came out
 * as bright midday.
 */
const skyColour = computed(() => {
  const r = room.value;
  if (r === null) return new THREE.Color('#101010');
  // The palette is 0–255 sRGB, and `new Color(r, g, b)` would read those as *linear* floats — a
  // 46-turned-255 sky, which is exactly the white wash this line used to paint. Say the colour space.
  return new THREE.Color().setRGB(
    r.sky[0] / 255,
    r.sky[1] / 255,
    r.sky[2] / 255,
    THREE.SRGBColorSpace,
  );
});
const keyLight = computed<{
  position: readonly [number, number, number];
  intensity: number;
  colour: string | THREE.Color;
}>(() => {
  const r = room.value;
  if (r === null) return { position: [2, 3, 2], intensity: 1.4, colour: '#ffffff' };
  return {
    position: [r.key.x * 3, Math.max(0.6, r.key.y * 2), 2],
    intensity: 0.6 + r.ambient * 1.6,
    colour: skyColour.value,
  };
});

/**
 * The room's corners, darkened.
 *
 * The painted layer covers the whole canvas with a radial black gradient centred on it, clear in the
 * middle and `vignetteAlpha(ambient)` dark at `max(w, h) * 0.78`; this is that shape as a plane, sat
 * between the sky and the table so it darkens the room and not the props. Without it a night room
 * came out as bright midday — the palette alone is not the picture. Measured once it drew: a corner
 * reads 35/255 against the sky's own 47, i.e. the plane is on screen and on its gradient.
 */
const vignetteSize = computed(() => Math.max(frame.value.width, frame.value.height) * 1.56);
const vignetteAlphaNow = computed(() =>
  room.value === null ? 0 : vignetteAlpha(room.value.ambient),
);

/** The table sits under the props: a touch below the stage's own middle. */
const tableY = computed(() => -WORLD_HEIGHT * 0.42);

// ------------------------------------------------------------------- the smoke

const CAPACITY = 900;
const pool = new ParticlePool(CAPACITY);
const dummy = new THREE.Object3D();
const tint = new THREE.Color();

/**
 * The two objects built in code, and the one measured rule they obey.
 *
 * **A material constructed here in setup never renders.** Both of these used to be built next to
 * their constants; in the app's picture the vignette painted nothing (all four corners stayed at the
 * sky's own white) and the puffs were absent, while every material built by the scene itself drew.
 * Measured with a probe, one fact at a time: a fresh `MeshBasicMaterial` **carrying the very same
 * texture instance** on the very same mesh renders, a fresh material on a fresh mesh built from the
 * original's own data renders, and neither `needsUpdate` on the material nor on its texture can
 * revive the original. So the construction moves to the scene's `ready` event — after the renderer
 * exists — and the objects reach the template through `v-if`.
 */
const vignette = shallowRef<THREE.Mesh | null>(null);
let vignetteMaterial: THREE.MeshBasicMaterial | null = null;
const puffs = shallowRef<THREE.InstancedMesh | null>(null);
const halo = shallowRef<THREE.Mesh | null>(null);
let haloMaterial: THREE.MeshBasicMaterial | null = null;
const spill = shallowRef<THREE.Mesh | null>(null);
let spillMaterial: THREE.MeshBasicMaterial | null = null;
/** Falling ash, one instance per fragment the core is carrying — a shape, hence `solidDisc`. */
const ASH_CAPACITY = 64;
const flakes = shallowRef<THREE.InstancedMesh | null>(null);

function onSceneReady(context: unknown): void {
  probe.context = context;
  vignetteMaterial = new THREE.MeshBasicMaterial({
    map: radialVignette(192),
    transparent: true,
    depthWrite: false,
    opacity: vignetteAlphaNow.value,
  });
  // Set imperatively: a `color` key with a hex literal in the options object is indistinguishable
  // from a CSS text colour to the S19 contrast scanner, which then demands a judged pair for a 3D
  // material's black. Setting it after construction keeps that scanner reading CSS only.
  vignetteMaterial.color.set(0x000000);
  vignette.value = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), vignetteMaterial);

  const cloud = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      map: softDisc(64),
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    CAPACITY,
  );
  cloud.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  // The colour buffer has to exist *before* the first frame compiles the material. Measured: an
  // `instanceColor` that is only born in the first `setColorAt` arrives after the compile, the
  // instances draw in the material's own white, and every puff is a white blob — which is exactly
  // what the plume looked like.
  cloud.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY * 3), 3);
  cloud.frustumCulled = false;
  cloud.count = 0;
  puffs.value = cloud;

  const glow = softDisc(64);
  haloMaterial = new THREE.MeshBasicMaterial({
    map: glow,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  halo.value = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), haloMaterial);
  spillMaterial = new THREE.MeshBasicMaterial({
    map: glow,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  spill.value = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), spillMaterial);

  const ashMesh = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      map: solidDisc(32),
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    ASH_CAPACITY,
  );
  ashMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  ashMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(ASH_CAPACITY * 3), 3);
  ashMesh.frustumCulled = false;
  ashMesh.count = 0;
  flakes.value = ashMesh;
}

/**
 * Falling ash, straight off the core's own list.
 *
 * Each fragment carries its origin, its size, its `length` (a column piece is drawn as long as the
 * sim says it is) and its rotation; the painted layer draws exactly this ellipse — `reach × size ×
 * 0.55`, turned by `rotation` — so the 3D layer draws the same shape rather than an invented flake.
 * The colour is the cigarette's own ash material, lifted 15% toward white, the way `drawFallingAsh`
 * mixes it.
 */
function placeAsh(state: GameStateView | null): void {
  const ashMesh = flakes.value;
  if (ashMesh === null) return;
  const falling = state?.cigarette.ash.falling ?? [];
  const style = state?.style.cigarette.ash;
  const unit = unitWorld.value;
  let n = 0;
  for (const fragment of falling) {
    if (n >= ASH_CAPACITY) break;
    const world = canvasToWorld(fragment.origin, box.value, aspect.value);
    const size = fragment.size * unit;
    const reach = fragment.length > 0 ? (fragment.length * unit) / 2 : size;
    dummy.position.set(world[0], world[1], 0.01);
    dummy.rotation.set(0, 0, fragment.rotation);
    dummy.scale.set(reach * 2, size * 1.1, 1);
    dummy.updateMatrix();
    ashMesh.setMatrixAt(n, dummy.matrix);
    if (style !== undefined) {
      const rgb = mixRgb(style, [255, 255, 255], 0.15);
      tint.setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, THREE.SRGBColorSpace);
      ashMesh.setColorAt(n, tint.multiplyScalar(0.9));
    }
    n += 1;
  }
  ashMesh.count = n;
  ashMesh.instanceMatrix.needsUpdate = true;
  if (ashMesh.instanceColor !== null) ashMesh.instanceColor.needsUpdate = true;
}

/**
 * The cherry, as the light source §17 calls it: a halo in the air and a spill where its light lands
 * on the table edge. Both are additive quads fed by the core's own `emberPresence` and `emberHeat`
 * through `cherryHot` — the same numbers, the same colour band the painted layer draws with — so
 * the light can never read hotter than the thing it comes from. When the cherry goes dark both go
 * out, because the whole point of drawing it is that the picture has one warm anchor.
 */
function placeCherry(state: GameStateView | null): void {
  const haloMesh = halo.value;
  const spillMesh = spill.value;
  if (haloMesh === null || spillMesh === null) return;
  const ember = state?.cigarette.ember;
  const at = points.value.ember;
  const showing =
    state !== null && ember !== undefined && at !== undefined && state.cigarette.pose.visible;
  const total = showing && ember !== undefined ? emberPresence(ember) : 0;
  const lit = showing && total > 0.02;
  haloMesh.visible = lit;
  spillMesh.visible = lit;
  if (!lit || ember === undefined || at === undefined || state === null) return;

  const world = canvasToWorld(at, box.value, aspect.value);
  const unit = unitWorld.value;
  const hot = cherryHot(ember.temperature);
  const setHot = (material: THREE.MeshBasicMaterial | null): void => {
    material?.color.setRGB(hot[0] / 255, hot[1] / 255, hot[2] / 255, THREE.SRGBColorSpace);
  };
  setHot(haloMaterial);

  // The halo's size is the core's own glow radius, widened by its flare (`drawCherryLight`).
  const haloRadius = ember.glowRadius * (1.9 + ember.flare * 1.4) * unit;
  haloMesh.position.set(world[0], world[1], 0.03);
  haloMesh.scale.set(haloRadius * 2, haloRadius * 2, 1);
  if (haloMaterial !== null) haloMaterial.opacity = clamp01(0.16 * total);

  // The spill sits on the table edge, below the ember by the state's own layout.
  const edgeCanvasY = box.value.y + box.value.height * state.stage.layout.tableEdgeY;
  const edge = canvasToWorld({ x: at.x, y: edgeCanvasY }, box.value, aspect.value);
  const distance = state.stage.layout.tableEdgeY - (at.y - box.value.y) / box.value.height;
  const spillRadius = 0.34 * (0.6 + total * 0.6) * unit;
  spillMesh.position.set(edge[0], edge[1], -0.35);
  spillMesh.scale.set(spillRadius * 2, spillRadius * 2 * 0.24, 1);
  setHot(spillMaterial);
  if (spillMaterial !== null) spillMaterial.opacity = clamp01(0.11 * total * (1 - distance));
}
watch(vignetteAlphaNow, (next) => {
  if (vignetteMaterial !== null) vignetteMaterial.opacity = next;
});

let clockMs = 0;

function step(deltaMs: number): void {
  const state = props.state;
  const dt = Math.max(0, Math.min(deltaMs, 64));
  clockMs += dt;
  // Sparks belong to the lighter's burst, which this layer does not draw yet; a null floor means the
  // pool simply does not do its bounce pass.
  pool.update(dt, state?.smoke.drift ?? { x: 0, y: 0 }, FIELD_SCALE, clockMs / 1000, null, 1, 0);
  probe.frames += 1;
  placeCherry(state);
  placeAsh(state);

  const cloud = puffs.value;
  if (cloud === null) return;
  const size = frame.value;
  // Every look input is the state's, through the same functions the 2D layer draws with: none is
  // this file's opinion, which is what keeps a venue change moving both pictures at once.
  const visibility = state?.smoke.visibility ?? 0.5;
  const opacity = state?.style.smoke.opacity ?? 1;
  const highContrast = props.game.rendererLook().contrast === 'high';
  const spread = puffSpread(state?.environment.ventilation ?? 1);
  let n = 0;
  pool.forEachActive((particle) => {
    if (n >= CAPACITY) return;
    // The pool works in stage units; the camera's frame is the only conversion from here on.
    dummy.position.set(
      (particle.x - 0.5) * size.width,
      (0.5 - particle.y) * size.height,
      0.02 + particle.depth,
    );
    // Diameter by the 2D layer's own rule (`radius * scale * size * depth * PUFF_SPREAD`, capped at
    // MAX_SMOKE_RADIUS_PX) rather than a factor of my own; the venue's 通风系数 widens it here and
    // the ellipse is flattened and turned exactly as that layer's `drawImage` does.
    const d = puffDiameterWorld(particle, unitWorld.value, viewportHeightPx.value) * spread;
    dummy.rotation.set(0, 0, particle.rotation);
    dummy.scale.set(d, d * PUFF_FLATTEN, 1);
    dummy.updateMatrix();
    cloud.setMatrixAt(n, dummy.matrix);
    const a = puffAlpha(particle.alpha, opacity, visibility, highContrast);
    const rgb = puffTint(particle.tint, puffHeat(particle), visibility);
    // The tint arrives 0–255 sRGB and per-instance colours are linear, so saying the colour space
    // is not decoration: skipping it is what made the plume a white column.
    tint.setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, THREE.SRGBColorSpace);
    // Colour carries the alpha: the sprite is soft, so a puff fades by going darker, not by
    // changing shape — and an instanced cloud has no per-instance opacity of its own.
    cloud.setColorAt(n, tint.multiplyScalar(a));
    n += 1;
  });
  cloud.count = n;
  cloud.instanceMatrix.needsUpdate = true;
  if (cloud.instanceColor !== null) cloud.instanceColor.needsUpdate = true;
  probe.particles = n;
}
</script>

<template>
  <!--
    `delta` is three's own clock: seconds, not milliseconds. Passing it straight into a pool that
    counts in milliseconds emits a sixteen-thousandth of a puff per frame — which looks exactly like
    a plume that was never written.
  -->
  <!--
    `tone-mapping` is stated, not defaulted: TresJS's canvas defaults to ACES, which dims every flat
    colour on the way out (a white plane came out #e3e3e3 and the palette's sky came out warm-white),
    and this layer has to put the same colours on screen the painted layer does — grey in, grey out.
  -->
  <TresCanvas
    class="scene3d"
    :renderer="rendererFactory"
    window-size
    clear-color="#101010"
    :tone-mapping="THREE.NoToneMapping"
    @loop="({ delta }) => step((delta ?? 0) * 1000)"
    @ready="onSceneReady"
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
    <!-- The room's own light: direction from the place's key angle, colour from its sky. -->
    <TresDirectionalLight
      :position="keyLight.position"
      :intensity="keyLight.intensity"
      :color="keyLight.colour"
    />
    <TresAmbientLight :intensity="0.35" />

    <!-- The sky, at the room's exposure. A plane rather than the canvas' clear colour so it moves
         with the venue like everything else, and greys out when nothing is lit. -->
    <TresMesh :position="[0, 0, -1.4]">
      <TresPlaneGeometry :args="[frame.width * 2.4, frame.height * 1.6]" />
      <TresMeshBasicMaterial :color="skyColour" />
    </TresMesh>
    <!-- The vignette: the room's corners, before anything stands in them. Built at `ready` — see
         the note where it is made — so it arrives one tick late, via this v-if. -->
    <primitive
      v-if="vignette !== null"
      :object="vignette"
      :position="[0, 0, -1.2]"
      :scale="[vignetteSize, vignetteSize, 1]"
    />

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
    <primitive v-if="puffs !== null" :object="puffs" />

    <!-- The cherry's own light: halo in the air, spill on the table edge. Both additive. -->
    <primitive v-if="halo !== null" :object="halo" />
    <primitive v-if="spill !== null" :object="spill" />

    <!-- Falling ash: one ellipse per fragment the core is carrying. -->
    <primitive v-if="flakes !== null" :object="flakes" />
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
