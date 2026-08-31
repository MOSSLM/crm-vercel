"use client";
// DemRetour — « Revenir en arrière », dans le poste de travail.
//
// POURQUOI UN DEUXIÈME BLOC. Le toast qui suit un geste porte déjà « Annuler
// ce geste », mais il passe : il ne sert qu'à celui qui se rend compte dans
// les cinq secondes. Or on se rend compte plus tard — en revenant sur sa file
// et en retrouvant une entreprise qu'on n'aurait pas dû boucler. Il fallait
// donc, ici aussi, un bouton QUI RESTE, et qui ne dépende pas de la tâche
// affichée : les gestes listés sont ceux de l'agent, pas ceux du prospect
// ouvert au centre.
//
// POURQUOI PAS `DerniersGestes`. Ce composant-là porte la charte lemlist
// (`.lem-skin`), qui n'existe pas sur cet écran. Seule la mécanique est
// commune, et elle est partagée : `useGestes`.
//
// PLACÉ AU-DESSUS DE LA CARTE D'ACTION et non en pied : c'est un rattrapage,
// on le cherche en haut, et il disparaît de lui-même dès qu'il n'y a plus rien
// à annuler.
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { authedFetch } from "@/utils/authedFetch";
import { Icon } from "./DemIcon";
import { LIBELLE_GESTE, depuis, useGestes } from "@/hooks/useGestes";

/** Une séquence du prospect ouvert, et les étapes où l'on peut le replacer. */
type CibleRetour = {
  enrollment_id: string;
  sequence: string;
  statut: string;
  etape_courante: number;
  courante: boolean;
  steps: { index: number; label: string; kind: string; day: number }[];
};

/**
 * Le retour DANS LA SÉQUENCE, à côté du retour sur un geste.
 *
 * CE QUE LE BLOC NE SAVAIT PAS FAIRE. Il annule un geste — le dernier, ou l'un
 * des cinq derniers. Or ce qu'on constate n'est pas « j'ai mal cliqué il y a
 * dix secondes », c'est « ce prospect est à l'étape 6 sur 22 et je ne lui ai
 * jamais écrit ». Remonter de cinq étapes demandait cinq annulations, dans le
 * bon ordre, et seulement si les gestes étaient encore dans la liste : au
 * 31/08/2026, 224 inscriptions S1 étaient à l'étape 9 et 151 à l'étape 15 sans
 * qu'aucune ne puisse redescendre.
 *
 * LES ÉTAPES PROPOSÉES SONT CELLES DE SA SÉQUENCE, ET SEULEMENT LES ANTÉRIEURES
 * — c'est le serveur qui les rend (`/api/agent/demarchage/revenir`), depuis la
 * définition de l'automatisation. Aucune liste n'est reconstruite ici : une
 * frise et un sélecteur qui ne compteraient pas les étapes de la même façon
 * enverraient le prospect ailleurs que là où l'agent croit le poser.
 *
 * LA SÉQUENCE D'AVANT EST DANS LA LISTE, et c'est le cas qui a déclenché ce
 * travail : boucler la dernière étape de S1 fait entrer en S2, et c'est là
 * qu'on s'aperçoit que rien n'est parti. Revenir dans S1 la rouvre et ferme S2.
 */
