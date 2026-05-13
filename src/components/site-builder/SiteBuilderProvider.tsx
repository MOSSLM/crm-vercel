"use client";

import React from "react";
import type {
  SiteConfig,
  SiteConfigAction,
  SiteConfigState,
  SiteSection,
  SiteConfigPage,
  ThemeGlobalVariables,
  SiteGlobalSettings,
} from "@/types";

function nanoid() {
  return crypto.randomUUID();
}

const defaultPage: SiteConfigPage = {
  id: "page-home",
  slug: "/",
  title: "Accueil",
  sections: [],
};

const defaultConfig: SiteConfig = {
  theme: "theme-default",
  settings: {
    colors: {
      primary: "#1a56db",
      secondary: "#6b7280",
      accent: "#f59e0b",
      background: "#ffffff",
      text: "#111827",
    },
    fonts: { heading: "Inter", body: "Inter", baseSize: "16px" },
    buttons: { borderRadius: "8px", padding: "12px 24px", style: "filled" },
    cards: { borderRadius: "8px", shadow: "md", padding: "24px" },
    spacing: { sectionPadding: "80px", elementGap: "24px" },
    siteSettings: {
      metaTitle: "",
      metaDescription: "",
      faviconUrl: "",
      isActive: true,
    },
  },
  pages: [{ ...defaultPage }],
};

function migrateLegacyConfig(raw: SiteConfig): SiteConfig {
  // If old format: has sections[] but no pages[] → wrap into home page
  const hasPages = Array.isArray(raw.pages) && raw.pages.length > 0;
  const hasSections = Array.isArray((raw as unknown as { sections?: SiteSection[] }).sections);

  if (!hasPages && hasSections) {
    const legacy = raw as unknown as { sections: SiteSection[] } & Omit<SiteConfig, 'pages'>;
    return {
      ...raw,
      pages: [{
        id: "page-home",
        slug: "/",
        title: "Accueil",
        sections: legacy.sections ?? [],
      }],
    };
  }

  if (!hasPages) {
    return { ...raw, pages: [{ ...defaultPage }] };
  }

  return raw;
}

const initialState: SiteConfigState = {
  config: defaultConfig,
  isDirty: false,
  selectedSectionId: null,
  activePageId: "page-home",
};

