import { notFound } from "next/navigation";
import { sitePagesApi } from "@/utils/siteBuilderApi";
import EditorProvider from "@/components/site-builder/EditorProvider";
import SiteEditorNavigation from "@/components/site-builder/SiteEditorNavigation";
import SiteEditor from "@/components/site-builder/SiteEditor";
import SiteEditorSidebar from "@/components/site-builder/SiteEditorSidebar";

interface EditorPageProps {
  params: Promise<{ siteId: string; pageId: string }>;
}

export default async function EditorPage({ params }: EditorPageProps) {
  const { siteId, pageId } = await params;

  const pageDetails = await sitePagesApi.fetchById(pageId).catch(() => null);

  if (!pageDetails) {
    notFound();
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      <EditorProvider siteId={siteId} pageDetails={pageDetails}>
        <SiteEditorNavigation siteId={siteId} pageId={pageId} />
        <div className="flex flex-1 overflow-hidden relative">
          <SiteEditor pageId={pageId} />
          <SiteEditorSidebar />
        </div>
      </EditorProvider>
    </div>
  );
}
