/**
 * Preview viewport simulation for the site builder.
 *
 * In the builder iframe, native `100vh` resolves to the iframe's own
 * viewport height — which is dynamic (height-reporter auto-resize) and
 * leads to broken layouts. To let designers (and the AI) use `vh` freely
 * we substitute a realistic, device-specific px value at preview time.
 * The published site keeps native `vh`.
 */

export const SIMULATED_VIEWPORT_HEIGHT = {
  desktop: 900,
  tablet: 1024,
  mobile: 812,
} as const;

export type DeviceView = keyof typeof SIMULATED_VIEWPORT_HEIGHT;

export function getSimulatedViewportHeight(device: DeviceView): number {
  return SIMULATED_VIEWPORT_HEIGHT[device];
}

/**
 * Replace every `Nvh` literal in a CSS value with its px equivalent on the
 * supplied viewport. Works inside `calc()` expressions too:
 *   convertVhToPx("calc(100vh - 64px)", 900) === "calc(900px - 64px)"
 */
export function convertVhToPx(value: string, viewportPx: number): string {
  return value.replace(/(-?\d*\.?\d+)vh\b/g, (_, n) => {
    const px = (Number(n) / 100) * viewportPx;
    return `${Number.isFinite(px) ? px : 0}px`;
  });
}