function useRetourEtape(taskId: string | null | undefined, apres?: () => void) {
  const [cibles, setCibles] = useState<CibleRetour[]>([]);
  const [enCours, setEnCours] = useState<string | null>(null);

  const charger = useCallback(async () => {
    // Pas de tâche ouverte (fiche hors file, file vide) : rien à reprendre, et
    // une requête sans cible serait un appel pour rien à chaque rendu.
    if (!taskId) {
      setCibles([]);
      return;
    }
    try {
      const res = await authedFetch(`/api/agent/demarchage/revenir?task_id=${taskId}`);
      if (!res.ok) return;
      const data = await res.json();
      setCibles(Array.isArray(data?.cibles) ? data.cibles : []);
    } catch {
      // Silencieux à la lecture, comme le reste du bloc : c'est un rattrapage
      // posé au-dessus d'un écran qui sert à autre chose.
    }
  }, [taskId]);

  useEffect(() => {
    void charger();
  }, [charger]);

  const replacer = async (cible: CibleRetour, index: number, label: string) => {
    setEnCours(`${cible.enrollment_id}:${index}`);
    try {
      const res = await authedFetch("/api/agent/demarchage/revenir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task_id: taskId,
          enrollment_id: cible.enrollment_id,
          step_index: index,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Retour impossible");
      const ferme = Array.isArray(data.fermees) && data.fermees.length > 0
        ? ` — ${data.fermees.join(", ")} refermée${data.fermees.length > 1 ? "s" : ""}`
        : "";
      toast.success(`Reposé sur « ${label} » (${data.sequence}, étape ${data.etape})${ferme}.`);
      await charger();
      apres?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Retour impossible");
    } finally {
      setEnCours(null);
    }
  };

  // Aucune étape derrière : rien à proposer, et un bouton qui n'ouvrirait qu'une
  // liste vide est exactement ce qu'on cherche à éviter ici. Le calcul est
  // rendu au parent, parce que c'est LUI qui décide si le bloc a lieu d'être :
  // un composant qui rend `null` laisse quand même sa carte vide autour.
  return { utiles: cibles.filter((c) => c.steps.length > 0), enCours, replacer };
}

/** La liste elle-même, une fois qu'on sait qu'il y a quelque chose à montrer. */
function RetourEtape({
  utiles,
  enCours,
  replacer,
}: ReturnType<typeof useRetourEtape>) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10, marginTop: 2 }}>
      <button className="btn sm outline" onClick={() => setOuvert((o) => !o)}>
        <Icon name={ouvert ? "chevronUp" : "chevronDown"} className="ico-sm" />
        Reprendre la séquence à une étape
      </button>
      {ouvert && (
        <div style={{ marginTop: 9, display: "flex", flexDirection: "column", gap: 10 }}>
          {utiles.map((c) => (
            <div key={c.enrollment_id}>
              <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 5 }}>
                {c.sequence}
                {c.courante
                  ? ` · en cours, étape ${c.etape_courante}`
                  : " · quittée — y revenir la rouvre et referme celle en cours"}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {c.steps.map((s) => (
                  <button
                    key={`${c.enrollment_id}-${s.index}`}
                    className="btn sm outline"
                    disabled={enCours !== null}
                    title={`Reposer le prospect sur « ${s.label} » et relancer la séquence à partir de là`}
                    onClick={() => void replacer(c, s.index, s.label)}
                  >
                    {enCours === `${c.enrollment_id}:${s.index}` ? (
                      "…"
                    ) : (
                      <>
                        <span style={{ color: "var(--text-3)" }}>{s.index + 1}.</span> {s.label}
                      </>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function DemRetour({ apres, taskId }: { apres?: () => void; taskId?: string | null }) {
  const { gestes, enCours, annuler } = useGestes({
    endpoint: "/api/agent/gestes",
    // Cinq lignes : de quoi couvrir la poignée de gestes qu'on vient de faire
    // sans transformer le haut de l'écran en journal.
    limite: 5,
    apres,
  });

  // LE BLOC RESTE TANT QU'IL A QUELQUE CHOSE À OFFRIR. Il s'effaçait dès qu'il
  // n'y avait plus de geste à annuler — c'est-à-dire exactement au moment où
  // l'on cherche à revenir sur une étape franchie il y a trois jours.
  const etapes = useRetourEtape(taskId, apres);
  const retourEtape = etapes.utiles.length > 0 ? <RetourEtape {...etapes} /> : null;
  if (gestes.length === 0) {
    return retourEtape ? (
      <section className="dm-card" style={{ ["--k" as string]: "var(--text-3)", ["--kt" as string]: "var(--bg-2)" }}>
        <div className="dm-card-h">
          <span className="ic">
            <Icon name="undo" className="ico" />
          </span>
          <div>
            <div className="ti">Revenir en arrière</div>
            <div className="su">
              Aucun geste récent à annuler. La séquence, elle, peut être reprise à une étape
              antérieure : le prospect y est reposé et la suite repart de là.
            </div>
          </div>
        </div>
        <div className="dm-card-b">{retourEtape}</div>
      </section>
    ) : null;
  }

  return (
    <section className="dm-card" style={{ ["--k" as string]: "var(--text-3)", ["--kt" as string]: "var(--bg-2)" }}>
      <div className="dm-card-h">
        <span className="ic">
          <Icon name="undo" className="ico" />
        </span>
        <div>
          <div className="ti">Revenir en arrière</div>
          <div className="su">
            Annuler repose l’état d’avant : la tâche revient dans la file, la séquence retrouve
            son étape. Aucun message déjà parti n’est rappelé.
          </div>
        </div>
        <span className="rt">
          <span className="pill">{gestes.length}</span>
        </span>
      </div>

      <div className="dm-card-b">
        {gestes.map((g) => (
          <div
            key={g.id}
            style={{ display: "flex", alignItems: "flex-start", gap: 9, minWidth: 0 }}
          >
            <span className={`pill ${g.geste === "ignorer" ? "warn" : ""}`.trim()}>
              {LIBELLE_GESTE[g.geste]}
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, letterSpacing: "-.005em" }}>
                {g.entreprise ?? g.titre ?? "Tâche"}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 1 }}>
                {g.titre && g.entreprise ? `${g.titre} · ` : ""}
                {depuis(g.faitLe)}
                {g.verdict.possible ? ` · ${g.resume}` : ""}
              </div>
            </div>
            {g.verdict.possible ? (
              <button
                className="btn sm outline"
                disabled={enCours === g.id}
                onClick={() => void annuler(g)}
              >
                <Icon name="undo" className="ico-sm" />
                {enCours === g.id ? "Annulation…" : "Annuler"}
              </button>
            ) : (
              // LE REFUS SE LIT, il ne se devine pas : un bouton grisé sans
              // motif est exactement ce qu'on remplace ici.
              <span
                className="dm-hint warn"
                style={{ maxWidth: 300, padding: "5px 8px", fontSize: 11 }}
              >
                <Icon name="warning" className="ico-sm" />
                {g.verdict.motif}
              </span>
            )}
          </div>
        ))}
        {retourEtape}
      </div>
    </section>
  );
}
