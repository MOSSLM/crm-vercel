"use client";

import { useParams } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import { BriefWorkspace } from "@/components/brief/BriefWorkspace";

/**
 * Brief de reprise, côté admin. L'agent freelance a sa propre route
 * (`/espace-agent/brief/[siteId]`) : `AppLayout` renvoie tout non-admin sur son
 * portail, c'est la même raison qui a imposé deux routes pour l'éditeur
 * d'audit.
 */
export default function BriefPage() {
  const { siteId } = useParams<{ siteId: string }>();
  return (
    <AppLayout>
      <div className="h-[calc(100vh-4rem)]">
        {siteId ? <BriefWorkspace siteId={siteId} /> : null}
      </div>
    </AppLayout>
  );
}
