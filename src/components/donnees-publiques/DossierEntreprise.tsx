"use client";

/**
 * Le dossier d'une entreprise, tel qu'on le lit avant de décrocher.
 *
 * ORDRE DE LECTURE, et il est délibéré : ce qui doit m'arrêter, puis ce qui me
 * donne une raison d'appeler, puis à qui parler, puis le reste. Un commercial
 * qui ne lit que les deux premiers blocs a déjà l'essentiel.
 *
 * RÈGLE D'AFFICHAGE UNIQUE, qui découle des couvertures réelles (dirigeants
 * 100 %, effectif 47 %, résultat 40 %, CA 12 %) : **un bloc sans contenu n'est
 * pas rendu**. Pas de section vide, pas de placeholder, pas de tiret. Une fiche
 * pauvre produit une carte courte et lisible, pas un formulaire troué.
 */

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Ban,
  BadgeCheck,
  Building2,
  CalendarClock,
  Mail,
  Phone,
  RefreshCw,
  ShieldAlert,
  User,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { authedFetch } from "@/utils/authedFetch";
import { trancheEffectifLabel } from "@/lib/donnees-publiques/effectif";
import {
  accrochesDAppel,
  classerDirigeants,
  evaluerRisques,
  faitsEntreprise,
  finances,
  formatDate,
  nomAuRegistre,
  type DossierEntreprise as Dossier,
} from "@/lib/donnees-publiques/fiche";

type Contact = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  tel: string | null;
  role_title: string | null;
  is_decision_maker: boolean | null;
};

type Reponse = {
  entreprise: {
    id: number;
    name: string | null;
    ville: string | null;
    code_postal: string | null;
    telephone: string | null;
    email: string | null;
    siret: string | null;
  };
  publiques: Record<string, unknown> | null;
  qualifications: Dossier["qualifications"];
  contacts: Contact[];
};

export type DossierEntrepriseProps = {
  entrepriseId: number;
  /** Compact : masque les blocs secondaires, pour un panneau latéral d'appel. */
  compact?: boolean;
};

/** Petit bloc de section — n'est jamais rendu sans enfants. */
function Section({ titre, icone, children }: { titre: string; icone?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">
        {icone}
        {titre}
      </h3>
      {children}
    </div>
  );
}

