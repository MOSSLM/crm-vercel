"use client";

import { useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  type FiltresExplorateur,
  type Facettes,
  type Ternaire,
  LABELS_SITE,
  LABELS_DEMO,
  LABELS_CA,
  LABELS_AVIS,
  LABELS_EFFECTIF,
  LABELS_SOURCE,
  LABELS_COHORTE,
  LABELS_CMS,
  ORDRE_SITE,
  ORDRE_DEMO,
  ORDRE_CA,
  ORDRE_AVIS,
  ORDRE_EFFECTIF,
  libelle,
} from "@/lib/entreprises/explorateur";
import { nombre } from "./graphes";

/**
 * Le panneau de filtres, rangé selon les cinq familles de la vision : identité
 * et sources, présence digitale, finances et taille, contacts, métier et zone —
 * plus le suivi commercial et le périmètre.
 *
 * CHAQUE CASE PORTE SON COMPTEUR, tiré des répartitions de la sélection
 * courante. C'est ce qui évite de cocher à l'aveugle une case qui rendra zéro :
 * le compteur le dit avant le clic. Une case à 0 reste cochable (la sélection
 * peut changer), mais elle est estompée.
 */

type Props = {
  filtres: FiltresExplorateur;
  facettes: Facettes | null;
  departements: { cle: string; libelle: string; n: number }[];
  lots: { id: number; nom: string; taille: number }[];
  onChange: (patch: Partial<FiltresExplorateur>) => void;
};

