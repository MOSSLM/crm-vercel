"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Icon } from "./DemIcon";
import { authedFetch } from "@/utils/authedFetch";

/**
 * S'ATTRIBUER DES ENTREPRISES — se constituer sa file, à l'avance.
 *
 * La file de démarchage ne montre que les entreprises dont on est
 * propriétaire ; sans attribution, l'écran est vide et le reste. Ce panneau
 * ouvre le POOL — tout ce qui est qualifié et n'appartient à personne — et
 * permet de s'en servir directement (cf. `/api/agent/demarchage/pool`).
 *
 * CE QUI EST MONTRÉ, ET POURQUOI
 * Le nom, la ville, le numéro, et deux marqueurs : « avec site » / « sans
 * site », qui décident de l'accroche et du document qu'on enverra, et le
 * nombre d'avis Google, qui dit s'il y a une réputation à défendre en face.
 * C'est exactement ce dont on a besoin pour choisir un lot, pas plus — la
 * fiche complète est à un clic depuis la file, une fois l'entreprise à soi.
 *
 * Le filtre « avec un numéro » est proposé mais jamais imposé : démarcher,
 * c'est appeler ou écrire sur WhatsApp, et une fiche sans téléphone n'ouvre
 * aucune des deux portes — elle reste attribuable pour autant, elle se
 * travaille autrement.
 */

type PoolProspect = {
  id: number;
  name: string | null;
  ville: string | null;
  code_postal: string | null;
  departement: string | null;
  telephone: string | null;
  a_email: boolean;
  a_site: boolean;
  cohorte: string | null;
  avis: number | null;
  note: number | null;
};

type PoolReponse = {
  autorise: boolean;
  total: number;
  tronque: boolean;
  prospects: PoolProspect[];
};

/** Ce qu'on charge d'un coup : de quoi choisir un lot sans faire défiler l'infini. */
const PAR_PAGE = 60;

const nomDe = (e: PoolProspect) => e.name?.trim() || `Fiche #${e.id}`;

