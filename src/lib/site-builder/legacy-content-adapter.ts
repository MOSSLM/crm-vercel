import type { SectionBlockInstance, SiteSectionInstance } from '@/types';

/**
 * Maps schema-driven content keys (Shopify-like, e.g. `heading`, `subheading`,
 * `cta_primary`) to the legacy keys the section renderer / snippet engine still
 * consumes (`title`, `subtitle`, `cta`, `items`, …).
 *
 * Strategy: never overwrite an explicitly-set legacy value. If `content.title`
 * already exists, we keep it; otherwise we surface `content.heading` under
 * `title`. This keeps both old and freshly-generated instances rendering.
 *
 * Block arrays (`instance.blocks`) are projected back into the legacy array
 * shapes (e.g. `items`, `testimonials`, `faqs`, …) since the snippet engine
 * iterates over those keys.
 */

type Mapping = { from: string; to: string; transform?: (value: unknown) => unknown };

/**
 * Per-key aliases. Source key (`from`) is the new schema id; target key (`to`)
 * is the legacy key consumed by section components / snippets.
 */
const FIELD_ALIASES: Mapping[] = [
  { from: 'heading', to: 'title' },
  { from: 'subheading', to: 'subtitle' },
  { from: 'body', to: 'content' },
  { from: 'background_image', to: 'backgroundImage' },
  { from: 'image_position', to: 'imagePosition' },
  { from: 'logo_image', to: 'logo' },
  { from: 'logo_text', to: 'logoText' },
  { from: 'submit_label', to: 'submitText' },
];

/** Combine cta_primary + cta_primary_href into a legacy `cta` object. */
function deriveCta(content: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (content.cta === undefined && (content.cta_primary || content.cta_primary_href)) {
    out.cta = {
      text: content.cta_primary ?? '',
      href: content.cta_primary_href ?? '#',
    };
  }
  if (content.ctaSecondary === undefined && (content.cta_secondary || content.cta_secondary_href)) {
    out.ctaSecondary = {
      text: content.cta_secondary ?? '',
      href: content.cta_secondary_href ?? '#',
    };
  }
  return out;
}

/**
 * Project layout-related schema fields into the legacy `settings` object the
 * section components expect.
 */
function deriveSettings(content: Record<string, unknown>): Record<string, unknown> {
  const existing = (content.settings as Record<string, unknown>) ?? {};
  return {
    ...existing,
    // Hero / about
    height: existing.height ?? content.height,
    overlay: existing.overlay ?? (typeof content.overlay_opacity === 'number' && (content.overlay_opacity as number) > 0),
    overlayOpacity: existing.overlayOpacity ?? content.overlay_opacity,
    layout: existing.layout ?? content.layout,
    columns: existing.columns ?? content.columns,
    // Services
    style: existing.style ?? content.card_style,
    showIcons: existing.showIcons ?? content.show_icons,
    // Contact
    showMap: existing.showMap ?? content.show_map,
    showForm: existing.showForm ?? content.show_form,
    showPhone: existing.showPhone ?? content.show_phone,
    showEmail: existing.showEmail ?? content.show_email,
    showAddress: existing.showAddress ?? content.show_address,
    // FAQ
    faqStyle: existing.faqStyle ?? content.style,
    openFirst: existing.openFirst ?? content.open_first,
    // Testimonials
    showRating: existing.showRating ?? content.show_ratings,
    showAvatars: existing.showAvatars ?? content.show_avatars,
    // Gallery
    gap: existing.gap ?? content.gap,
    lightbox: existing.lightbox ?? content.lightbox,
    // Logos
    autoplay: existing.autoplay ?? content.autoplay,
    grayscale: existing.grayscale ?? content.grayscale,
    logoHeight: existing.logoHeight ?? content.logo_height,
    // Generic
    align: existing.align ?? content.text_align,
  };
}

/**
 * Maps a section's `blocks[]` into the legacy array shapes the snippet engine
 * iterates over. Section-type-aware so e.g. `service_item` lands at `items`/`cards`.
 */
function blocksToLegacyArrays(
  blocks: SectionBlockInstance[],
  existing: Record<string, unknown>,
): Record<string, unknown> {
  if (!blocks || blocks.length === 0) return {};

  // Group blocks by type so different block types in the same section land in
  // different keys (e.g. `nav_link` → `links`, `service_item` → `items`).
  const byType: Record<string, Array<Record<string, unknown>>> = {};
  for (const b of blocks) {
    if (!byType[b.type]) byType[b.type] = [];
    byType[b.type].push({ ...b.settings });
  }

  const out: Record<string, unknown> = {};
  for (const [type, items] of Object.entries(byType)) {
    switch (type) {
      case 'service_item':
      case 'feature_item':
        if (existing.items === undefined) out.items = items;
        if (existing.cards === undefined) out.cards = items;
        break;
      case 'testimonial_item':
        if (existing.testimonials === undefined) out.testimonials = items.map((t) => ({
          name: t.author,
          role: t.role,
          text: t.quote,
          rating: t.rating,
          avatar: t.avatar,
        }));
        if (existing.reviews === undefined) out.reviews = out.testimonials;
        break;
      case 'faq_item':
        if (existing.faqs === undefined) out.faqs = items;
        if (existing.items === undefined) out.items = items;
        break;
      case 'stat_item':
        if (existing.stats === undefined) out.stats = items;
        break;
      case 'gallery_item':
        if (existing.images === undefined) out.images = items.map((g) => ({ src: g.src, alt: g.alt, caption: g.caption }));
        break;
      case 'team_member':
        if (existing.members === undefined) out.members = items;
        break;
      case 'logo_item':
        if (existing.logos === undefined) out.logos = items;
        break;
      case 'nav_link':
        if (existing.links === undefined) out.links = items;
        break;
      case 'footer_column':
        if (existing.columns === undefined) out.columns = items;
        break;
      default:
        // Unknown block type: expose as-is keyed by `<type>s`
        if (existing[`${type}s`] === undefined) out[`${type}s`] = items;
    }
  }
  return out;
}

/**
 * Returns a content object enriched with legacy aliases. Existing keys win:
 * we never clobber an explicitly-authored legacy value.
 */
export function adaptContentForRender(
  content: Record<string, unknown>,
  blocks: SectionBlockInstance[] = [],
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...content };

  // 1) Field-level aliases (heading → title, etc.)
  for (const { from, to, transform } of FIELD_ALIASES) {
    if (out[to] === undefined && out[from] !== undefined) {
      out[to] = transform ? transform(out[from]) : out[from];
    }
  }

  // 2) Composite fields (cta, settings)
  Object.assign(out, deriveCta(out));
  out.settings = deriveSettings(out);

  // 3) Blocks → legacy arrays
  Object.assign(out, blocksToLegacyArrays(blocks, out));

  return out;
}

/**
 * Convenience wrapper for instance-level adaption.
 */
export function adaptInstanceForRender(instance: SiteSectionInstance): Record<string, unknown> {
  return adaptContentForRender(instance.content ?? {}, instance.blocks ?? []);
}