export function PanneauFiltres({ filtres, facettes, departements, lots, onChange }: Props) {
  return (
    <div className="space-y-1">
      <Groupe titre="Lot de travail" ouvertParDefaut={Boolean(filtres.lot_id)}>
        <p className="mb-1.5 text-[11px] leading-snug text-muted-foreground">
          Un lot est une sélection figée — voir la barre d&apos;action groupée pour en créer un.
        </p>
        <label className="block">
          <select
            value={filtres.lot_id ?? ""}
            onChange={(e) => onChange({ lot_id: e.target.value ? Number(e.target.value) : undefined })}
            className="h-7 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground"
          >
            <option value="">Tous les lots (aucun filtre)</option>
            {lots.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nom} ({l.taille})
              </option>
            ))}
          </select>
        </label>
      </Groupe>

      <Groupe titre="Suivi commercial" ouvertParDefaut>
        <ChoixTernaire
          label="Qualifiée"
          valeur={filtres.qualifie}
          compteurs={
            facettes && [facettes.qualification.qualifiee, facettes.qualification.non_qualifiee]
          }
          onChange={(v) => onChange({ qualifie: v })}
        />
        <ChoixTernaire
          label="Opportunité ouverte"
          valeur={filtres.opportunite}
          compteurs={facettes && [facettes.opportunite.avec, facettes.opportunite.sans]}
          onChange={(v) => onChange({ opportunite: v })}
        />
        <ChoixTernaire
          label="Déjà démarchée"
          valeur={filtres.demarche}
          compteurs={facettes && [facettes.demarchage.demarchee, facettes.demarchage.jamais]}
          onChange={(v) => onChange({ demarche: v })}
        />
        <Cases
          titre="Cohorte de démarchage"
          ordre={Object.keys(facettes?.cohorte ?? {}).sort()}
          labels={LABELS_COHORTE}
          compteurs={facettes?.cohorte ?? {}}
          selection={filtres.cohortes ?? []}
          onChange={(v) => onChange({ cohortes: v })}
        />
      </Groupe>

      <Groupe titre="Présence digitale" ouvertParDefaut>
        <Cases
          titre="État du site"
          aide="« Sans site (vérifié) » veut dire qu'on a cherché et qu'il n'y a rien. « Site inconnu » veut dire que personne n'a encore regardé."
          ordre={ORDRE_SITE}
          labels={LABELS_SITE}
          compteurs={facettes?.site ?? {}}
          selection={filtres.site ?? []}
          onChange={(v) => onChange({ site: v })}
        />
        <ChoixTernaire
          label="Fiche Google"
          valeur={filtres.fiche_google}
          compteurs={facettes && [facettes.fiche_google.avec, facettes.fiche_google.sans]}
          onChange={(v) => onChange({ fiche_google: v })}
        />
        <Cases
          titre="Site de démo"
          ordre={ORDRE_DEMO}
          labels={LABELS_DEMO}
          compteurs={facettes?.demo ?? {}}
          selection={filtres.demo ?? []}
          onChange={(v) => onChange({ demo: v })}
        />
        <Cases
          titre="Avis Google"
          ordre={ORDRE_AVIS}
          labels={LABELS_AVIS}
          compteurs={facettes?.avis ?? {}}
          selection={filtres.avis ?? []}
          onChange={(v) => onChange({ avis: v })}
        />
        <Deux>
          <Nombre
            label="Note min."
            valeur={filtres.note_min}
            pas={0.1}
            max={5}
            onChange={(v) => onChange({ note_min: v })}
          />
          <Nombre
            label="Avis min."
            valeur={filtres.avis_min}
            onChange={(v) => onChange({ avis_min: v })}
          />
        </Deux>
      </Groupe>

      <Groupe titre="Technologie" ouvertParDefaut={Boolean(filtres.technologies?.length)}>
        <p className="mb-1.5 text-[11px] leading-snug text-muted-foreground">
          Détectée dans le HTML du site actuel — voir « Ancienneté technique » dans le tri pour
          faire remonter les plus vieux d&apos;abord.
        </p>
        <Cases
          titre="CMS / plateforme"
          ordre={Object.keys(facettes?.technologie ?? {}).sort(
            (a, b) => (facettes?.technologie[b] ?? 0) - (facettes?.technologie[a] ?? 0),
          )}
          labels={LABELS_CMS}
          compteurs={facettes?.technologie ?? {}}
          selection={filtres.technologies ?? []}
          onChange={(v) => onChange({ technologies: v })}
        />
      </Groupe>

      <Groupe titre="Finances et taille">
        <p className="mb-2 text-[11px] leading-snug text-muted-foreground">
          Peu de fiches portent ces données : filtrer sur un palier réduit fort, non parce que les
          entreprises manquent, mais parce que la donnée manque. Le palier « inconnu » le montre.
        </p>
        <Cases
          titre="Chiffre d'affaires"
          ordre={ORDRE_CA}
          labels={LABELS_CA}
          compteurs={facettes?.ca ?? {}}
          selection={filtres.ca ?? []}
          onChange={(v) => onChange({ ca: v })}
        />
        <Cases
          titre="Effectif"
          ordre={ORDRE_EFFECTIF}
          labels={LABELS_EFFECTIF}
          compteurs={facettes?.effectif ?? {}}
          selection={filtres.effectif ?? []}
          onChange={(v) => onChange({ effectif: v })}
        />
        <ChoixTernaire
          label="RGE"
          valeur={filtres.rge}
          compteurs={facettes && [facettes.rge.oui, facettes.rge.non]}
          onChange={(v) => onChange({ rge: v })}
        />
      </Groupe>

      <Groupe titre="Contacts">
        <ChoixTernaire
          label="E-mail"
          valeur={filtres.email}
          compteurs={facettes && [facettes.contact.email, null]}
          onChange={(v) => onChange({ email: v })}
        />
        <ChoixTernaire
          label="Téléphone"
          valeur={filtres.telephone}
          compteurs={facettes && [facettes.contact.telephone, null]}
          onChange={(v) => onChange({ telephone: v })}
        />
        {facettes ? (
          <p className="text-[11px] text-muted-foreground">
            {nombre(facettes.contact.aucun)} fiche{facettes.contact.aucun > 1 ? "s" : ""} sans aucun
            contact exploitable.
          </p>
        ) : null}
      </Groupe>

      <Groupe titre="Métier et zone">
        <ListeCherchable
          titre="Départements"
          options={departements}
          selection={filtres.departements ?? []}
          onChange={(v) => onChange({ departements: v })}
        />
        {filtres.villes?.length ? (
          <Jetons
            titre="Villes"
            valeurs={filtres.villes}
            onRetirer={(v) =>
              onChange({ villes: (filtres.villes ?? []).filter((x) => x !== v) })
            }
          />
        ) : (
          <p className="text-[11px] text-muted-foreground">
            Les villes se filtrent en cliquant une barre du graphe « Villes ».
          </p>
        )}
      </Groupe>

      <Groupe titre="Identité et sources">
        <Cases
          titre="Source"
          ordre={Object.keys(facettes?.sources ?? {}).sort(
            (a, b) => (facettes?.sources[b] ?? 0) - (facettes?.sources[a] ?? 0),
          )}
          labels={LABELS_SOURCE}
          compteurs={facettes?.sources ?? {}}
          selection={filtres.sources ?? []}
          onChange={(v) => onChange({ sources: v })}
        />
        <ChoixTernaire
          label="SIRET"
          valeur={filtres.siret}
          onChange={(v) => onChange({ siret: v })}
        />
        <ChoixTernaire label="Logo" valeur={filtres.logo} onChange={(v) => onChange({ logo: v })} />
      </Groupe>

      <Groupe titre="Périmètre">
        <ChoixPerimetre
          label="Fiches masquées"
          valeur={filtres.masquees ?? "exclure"}
          onChange={(v) => onChange({ masquees: v })}
        />
        <ChoixPerimetre
          label="Fiches archivées"
          valeur={filtres.archivees ?? "exclure"}
          onChange={(v) => onChange({ archivees: v })}
        />
      </Groupe>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Groupe({
  titre,
  ouvertParDefaut = false,
  children,
}: {
  titre: string;
  ouvertParDefaut?: boolean;
  children: React.ReactNode;
}) {
  const [ouvert, setOuvert] = useState(ouvertParDefaut);
  return (
    <div className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={() => setOuvert((o) => !o)}
        aria-expanded={ouvert}
        className="flex w-full items-center justify-between py-2.5 text-left text-xs font-semibold tracking-tight text-foreground"
      >
        {titre}
        <ChevronDown
          className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${ouvert ? "rotate-180" : ""}`}
        />
      </button>
      {ouvert ? <div className="space-y-3 pb-3">{children}</div> : null}
    </div>
  );
}

function ChoixTernaire({
  label,
  valeur,
  compteurs,
  onChange,
}: {
  label: string;
  valeur: Ternaire;
  /** [combien de « oui », combien de « non »] — `null` quand on ne sait pas. */
  compteurs?: (number | null)[] | null;
  onChange: (v: Ternaire) => void;
}) {
  const options: { v: Ternaire; texte: string; n?: number | null }[] = [
    { v: undefined, texte: "Tous" },
    { v: "oui", texte: "Oui", n: compteurs?.[0] },
    { v: "non", texte: "Non", n: compteurs?.[1] },
  ];
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-foreground">{label}</span>
      <div className="flex shrink-0 overflow-hidden rounded-md border border-border">
        {options.map((o) => (
          <button
            key={o.texte}
            type="button"
            onClick={() => onChange(o.v)}
            aria-pressed={valeur === o.v}
            className={[
              "px-2 py-1 text-[11px] transition-colors",
              valeur === o.v
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted",
            ].join(" ")}
          >
            {o.texte}
            {typeof o.n === "number" ? (
              <span className="ml-1 font-mono tabular-nums opacity-70">{nombre(o.n)}</span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}

function ChoixPerimetre({
  label,
  valeur,
  onChange,
}: {
  label: string;
  valeur: "exclure" | "inclure" | "seulement";
  onChange: (v: "exclure" | "inclure" | "seulement") => void;
}) {
  const options = [
    { v: "exclure" as const, texte: "Exclure" },
    { v: "inclure" as const, texte: "Inclure" },
    { v: "seulement" as const, texte: "Seulement" },
  ];
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-foreground">{label}</span>
      <div className="flex shrink-0 overflow-hidden rounded-md border border-border">
        {options.map((o) => (
          <button
            key={o.v}
            type="button"
            onClick={() => onChange(o.v)}
            aria-pressed={valeur === o.v}
            className={[
              "px-2 py-1 text-[11px] transition-colors",
              valeur === o.v
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted",
            ].join(" ")}
          >
            {o.texte}
          </button>
        ))}
      </div>
    </div>
  );
}

function Cases({
  titre,
  aide,
  ordre,
  labels,
  compteurs,
  selection,
  onChange,
}: {
  titre: string;
  aide?: string;
  ordre: string[];
  labels: Record<string, string>;
  compteurs: Record<string, number>;
  selection: string[];
  onChange: (v: string[]) => void;
}) {
  // On montre les valeurs de l'ordre canonique qui existent dans la sélection
  // courante, plus celles déjà cochées — sinon décocher deviendrait impossible
  // dès qu'un filtre vide leur compteur.
  const cles = ordre.filter((c) => c in compteurs || selection.includes(c));
  if (cles.length === 0) return null;

  const basculer = (cle: string) => {
    onChange(selection.includes(cle) ? selection.filter((c) => c !== cle) : [...selection, cle]);
  };

  return (
    <fieldset>
      <legend className="mb-1 text-[11px] font-medium text-muted-foreground">{titre}</legend>
      {aide ? <p className="mb-1.5 text-[11px] leading-snug text-muted-foreground">{aide}</p> : null}
      <div className="space-y-0.5">
        {cles.map((cle) => {
          const n = compteurs[cle] ?? 0;
          return (
            <label
              key={cle}
              className={`flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-xs hover:bg-muted ${n === 0 ? "opacity-50" : ""}`}
            >
              <Checkbox
                checked={selection.includes(cle)}
                onCheckedChange={() => basculer(cle)}
                className="h-3.5 w-3.5"
              />
              <span className="min-w-0 flex-1 truncate text-foreground">
                {libelle(labels, cle)}
              </span>
              <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                {nombre(n)}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function ListeCherchable({
  titre,
  options,
  selection,
  onChange,
}: {
  titre: string;
  options: { cle: string; libelle: string; n: number }[];
  selection: string[];
  onChange: (v: string[]) => void;
}) {
  const [recherche, setRecherche] = useState("");
  const visibles = options.filter(
    (o) => recherche === "" || o.libelle.toLowerCase().includes(recherche.toLowerCase()),
  );

  return (
    <fieldset>
      <legend className="mb-1 text-[11px] font-medium text-muted-foreground">
        {titre}
        {selection.length > 0 ? ` — ${selection.length} retenu${selection.length > 1 ? "s" : ""}` : ""}
      </legend>
      <Input
        value={recherche}
        onChange={(e) => setRecherche(e.target.value)}
        placeholder="Filtrer la liste…"
        className="mb-1.5 h-7 text-xs"
      />
      <div className="max-h-44 space-y-0.5 overflow-y-auto rounded-md border border-border p-1">
        {visibles.length === 0 ? (
          <p className="px-1 py-2 text-center text-[11px] text-muted-foreground">Aucun résultat.</p>
        ) : (
          visibles.map((o) => (
            <label
              key={o.cle}
              className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-xs hover:bg-muted"
            >
              <Checkbox
                checked={selection.includes(o.cle)}
                onCheckedChange={() =>
                  onChange(
                    selection.includes(o.cle)
                      ? selection.filter((c) => c !== o.cle)
                      : [...selection, o.cle],
                  )
                }
                className="h-3.5 w-3.5"
              />
              <span className="min-w-0 flex-1 truncate text-foreground">{o.libelle}</span>
              <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                {nombre(o.n)}
              </span>
            </label>
          ))
        )}
      </div>
    </fieldset>
  );
}

function Jetons({
  titre,
  valeurs,
  onRetirer,
}: {
  titre: string;
  valeurs: string[];
  onRetirer: (v: string) => void;
}) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-medium text-muted-foreground">{titre}</p>
      <div className="flex flex-wrap gap-1">
        {valeurs.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onRetirer(v)}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] text-foreground hover:bg-muted/70"
          >
            {v}
            <X className="h-3 w-3 text-muted-foreground" />
          </button>
        ))}
      </div>
    </div>
  );
}

function Deux({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-2">{children}</div>;
}

function Nombre({
  label,
  valeur,
  pas,
  max,
  onChange,
}: {
  label: string;
  valeur: number | undefined;
  pas?: number;
  max?: number;
  onChange: (v: number | undefined) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-muted-foreground">{label}</span>
      <Input
        type="number"
        step={pas}
        max={max}
        min={0}
        value={valeur ?? ""}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === "" ? undefined : Number(v));
        }}
        className="h-7 text-xs"
      />
    </label>
  );
}
