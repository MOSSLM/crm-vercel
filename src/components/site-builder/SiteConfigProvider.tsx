"use client";

import React from "react";
import type {
  SiteConfig,
  SiteConfigAction,
  SiteConfigState,
  SiteSection,
  ThemeGlobalVariables,
} from "@/types";

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
    fonts: { heading: "Inter", body: "Inter" },
  },
  sections: [],
};

const initialState: SiteConfigState = {
  config: defaultConfig,
  isDirty: false,
  selectedSectionId: null,
};

function reorder<T>(arr: T[], from: number, to: number): T[] {
  const next = [...arr];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function siteConfigReducer(state: SiteConfigState, action: SiteConfigAction): SiteConfigState {
  switch (action.type) {
    case "LOAD_CONFIG":
      return { ...state, config: action.payload.config, isDirty: false, selectedSectionId: null };

    case "ADD_SECTION": {
      const sections = [...state.config.sections];
      const idx = action.payload.index ?? sections.length;
      sections.splice(idx, 0, action.payload.section);
      return {
        ...state,
        config: { ...state.config, sections },
        isDirty: true,
        selectedSectionId: action.payload.section.id,
      };
    }

    case "REMOVE_SECTION":
      return {
        ...state,
        config: {
          ...state.config,
          sections: state.config.sections.filter((s) => s.id !== action.payload.sectionId),
        },
        isDirty: true,
        selectedSectionId:
          state.selectedSectionId === action.payload.sectionId ? null : state.selectedSectionId,
      };

    case "UPDATE_SECTION":
      return {
        ...state,
        config: {
          ...state.config,
          sections: state.config.sections.map((s) =>
            s.id === action.payload.sectionId ? { ...s, ...action.payload.data } : s
          ),
        },
        isDirty: true,
      };

    case "REORDER_SECTIONS":
      return {
        ...state,
        config: {
          ...state.config,
          sections: reorder(state.config.sections, action.payload.fromIndex, action.payload.toIndex),
        },
        isDirty: true,
      };

    case "UPDATE_SETTINGS":
      return {
        ...state,
        config: {
          ...state.config,
          settings: deepMerge(state.config.settings, action.payload.settings) as ThemeGlobalVariables,
        },
        isDirty: true,
      };

    case "SET_THEME":
      return {
        ...state,
        config: { ...state.config, theme: action.payload.theme },
        isDirty: true,
      };

    case "TOGGLE_SECTION_VISIBILITY":
      return {
        ...state,
        config: {
          ...state.config,
          sections: state.config.sections.map((s) =>
            s.id === action.payload.sectionId ? { ...s, hidden: !s.hidden } : s
          ),
        },
        isDirty: true,
      };

    default:
      return state;
  }
}

function deepMerge(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
  const result = { ...base };
  for (const key of Object.keys(override)) {
    const bVal = base[key];
    const oVal = override[key];
    if (
      oVal !== null &&
      typeof oVal === "object" &&
      !Array.isArray(oVal) &&
      bVal !== null &&
      typeof bVal === "object" &&
      !Array.isArray(bVal)
    ) {
      result[key] = deepMerge(bVal as Record<string, unknown>, oVal as Record<string, unknown>);
    } else {
      result[key] = oVal;
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

type SiteConfigProviderProps = {
  children: React.ReactNode;
  siteId: string;
  initialConfig?: SiteConfig;
};

const SiteConfigProvider: React.FC<SiteConfigProviderProps> = ({
  children,
  siteId,
  initialConfig,
}) => {
  const [state, dispatch] = React.useReducer(siteConfigReducer, {
    ...initialState,
    config: initialConfig ?? defaultConfig,
  });

  return (
    <SiteConfigContext.Provider value={{ state, dispatch, siteId }}>
      {children}
    </SiteConfigContext.Provider>
  );
};

export default SiteConfigProvider;
export { defaultConfig };
