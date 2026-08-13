"use client";

import type { ReactNode } from "react";
import { Building2, MapPin, Users, Banknote, TrendingUp, TrendingDown, Layers } from "lucide-react";
import { formatEuros } from "@/lib/donnees-publiques/fiche";
import { trancheEffectifLabel } from "@/lib/donnees-publiques/effectif";
import type { CompanyBundle, DemarchageTask } from "./types";

/** Un fait en ligne — icône + valeur, jamais en tuile encadrée : ce n'est pas une carte, c'est le titre. */
function Fact({ icon, value, tone }: { icon: ReactNode; value: string; tone?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm" style={tone ? { color: tone } : undefined}>
      {icon}
      {value}
    </span>
  );
}

/**
 * En-tête de page intégré — PAS une carte : le nom de l'entreprise est le
 * titre de la page, pas un bloc parmi d'autres. L'eyebrow rappelle le
 * contexte (étape de séquence en cours, ou "appel à froid" s'il n'y en a
 * pas) ; les contacts vivent dans `ContactsPanel` (colonne de droite).
 */
export function CompanyHeaderCard({
  company,
  loading,
  task,
}: {
  company: CompanyBundle | null;
  loading: boolean;
  task: DemarchageTask | null;
}) {
  if (loading) {
    return <div className="text-sm text-muted-foreground">Chargement de la fiche…</div>;
  }
  if (!company) return null;

  const { entreprise, donneesPubliques } = company;
  const effectif = trancheEffectifLabel(donneesPubliques?.tranche_effectif_code ?? null);
  const ca = donneesPubliques?.chiffre_affaires ?? null;
  const resultat = donneesPubliques?.resultat_net ?? null;
  const exercice = donneesPubliques?.exercice_annee ?? null;
  const adresse = [entreprise.adresse, entreprise.code_postal, entreprise.ville].filter(Boolean).join(", ");

  const eyebrow = task?.sequence
    ? `${task.sequence.name ?? "Séquence"}${
        task.sequence.stepIndex != null ? ` · étape ${task.sequence.stepIndex}/${task.sequence.totalSteps}` : ""
      }`
    : "Appel à froid";

  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Layers className="h-3 w-3" />
        {eyebrow}
      </div>
      <h1 className="mt-1 flex items-center gap-2 truncate text-2xl font-semibold">
        <Building2 className="h-5 w-5 shrink-0 text-muted-foreground" />
        <span className="truncate">{entreprise.name || donneesPubliques?.denomination || "Sans nom"}</span>
      </h1>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-muted-foreground">
        {effectif && <Fact icon={<Users className="h-3.5 w-3.5" />} value={effectif} />}
        {ca != null && (
          <Fact icon={<Banknote className="h-3.5 w-3.5" />} value={`CA ${formatEuros(ca)}${exercice ? ` (${exercice})` : ""}`} />
        )}
        {resultat != null && (
          <Fact
            icon={resultat < 0 ? <TrendingDown className="h-3.5 w-3.5" /> : <TrendingUp className="h-3.5 w-3.5" />}
            value={`Résultat ${formatEuros(resultat)}`}
            tone={resultat < 0 ? "var(--danger)" : "var(--ok)"}
          />
        )}
        {adresse && <Fact icon={<MapPin className="h-3.5 w-3.5" />} value={adresse} />}
      </div>
    </div>
  );
}
