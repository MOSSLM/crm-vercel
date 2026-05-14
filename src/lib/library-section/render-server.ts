/**
 * Server-only: evaluates pre-compiled section JS and renders it to an HTML string
 * via react-dom/server renderToString.
 *
 * try/catch per section: a broken section renders an empty string so the rest
 * of the page is unaffected.
 */
import "server-only";
import React from "react";
import { renderToString } from "react-dom/server";
import { generateColorShades } from "@/lib/color-utils";
import type { StyleGuide } from "@/types";

export interface RenderSectionOptions {
  js: string;
  renderName: string | null;
  data: Record<string, unknown>;
  variables: Record<string, string>;
  styleGuide?: StyleGuide;
}

export interface RenderSectionResult {
  html: string;
  error?: string;
}

export function renderSectionToHTML(options: RenderSectionOptions): RenderSectionResult {
  const { js, renderName, data, variables, styleGuide } = options;

  if (!renderName || !js) {
    return { html: "", error: "No component name or JS" };
  }

  const tokens = styleGuide
    ? {
        primary: styleGuide.colors.primary,
        secondary: styleGuide.colors.secondary,
        accent: styleGuide.colors.accent,
        background: styleGuide.colors.background,
        backgroundAlt: styleGuide.colors.backgroundAlt,
        text: styleGuide.colors.text,
        textMuted: styleGuide.colors.textMuted,
        fontHeading: styleGuide.fonts.heading,
        fontBody: styleGuide.fonts.body,
        baseSize: styleGuide.fonts.baseSize,
        primaryShades: generateColorShades(styleGuide.colors.primary),
        secondaryShades: generateColorShades(styleGuide.colors.secondary),
        accentShades: generateColorShades(styleGuide.colors.accent),
      }
    : {};

  try {
    // Build a function scope that mirrors what the iframe exposes globally.
    // useLayoutEffect is aliased to useEffect to silence the SSR warning.
    const scope: Record<string, unknown> = {
      React,
      useState: React.useState,
      useEffect: React.useEffect,
      useRef: React.useRef,
      useMemo: React.useMemo,
      useCallback: React.useCallback,
      useId: React.useId,
      useContext: React.useContext,
      useReducer: React.useReducer,
      useLayoutEffect: React.useEffect, // suppress SSR warning
    };

    const scopeKeys = Object.keys(scope);
    const scopeValues = Object.values(scope);

    const factory = new Function(
      ...scopeKeys,
      `"use strict";\n${js}\nreturn ${renderName};`
    );

    const Component = factory(...scopeValues) as React.ComponentType<{
      tokens: typeof tokens;
      data: Record<string, unknown>;
      variables: Record<string, string>;
    }>;

    if (typeof Component !== "function") {
      return { html: "", error: "Evaluated value is not a function" };
    }

    const html = renderToString(
      React.createElement(Component, { tokens, data, variables })
    );

    return { html };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { html: "", error };
  }
}
