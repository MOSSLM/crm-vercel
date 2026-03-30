"use client";

import React from "react";
import { ProductionDataTable, ProductionColumn } from "@/components/production/ProductionDataTable";

const columns: ProductionColumn[] = [
  { key: "id", label: "ID", type: "text", readOnly: true },
  { key: "lead_magnet_content_id", label: "Lead Magnet Content ID", type: "text", readOnly: true },
  { key: "entreprise_id", label: "Entreprise ID", type: "number" },
  { key: "created_at", label: "Créé le", type: "timestamp", readOnly: true },
  { key: "updated_at", label: "Mis à jour le", type: "timestamp", readOnly: true },
  { key: "page_name", label: "Page", type: "text" },
  { key: "slogan", label: "Slogan", type: "text", isLong: true },
  { key: "sub_slogan_text", label: "Sous-slogan", type: "text", isLong: true },
  { key: "presentation_paragraph", label: "Présentation", type: "text", isLong: true },
  { key: "differentiator_1", label: "Différenciateur 1", type: "text", isLong: true },
  { key: "differentiator_2", label: "Différenciateur 2", type: "text", isLong: true },
  { key: "differentiator_3", label: "Différenciateur 3", type: "text", isLong: true },
  { key: "key_stat_1", label: "Stat clé 1", type: "text" },
  { key: "key_stat_2", label: "Stat clé 2", type: "text" },
  { key: "key_stat_3", label: "Stat clé 3", type: "text" },
  { key: "cta_long_title", label: "CTA long", type: "text", isLong: true },
  { key: "entreprise_name", label: "Entreprise", type: "text" },
  { key: "adresse", label: "Adresse", type: "text", isLong: true },
  { key: "telephone", label: "Téléphone", type: "text" },
  { key: "email", label: "Email", type: "text" },
  { key: "facebook_url", label: "Facebook", type: "text", isLong: true },
  { key: "instagram_url", label: "Instagram", type: "text", isLong: true },
  { key: "linkedin_url", label: "LinkedIn", type: "text", isLong: true },
  { key: "avis_1_nom", label: "Avis 1 - Nom", type: "text" },
  { key: "avis_1_texte", label: "Avis 1 - Texte", type: "text", isLong: true },
  { key: "avis_2_nom", label: "Avis 2 - Nom", type: "text" },
  { key: "avis_2_texte", label: "Avis 2 - Texte", type: "text", isLong: true },
  { key: "avis_3_nom", label: "Avis 3 - Nom", type: "text" },
  { key: "avis_3_texte", label: "Avis 3 - Texte", type: "text", isLong: true },
  { key: "avis_4_nom", label: "Avis 4 - Nom", type: "text" },
  { key: "avis_4_texte", label: "Avis 4 - Texte", type: "text", isLong: true },
];

export const LeadMagnetPage: React.FC = () => {
  const getPublicEndpointUrl = (row: Record<string, unknown>): string | null => {
    const pageName = row.page_name;
    if (typeof pageName !== "string" || !pageName.trim()) return null;

    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/api/public/lead-magnets/${encodeURIComponent(pageName.trim())}`;
  };

  return (
    <ProductionDataTable
      title="Lead magnet"
      description="Consultez/modifiez les contenus et copiez l'endpoint public pour Framer."
      tableName="lead_magnets"
      columns={columns}
      getPublicEndpointUrl={getPublicEndpointUrl}
      enableEntrepriseCsvExport
      csvExcludedColumns={["id", "entreprise_id", "created_at", "updated_at", "lead_magnet_content_id"]}
    />
  );
};
