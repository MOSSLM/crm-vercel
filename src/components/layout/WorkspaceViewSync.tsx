"use client";

import { useEffect } from "react";
import { WorkspaceView, useWorkspaceView } from "./useWorkspaceView";

type WorkspaceViewSyncProps = {
  view: WorkspaceView;
};

export default function WorkspaceViewSync({ view }: WorkspaceViewSyncProps) {
  const { setView } = useWorkspaceView();

  useEffect(() => {
    setView(view);
  }, [setView, view]);

  return null;
}

