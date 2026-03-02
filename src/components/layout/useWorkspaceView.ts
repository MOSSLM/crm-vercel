"use client";

import { useCallback, useEffect, useState } from "react";

export type WorkspaceView = "base" | "prospection" | "qualification";

const STORAGE_KEY = "crm-workspace-view";

export function useWorkspaceView() {
  const [view, setViewState] = useState<WorkspaceView>("base");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY) as WorkspaceView | null;
    if (stored === "base" || stored === "prospection" || stored === "qualification") {
      setViewState(stored);
    }
  }, []);

  const setView = useCallback((nextView: WorkspaceView) => {
    setViewState(nextView);
    window.localStorage.setItem(STORAGE_KEY, nextView);
  }, []);

  return { view, setView };
}
