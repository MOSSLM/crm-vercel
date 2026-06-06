"use client";

import React from "react";
import type { RelumeBuilderState } from "@/types";
import { authedFetch } from "@/utils/authedFetch";

export type AutosaveStatus = "idle" | "saving" | "saved" | "error";

interface UseSiteAutosaveOptions {
  siteId: string;
  state: RelumeBuilderState;
  onSaved: () => void;
  /** Milliseconds of inactivity before triggering a save. Default: 2000 */
  debounceMs?: number;
}

/**
 * Debounced autosave for the site builder.
 * - Fires after `debounceMs` ms of inactivity whenever `state.isDirty` is true.
 * - Every state change (new object reference from useReducer) resets the timer.
 * - `stateRef` always holds the latest snapshot, so the save captures the final value.
 * - On page unload, sends a best-effort beacon to persist site metadata.
 */
export function useSiteAutosave({
  siteId,
  state,
  onSaved,
  debounceMs = 2000,
}: UseSiteAutosaveOptions): { status: AutosaveStatus } {
  const [status, setStatus] = React.useState<AutosaveStatus>("idle");
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = React.useRef(state);
  stateRef.current = state;

  const doSave = React.useCallback(async () => {
    const s = stateRef.current;
    setStatus("saving");
    try {
      const instances = Object.values(s.instances).map((inst) => ({
        id: inst.id,
        site_id: inst.site_id,
        section_id: inst.section_id ?? null,
        page_slug: inst.page_slug,
        sort_order: inst.sort_order,
        content: inst.content,
        blocks: inst.blocks ?? [],
        custom_style: inst.custom_style ?? {},
        is_hidden: inst.is_hidden ?? false,
      }));

      const [r1, r2] = await Promise.all([
        authedFetch(`/api/site-builder/sites/${siteId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            style_guide: s.styleGuide,
            sitemap: s.sitemap,
            site_config: { menus: s.menus, faviconUrl: s.faviconUrl ?? undefined, seo: s.seo },
          }),
        }),
        authedFetch(`/api/site-builder/sites/${siteId}/instances`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ instances }),
        }),
      ]);

      if (!r1.ok || !r2.ok) throw new Error("Erreur de sauvegarde automatique");

      setStatus("saved");
      onSaved();
      // Reset indicator after 2 s
      setTimeout(() => setStatus((prev: AutosaveStatus) => (prev === "saved" ? "idle" : prev)), 2000);
    } catch {
      setStatus("error");
      // Reset error indicator after 4 s so user sees it
      setTimeout(() => setStatus((prev: AutosaveStatus) => (prev === "error" ? "idle" : prev)), 4000);
    }
  }, [siteId, onSaved]);

  // Every new state object from useReducer resets the debounce when dirty.
  React.useEffect(() => {
    if (!state.isDirty) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void doSave(), debounceMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [state, doSave, debounceMs]);

  // Best-effort beacon on unload for site metadata (instances are too large for sendBeacon).
  React.useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const s = stateRef.current;
      if (!s.isDirty) return;
      e.preventDefault();
      navigator.sendBeacon(
        `/api/site-builder/sites/${siteId}`,
        new Blob(
          [JSON.stringify({
            style_guide: s.styleGuide,
            sitemap: s.sitemap,
            site_config: { menus: s.menus, faviconUrl: s.faviconUrl ?? undefined, seo: s.seo },
          })],
          { type: "application/json" }
        )
      );
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [siteId]);

  return { status };
}
