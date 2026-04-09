"use client";

import React from "react";
import type { SitePage } from "@/types";
import EditorProvider from "@/components/site-builder/EditorProvider";
import SiteEditorNavigation from "@/components/site-builder/SiteEditorNavigation";
import SiteEditor from "@/components/site-builder/SiteEditor";
import SiteEditorSidebar from "@/components/site-builder/SiteEditorSidebar";
import SiteEditorLeftPanel from "@/components/site-builder/SiteEditorLeftPanel";

interface EditorClientLayoutProps {
  siteId: string;
  pageId: string;
  pageDetails: SitePage;
}

const EditorClientLayout: React.FC<EditorClientLayoutProps> = ({ siteId, pageId, pageDetails }) => {
  const [leftPanelOpen, setLeftPanelOpen] = React.useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const stored = localStorage.getItem("sb-left-panel");
    return stored === null ? true : stored === "true";
  });

  const toggleLeftPanel = React.useCallback(() => {
    setLeftPanelOpen((prev) => {
      const next = !prev;
      localStorage.setItem("sb-left-panel", String(next));
      return next;
    });
  }, []);

  return (
    <div className="flex flex-col h-screen bg-zinc-950 overflow-hidden">
      <EditorProvider siteId={siteId} pageDetails={pageDetails}>
        <SiteEditorNavigation
          siteId={siteId}
          pageId={pageId}
          leftPanelOpen={leftPanelOpen}
          onToggleLeftPanel={toggleLeftPanel}
        />
        <div className="flex flex-1 min-h-0 relative">
          <SiteEditorLeftPanel open={leftPanelOpen} onClose={toggleLeftPanel} />
          <SiteEditor pageId={pageId} leftPanelOpen={leftPanelOpen} />
          <SiteEditorSidebar />
        </div>
      </EditorProvider>
    </div>
  );
};

export default EditorClientLayout;
