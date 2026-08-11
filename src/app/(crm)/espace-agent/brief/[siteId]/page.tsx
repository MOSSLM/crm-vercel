"use client";

import { useParams } from "next/navigation";
import { BriefWorkspace } from "@/components/brief/BriefWorkspace";

/**
 * Brief de reprise dans le portail agent — même atelier que la page admin,
 * monté dans la coque de l'espace agent. C'est la route ouverte depuis le
 * cockpit d'appel : celle qu'on utilise réellement pendant un RDV.
 */
export default function BriefAgentPage() {
  const { siteId } = useParams<{ siteId: string }>();
  if (!siteId) return null;
  return (
    <div className="h-[calc(100vh-4rem)]">
      <BriefWorkspace siteId={siteId} />
    </div>
  );
}
