import { QualifiedCompaniesPage } from "@/components/QualifiedCompaniesPage";
import  AppLayout  from "@/components/layout/AppLayout";
import { Suspense } from "react";

export default function Dashboard() {
  return (
    <AppLayout>
      <Suspense fallback={null}>
        <QualifiedCompaniesPage />
      </Suspense>
    </AppLayout>
  );
}
