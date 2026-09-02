"use client";

import React from "react";
import { toast } from "sonner";
import { Bookmark, Trash2 } from "lucide-react";
import { authedFetch } from "@/utils/authedFetch";
import type { CleFiltre } from "./filtres";

/**
 * LES SEGMENTS, ENFIN ATTEIGNABLES DEPUIS LE TABLEAU.
 *
 * Le grief : « les segments, je ne les ai pas trouvés. Je ne peux pas créer des
 * segments dans le marketing pipeline. » Ils existaient — table
 * `segments_entreprises`, route `/api/entreprises/segments` — mais un seul
 * écran les servait, l'explorateur d'entreprises, où personne ne travaille.
 *
 * UN SEGMENT EST UNE REQUÊTE, PAS UNE LISTE. On enregistre les critères et
 * jamais les identifiants trouvés : une entreprise entre et sort du segment
 * toute seule quand ses données changent — et c'est le signe que
 * l'enrichissement a marché. Ce qui doit rester FIGÉ, c'est un lot de campagne,
 * et il vit ailleurs (`entreprises.cohorte_demarchage`), pour que la population
 * mesurée ne bouge pas sous la mesure.
 *
 * ⚠️ DEUX ÉCRANS ÉCRIVENT DANS LA MÊME TABLE, ET PAS DANS LA MÊME LANGUE.
 * L'explorateur pose `flags` et `sources` ; ici on pose `services` et
 * `filtres`. Rouvrir un segment écrit là-bas ne rejouerait donc qu'une partie
 * de ses critères — alors on le DIT, au lieu de rendre une population plus
 * large sous un nom qui promet un tri.
 */

/**
 * L'ÉTAT DE LA BARRE D'OUTILS, celui que les segments ignoraient.
 *
 * Un segment ne retenait que `q`, `services` et `filtres` — trois dimensions
 * sur treize. On enregistrait « aucun tag autorisé + étape Site démo », on
 * rouvrait, et l'étape avait disparu : le tableau rendait une population plus
 * large sous un nom qui promettait un tri, sans que rien ne le signale. C'est
 * exactement la faute que ce fichier reproche déjà aux segments de
 * l'explorateur ; elle était aussi ici.
 *
 * Tout est FACULTATIF et rangé sous `vue` : l'explorateur lit `flags` et
 * `sources`, il ignore cette clé sans rien casser, et un segment écrit avant
 * aujourd'hui se rejoue comme avant.
 */
export interface VueSegment {
  attribution?: string;
  owner?: string | null;
  hideAttributed?: boolean;
  pipeline?: string;
  data?: string;
  canal?: string;
  sequence?: string;
  ticket?: string;
  /** L'étape : `all`, `done`, ou l'index de la colonne. */
  stage?: string;
  /** L'ordre fait partie de la vue : « les plus en retard d'abord » se sauve. */
  sort?: string;
}

export interface CriteresSegment {
  q?: string | null;
  flags?: string[];
  sources?: string[];
  services?: string[];
  filtres?: string[];
  /** Les menus de la barre d'outils. Absent des segments d'avant le 02/09/2026. */
  vue?: VueSegment;
}

export interface Segment {
  id: string;
  nom: string;
  criteres: CriteresSegment;
}

/** Ce que CET écran sait rejouer. Le reste est signalé, jamais avalé. */
const rejouable = (c: CriteresSegment) =>
  (c.services?.length ?? 0) > 0 ||
  (c.filtres?.length ?? 0) > 0 ||
  !!c.q ||
  Object.keys(c.vue ?? {}).length > 0;

/** Ce que cet écran ne sait PAS rejouer — les critères de l'explorateur. */
const etranger = (c: CriteresSegment) =>
  (c.flags?.length ?? 0) + (c.sources?.length ?? 0);

