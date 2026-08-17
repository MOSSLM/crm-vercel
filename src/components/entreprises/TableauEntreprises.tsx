"use client";

import Link from "next/link";
import { ExternalLink, Globe, MapPin, Star, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  type LigneEntreprise,
  LABELS_SITE,
  LABELS_DEMO,
  LABELS_EFFECTIF,
  LABELS_CMS,
  libelle,
} from "@/lib/entreprises/explorateur";
import { nombre } from "./graphes";

/**
 * Le tableau paginé, et ce qu'on peut faire sans quitter l'écran.
 *
 * Les actions rapides sont volontairement de deux sortes seulement : OUVRIR
 * (la fiche, le site, la fiche Google, la démo — aucun effet de bord) et
 * ATTRIBUER, qui passe par `/api/admin/assign`. Attribuer n'est pas un simple
 * `update` : cette route pose le propriétaire, réutilise l'affaire existante
 * plutôt que d'en ouvrir une seconde, et qualifie l'entreprise au passage —
 * l'invariant « une affaire implique une entreprise qualifiée ». Réécrire ce
 * geste ici aurait produit des doublons d'affaires, ce que cette route existe
 * précisément pour éviter.
 */

const url = (u: string | null) => (u && /^https?:\/\//i.test(u) ? u : u ? `https://${u}` : null);

type Props = {
  lignes: LigneEntreprise[];
  chargement: boolean;
  selection: Set<number>;
  onSelection: (s: Set<number>) => void;
  page: number;
  taille: number;
  total: number;
  onPage: (p: number) => void;
};

export function TableauEntreprises({
  lignes,
  chargement,
  selection,
  onSelection,
  page,
  taille,
  total,
  onPage,
}: Props) {
  const pages = Math.max(1, Math.ceil(total / taille));
  const toutesCochees = lignes.length > 0 && lignes.every((l) => selection.has(l.id));

  const basculerTout = () => {
    const s = new Set(selection);
    if (toutesCochees) lignes.forEach((l) => s.delete(l.id));
    else lignes.forEach((l) => s.add(l.id));
    onSelection(s);
  };

  const basculer = (id: number) => {
    const s = new Set(selection);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    onSelection(s);
  };

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="w-8 px-3 py-2">
                <Checkbox
                  checked={toutesCochees}
                  onCheckedChange={basculerTout}
                  aria-label="Tout sélectionner sur cette page"
                  className="h-3.5 w-3.5"
                />
              </th>
              <th className="px-3 py-2 font-medium">Entreprise</th>
              <th className="px-3 py-2 font-medium">Site</th>
              <th className="px-3 py-2 font-medium">Google</th>
              <th className="px-3 py-2 font-medium">Démo</th>
              <th className="px-3 py-2 font-medium">Techno</th>
              <th className="px-3 py-2 font-medium">Commercial</th>
              <th className="px-3 py-2 font-medium">Taille</th>
              <th className="w-24 px-3 py-2 font-medium">Ouvrir</th>
            </tr>
          </thead>
          <tbody className={chargement ? "opacity-50 transition-opacity" : "transition-opacity"}>
            {lignes.length === 0 && !chargement ? (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center text-sm text-muted-foreground">
                  Aucune entreprise ne répond à ces filtres.
                </td>
              </tr>
            ) : (
              lignes.map((l) => (
                <tr key={l.id} className="border-b border-border/60 last:border-b-0 hover:bg-muted/40">
                  <td className="px-3 py-2 align-top">
                    <Checkbox
                      checked={selection.has(l.id)}
                      onCheckedChange={() => basculer(l.id)}
                      aria-label={`Sélectionner ${l.nom ?? l.id}`}
                      className="mt-0.5 h-3.5 w-3.5"
                    />
                  </td>

                  <td className="max-w-[280px] px-3 py-2 align-top">
                    <Link
                      href={`/companies/${l.id}`}
                      className="block truncate font-medium text-foreground hover:text-primary hover:underline"
                    >
                      {l.nom ?? `Fiche ${l.id}`}
                    </Link>
                    <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span className="truncate">
                        {[l.code_postal, l.ville].filter(Boolean).join(" ") || "Adresse inconnue"}
                      </span>
                    </div>
                    {l.metier ? (
                      <div className="mt-0.5 truncate text-[11px] text-muted-foreground/80">
                        {l.metier}
                      </div>
                    ) : null}
                  </td>

                  <td className="px-3 py-2 align-top">
                    <EtatSite ligne={l} />
                  </td>

                  <td className="px-3 py-2 align-top">
                    {l.google_place_id ? (
                      <div className="text-xs">
                        {l.note_moyenne != null ? (
                          <span className="inline-flex items-center gap-1 font-medium text-foreground">
                            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                            {l.note_moyenne.toString().replace(".", ",")}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Fiche</span>
                        )}
                        <div className="text-[11px] text-muted-foreground">
                          {l.nombre_avis != null ? `${nombre(l.nombre_avis)} avis` : "avis inconnus"}
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>

                  <td className="px-3 py-2 align-top">
                    <EtiquetteDemo ligne={l} />
                  </td>

                  <td className="px-3 py-2 align-top">
                    <Techno ligne={l} />
                  </td>

                  <td className="px-3 py-2 align-top">
                    <div className="flex flex-wrap gap-1">
                      {l.qualifie ? (
                        <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                          Qualifiée
                        </Badge>
                      ) : null}
                      {l.opportunite_id ? (
                        <Badge className="px-1.5 py-0 text-[10px]">Affaire</Badge>
                      ) : null}
                      {l.premiere_touche_le ? (
                        <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                          Démarchée
                        </Badge>
                      ) : null}
                      {l.cohorte ? (
                        <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                          {l.cohorte.replace(/_/g, " ")}
                        </Badge>
                      ) : null}
                      {!l.qualifie && !l.opportunite_id && !l.premiere_touche_le && !l.cohorte ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : null}
                    </div>
                  </td>

                  <td className="px-3 py-2 align-top text-xs">
                    {l.chiffre_affaires != null ? (
                      <div className="font-medium text-foreground">
                        {(l.chiffre_affaires / 1000).toLocaleString("fr-FR", {
                          maximumFractionDigits: 0,
                        })}{" "}
                        k€
                        {l.exercice_annee ? (
                          <span className="ml-1 font-normal text-muted-foreground">
                            {l.exercice_annee}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                    <div className="text-[11px] text-muted-foreground">
                      {l.tranche_effectif_code
                        ? libelle(LABELS_EFFECTIF, l.tranche_effectif_code)
                        : l.chiffre_affaires != null
                          ? "effectif inconnu"
                          : "—"}
                    </div>
                    {l.rge ? (
                      <Badge variant="outline" className="mt-0.5 px-1.5 py-0 text-[10px]">
                        RGE
                      </Badge>
                    ) : null}
                  </td>

                  <td className="px-3 py-2 align-top">
                    <div className="flex items-center gap-1.5">
                      <LienExterne href={url(l.site)} titre="Ouvrir le site">
                        <Globe className="h-3.5 w-3.5" />
                      </LienExterne>
                      <LienExterne
                        href={
                          l.google_maps_url ??
                          (l.google_place_id
                            ? `https://www.google.com/maps/place/?q=place_id:${l.google_place_id}`
                            : null)
                        }
                        titre="Ouvrir la fiche Google"
                      >
                        <MapPin className="h-3.5 w-3.5" />
                      </LienExterne>
                      <LienExterne href={urlDemo(l)} titre="Ouvrir la démo">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </LienExterne>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between border-t border-border px-3 py-2">
        <p className="text-xs text-muted-foreground">
          {chargement ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" /> Chargement…
            </span>
          ) : total === 0 ? (
            "Aucun résultat"
          ) : (
            <>
              {nombre((page - 1) * taille + 1)}–{nombre(Math.min(page * taille, total))} sur{" "}
              <span className="font-medium text-foreground">{nombre(total)}</span>
            </>
          )}
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onPage(page - 1)}
            disabled={page <= 1}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
            aria-label="Page précédente"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="px-1 font-mono text-xs tabular-nums text-muted-foreground">
            {nombre(page)} / {nombre(pages)}
          </span>
          <button
            type="button"
            onClick={() => onPage(page + 1)}
            disabled={page >= pages}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
            aria-label="Page suivante"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

/** L'adresse publique de la démo, si elle est publiée. */
function urlDemo(l: LigneEntreprise): string | null {
  if (l.demo_domaine) return `https://${l.demo_domaine}`;
  if (l.demo_sous_domaine) return `https://${l.demo_sous_domaine}`;
  return null;
}

function EtatSite({ ligne }: { ligne: LigneEntreprise }) {
  if (ligne.etat_site === "present") {
    const lien = url(ligne.site);
    return lien ? (
      <a
        href={lien}
        target="_blank"
        rel="noopener noreferrer"
        className="block max-w-[150px] truncate text-xs text-primary hover:underline"
        title={ligne.site ?? undefined}
      >
        {ligne.domaine ?? ligne.site}
      </a>
    ) : (
      <span className="text-xs text-foreground">Site connu</span>
    );
  }
  return (
    <Badge
      variant={ligne.etat_site === "absent" ? "default" : "outline"}
      className={`px-1.5 py-0 text-[10px] ${ligne.etat_site === "absent" ? "bg-amber-500 text-white hover:bg-amber-500" : ""}`}
    >
      {libelle(LABELS_SITE, ligne.etat_site)}
    </Badge>
  );
}

function EtiquetteDemo({ ligne }: { ligne: LigneEntreprise }) {
  if (ligne.etat_demo === "aucune") return <span className="text-xs text-muted-foreground">—</span>;
  const fort = ligne.etat_demo === "publiee" || ligne.etat_demo === "prete";
  return (
    <Badge
      variant={fort ? "default" : "outline"}
      className={`px-1.5 py-0 text-[10px] ${ligne.etat_demo === "echec" ? "border-destructive text-destructive" : ""}`}
    >
      {libelle(LABELS_DEMO, ligne.etat_demo)}
    </Badge>
  );
}

/** CMS + version + année de dernière modification détectée — voir techno.ts. */
function Techno({ ligne }: { ligne: LigneEntreprise }) {
  if (!ligne.cms || ligne.cms === "inconnu") {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const annee = anneeDe(ligne.derniere_modif_site);
  return (
    <div className="text-xs">
      <span className="font-medium text-foreground">{libelle(LABELS_CMS, ligne.cms)}</span>
      {ligne.cms_version ? (
        <span className="ml-1 text-[11px] text-muted-foreground">{ligne.cms_version}</span>
      ) : null}
      {ligne.theme ? (
        <div className="truncate text-[11px] text-muted-foreground">{ligne.theme}</div>
      ) : null}
      {annee ? (
        <Badge variant="outline" className="mt-0.5 px-1.5 py-0 text-[10px]">
          maj {annee}
        </Badge>
      ) : null}
    </div>
  );
}

function anneeDe(iso: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? String(new Date(t).getFullYear()) : null;
}

function LienExterne({
  href,
  titre,
  children,
}: {
  href: string | null;
  titre: string;
  children: React.ReactNode;
}) {
  if (!href) {
    return (
      <span className="p-1 text-muted-foreground/25" title={`${titre} — indisponible`}>
        {children}
      </span>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={titre}
      className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {children}
    </a>
  );
}
