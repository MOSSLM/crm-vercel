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
import { Icon } from "./DemIcon";
import { LIBELLE_GESTE, depuis, useGestes } from "@/hooks/useGestes";

export function DemRetour({ apres }: { apres?: () => void }) {
  const { gestes, enCours, annuler } = useGestes({
    endpoint: "/api/agent/gestes",
    // Cinq lignes : de quoi couvrir la poignée de gestes qu'on vient de faire
    // sans transformer le haut de l'écran en journal.
    limite: 5,
    apres,
  });

  if (gestes.length === 0) return null;

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
      </div>
    </section>
  );
}
