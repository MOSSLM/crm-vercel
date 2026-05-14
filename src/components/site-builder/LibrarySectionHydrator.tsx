"use client";

/**
 * Client Component: picks up the JSON hydration payloads emitted by
 * LibrarySectionInline and mounts interactive React trees on each section div.
 *
 * No @babel/standalone needed client-side — the JS is already compiled.
 */
import React, { useEffect } from "react";
import { hydrateRoot } from "react-dom/client";

interface SectionPayload {
  instanceId: string;
  js: string;
  renderName: string | null;
  data: Record<string, unknown>;
  variables: Record<string, string>;
  tokens: Record<string, unknown>;
}

export function LibrarySectionHydrator() {
  useEffect(() => {
    const scripts = document.querySelectorAll<HTMLScriptElement>(
      "script[type='application/json'][data-lsi-id]"
    );

    scripts.forEach((script) => {
      const instanceId = script.dataset.lsiId;
      if (!instanceId) return;

      let payload: SectionPayload;
      try {
        payload = JSON.parse(script.textContent ?? "");
      } catch {
        return; // malformed JSON, skip
      }

      const { js, renderName, data, variables, tokens } = payload;
      if (!js || !renderName) return;

      const container = document.querySelector<HTMLElement>(`[data-lsi="${instanceId}"]`);
      if (!container) return;

      try {
        // Re-evaluate the pre-compiled JS in the same scope as the server.
        // React hooks are passed as scope args so they resolve correctly.
        const factory = new Function(
          "React",
          "useState",
          "useEffect",
          "useRef",
          "useMemo",
          "useCallback",
          "useId",
          "useContext",
          "useReducer",
          "useLayoutEffect",
          `"use strict";\n${js}\nreturn ${renderName};`
        );

        const Component = factory(
          React,
          React.useState,
          React.useEffect,
          React.useRef,
          React.useMemo,
          React.useCallback,
          React.useId,
          React.useContext,
          React.useReducer,
          React.useLayoutEffect,
        ) as React.ComponentType<{
          tokens: typeof tokens;
          data: Record<string, unknown>;
          variables: Record<string, string>;
        }>;

        if (typeof Component !== "function") return;

        hydrateRoot(
          container,
          React.createElement(Component, { tokens, data, variables })
        );
      } catch (err) {
        console.warn(
          `[LibrarySectionHydrator] Hydration failed for section ${instanceId}:`,
          err
        );
      }
    });
  // Run once on mount — SSR payloads are static
  }, []);

  return null;
}
