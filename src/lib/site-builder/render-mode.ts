/**
 * Render-mode resolution for site-builder sections.
 *
 * - "managed" (default): the site builder applies its coherence layer — forced
 *   section padding, max-width, color-scheme, and the `!important` font / radius
 *   / CTA rules — so heterogeneous sections share a house style.
 * - "raw": the section renders EXACTLY as its own markup/CSS defines. The
 *   builder imposes nothing (no forced padding, background, fonts, radius,
 *   color-scheme, or max-width). Used for imported / hand-designed sections
 *   that must stay faithful to their original design.
 *
 * Precedence: a per-instance override (`content.__unmanaged_style`) always wins
 * over the section's stored default (`theme_sections.render_mode`). This lets
 * any individual placement be flipped to raw (or back to managed) regardless of
 * the library section's default.
 *
 * Kept dependency-free so it is safe to import from both server and client
 * render paths.
 */
export type RenderMode = "managed" | "raw";

/** Reserved key on `site_section_instances.content` carrying the per-instance override. */
export const UNMANAGED_STYLE_KEY = "__unmanaged_style";

/**
 * Resolve whether a section instance should render in raw (unmanaged) mode.
 *
 * @param content    The instance content (may carry `__unmanaged_style`).
 * @param renderMode The section's stored default (`theme_sections.render_mode`).
 */
export function isUnmanaged(
  content: Record<string, unknown> | null | undefined,
  renderMode?: string | null,
): boolean {
  const override = content?.[UNMANAGED_STYLE_KEY];
  if (typeof override === "boolean") return override;
  return renderMode === "raw";
}
