"use client";

import React from "react";
import AppLayout from "@/components/layout/AppLayout";
import { SectionTabsNav } from "@/components/layout/SectionTabsNav";
import { crmEnterpriseTabs } from "@/components/layout/sectionTabs";
import { QualificationPage } from "@/components/QualificationPage";
import { LeadMagnetReadyCompanies } from "@/components/LeadMagnetReadyCompanies";

type CompanyView = "qualification" | "lead-magnet";

export default function CompaniesPage() {
  const [view, setView] = React.useState<CompanyView>("lead-magnet");

  return (
    <AppLayout>
      <SectionTabsNav items={crmEnterpriseTabs} />

      {/* Sub-navigation */}
      <div className="border-b border-gray-200 bg-white px-6">
        <div className="flex gap-0">
          {([
            { id: "lead-magnet", label: "Entreprises qualifiées" },
            { id: "qualification", label: "Prospection & Qualification" },
          ] as { id: CompanyView; label: string }[]).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setView(tab.id)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                view === tab.id
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {view === "lead-magnet" ? <LeadMagnetReadyCompanies /> : <QualificationPage />}
    </AppLayout>
  );
}
