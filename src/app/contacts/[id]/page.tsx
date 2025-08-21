"use client";

import { useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import RequireAuth from "@/components/auth/RequireAuth";
import { ContactDetailPage } from "@/components/ContactDetailPage";

export default function ContactDetailRoute() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const contactId = useMemo(() => {
    const raw = Array.isArray(params.id) ? params.id[0] : params.id;
    return raw ?? null;
  }, [params.id]);

  return (
    <AppLayout>
      <RequireAuth>
        {!contactId ? (
          <div className="p-6">
            <p className="text-sm text-red-600">Identifiant de contact manquant.</p>
            <button onClick={() => router.back()} className="mt-4 text-sm underline">
              Retour
            </button>
          </div>
        ) : (
          <ContactDetailPage
            contactId={contactId}
            onBack={() => router.back()}
            onNavigateToPipeline={() => router.push("/pipeline")}
            onNavigateToOpportunities={() => router.push("/opportunities")}
          />
        )}
      </RequireAuth>
    </AppLayout>
  );
}
