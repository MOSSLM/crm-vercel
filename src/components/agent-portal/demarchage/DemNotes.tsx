"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Icon } from "./DemIcon";
import { authedFetch } from "@/utils/authedFetch";
import type { NoteAgent } from "@/app/api/agent/notes/route";

/**
 * LES NOTES DU PROSPECT — à chaque étape, et sans prendre de place.
 *
 * LE GRIEF : « à toutes les étapes on doit pouvoir noter ce que le client a
 * dit, et consulter les notes très facilement partout où on a une tâche avec ce
 * client, sans que ça prenne trop de place ».
 *
 * CE QUE ÇA CHANGE. Une note ne s'écrivait qu'en BOUCLANT une tâche : ce que le
 * prospect dit au milieu d'une conversation n'avait nulle part où aller tant
 * qu'on n'avait rien fini. Et pour relire, il fallait descendre dans
 * l'historique complet, tous canaux mêlés. Ici : les deux dernières notes en
 * deux lignes, le reste dépliable, et un champ qui sert aux DEUX gestes.
 *
 * UN SEUL CHAMP, DEUX SORTIES — c'est le point de conception :
 *   · « Noter » enregistre tout de suite, seul, sans rien fermer ;
 *   · le même texte part avec la tâche quand on la boucle (le parent le lit).
 * Deux zones de saisie auraient garanti qu'on écrive dans la mauvaise.
 */

const dateCourte = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const auj = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const t = d.getTime();
  if (t >= auj) return "aujourd'hui";
  if (t >= auj - 86400000) return "hier";
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(d);
};

/** Combien de notes on montre avant de proposer de tout déplier. */
const APERCU = 2;

export function DemNotes({
  entrepriseId,
  contactId,
  opportuniteId,
  stepId,
  valeur,
  setValeur,
  placeholder,
  refreshKey,
  onEnregistree,
  /** Le champ de saisie sert aussi à boucler la tâche : le parent le dit. */
  aide,
}: {
  entrepriseId: number | null;
  contactId?: string | null;
  opportuniteId?: string | null;
  stepId?: string | null;
  valeur: string;
  setValeur: (v: string) => void;
  placeholder?: string;
  /** Change quand le parent sait qu'un événement a été journalisé. */
  refreshKey?: number;
  onEnregistree?: () => void;
  aide?: string;
}) {
  const [notes, setNotes] = useState<NoteAgent[] | null>(null);
  const [tout, setTout] = useState(false);
  const [envoi, setEnvoi] = useState(false);

  const relire = useCallback(async () => {
    if (entrepriseId == null) {
      setNotes([]);
      return;
    }
    try {
      const res = await authedFetch(`/api/agent/notes?entreprise_id=${entrepriseId}`);
      const body = (await res.json().catch(() => ({}))) as { notes?: NoteAgent[] };
      setNotes(res.ok ? (body.notes ?? []) : []);
    } catch {
      // Ne pas savoir lire les notes ne doit pas empêcher d'en écrire une.
      setNotes([]);
    }
  }, [entrepriseId]);

  useEffect(() => {
    setNotes(null);
    setTout(false);
    void relire();
  }, [relire, refreshKey]);

  const noter = async () => {
    const texte = valeur.trim();
    if (!texte || entrepriseId == null) return;
    setEnvoi(true);
    try {
      const res = await authedFetch("/api/agent/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entreprise_id: entrepriseId,
          texte,
          contact_id: contactId ?? null,
          opportunite_id: opportuniteId ?? null,
          step_id: stepId ?? null,
        }),
      });
      if (!res.ok) throw new Error();
      // Le champ se vide : sans ça, la note repartirait une seconde fois avec
      // la tâche au moment de la boucler.
      setValeur("");
      toast.success("Note enregistrée.");
      await relire();
      onEnregistree?.();
    } catch {
      toast.error("Note non enregistrée.");
    } finally {
      setEnvoi(false);
    }
  };

  const liste = notes ?? [];
  const visibles = tout ? liste : liste.slice(0, APERCU);

  return (
    <div className="dm-notes">
      <div className="hd">
        <Icon name="note" className="ico-xs" />
        <span className="ti">Notes</span>
        {liste.length > 0 && <span className="n">{liste.length}</span>}
        {liste.length > APERCU && (
          <button type="button" className="lien" onClick={() => setTout(!tout)}>
            {tout ? "réduire" : "tout voir"}
          </button>
        )}
      </div>

      {visibles.length > 0 && (
        <div className="lst">
          {visibles.map((n) => (
            <div className="n1" key={n.id} title={n.texte}>
              <span className="q">
                {dateCourte(n.le)}
                {n.auteur ? ` · ${n.auteur}` : ""}
                {n.motif ? ` · ${n.motif}` : ""}
              </span>
              <span className="t">{n.texte}</span>
            </div>
          ))}
        </div>
      )}

      <textarea
        className="dm-note"
        value={valeur}
        onChange={(e) => setValeur(e.target.value)}
        placeholder={placeholder ?? "Ce qu'il a dit, ce qu'on a remarqué…"}
      />

      <div className="ft">
        {aide && <span className="ai">{aide}</span>}
        <button
          type="button"
          className="dm-noter"
          disabled={envoi || !valeur.trim() || entrepriseId == null}
          onClick={noter}
        >
          <Icon name="check" className="ico-xs" />
          {envoi ? "…" : "Noter"}
        </button>
      </div>
    </div>
  );
}
