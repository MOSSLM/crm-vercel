"use client";

import React from "react";
import { ProductionDataTable, ProductionColumn } from "@/components/production/ProductionDataTable";

const columns: ProductionColumn[] = [
  { key: "id", label: "ID", type: "text", readOnly: true },
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
];

export const CopywritingPage: React.FC = () => {
  return (
    <ProductionDataTable
      title="Copywriting"
      description="Gérez les contenus copywriting liés aux lead magnets."
      tableName="lead_magnet_content"
      columns={columns}
    />
  );
};