function reorder<T>(arr: T[], from: number, to: number): T[] {
  const next = [...arr];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function updatePageSections(
  pages: SiteConfigPage[],
  pageId: string,
  updater: (sections: SiteSection[]) => SiteSection[]
): SiteConfigPage[] {
  return pages.map((p) =>
    p.id === pageId ? { ...p, sections: updater(p.sections) } : p
  );
}

function siteConfigReducer(state: SiteConfigState, action: SiteConfigAction): SiteConfigState {
  switch (action.type) {
    case "LOAD_CONFIG": {
      const migrated = migrateLegacyConfig(action.payload.config);
      const firstPageId = migrated.pages[0]?.id ?? null;
      return {
        ...state,
        config: migrated,
        isDirty: false,
        selectedSectionId: null,
        activePageId: firstPageId,
      };
    }

    case "ADD_SECTION": {
      const targetPageId = action.payload.pageId ?? state.activePageId;
      if (!targetPageId) return state;
      const pages = updatePageSections(state.config.pages, targetPageId, (sections) => {
        const next = [...sections];
        const idx = action.payload.index ?? next.length;
        next.splice(idx, 0, action.payload.section);
        return next;
      });
      return {
        ...state,
        config: { ...state.config, pages },
        isDirty: true,
        selectedSectionId: action.payload.section.id,
      };
    }

    case "REMOVE_SECTION": {
      const targetPageId = action.payload.pageId ?? state.activePageId;
      if (!targetPageId) return state;
      const pages = updatePageSections(state.config.pages, targetPageId, (sections) =>
        sections.filter((s) => s.id !== action.payload.sectionId)
      );
      return {
        ...state,
        config: { ...state.config, pages },
        isDirty: true,
        selectedSectionId:
          state.selectedSectionId === action.payload.sectionId ? null : state.selectedSectionId,
      };
    }

    case "UPDATE_SECTION": {
      const targetPageId = action.payload.pageId ?? state.activePageId;
      if (!targetPageId) return state;
      const pages = updatePageSections(state.config.pages, targetPageId, (sections) =>
        sections.map((s) =>
          s.id === action.payload.sectionId ? { ...s, ...action.payload.data } : s
        )
      );
      return {
        ...state,
        config: { ...state.config, pages },
        isDirty: true,
      };
    }

    case "REORDER_SECTIONS": {
      const targetPageId = action.payload.pageId ?? state.activePageId;
      if (!targetPageId) return state;
      const pages = updatePageSections(state.config.pages, targetPageId, (sections) =>
        reorder(sections, action.payload.fromIndex, action.payload.toIndex)
      );
      return {
        ...state,
        config: { ...state.config, pages },
        isDirty: true,
      };
    }

    case "UPDATE_SETTINGS":
      return {
        ...state,
        config: {
          ...state.config,
          settings: deepMerge(
            state.config.settings,
            action.payload.settings as Record<string, unknown>
          ) as SiteConfig["settings"],
        },
        isDirty: true,
      };

    case "SET_THEME":
      return {
        ...state,
        config: { ...state.config, theme: action.payload.theme },
        isDirty: true,
      };

    case "TOGGLE_SECTION_VISIBILITY": {
      const targetPageId = action.payload.pageId ?? state.activePageId;
      if (!targetPageId) return state;
      const pages = updatePageSections(state.config.pages, targetPageId, (sections) =>
        sections.map((s) =>
          s.id === action.payload.sectionId ? { ...s, hidden: !s.hidden } : s
        )
      );
      return {
        ...state,
        config: { ...state.config, pages },
        isDirty: true,
      };
    }

    case "SELECT_SECTION":
      return { ...state, selectedSectionId: action.payload.sectionId };

    case "ADD_PAGE": {
      return {
        ...state,
        config: {
          ...state.config,
          pages: [...state.config.pages, action.payload.page],
        },
        isDirty: true,
        activePageId: action.payload.page.id,
        selectedSectionId: null,
      };
    }

    case "REMOVE_PAGE": {
      const pages = state.config.pages.filter((p) => p.id !== action.payload.pageId);
      const newActivePageId =
        state.activePageId === action.payload.pageId
          ? (pages[0]?.id ?? null)
          : state.activePageId;
      return {
        ...state,
        config: { ...state.config, pages },
        isDirty: true,
        activePageId: newActivePageId,
        selectedSectionId: null,
      };
    }

    case "UPDATE_PAGE": {
      const pages = state.config.pages.map((p) =>
        p.id === action.payload.pageId ? { ...p, ...action.payload.data } : p
      );
      return {
        ...state,
        config: { ...state.config, pages },
        isDirty: true,
      };
    }

    case "SET_ACTIVE_PAGE":
      return {
        ...state,
        activePageId: action.payload.pageId,
        selectedSectionId: null,
      };

    default:
      return state;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function deepMerge<T extends object>(base: T, override: Partial<T>): T {
  const result = { ...base } as T;
  for (const key of Object.keys(override) as Array<keyof T>) {
    const bVal = base[key];
    const oVal = override[key];
    if (isRecord(oVal) && isRecord(bVal)) {
      result[key] = deepMerge(bVal as object, oVal as object) as unknown as T[keyof T];
    } else if (oVal !== undefined) {
      result[key] = oVal as T[keyof T];
    }
  }
  return result;
}

export type SiteConfigContextData = {
  state: SiteConfigState;
  dispatch: React.Dispatch<SiteConfigAction>;
  siteId: string;
};

export const SiteConfigContext = React.createContext<SiteConfigContextData>({
  state: initialState,
  dispatch: () => undefined,
  siteId: "",
});

type SiteBuilderProviderProps = {
  children: React.ReactNode;
  siteId: string;
  initialConfig?: SiteConfig;
};

const SiteBuilderProvider: React.FC<SiteBuilderProviderProps> = ({
  children,
  siteId,
  initialConfig,
}) => {
  const migratedConfig = initialConfig ? migrateLegacyConfig(initialConfig) : defaultConfig;
  const [state, dispatch] = React.useReducer(siteConfigReducer, {
    ...initialState,
    config: migratedConfig,
    activePageId: migratedConfig.pages[0]?.id ?? null,
  });

  return (
    <SiteConfigContext.Provider value={{ state, dispatch, siteId }}>
      {children}
    </SiteConfigContext.Provider>
  );
};

export default SiteBuilderProvider;
export { defaultConfig };
