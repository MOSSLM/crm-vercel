import { notFound } from "next/navigation";
import { fetchSitePageById } from "@/utils/siteBuilderServerApi";
import EditorProvider from "@/components/site-builder/EditorProvider";
import SiteEditorNavigation from "@/components/site-builder/SiteEditorNavigation";
import SiteEditor from "@/components/site-builder/SiteEditor";
import SiteEditorSidebar from "@/components/site-builder/SiteEditorSidebar";

interface EditorPageProps {
  params: Promise<{ siteId: string; pageId: string }>;
}

export default async function EditorPage({ params }: EditorPageProps) {
  const { siteId, pageId } = await params;

  const pageDetails = await fetchSitePageById(pageId).catch(() => null);

  if (!pageDetails) {
    notFound();
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      <EditorProvider siteId={siteId} pageDetails={pageDetails}>
        <SiteEditorNavigation siteId={siteId} pageId={pageId} />
        <div className="flex flex-1 min-h-0 relative">
          <SiteEditor pageId={pageId} />
          <SiteEditorSidebar />
        </div>
      </EditorProvider>
    </div>
  );
}
