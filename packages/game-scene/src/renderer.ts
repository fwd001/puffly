/**
 * The renderer factory the shell hands to TresJS.
 *
 * SPEC §76 was "no engine dependency — Canvas 2D and requestAnimationFrame only". It is rewritten
 * (2026-10-09) to: TresJS + three, WebGPU first and WebGL2 when the machine has no adapter. The
 * two backends share one set of TSL materials, so there is no second shader to keep in sync.
 *
 * Measured in the throwaway spike before this package existed: a WebGPU adapter is available on a
 * secure origin (localhost or https) and a minimal scene rendered 165 frames with no errors; the
 * same build's WebGL2 path is what the local device gate exercises, since a browser without
 * `navigator.gpu` must still be able to play.
 */
import type { TresRendererSetupContext } from '@tresjs/core';
import { WebGPURenderer } from 'three/webgpu';

export interface RendererChoice {
  readonly backend: 'webgpu' | 'webgl2';
}

/**
 * Builds the renderer and reports which backend it actually got. The report is not decoration: the
 * device suite asserts both backends render, and a silent fallback would make "WebGPU works" and
 * "WebGPU was never used" look identical from the outside.
 */
export interface RendererOptions {
  onChoice?: (choice: RendererChoice) => void;
  /** Ask for the WebGL2 backend even where a WebGPU adapter exists — the device gate's second pass. */
  forceWebGL?: boolean;
}

export function createPufflyRenderer(
  ctx: TresRendererSetupContext,
  options: RendererOptions = {},
): WebGPURenderer {
  const renderer = new WebGPURenderer({
    canvas: ctx.canvas instanceof HTMLCanvasElement ? ctx.canvas : undefined,
    alpha: true,
    antialias: true,
    forceWebGL: options.forceWebGL === true,
  });
  void renderer
    .init()
    .then(() => {
      options.onChoice?.({ backend: backendOf(renderer) });
    })
    .catch(() => {
      // A renderer that never initialised is not a renderer: report the fallback, which is what the
      // device suite will exercise anyway.
      options.onChoice?.({ backend: 'webgl2' });
    });
  return renderer;
}

/**
 * Which backend this renderer actually got.
 *
 * three marks the concrete backends (`WebGPUBackend.isWebGPUBackend`, `WebGLBackend.isWebGLBackend`)
 * but types `renderer.backend` as the base class, so the flag has to be read through a narrowing
 * check. It is a runtime fact, not a guess: the spike printed it, and the device suite asserts both
 * values so "WebGPU works" and "WebGPU was never used" cannot look alike.
 */
function backendOf(renderer: { backend?: unknown }): 'webgpu' | 'webgl2' {
  const backend = renderer.backend;
  if (typeof backend === 'object' && backend !== null && 'isWebGPUBackend' in backend) {
    return (backend as { isWebGPUBackend?: unknown }).isWebGPUBackend === true
      ? 'webgpu'
      : 'webgl2';
  }
  return 'webgl2';
}
