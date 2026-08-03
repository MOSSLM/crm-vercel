"use client";

import { useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import RequireAuth from "@/components/auth/RequireAuth";
import { CompanyDetailPage } from "@/components/CompanyDetailPage";

export default function CompanyDetailRoute() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const companyId = useMemo(() => {
    const raw = Array.isArray(params.id) ? params.id[0] : params.id;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }, [params.id]);

  return (
    <AppLayout>
      <RequireAuth>
        {companyId === null ? (
          <div className="p-6">
            <p className="text-sm text-red-600">Identifiant d’entreprise invalide.</p>
            <button onClick={() => router.back()} className="mt-4 text-sm underline">
              Retour
            </button>
          </div>
        ) : (
          <CompanyDetailPage companyId={companyId} onBack={() => router.back()} />
        )}
      </RequireAuth>
    </AppLayout>
  );
}
