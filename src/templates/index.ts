import { themeConfig as themeDefault } from "./theme-default";
import type { ThemeConfig } from "@/types";

export const themes: Record<string, ThemeConfig> = {
  "theme-default": themeDefault,
};

export function getTheme(slug: string): ThemeConfig | null {
  return themes[slug] ?? null;
}

export function listThemes(): ThemeConfig[] {
  return Object.values(themes);
}
