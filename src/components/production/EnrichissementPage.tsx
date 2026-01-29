"use client";

import React from "react";
import { ProductionDataTable, ProductionColumn } from "@/components/production/ProductionDataTable";

const columns: ProductionColumn[] = [
  { key: "id", label: "ID", type: "text", readOnly: true },
  { key: "entreprise_id", label: "Entreprise ID", type: "number" },
  { key: "created_at", label: "Créé le", type: "timestamp", readOnly: true },
  { key: "updated_at", label: "Mis à jour le", type: "timestamp", readOnly: true },
  { key: "website_url", label: "Site web", type: "text" },
  { key: "google_maps_url", label: "Google Maps", type: "text" },
  { key: "google_url", label: "Google URL", type: "text" },
  { key: "contact_page_url", label: "Page contact", type: "text" },
  { key: "about_page_url", label: "Page à propos", type: "text" },
  { key: "emails", label: "Emails", type: "stringArray", isLong: true },
  { key: "phones", label: "Téléphones", type: "stringArray", isLong: true },
  { key: "socials", label: "Réseaux sociaux", type: "json", isLong: true },
  { key: "meta_source", label: "Meta source", type: "json", isLong: true },
  { key: "logo_url", label: "Logo URL", type: "text" },
  { key: "services_list", label: "Services list", type: "stringArray", isLong: true },
  { key: "services_flags", label: "Services flags", type: "json", isLong: true },
  { key: "site_summary", label: "Résumé du site", type: "text", isLong: true },
  { key: "strengths", label: "Forces", type: "stringArray", isLong: true },
  { key: "pages_visited", label: "Pages visitées", type: "stringArray", isLong: true },
  { key: "ai_meta", label: "AI meta", type: "json", isLong: true },
  { key: "status", label: "Statut", type: "text" },
  { key: "last_run_at", label: "Dernier run", type: "timestamp" },
  { key: "services_page_urls", label: "URLs services", type: "stringArray", isLong: true },
  { key: "areas_served", label: "Zones couvertes", type: "json", isLong: true },
  { key: "founded_year", label: "Année de création", type: "number" },
  { key: "years_in_business", label: "Années d'activité", type: "number" },
  { key: "opening_hours", label: "Horaires", type: "json", isLong: true },
];

export const EnrichissementPage: React.FC = () => {
  return (
    <ProductionDataTable
      title="Enrichissement"
      description="Consultez et mettez à jour les données enrichies des entreprises."
      tableName="automated_enrichment"
      columns={columns}
      getWebsiteUrl={(row) => (typeof row.website_url === "string" ? row.website_url : null)}
    />
  );
};
