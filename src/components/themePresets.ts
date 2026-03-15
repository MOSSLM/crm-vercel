export type ThemePreset = 'default' | 'ocean' | 'sunset' | 'forest' | 'midnight';

export interface ThemePresetConfig {
  id: ThemePreset;
  name: string;
  description: string;
  cssVars: Record<string, string>;
}

export const THEME_PRESETS: ThemePresetConfig[] = [
  {
    id: 'default',
    name: 'Sama (défaut)',
    description: 'Le style actuel de l\'application, équilibré et lisible.',
    cssVars: {},
  },
  {
    id: 'ocean',
    name: 'Ocean Pro',
    description: 'Palette bleue/teal pour des dashboards très data-driven.',
    cssVars: {
      '--accent': '#e6f4ff',
      '--accent-foreground': '#0f5ea8',
      '--ring': 'rgba(15, 94, 168, 0.28)',
      '--radius': '1.05rem',
      '--border': '#c7dff3',
      '--input': '#cce2f5',
      '--sidebar-accent': '#e8f4ff',
      '--sidebar-border': '#cfe4f5',
      '--chart-1': '#1d4ed8',
      '--chart-2': '#0ea5e9',
      '--chart-3': '#14b8a6',
      '--chart-4': '#22c55e',
      '--chart-5': '#6366f1',
      '--chart-6': '#0ea5e9',
      '--chart-7': '#14b8a6',
      '--chart-8': '#22c55e',
      '--chart-9': '#1d4ed8',
      '--chart-10': '#0ea5e9',
      '--chart-11': '#14b8a6',
      '--chart-12': '#6366f1',
    },
  },
  {
    id: 'sunset',
    name: 'Sunset Sales',
    description: 'Couleurs chaudes pour un rendu énergique orienté conversion.',
    cssVars: {
      '--accent': '#fff1e6',
      '--accent-foreground': '#c2410c',
      '--ring': 'rgba(194, 65, 12, 0.24)',
      '--radius': '1.15rem',
      '--border': '#f1d9cb',
      '--input': '#f5e0d5',
      '--sidebar-accent': '#fff2e8',
      '--sidebar-border': '#f3ddcf',
      '--chart-1': '#ea580c',
      '--chart-2': '#f97316',
      '--chart-3': '#fb7185',
      '--chart-4': '#f59e0b',
      '--chart-5': '#e11d48',
      '--chart-6': '#f97316',
      '--chart-7': '#fb7185',
      '--chart-8': '#f59e0b',
      '--chart-9': '#ea580c',
      '--chart-10': '#f97316',
      '--chart-11': '#e11d48',
      '--chart-12': '#fb7185',
    },
  },
  {
    id: 'forest',
    name: 'Forest Focus',
    description: 'Un thème nature, apaisant, excellent pour longues sessions CRM.',
    cssVars: {
      '--accent': '#e9f5e9',
      '--accent-foreground': '#1f7a4a',
      '--ring': 'rgba(31, 122, 74, 0.24)',
      '--radius': '0.8rem',
      '--border': '#cfe2d0',
      '--input': '#d6e7d6',
      '--sidebar-accent': '#eaf4ea',
      '--sidebar-border': '#d5e5d5',
      '--chart-1': '#15803d',
      '--chart-2': '#22c55e',
      '--chart-3': '#0f766e',
      '--chart-4': '#84cc16',
      '--chart-5': '#65a30d',
      '--chart-6': '#22c55e',
      '--chart-7': '#0f766e',
      '--chart-8': '#84cc16',
      '--chart-9': '#15803d',
      '--chart-10': '#22c55e',
      '--chart-11': '#0f766e',
      '--chart-12': '#65a30d',
    },
  },
  {
    id: 'midnight',
    name: 'Midnight Glass',
    description: 'Look premium, contrasté et net pour le mode sombre.',
    cssVars: {
      '--accent': '#1f2633',
      '--accent-foreground': '#c5d6ff',
      '--ring': 'rgba(120, 146, 255, 0.4)',
      '--radius': '0.7rem',
      '--border': '#3a465a',
      '--input': '#344156',
      '--sidebar-accent': '#252f40',
      '--sidebar-border': '#354155',
      '--chart-1': '#8b5cf6',
      '--chart-2': '#6366f1',
      '--chart-3': '#38bdf8',
      '--chart-4': '#22d3ee',
      '--chart-5': '#a78bfa',
      '--chart-6': '#6366f1',
      '--chart-7': '#38bdf8',
      '--chart-8': '#22d3ee',
      '--chart-9': '#8b5cf6',
      '--chart-10': '#6366f1',
      '--chart-11': '#38bdf8',
      '--chart-12': '#a78bfa',
    },
  },
];

export const THEME_PRESET_KEYS = Array.from(
  new Set(THEME_PRESETS.flatMap((preset) => Object.keys(preset.cssVars)))
);

export const THEME_PRESET_STORAGE_KEY = 'theme-preset';