export default function DossierEntreprise({ entrepriseId, compact = false }: DossierEntrepriseProps) {
  const [data, setData] = useState<Reponse | null>(null);
  const [chargement, setChargement] = useState(true);
  const [rafraichit, setRafraichit] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    try {
      const res = await authedFetch(`/api/donnees-publiques/fiche?entreprise_id=${entrepriseId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "lecture impossible");
      setData(json);
      setErreur(null);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "lecture impossible");
    } finally {
      setChargement(false);
    }
  }, [entrepriseId]);

  useEffect(() => {
    void charger();
  }, [charger]);

  const rafraichir = useCallback(async () => {
    setRafraichit(true);
    try {
      await authedFetch("/api/donnees-publiques/hydrate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ entreprise_ids: [entrepriseId] }),
      });
      await charger();
    } finally {
      setRafraichit(false);
    }
  }, [charger, entrepriseId]);

  if (chargement) {
    return <div className="h-24 animate-pulse rounded-lg bg-neutral-100" />;
  }
  if (erreur || !data) {
    return <p className="text-sm text-red-600">Dossier indisponible : {erreur}</p>;
  }

  const { entreprise, publiques, qualifications, contacts } = data;

  // ── Cas « pas encore de SIRET » : rien à afficher, mais une action à
  // proposer. C'est le cas de 150 fiches sur 190 : mieux vaut dire quoi faire
  // que d'afficher un dossier vide.
  if (!entreprise.siret) {
    return (
      <Card>
        <CardContent className="flex items-center justify-between gap-4 py-4">
          <div className="text-sm text-neutral-600">
            <p className="font-medium text-neutral-800">Aucun identifiant légal</p>
            <p className="text-xs">
              Sans SIRET, aucune donnée publique n&apos;est atteignable. À résoudre depuis la fiche.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const dossier: Dossier = {
    entreprise_id: entreprise.id,
    nom_crm: entreprise.name,
    siret: entreprise.siret,
    denomination: (publiques?.denomination as string) ?? null,
    enseignes: (publiques?.enseignes as string[]) ?? [],
    date_creation: (publiques?.date_creation as string) ?? null,
    date_fermeture: (publiques?.date_fermeture as string) ?? null,
    etat_administratif: (publiques?.etat_administratif as string) ?? null,
    naf_code: (publiques?.naf_code as string) ?? null,
    categorie_entreprise: (publiques?.categorie_entreprise as string) ?? null,
    tranche_effectif_code: (publiques?.tranche_effectif_code as string) ?? null,
    tranche_effectif_annee: (publiques?.tranche_effectif_annee as string) ?? null,
    chiffre_affaires: (publiques?.chiffre_affaires as number) ?? null,
    resultat_net: (publiques?.resultat_net as number) ?? null,
    exercice_annee: (publiques?.exercice_annee as number) ?? null,
    dirigeants: (publiques?.dirigeants as Dossier["dirigeants"]) ?? [],
    qualifications,
    identite_rafraichie_le: (publiques?.identite_rafraichie_le as string) ?? null,
    rge_rafraichi_le: (publiques?.rge_rafraichi_le as string) ?? null,
  };

  const risques = evaluerRisques(dossier);
  const bloquants = risques.filter((r) => r.niveau === "bloquant");
  const accroches = accrochesDAppel(dossier);
  const dirigeants = classerDirigeants(dossier.dirigeants);
  const faits = faitsEntreprise(dossier, trancheEffectifLabel);
  const fin = finances(dossier);
  const autreNom = nomAuRegistre(dossier);
  const joignables = contacts.filter((c) => c.tel || c.email);

  return (
    <Card className={bloquants.length > 0 ? "border-red-300" : undefined}>
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4 shrink-0 text-neutral-400" />
            Dossier public
          </CardTitle>
          {/* Le nom au registre quand il diffère : on appelle « EMC » une
              société qui répond « EDDIA Nouvelle Aquitaine ». */}
          {autreNom && (
            <p className="mt-1 truncate text-xs text-neutral-500">
              Au registre : <span className="font-medium text-neutral-700">{autreNom}</span>
            </p>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={rafraichir} disabled={rafraichit} className="shrink-0">
          <RefreshCw className={`h-3.5 w-3.5 ${rafraichit ? "animate-spin" : ""}`} />
          <span className="ml-1.5 text-xs">Rafraîchir</span>
        </Button>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* ── 1. CE QUI DOIT M'ARRÊTER ─────────────────────────────────────
            En tête, pleine largeur, couleur franche. Une entreprise cessée ne
            doit pas pouvoir être ratée par quelqu'un qui survole. */}
        {risques.map((r) => (
          <div
            key={r.titre}
            className={
              r.niveau === "bloquant"
                ? "flex items-start gap-2.5 rounded-md border border-red-300 bg-red-50 p-3"
                : "flex items-start gap-2.5 rounded-md border border-amber-300 bg-amber-50 p-3"
            }
          >
            {r.niveau === "bloquant" ? (
              <Ban className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
            ) : (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            )}
            <div className="min-w-0 text-sm">
              <p className={r.niveau === "bloquant" ? "font-semibold text-red-800" : "font-semibold text-amber-800"}>
                {r.titre}
                {r.niveau === "bloquant" && " — ne plus démarcher"}
              </p>
              {r.detail && (
                <p className={r.niveau === "bloquant" ? "text-red-700" : "text-amber-700"}>{r.detail}</p>
              )}
            </div>
          </div>
        ))}

        {/* ── 2. CE QUI OUVRE UNE CONVERSATION ────────────────────────────
            Inutile sur une fiche à proscrire : on ne cherche pas un motif
            d'appeler une entreprise morte. */}
        {bloquants.length === 0 && accroches.length > 0 && (
          <Section titre="Raisons d'appeler" icone={<CalendarClock className="h-3.5 w-3.5" />}>
            <div className="space-y-1.5">
              {accroches.map((a) => (
                <div
                  key={a.titre}
                  className={
                    a.intensite === "chaude"
                      ? "rounded-md border border-emerald-300 bg-emerald-50 p-2.5"
                      : "rounded-md border border-neutral-200 bg-neutral-50 p-2.5"
                  }
                >
                  <p
                    className={
                      a.intensite === "chaude"
                        ? "text-sm font-medium text-emerald-900"
                        : "text-sm font-medium text-neutral-800"
                    }
                  >
                    {a.titre}
                  </p>
                  {a.detail && <p className="text-xs text-neutral-600">{a.detail}</p>}
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* ── 3. À QUI PARLER ─────────────────────────────────────────────
            Le bloc le mieux couvert : 100 % des fiches hydratées ont au moins
            un dirigeant nommé. C'est ce qui remplace l'appel à l'aveugle. */}
        {(dirigeants.length > 0 || joignables.length > 0) && (
          <Section titre="À qui parler" icone={<User className="h-3.5 w-3.5" />}>
            <div className="space-y-1.5">
              {dirigeants.map((d) => (
                <div key={`${d.nomComplet}-${d.qualite ?? ""}`} className="flex items-baseline gap-2 text-sm">
                  <span className={d.estDecideur ? "font-medium text-neutral-900" : "text-neutral-500"}>
                    {d.nomComplet}
                  </span>
                  {d.qualite && (
                    <Badge variant="secondary" className="text-[10px] font-normal">
                      {d.qualite}
                    </Badge>
                  )}
                  {d.age !== null && <span className="text-xs text-neutral-400">{d.age} ans</span>}
                </div>
              ))}

              {joignables.map((c) => (
                <div key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <span className="font-medium text-neutral-900">
                    {[c.first_name, c.last_name].filter(Boolean).join(" ") || "Contact"}
                  </span>
                  {c.role_title && <span className="text-xs text-neutral-500">{c.role_title}</span>}
                  {c.tel && (
                    <a href={`tel:${c.tel}`} className="flex items-center gap-1 text-xs text-blue-700 hover:underline">
                      <Phone className="h-3 w-3" />
                      {c.tel}
                    </a>
                  )}
                  {c.email && (
                    <a href={`mailto:${c.email}`} className="flex items-center gap-1 text-xs text-blue-700 hover:underline">
                      <Mail className="h-3 w-3" />
                      {c.email}
                    </a>
                  )}
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* ── 4. L'ENTREPRISE ─────────────────────────────────────────────
            Des puces, pas un tableau : une fiche qui ne connaît que
            l'ancienneté affiche une puce, et reste jolie. */}
        {faits.length > 0 && (
          <Section titre="L'entreprise">
            <div className="flex flex-wrap gap-2">
              {faits.map((f) => (
                <div key={f.libelle} className="rounded-md border border-neutral-200 px-2.5 py-1.5">
                  <p className="text-[10px] uppercase tracking-wide text-neutral-400">{f.libelle}</p>
                  <p className="text-sm font-medium text-neutral-900">{f.valeur}</p>
                  {f.note && <p className="text-[10px] text-neutral-400">{f.note}</p>}
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* ── 5. FINANCES — absentes pour 60 % des fiches, donc absentes tout
            court quand elles le sont. Les deux chiffres sont indépendants. */}
        {fin && !compact && (
          <Section titre={`Comptes ${fin.exercice ?? ""}`.trim()}>
            <div className="flex flex-wrap gap-2">
              {fin.ca && (
                <div className="rounded-md border border-neutral-200 px-2.5 py-1.5">
                  <p className="text-[10px] uppercase tracking-wide text-neutral-400">Chiffre d&apos;affaires</p>
                  <p className="text-sm font-medium text-neutral-900">{fin.ca}</p>
                </div>
              )}
              <div className="rounded-md border border-neutral-200 px-2.5 py-1.5">
                <p className="text-[10px] uppercase tracking-wide text-neutral-400">Résultat net</p>
                <p
                  className={`text-sm font-medium ${
                    (dossier.resultat_net ?? 0) < 0 ? "text-red-700" : "text-neutral-900"
                  }`}
                >
                  {fin.resultat}
                </p>
              </div>
              {/* Dit pourquoi le CA manque, au lieu de laisser croire à un bug :
                  les comptes confidentiels sont la règle chez les artisans. */}
              {!fin.ca && (
                <p className="self-center text-xs text-neutral-400">
                  Chiffre d&apos;affaires non publié (comptes confidentiels)
                </p>
              )}
            </div>
          </Section>
        )}

        {/* ── 6. QUALIFICATIONS RGE — source ADEME, jamais déclarative.
            Aucun bloc si aucune qualification : ne pas laisser croire qu'on
            n'a pas regardé. */}
        {qualifications.length > 0 && (
          <Section titre="Qualifications RGE" icone={<BadgeCheck className="h-3.5 w-3.5" />}>
            <div className="space-y-1">
              {qualifications.map((q) => {
                const jours = q.date_fin
                  ? Math.round((new Date(`${q.date_fin}T00:00:00Z`).getTime() - Date.now()) / 86_400_000)
                  : null;
                const expiree = jours !== null && jours < 0;
                const bientot = jours !== null && jours >= 0 && jours <= 90;
                return (
                  <div key={q.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
                    <span className="font-medium text-neutral-900">
                      {q.nom_certificat ?? q.code_qualification}
                    </span>
                    {q.domaine && <span className="text-xs text-neutral-500">{q.domaine}</span>}
                    {q.date_fin && (
                      <span
                        className={`text-xs ${
                          expiree ? "font-medium text-red-700" : bientot ? "font-medium text-amber-700" : "text-neutral-400"
                        }`}
                      >
                        {expiree
                          ? `expirée le ${formatDate(q.date_fin)}`
                          : `jusqu'au ${formatDate(q.date_fin)}`}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        {/* ── Pied : d'où ça vient et de quand. Une donnée sans date de
            fraîcheur invite à lui faire trop confiance. */}
        <div className="flex flex-wrap items-center gap-x-3 border-t pt-2.5 text-[11px] text-neutral-400">
          <span className="font-mono">{entreprise.siret}</span>
          {dossier.identite_rafraichie_le && (
            <span>identité au {formatDate(dossier.identite_rafraichie_le.slice(0, 10))}</span>
          )}
          {dossier.rge_rafraichi_le && <span>RGE au {formatDate(dossier.rge_rafraichi_le.slice(0, 10))}</span>}
          {!publiques && (
            <span className="flex items-center gap-1 text-amber-600">
              <ShieldAlert className="h-3 w-3" />
              jamais hydratée
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