export function SegmentsBarre({
  q,
  services,
  filtres,
  vue,
  onRejouer,
}: {
  /** La recherche courante du tableau. */
  q: string;
  /** Les métiers cochés. */
  services: Set<string>;
  /** Les cases cochées du panneau de filtres. */
  filtres: Set<CleFiltre>;
  /**
   * Les menus de la barre d'outils, réduits à ce qui S'ÉCARTE du défaut.
   * Enregistrer « tout » sous chaque menu ferait un segment illisible et,
   * surtout, figerait des défauts qui peuvent changer.
   */
  vue: VueSegment;
  /** Applique les critères d'un segment au tableau. */
  onRejouer: (c: CriteresSegment) => void;
}) {
  const [segments, setSegments] = React.useState<Segment[]>([]);
  /**
   * `null` = on ne sait pas lire les segments (migration non jouée, panne). La
   * barre disparaît alors, plutôt que d'annoncer « aucun segment » sur une base
   * qui en contient peut-être vingt.
   */
  const [lisibles, setLisibles] = React.useState<boolean | null>(null);
  const [occupe, setOccupe] = React.useState(false);

  const relire = React.useCallback(async () => {
    try {
      const res = await authedFetch("/api/entreprises/segments");
      const body = (await res.json().catch(() => ({}))) as { segments?: Segment[] };
      if (!res.ok) {
        setLisibles(false);
        return;
      }
      setSegments(body.segments ?? []);
      setLisibles(true);
    } catch {
      setLisibles(false);
    }
  }, []);

  React.useEffect(() => {
    void relire();
  }, [relire]);

  const aQuoiTrier =
    services.size > 0 || filtres.size > 0 || q.trim().length > 0 || Object.keys(vue).length > 0;

  const enregistrer = async () => {
    if (!aQuoiTrier) return;
    const nom = window.prompt("Nom du segment ?")?.trim();
    if (!nom) return;
    setOccupe(true);
    try {
      const res = await authedFetch("/api/entreprises/segments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nom,
          criteres: {
            q: q.trim() || null,
            services: [...services],
            filtres: [...filtres],
            vue,
          },
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(body.error || "Segment non enregistré.");
        return;
      }
      toast.success(`Segment « ${nom} » enregistré.`);
      await relire();
    } catch {
      toast.error("Segment non enregistré.");
    } finally {
      setOccupe(false);
    }
  };

  const supprimer = async (s: Segment) => {
    // Pas de confirmation : supprimer un segment ne supprime AUCUNE entreprise.
    try {
      const res = await authedFetch(`/api/entreprises/segments?id=${encodeURIComponent(s.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      setSegments((liste) => liste.filter((x) => x.id !== s.id));
    } catch {
      toast.error("Segment non supprimé.");
    }
  };

  if (lisibles !== true) return null;

  return (
    <div className="mp-segments">
      <span className="lb">
        <Bookmark className="ico-sm" />
        Segments
      </span>

      {segments.length === 0 && (
        <span className="vide">
          Aucune pour l’instant — filtre le tableau comme tu veux le retrouver, puis enregistre.
        </span>
      )}

      {segments.map((s) => {
        const hors = etranger(s.criteres);
        return (
          <span className="seg" key={s.id}>
            <button
              className="btn subtle sm"
              disabled={!rejouable(s.criteres)}
              title={
                hors > 0
                  ? `Écrit depuis l’explorateur : ${hors} critère(s) que ce tableau ne sait pas rejouer seront ignorés.`
                  : "Rejouer ce segment sur le tableau"
              }
              onClick={() => {
                onRejouer(s.criteres);
                if (hors > 0) {
                  toast.warning(
                    `« ${s.nom} » vient de l’explorateur : ${hors} critère(s) ne sont pas rejoués ici.`,
                    { description: "Le tableau montre donc une population plus large que le segment." },
                  );
                }
              }}
            >
              {s.nom}
            </button>
            <button
              className="btn ghost sm x"
              onClick={() => supprimer(s)}
              title="Oublier ce segment (aucune entreprise n’est supprimée)"
            >
              <Trash2 className="ico-sm" />
            </button>
          </span>
        );
      })}

      <button
        className="btn subtle sm"
        disabled={!aQuoiTrier || occupe}
        onClick={enregistrer}
        title={
          aQuoiTrier
            ? "Enregistrer sous un nom TOUT l’état de la barre : recherche, métiers, cases, menus, étape et tri"
            : "Coche au moins un métier, un filtre ou un menu : une vue sans critère ne trie rien"
        }
      >
        <Bookmark className="ico-sm" />
        Enregistrer cette vue
      </button>
    </div>
  );
}
