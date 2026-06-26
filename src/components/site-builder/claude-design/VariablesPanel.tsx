"use client";

import React from "react";
import { toast } from "sonner";
import { Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { authedFetch } from "@/utils/authedFetch";

/** Client-safe list of the variables a Claude design can resolve per company. */
export const CLAUDE_DESIGN_VARIABLES: Array<{ token: string; label: string; sample: string }> = [
  { token: "{{ entreprise.nom }}", label: "Nom", sample: "Votre Entreprise" },
  { token: "{{ entreprise.telephone }}", label: "Téléphone", sample: "01 23 45 67 89" },
  { token: "{{ entreprise.email }}", label: "Email", sample: "contact@entreprise.fr" },
  { token: "{{ entreprise.adresse }}", label: "Adresse", sample: "12 rue de la Paix" },
  { token: "{{ entreprise.ville }}", label: "Ville", sample: "Annecy" },
  { token: "{{ entreprise.code_postal }}", label: "Code postal", sample: "74000" },
  { token: "{{ entreprise.horaires }}", label: "Horaires", sample: "Lun–Ven 8h–18h" },
  { token: "{{ entreprise.logo_url }}", label: "Logo", sample: "" },
  { token: "{{ entreprise.siret }}", label: "SIRET", sample: "123 456 789 00012" },
  { token: "{{ entreprise.fondateur }}", label: "Fondateur", sample: "Alex" },
  { token: "{{ entreprise.attestation_fluides }}", label: "Attestation fluides", sample: "ACO-00000" },
  { token: "{{ entreprise.email_domain }}", label: "Domaine email", sample: "entreprise.fr" },
  { token: "{{ entreprise.annee_experience }}", label: "Années d'expérience", sample: "15" },
  { token: "{{ entreprise.clients_count }}", label: "Clients", sample: "500" },
];

/** Sample values keyed by token key (without braces), for editor preview. */
export const SAMPLE_VARIABLES: Record<string, string> = Object.fromEntries(
  CLAUDE_DESIGN_VARIABLES.map((v) => [v.token.replace(/\{\{\s*|\s*\}\}/g, ""), v.sample]),
);

export function VariablesPanel({ siteId, onRetokenised }: { siteId: string; onRetokenised: () => void }) {
  const [busy, setBusy] = React.useState(false);

  const retokenise = async () => {
    setBusy(true);
    try {
      const res = await authedFetch(`/api/site-builder/designs/${siteId}/tokenize`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Échec");
      const { mapping } = (await res.json()) as { mapping?: unknown[] };
      toast.success(`${mapping?.length ?? 0} variable(s) détectée(s)`);
      onRetokenised();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Détection impossible");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="text-xs text-muted-foreground">
        Ces variables sont remplacées par les données de chaque entreprise au déploiement.
        L&apos;aperçu utilise des valeurs d&apos;exemple.
      </p>
      <Button variant="outline" size="sm" className="gap-2" onClick={retokenise} disabled={busy}>
        <Wand2 className="h-4 w-4" /> {busy ? "Détection…" : "Re-détecter (IA)"}
      </Button>
      <ul className="flex flex-col divide-y rounded-md border">
        {CLAUDE_DESIGN_VARIABLES.map((v) => (
          <li key={v.token} className="flex items-center justify-between gap-2 px-3 py-2">
            <span className="text-xs">{v.label}</span>
            <code className="text-[10px] text-muted-foreground truncate max-w-[140px]">{v.token}</code>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default VariablesPanel;
