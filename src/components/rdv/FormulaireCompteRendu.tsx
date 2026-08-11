"use client";

import React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Check, ExternalLink, Loader2 } from "lucide-react";
import type { Form } from "@/types";
import { authedFetch } from "@/utils/authedFetch";
import { ChampFormulaire } from "./ChampFormulaire";
import {
  calculerCompletion,
  questionsVisibles,
  titreParDefaut,
} from "@/lib/rdv/formulaire";
import type { CanalCompteRendu, CompteRendu, IssueCompteRendu } from "@/lib/rdv/types";

/** Délai avant enregistrement après la dernière frappe. */
const DELAI_SAUVEGARDE_MS = 900;

const CANAUX: Array<{ id: CanalCompteRendu; label: string }> = [
  { id: "appel", label: "Appel" },
  { id: "rdv", label: "RDV" },
  { id: "visio", label: "Visio" },
  { id: "terrain", label: "Visite" },
  { id: "autre", label: "Autre" },
];

const ISSUES: Array<{ id: IssueCompteRendu; label: string; ton: string }> = [
  { id: "interesse", label: "Intéressé", ton: "border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  { id: "a_relancer", label: "À relancer", ton: "border-blue-500 bg-blue-500/15 text-blue-700 dark:text-blue-300" },
  { id: "reflexion", label: "Réflexion", ton: "border-amber-500 bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  { id: "pas_interesse", label: "Pas intéressé", ton: "border-red-500 bg-red-500/15 text-red-700 dark:text-red-300" },
  { id: "injoignable", label: "Injoignable", ton: "border-slate-400 bg-slate-400/15 text-slate-600 dark:text-slate-300" },
  { id: "vendu", label: "Vendu", ton: "border-violet-500 bg-violet-500/15 text-violet-700 dark:text-violet-300" },
];

type EtatSauvegarde = "repos" | "en_cours" | "enregistre" | "erreur";

interface Props {
  compteRendu: CompteRendu;
  formulaires: Form[];
  /** Remonte l'état à jour pour que l'historique du cockpit se rafraîchisse. */
  onMaj: (compteRendu: CompteRendu) => void;
}

export function FormulaireCompteRendu({ compteRendu, formulaires, onMaj }: Props) {
  const [brouillon, setBrouillon] = React.useState<CompteRendu>(compteRendu);
  const [etat, setEtat] = React.useState<EtatSauvegarde>("repos");

  // Les modifications en attente d'envoi. Une `ref` et pas un state : le
  // minuteur de sauvegarde doit lire les dernières valeurs sans être recréé à
  // chaque frappe, sinon il ne se déclenche jamais tant qu'on tape.
  const enAttente = React.useRef<Record<string, unknown>>({});
  const minuteur = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Changer de compte rendu (autre entreprise, autre RDV) doit repartir propre :
  // sans ça, les modifications en attente du précédent partiraient sur le nouveau.
  React.useEffect(() => {
    if (minuteur.current) clearTimeout(minuteur.current);
    enAttente.current = {};
    setBrouillon(compteRendu);
    setEtat("repos");
  }, [compteRendu]);

  const envoyer = React.useCallback(async () => {
    const charge = enAttente.current;
    enAttente.current = {};
    if (Object.keys(charge).length === 0) return;

    setEtat("en_cours");
    try {
      const res = await authedFetch(`/api/rdv/comptes-rendus/${compteRendu.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(charge),
      });
      if (!res.ok) throw new Error(await res.text());
      const frais = (await res.json()) as CompteRendu;
      setEtat("enregistre");
      onMaj(frais);
    } catch {
      // Les modifications repartent dans la file : la prochaine frappe — ou le
      // bouton « Terminer » — les renverra. Rien n'est perdu silencieusement.
      enAttente.current = { ...charge, ...enAttente.current };
      setEtat("erreur");
    }
  }, [compteRendu.id, onMaj]);

  const modifier = React.useCallback(
    (champs: Partial<CompteRendu>) => {
      setBrouillon((prec) => ({ ...prec, ...champs }));
      enAttente.current = { ...enAttente.current, ...champs };
      if (minuteur.current) clearTimeout(minuteur.current);
      minuteur.current = setTimeout(() => void envoyer(), DELAI_SAUVEGARDE_MS);
    },
    [envoyer],
  );

  // Quitter le cockpit ne doit pas emporter la dernière phrase tapée.
  React.useEffect(() => {
    return () => {
      if (minuteur.current) clearTimeout(minuteur.current);
      if (Object.keys(enAttente.current).length > 0) void envoyer();
    };
  }, [envoyer]);

  const formulaire = React.useMemo(
    () => formulaires.find((f) => f.id === brouillon.form_id) ?? null,
    [formulaires, brouillon.form_id],
  );

  const questions = React.useMemo(
    () => (formulaire ? questionsVisibles(formulaire, brouillon.reponses) : []),
    [formulaire, brouillon.reponses],
  );

  const completion = React.useMemo(
    () => (formulaire ? calculerCompletion(formulaire, brouillon.reponses) : null),
    [formulaire, brouillon.reponses],
  );

  const repondre = (idQuestion: string, valeur: unknown) => {
    const reponses = { ...brouillon.reponses, [idQuestion]: valeur };
    modifier({ reponses });
  };

  const terminer = async () => {
    const titre = brouillon.titre?.trim() || titreParDefaut(brouillon.canal, new Date(brouillon.demarre_le));
    modifier({ statut: "termine", titre });
    if (minuteur.current) clearTimeout(minuteur.current);
    await envoyer();
    toast.success("Compte rendu enregistré");
  };

  const rouvrir = () => modifier({ statut: "brouillon" });

  return (
    <div className="space-y-4">
      {/* Canal + issue : les deux réflexes de fin d'appel. */}
      <div className="space-y-3 rounded-lg border border-border/60 bg-[var(--surface)] p-3">
        <Ligne label="Canal">
          <div className="flex flex-wrap gap-1.5">
            {CANAUX.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => modifier({ canal: c.id })}
                className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                  brouillon.canal === c.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border/60 hover:bg-[var(--bg-2)]"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </Ligne>

        <Ligne label="Issue">
          <div className="flex flex-wrap gap-1.5">
            {ISSUES.map((i) => (
              <button
                key={i.id}
                type="button"
                onClick={() => modifier({ issue: brouillon.issue === i.id ? null : i.id })}
                className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                  brouillon.issue === i.id ? i.ton : "border-border/60 hover:bg-[var(--bg-2)]"
                }`}
              >
                {i.label}
              </button>
            ))}
          </div>
        </Ligne>
      </div>

      {/* Le questionnaire. */}
      {formulaires.length > 1 && (
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-[var(--text-3)]">Grille</span>
          <select
            value={brouillon.form_id ?? ""}
            onChange={(e) => modifier({ form_id: e.target.value || null })}
            className="w-full rounded-md border border-border/60 bg-[var(--surface)] px-3 py-2 text-sm"
          >
            {formulaires.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {!formulaire ? (
        <AucuneGrille />
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-4)]">
              {formulaire.name}
            </p>
            {completion && completion.total > 0 && (
              <span className="text-xs tabular-nums text-[var(--text-3)]">
                {completion.repondues}/{completion.total}
              </span>
            )}
          </div>

          {questions.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border/60 p-4 text-sm text-[var(--text-3)]">
              Cette grille ne contient aucune question à remplir.{" "}
              <Link href={`/forms/${formulaire.id}/edit`} className="underline">
                L&apos;éditer
              </Link>
            </p>
          ) : (
            questions.map((q) => (
              <div key={q.id} className="space-y-1.5">
                <label className="block text-sm font-medium">
                  {q.title}
                  {q.required && <span className="ml-1 text-red-500">*</span>}
                </label>
                {q.subtitle && <p className="text-xs text-[var(--text-3)]">{q.subtitle}</p>}
                <ChampFormulaire
                  question={q}
                  valeur={brouillon.reponses[q.id]}
                  onChange={(v) => repondre(q.id, v)}
                />
              </div>
            ))
          )}
        </div>
      )}

      {/* Synthèse libre et suite à donner. */}
      <div className="space-y-3 border-t border-border/60 pt-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Résumé</span>
          <textarea
            className="min-h-[80px] w-full resize-y rounded-md border border-border/60 bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-primary"
            placeholder="Ce qu'il faut retenir de l'échange…"
            value={brouillon.resume ?? ""}
            onChange={(e) => modifier({ resume: e.target.value })}
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Prochaine étape</span>
            <input
              type="text"
              className="w-full rounded-md border border-border/60 bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-primary"
              placeholder="Rappeler avec le devis, envoyer la démo…"
              value={brouillon.prochaine_etape ?? ""}
              onChange={(e) => modifier({ prochaine_etape: e.target.value })}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Le</span>
            <input
              type="date"
              className="rounded-md border border-border/60 bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-primary"
              value={brouillon.date_prochaine_etape ?? ""}
              onChange={(e) => modifier({ date_prochaine_etape: e.target.value || null })}
            />
          </label>
        </div>
      </div>

      {/* Barre d'état + clôture. */}
      <div className="sticky bottom-0 -mx-1 flex items-center gap-3 border-t border-border/60 bg-background/95 px-1 py-3 backdrop-blur">
        <IndicateurSauvegarde etat={etat} />
        <div className="ml-auto">
          {brouillon.statut === "termine" ? (
            <button
              type="button"
              onClick={rouvrir}
              className="rounded-lg border border-border/60 px-3 py-2 text-sm transition-colors hover:bg-[var(--bg-2)]"
            >
              Rouvrir
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void terminer()}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              Terminer
            </button>
          )}
        </div>
      </div>

      {completion && completion.manquantes.length > 0 && brouillon.statut !== "termine" && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          {completion.manquantes.length} question
          {completion.manquantes.length > 1 ? "s" : ""} obligatoire
          {completion.manquantes.length > 1 ? "s" : ""} encore vide
          {completion.manquantes.length > 1 ? "s" : ""} — tu peux terminer quand même.
        </p>
      )}
    </div>
  );
}