export function DemAttribution({
  ouvert,
  onFermer,
  onAttribue,
}: {
  ouvert: boolean;
  onFermer: () => void;
  /** Le lot est passé côté agent : la file doit se recharger. */
  onAttribue: (nombre: number) => void;
}) {
  const [q, setQ] = useState("");
  const [avecTel, setAvecTel] = useState(true);
  const [prospects, setProspects] = useState<PoolProspect[]>([]);
  const [total, setTotal] = useState(0);
  const [tronque, setTronque] = useState(false);
  const [chargement, setChargement] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [choisis, setChoisis] = useState<Set<number>>(new Set());
  const champRef = useRef<HTMLInputElement>(null);

  // À l'ouverture : champ vide, rien de coché. On ne rouvre jamais sur la
  // sélection d'avant — un lot déjà attribué recoché par inadvertance ferait
  // un aller-retour d'erreurs 409.
  useEffect(() => {
    if (!ouvert) return;
    setQ("");
    setChoisis(new Set());
    champRef.current?.focus();
  }, [ouvert]);

  const charger = useCallback(async () => {
    setChargement(true);
    try {
      const params = new URLSearchParams({ limit: String(PAR_PAGE) });
      if (q.trim()) params.set("q", q.trim());
      if (avecTel) params.set("avec_tel", "1");
      const res = await authedFetch(`/api/agent/demarchage/pool?${params}`);
      if (!res.ok) throw new Error();
      const data = (await res.json()) as PoolReponse;
      setProspects(data.prospects ?? []);
      setTotal(data.total ?? 0);
      setTronque(data.tronque === true);
    } catch {
      toast.error("Impossible de charger le pool.");
    } finally {
      setChargement(false);
    }
  }, [q, avecTel]);

  // La recherche part au serveur : on attend une pause de frappe plutôt que
  // d'envoyer une requête par lettre.
  useEffect(() => {
    if (!ouvert) return;
    const id = setTimeout(() => void charger(), q.trim() ? 250 : 0);
    return () => clearTimeout(id);
  }, [ouvert, charger, q]);

  const basculer = (id: number) =>
    setChoisis((s) => {
      const suivant = new Set(s);
      if (suivant.has(id)) suivant.delete(id);
      else suivant.add(id);
      return suivant;
    });

  const toutCocher = () =>
    setChoisis((s) =>
      s.size === prospects.length ? new Set() : new Set(prospects.map((e) => e.id)),
    );

  const attribuer = async () => {
    if (choisis.size === 0) return;
    setEnvoi(true);
    try {
      const res = await authedFetch("/api/agent/demarchage/pool", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entreprise_ids: [...choisis] }),
      });
      const corps = (await res.json().catch(() => ({}))) as {
        attribuees?: number;
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        toast.error(corps?.message || corps?.error || "Attribution impossible.");
        // La liste a vieilli : on la relit, plutôt que de laisser recliquer sur
        // des fiches qui viennent d'être prises.
        await charger();
        return;
      }
      const n = corps.attribuees ?? choisis.size;
      toast.success(
        n > 1
          ? `${n} entreprises sont à toi — elles arrivent dans ta file.`
          : "Elle est à toi — elle arrive dans ta file.",
      );
      setChoisis(new Set());
      onAttribue(n);
      await charger();
    } catch {
      toast.error("Attribution impossible.");
    } finally {
      setEnvoi(false);
    }
  };

  const auClavier = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onFermer();
    }
  };

  const resume = useMemo(() => {
    if (chargement && prospects.length === 0) return "Chargement du pool…";
    if (total === 0) return "Aucune entreprise disponible avec ces critères.";
    const vues = prospects.length;
    return tronque
      ? `${vues} affichées sur ${total} disponibles — affine la recherche pour voir les autres.`
      : `${total} entreprise${total > 1 ? "s" : ""} disponible${total > 1 ? "s" : ""}.`;
  }, [chargement, prospects.length, total, tronque]);

  if (!ouvert) return null;

  return (
    <div
      className="dm-rech dm-attr"
      role="dialog"
      aria-modal="true"
      aria-label="S'attribuer des entreprises"
      onKeyDown={auClavier}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onFermer();
      }}
    >
      <div className="pan">
        <div className="hd">
          <Icon name="building" className="ico-sm" />
          <input
            ref={champRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Nom, ville ou code postal…"
            aria-label="Chercher dans le pool"
            autoComplete="off"
            spellCheck="false"
          />
          <button type="button" className="btn ghost sm" onClick={onFermer}>
            Échap
          </button>
        </div>

        <div className="dm-attr-bar">
          <button
            type="button"
            className="dm-chip"
            aria-pressed={avecTel}
            onClick={() => setAvecTel((v) => !v)}
            title="Une fiche sans numéro ne s'appelle pas et ne s'écrit pas sur WhatsApp."
          >
            avec un numéro
          </button>
          <button
            type="button"
            className="dm-chip"
            onClick={toutCocher}
            disabled={prospects.length === 0}
          >
            {choisis.size === prospects.length && prospects.length > 0
              ? "tout décocher"
              : "tout cocher"}
          </button>
          <span className="resume">{resume}</span>
        </div>

        <div className="rs" role="listbox" aria-label="Entreprises du pool" aria-multiselectable="true">
          {!chargement && prospects.length === 0 && (
            <div className="vide">
              <b>Rien à prendre ici</b>
              Le pool ne contient que des fiches <strong>qualifiées</strong> et non attribuées. S&apos;il
              est vide, c&apos;est qu&apos;il faut d&apos;abord qualifier des entreprises — ou que tout
              a déjà été distribué.
            </div>
          )}

          {prospects.map((e) => {
            const pris = choisis.has(e.id);
            return (
              <button
                key={e.id}
                type="button"
                role="option"
                aria-selected={pris}
                className="r"
                onClick={() => basculer(e.id)}
              >
                <span className="ck" aria-hidden="true">
                  {pris && <Icon name="check" className="ico-xs" />}
                </span>
                <span className="bd">
                  <span className="n">{nomDe(e)}</span>
                  <span className="m">
                    {[e.code_postal, e.ville].filter(Boolean).join(" ") || "ville inconnue"}
                    {e.telephone ? ` · ${e.telephone}` : " · aucun numéro"}
                  </span>
                </span>
                <span className="tags">
                  <span className="tg" data-site={e.a_site ? "1" : "0"}>
                    {e.a_site ? "a un site" : "sans site"}
                  </span>
                  {e.avis != null && e.avis > 0 && <span className="tg">{e.avis} avis</span>}
                </span>
              </button>
            );
          })}
        </div>

        <div className="ft">
          <span>
            {choisis.size > 0
              ? `${choisis.size} sélectionnée${choisis.size > 1 ? "s" : ""}`
              : "Coche celles que tu veux démarcher"}
          </span>
          <button
            type="button"
            className="btn sm"
            style={{ marginLeft: "auto" }}
            disabled={choisis.size === 0 || envoi}
            onClick={attribuer}
          >
            <Icon name="check" className="ico-sm" />
            {envoi ? "Attribution…" : `M'attribuer${choisis.size > 0 ? ` (${choisis.size})` : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
