"use client";
import { QualifiedCompaniesPage } from "@/components/QualifiedCompaniesPage";
import  AppLayout  from "@/components/layout/AppLayout";
export default function Dashboard() {
  return (
    <AppLayout>
      <QualifiedCompaniesPage />
    </AppLayout>
  );
}