function Ligne({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <span className="w-12 shrink-0 text-xs font-medium text-[var(--text-3)]">{label}</span>
      {children}
    </div>
  );
}

function IndicateurSauvegarde({ etat }: { etat: EtatSauvegarde }) {
  if (etat === "en_cours") {
    return (
      <span className="flex items-center gap-1.5 text-xs text-[var(--text-3)]">
        <Loader2 className="h-3 w-3 animate-spin" /> Enregistrement…
      </span>
    );
  }
  if (etat === "enregistre") {
    return (
      <span className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
        <Check className="h-3 w-3" /> Enregistré
      </span>
    );
  }
  if (etat === "erreur") {
    return (
      <span className="text-xs text-red-600 dark:text-red-400">
        Échec de l&apos;enregistrement — la prochaine frappe réessaie.
      </span>
    );
  }
  return <span className="text-xs text-[var(--text-4)]">Sauvegarde automatique</span>;
}

function AucuneGrille() {
  return (
    <div className="rounded-lg border border-dashed border-border/60 p-4 text-sm text-[var(--text-3)]">
      <p className="mb-2">
        Aucune grille de compte rendu n&apos;est encore définie. Crée un formulaire dans le form
        builder et donne-lui le tag <code className="rounded bg-[var(--bg-2)] px-1">compte-rendu</code>{" "}
        : il apparaîtra ici.
      </p>
      <Link href="/forms" className="inline-flex items-center gap-1 font-medium underline">
        Ouvrir le form builder <ExternalLink className="h-3 w-3" />
      </Link>
    </div>
  );
}

export default FormulaireCompteRendu;
