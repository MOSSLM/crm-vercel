"use client";

/**
 * Ce que le CRM doit montrer à côté de `stat_rge_count`, maintenant que ce
 * chiffre n'est plus une saisie.
 *
 * Le propriétaire a fait un choix assumé : une qualification RÉCEMMENT EXPIRÉE
 * peut rester affichée sur une démo. Pour que ce choix reste éclairé, il faut
 * qu'il voie les DATES — sinon il arbitre à l'aveugle entre « expirée la semaine
 * dernière » et « expirée il y a trois ans ».
 *
 * Ce composant ne décide de rien et n'écrit rien. Il explique ce que le site va
 * afficher, et pourquoi.
 */

import { useEffect, useState } from "react";
import { AlertTriangle, BadgeCheck, ShieldQuestion } from "lucide-react";

import { authedFetch } from "@/utils/authedFetch";
import { formatDate, joursAvant } from "@/lib/donnees-publiques/fiche";
import {
  afficherBlocCertifications,
  explicationRge,
  verdictRge,
  type EtatVerificationRge,
} from "@/lib/donnees-publiques/rge-compteur";
import { logoPourCertificat } from "@/lib/donnees-publiques/rge-logos";

type Qualification = {
  id: string;
  code_qualification: string;
  nom_certificat: string | null;
  domaine: string | null;
  date_fin: string | null;
};

export type CompteurRgeVerifieProps = {
  entrepriseId: number;
  /** `stat_rge_count` du projet, la valeur saisie historiquement. */
  statSaisi?: string | null;
  /** `stat_rge_count_official` — prioritaire, et jamais modifié ici. */
  statOfficiel?: string | null;
};

export default function CompteurRgeVerifie({
  entrepriseId,
  statSaisi,
  statOfficiel,
}: CompteurRgeVerifieProps) {
  const [etat, setEtat] = useState<EtatVerificationRge | null>(null);
  const [quals, setQuals] = useState<Qualification[]>([]);

  useEffect(() => {
    let vivant = true;
    void (async () => {
      try {
        const res = await authedFetch(`/api/donnees-publiques/fiche?entreprise_id=${entrepriseId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!vivant) return;
        const qualifications = (data.qualifications ?? []) as Qualification[];
        const aujourdhui = new Date().toISOString().slice(0, 10);
        setQuals(qualifications);
        setEtat({
          aSiret: Boolean(data.entreprise?.siret),
          rgeInterroge: Boolean(data.publiques?.rge_rafraichi_le),
          qualificationsValides: qualifications.filter(
            (q) => !q.date_fin || q.date_fin >= aujourdhui,
          ).length,
        });
      } catch {
        /* le bloc reste muet : c'est une aide à la décision, pas un bloqueur */
      }
    })();
    return () => {
      vivant = false;
    };
  }, [entrepriseId]);

  if (!etat) return null;

  const verdict = verdictRge(etat, statSaisi, statOfficiel);
  const affiche = afficherBlocCertifications(verdict);
  const expirees = quals.filter((q) => q.date_fin && joursAvant(q.date_fin) < 0);

  const ton =
    verdict.source === "saisie"
      ? { cadre: "border-amber-300 bg-amber-50", texte: "text-amber-900", Icone: ShieldQuestion }
      : affiche
        ? { cadre: "border-emerald-300 bg-emerald-50", texte: "text-emerald-900", Icone: BadgeCheck }
        : { cadre: "border-neutral-300 bg-neutral-50", texte: "text-neutral-700", Icone: AlertTriangle };

  return (
    <div className={`rounded-md border p-2.5 text-sm ${ton.cadre}`}>
      <div className={`flex items-start gap-2 ${ton.texte}`}>
        <ton.Icone className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0">
          <p className="font-medium">
            {affiche
              ? `Le site affichera « ${verdict.valeur} »`
              : "Le site n’affichera aucun bloc de certifications"}
            {verdict.source === "official" && " — chiffre client"}
            {verdict.source === "saisie" && " — NON VÉRIFIÉ"}
          </p>
          <p className="text-xs opacity-90">{explicationRge(verdict, etat)}</p>
        </div>
      </div>

      {/* Les dates, pour que « laisser une qualification expirée » reste un
          choix éclairé et non une inattention. */}
      {quals.length > 0 && (
        <ul className="mt-2 space-y-0.5 border-t pt-2 text-xs">
          {quals.map((q) => {
            const jours = q.date_fin ? joursAvant(q.date_fin) : null;
            const expiree = jours !== null && jours < 0;
            const bientot = jours !== null && jours >= 0 && jours <= 90;
            return (
              <li key={q.id} className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium">{q.nom_certificat ?? q.code_qualification}</span>
                {/* Dire quand un certificat n'a pas de logo évite qu'on cherche
                    un fichier manquant : les certificats d'audit nominatifs
                    n'en ont pas, et c'est normal. */}
                {!logoPourCertificat(q.nom_certificat) && (
                  <span className="text-neutral-400">(sans logo)</span>
                )}
                {q.date_fin && (
                  <span
                    className={
                      expiree ? "font-medium text-red-700" : bientot ? "font-medium text-amber-700" : "text-neutral-500"
                    }
                  >
                    {expiree
                      ? `expirée le ${formatDate(q.date_fin)} — il y a ${Math.abs(jours!)} j`
                      : `valide jusqu’au ${formatDate(q.date_fin)}`}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {expirees.length > 0 && (
        <p className="mt-1.5 text-xs text-red-700">
          {expirees.length} qualification{expirees.length > 1 ? "s" : ""} expirée
          {expirees.length > 1 ? "s" : ""} — elles ne comptent pas dans le total et n’affichent plus
          de logo.
        </p>
      )}
    </div>
  );
}
