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
// UNE FLÈCHE, PAS UN BLOC — ET C'EST LE POINT DE CETTE VERSION. Le rattrapage
// occupait le haut de la colonne de travail : un en-tête, sa phrase
// d'explication, puis jusqu'à cinq lignes de gestes. Soit près de 250 px AVANT
// la carte de message, sur l'écran où l'on vient faire une chose — envoyer.
// Ce qu'on regarde dix fois par jour passait donc sous ce qu'on regarde une
// fois par semaine. Le bloc est replié derrière une flèche posée dans le coin,
// avec le NOMBRE de gestes annulables : ce nombre suffit à savoir qu'il y a
// quelque chose à rattraper, et le panneau ne s'ouvre que si on le cherche.
// Il reste au-dessus de la carte, et il disparaît toujours de lui-même dès
// qu'il n'y a plus rien à annuler.
import { useEffect, useRef, useState } from "react";
import { Icon } from "./DemIcon";
import { LIBELLE_GESTE, depuis, useGestes } from "@/hooks/useGestes";

export function DemRetour({ apres }: { apres?: () => void }) {
  const { gestes, enCours, annuler } = useGestes({
    endpoint: "/api/agent/gestes",
    // Cinq lignes : de quoi couvrir la poignée de gestes qu'on vient de faire
    // sans transformer le panneau en journal.
    limite: 5,
    apres,
  });
  const [ouvert, setOuvert] = useState(false);
  const boite = useRef<HTMLDivElement>(null);

  // Le panneau se ferme comme tous les autres de cet écran : clic dehors ou
  // Échap. Sans ça, il resterait ouvert par-dessus la carte de message pendant
  // qu'on écrit dedans.
  useEffect(() => {
    if (!ouvert) return;
    const dehors = (e: MouseEvent) => {
      if (!boite.current?.contains(e.target as Node)) setOuvert(false);
    };
    const echap = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOuvert(false);
    };
    document.addEventListener("mousedown", dehors);
    document.addEventListener("keydown", echap);
    return () => {
      document.removeEventListener("mousedown", dehors);
      document.removeEventListener("keydown", echap);
    };
  }, [ouvert]);

  // Le dernier geste annulé vide la liste : le panneau ne doit pas rester
  // ouvert sur du vide, ni le bouton survivre à ce qu'il ouvrait.
  useEffect(() => {
    if (gestes.length === 0) setOuvert(false);
  }, [gestes.length]);

  if (gestes.length === 0) return null;

  return (
    <div className="dm-undo" ref={boite}>
      <button
        type="button"
        className="dm-undo-b"
        aria-expanded={ouvert}
        aria-label="Revenir en arrière"
        title="Revenir en arrière sur un geste"
        onClick={() => setOuvert((v) => !v)}
      >
        <Icon name="undo" className="ico-sm" />
        <span className="n">{gestes.length}</span>
      </button>

      {ouvert && (
        <div className="dm-undo-p" role="dialog" aria-label="Revenir en arrière">
          <div className="hd">
            Annuler repose l’état d’avant : la tâche revient dans la file, la séquence retrouve
            son étape. Aucun message déjà parti n’est rappelé.
          </div>
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
      )}
    </div>
  );
}
