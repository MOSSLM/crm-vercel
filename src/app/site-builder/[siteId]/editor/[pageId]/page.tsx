import { notFound } from "next/navigation";
import { fetchSitePageById } from "@/utils/siteBuilderServerApi";
import EditorClientLayout from "@/components/site-builder/EditorClientLayout";

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
    <EditorClientLayout siteId={siteId} pageId={pageId} pageDetails={pageDetails} />
  );
}
