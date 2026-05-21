import type { RelumeBuilderState, StyleGuide, SitemapPage, SiteMenus } from "@/types";

export interface SerializedInstance {
  section_id: string | null;
  sort_order: number;
  content: Record<string, unknown>;
  blocks: Array<{ id?: string; type: string; settings: Record<string, unknown>; service_tag?: string | null }>;
  custom_style: Record<string, string>;
  is_hidden: boolean;
}

export interface SerializedThemeConfig {
  styleGuide: StyleGuide;
  sitemap: SitemapPage[];
  menus: SiteMenus;
  instancesByPage: Record<string, SerializedInstance[]>;
  version: 1;
}

export function serializeTheme(state: RelumeBuilderState): SerializedThemeConfig {
  const instancesByPage: Record<string, SerializedInstance[]> = {};

  for (const [pageSlug, ids] of Object.entries(state.instancesByPage)) {
    instancesByPage[pageSlug] = ids
      .map((id) => state.instances[id])
      .filter(Boolean)
      .flatMap((inst) => {
        // Modern builder sections are library sections (section_id null +
        // content.__library). Keep any instance referencing a real section.
        const hasLibraryRef = !!(inst.content as Record<string, unknown>)?.__library;
        if (!inst.section_id && !hasLibraryRef) return [];

        return [{
          section_id: inst.section_id ?? null,
          sort_order: inst.sort_order,
          content: inst.content,
          blocks: (inst.blocks ?? []).map((b) => ({
            id: b.id,
            type: b.type,
            settings: b.settings,
            service_tag: b.service_tag ?? null,
          })),
          custom_style: (inst.custom_style ?? {}) as Record<string, string>,
          is_hidden: inst.is_hidden,
        }];
      });
  }

  return {
    version: 1,
    styleGuide: state.styleGuide,
    sitemap: state.sitemap,
    menus: state.menus,
    instancesByPage,
  };
}

export function countThemeSections(config: SerializedThemeConfig): number {
  return Object.values(config.instancesByPage).reduce((sum, arr) => sum + arr.length, 0);
}
