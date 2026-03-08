"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";

export type WorkspaceView = "base" | "prospection" | "qualification";

const STORAGE_KEY = "crm-workspace-view";
const VIEW_CHANGE_EVENT = "crm-workspace-view-change";

function isWorkspaceView(value: string | null): value is WorkspaceView {
  return value === "base" || value === "prospection" || value === "qualification";
}

function readStoredView(): WorkspaceView {
  if (typeof window === "undefined") {
    return "base";
  }

  const stored = window.localStorage.getItem(STORAGE_KEY);
  return isWorkspaceView(stored) ? stored : "base";
}

function persistView(view: WorkspaceView) {
  window.localStorage.setItem(STORAGE_KEY, view);
  window.dispatchEvent(new Event(VIEW_CHANGE_EVENT));
}

function deriveViewFromPathname(pathname: string | null): WorkspaceView | null {
  if (!pathname) {
    return null;
  }

  if (pathname === "/prospection/dashboard") {
    return "prospection";
  }

  if (pathname === "/qualification/dashboard") {
    return "qualification";
  }

  if (pathname === "/" || pathname === "/dashboard") {
    return "base";
  }

  return null;
}

function subscribe(onStoreChange: () => void) {
  const handleChange = () => onStoreChange();

  window.addEventListener("storage", handleChange);
  window.addEventListener(VIEW_CHANGE_EVENT, handleChange);

  return () => {
    window.removeEventListener("storage", handleChange);
    window.removeEventListener(VIEW_CHANGE_EVENT, handleChange);
  };
}

export function useWorkspaceView() {
  const pathname = usePathname();
  const storedView = useSyncExternalStore(subscribe, readStoredView, () => "base");

  const view = useMemo(() => {
    return deriveViewFromPathname(pathname) ?? storedView;
  }, [pathname, storedView]);

  useEffect(() => {
    const pathnameView = deriveViewFromPathname(pathname);
    if (pathnameView && pathnameView !== storedView) {
      persistView(pathnameView);
    }
  }, [pathname, storedView]);

  const setView = useCallback((nextView: WorkspaceView) => {
    persistView(nextView);
  }, []);

  return { view, setView };
}
