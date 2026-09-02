"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Icon } from "./DemIcon";
import { authedFetch } from "@/utils/authedFetch";

/**
 * CE QUI SE PASSE ENTRE DEUX ÉTAPES — la surface qui manquait.
 *
 * LE GRIEF, MOT POUR MOT : « après démo ça attend, on peut pas mettre qu'on a
 * envoyé la plaquette ou autre ». Et juste avant : « il apparaît pas ».
 *
 * Les deux sont le même trou. Une séquence ne pose une carte qu'aux dates
 * qu'elle a prévues ; entre deux, le prospect n'a aucune tâche, donc aucune
 * carte, donc aucun écran. Sauf que lui, il répond. Il a répondu à JM2C une
 * minute après avoir reçu la démo, alors que la carte suivante était datée du
 * surlendemain — et rien de ce qui s'est dit ensuite n'a pu entrer.
 *
 * Ce bloc rend les trois choses qui manquaient, dans cet ordre :
 *   1. OÙ IL EN EST. « S2 — Après la démo · prochaine carte le 3 sept. » Sans
 *      ça, une attente normale se lit comme une disparition, et on cherche un
 *      bug là où il n'y en a pas.
 *   2. DE QUOI ON DISPOSE. Les trois liens à jeton, préparés à la demande. Ils
 *      ne vivaient que dans la charge utile d'une tâche : plus de carte, plus
 *      de plaquette, alors même qu'on est en train de l'annoncer au prospect.
 *   3. CE QUI S'EST PASSÉ. Ce qu'il a dit, ce qu'on lui a envoyé, et ce que ça
 *      veut dire pour la suite.
 *
 * ⚠️ RIEN N'EST ENVOYÉ D'ICI. On DÉCLARE ce qui est parti de la main de
 * l'agent, dans son WhatsApp à lui. Même distinction que « il m'a rappelé ».
 */

/** Les issues d'un échange hors file, et ce qu'elles font. Miroir de `ISSUES` côté route. */
const ISSUES = [
  { id: "answered", lb: "Il a répondu", su: "→ consigné, la séquence continue" },
  { id: "lukewarm", lb: "Peu intéressé", su: "→ consigné, la séquence continue" },
  { id: "later", lb: "Mettre de côté", su: "→ la séquence dort jusqu’à la date" },
  { id: "not_interested", lb: "Pas intéressé", su: "→ Perdu · plus rien ne part" },
  { id: "blocked", lb: "Bloqué / mauvais numéro", su: "→ Perdu · plus rien ne part" },
  { id: "other", lb: "Autre", su: "→ noté au fil, rien ne change" },
] as const;

type IssueId = (typeof ISSUES)[number]["id"];

const PIECES = [
  { id: "demo", lb: "Le site démo" },
  { id: "plaquette", lb: "La plaquette" },
  { id: "audit", lb: "Le rapport d’audit" },
] as const;

type PieceId = (typeof PIECES)[number]["id"];

type Contexte = {
  sequence: { enrollment_id: string; nom: string | null; etape: string | null; prochaine_le: string | null } | null;
  prochaine_tache: { id: string; kind: string; due_at: string | null; title: string | null } | null;
  pieces?: Partial<Record<PieceId, string>>;
};

const quand = (iso: string | null | undefined): string =>
  iso
    ? new Intl.DateTimeFormat("fr-FR", {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(iso))
    : "";

/** La date civile dans `n` jours (YYYY-MM-DD), telle qu'un `<input type="date">` l'attend. */
const dansNJours = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

function LienPiece({ url }: { url: string }) {
  const [on, setOn] = useState(false);
  const copier = () => {
    navigator.clipboard?.writeText(url).catch(() => {});
    setOn(true);
    toast.success("Lien copié.");
    setTimeout(() => setOn(false), 1600);
  };
  return (
    <div className="dm-url">
      <Icon name="link" className="ico-sm" style={{ color: "var(--text-3)", flexShrink: 0 }} />
      <span className="u">{url.replace(/^https?:\/\//, "")}</span>
      <button className={`cp ${on ? "on" : ""}`.trim()} onClick={copier}>
        <Icon name={on ? "check" : "copy"} className="ico-xs" />
        {on ? "copié" : "copier"}
      </button>
    </div>
  );
}

export function DemEchange({
  entrepriseId,
  onConsigne,
}: {
  entrepriseId: number;
  /** L'échange est écrit : l'historique juste en dessous doit se relire. */
  onConsigne?: () => void;
}) {
  const [ctx, setCtx] = useState<Contexte | null>(null);
  const [ouvert, setOuvert] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [preparation, setPreparation] = useState(false);

  const [canal, setCanal] = useState<"whatsapp" | "call" | "email">("whatsapp");
  const [note, setNote] = useState("");
  const [issue, setIssue] = useState<IssueId | null>(null);
  const [revientLe, setRevientLe] = useState(dansNJours(14));
  // AUCUNE PIÈCE COCHÉE PAR DÉFAUT — contrairement à « il m'a rappelé », où
  // quelqu'un décroche et où l'on envoie tout ce qu'on a. Ici l'échange est le
  // plus souvent un mot, et pré-cocher ferait journaliser des envois qui n'ont
  // pas eu lieu. La preuve d'un envoi ne se coche pas toute seule.
  const [pieces, setPieces] = useState<Record<PieceId, boolean>>({
    demo: false,
    plaquette: false,
    audit: false,
  });

  // Changer d'entreprise remet tout à zéro : ce qu'on écrivait pour l'une n'a
  // rien à faire dans le dossier de l'autre.
  useEffect(() => {
    setCtx(null);
    setOuvert(false);
    setNote("");
    setIssue(null);
    setPieces({ demo: false, plaquette: false, audit: false });
  }, [entrepriseId]);

  /**
   * NE LÈVE JAMAIS. Cette lecture est du CONFORT — savoir pourquoi il n'est pas
   * dans la file — et la carte, elle, porte le numéro qu'on est en train
   * d'appeler. Une lecture qui échoue doit faire disparaître une phrase, jamais
   * la fiche.
   */
  const lire = useCallback(
    async (avecPieces: boolean): Promise<Contexte | null> => {
      try {
        const res = await authedFetch(
          `/api/agent/demarchage/echange?entreprise_id=${entrepriseId}${avecPieces ? "&pieces=1" : ""}`,
        );
        if (!res.ok) return null;
        return (await res.json().catch(() => null)) as Contexte | null;
      } catch {
        return null;
      }
    },
    [entrepriseId],
  );

  // L'ÉTAT SE LIT TOUT DE SUITE, LES LIENS NON. Le premier ne fait que lire ;
  // préparer les liens CRÉE les jetons manquants, et ouvrir une fiche ne doit
  // pas écrire en base.
  useEffect(() => {
    let vivant = true;
    lire(false).then((c) => {
      if (vivant && c) setCtx(c);
    });
    return () => {
      vivant = false;
    };
  }, [lire]);

  const preparerLiens = async () => {
    setPreparation(true);
    try {
      const c = await lire(true);
      if (!c) {
        toast.error("Impossible de préparer les liens.");
        return;
      }
      setCtx(c);
      const combien = Object.keys(c.pieces ?? {}).length;
      if (combien === 0) toast.warning("Aucune pièce disponible pour ce prospect.");
    } finally {
      setPreparation(false);
    }
  };

  const consigner = async () => {
    if (!note.trim()) {
      toast.error("Note ce qu'il a dit : c'est tout ce qui restera de cet échange.");
      return;
    }
    setEnvoi(true);
    try {
      const res = await authedFetch("/api/agent/demarchage/echange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entreprise_id: entrepriseId,
          canal,
          note: note.trim(),
          pieces: PIECES.map((p) => p.id).filter((id) => pieces[id]),
          issue: issue ?? undefined,
          revient_le:
            issue === "later" ? new Date(`${revientLe}T09:00:00`).toISOString() : undefined,
        }),
      });
      const corps = (await res.json().catch(() => ({}))) as {
        pieces_sans_lien?: string[];
        sequence?: { arretee?: boolean; repoussee_au?: string | null };
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        toast.error(corps?.message || corps?.error || "Action impossible.");
        return;
      }

      // CE QUI N'A PAS PU S'ÉCRIRE SE DIT EN PREMIER : une pièce cochée sans
      // lien disponible n'est pas consignée, et l'agent doit le savoir avant de
      // passer au suivant.
      const manquantes = corps.pieces_sans_lien ?? [];
      if (manquantes.length > 0) {
        toast.warning(`Consigné, sauf ${manquantes.join(" et ")} : aucun lien disponible.`);
      } else if (corps.sequence?.arretee) {
        toast.success("Consigné. La séquence est arrêtée — plus rien ne partira.");
      } else if (corps.sequence?.repoussee_au) {
        toast.success(`Consigné. La séquence repart le ${quand(corps.sequence.repoussee_au)}.`);
      } else {
        toast.success("Échange consigné.");
      }

      setNote("");
      setIssue(null);
      setPieces({ demo: false, plaquette: false, audit: false });
      setOuvert(false);
      lire(false).then((c) => c && setCtx(c));
      onConsigne?.();
    } catch {
      toast.error("Action impossible.");
    } finally {
      setEnvoi(false);
    }
  };

  const seq = ctx?.sequence ?? null;
  const prochaine = seq?.prochaine_le ?? ctx?.prochaine_tache?.due_at ?? null;
  const liens = ctx?.pieces ?? null;
  const choisie = ISSUES.find((i) => i.id === issue) ?? null;

  return (
    <>
      {/* ── POURQUOI IL N'EST PAS DANS LA FILE ────────────────────────────
          La réponse à « il apparaît pas ». Une inscription vivante avec une
          date future n'est pas une panne, c'est une attente — mais rien ne le
          disait, et une attente muette se cherche comme un bug. */}
      {seq && (
        <div className="dm-hint">
          <Icon name="flow" className="ico-sm" />
          {seq.nom || "Séquence en cours"}
          {seq.etape ? ` · étape ${seq.etape}` : ""}
          {prochaine ? ` — prochaine carte le ${quand(prochaine)}.` : " — aucune date prévue."} Il
          n&apos;est pas perdu, il est garé : c&apos;est pour ça qu&apos;il n&apos;apparaît pas dans
          la file aujourd&apos;hui.
        </div>
      )}

      <div className="dm-cta2">
        <button
          className="btn outline sm"
          style={{ justifyContent: "center" }}
          onClick={preparerLiens}
          disabled={preparation}
        >
          <Icon name="attach" className="ico-sm" />
          {preparation ? "Préparation…" : liens ? "Rafraîchir les liens" : "Ce que je peux lui envoyer"}
        </button>
        <button
          className="btn outline sm"
          style={{ justifyContent: "center" }}
          aria-pressed={ouvert}
          onClick={() => setOuvert((v) => !v)}
        >
          <Icon name="message" className="ico-sm" />
          Consigner un échange
        </button>
      </div>

      {liens && (
        <div className="dm-panel">
          <div className="dm-lbl">
            Ce qu&apos;on peut lui envoyer<span>à coller dans la conversation</span>
          </div>
          {PIECES.map((p) =>
            liens[p.id] ? (
              <div key={p.id}>
                <div className="dm-lbl" style={{ marginBottom: 4 }}>
                  {p.lb}
                </div>
                <LienPiece url={liens[p.id] as string} />
              </div>
            ) : null,
          )}
          {PIECES.every((p) => !liens[p.id]) && (
            <div className="dm-hint warn">
              <Icon name="warning" className="ico-sm" />
              Rien de publiable pour ce prospect : ni démo en ligne, ni rapport d&apos;audit.
            </div>
          )}
          <div className="dm-hint">
            <Icon name="info" className="ico-sm" />
            Envoyer ne se fait pas d&apos;ici. Colle le lien dans ta conversation, puis coche-le
            ci-dessous pour qu&apos;il entre dans le fil — c&apos;est ce qui rendra une ouverture
            rattachable à un envoi.
          </div>
        </div>
      )}

      {ouvert && (
        <div className="dm-panel">
          <div className="dm-lbl">
            Ce qui s&apos;est passé<span>hors file</span>
          </div>

          <div className="dm-outs">
            {(
              [
                { id: "whatsapp", lb: "Sur WhatsApp" },
                { id: "call", lb: "Au téléphone" },
                { id: "email", lb: "Par e-mail" },
              ] as const
            ).map((c) => (
              <button
                key={c.id}
                type="button"
                className="dm-out"
                aria-pressed={canal === c.id}
                onClick={() => setCanal(c.id)}
              >
                {c.lb}
              </button>
            ))}
          </div>

          <textarea
            className="dm-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ce qu'il a dit, mot pour mot si possible — son objection est ce qu'on relira avant de revenir vers lui."
          />

          <div className="dm-lbl">
            Ce qu&apos;on lui a envoyé<span>coche ce qui est vraiment parti</span>
          </div>
          {PIECES.map((p) => (
            <label key={p.id} className="dm-check">
              <input
                type="checkbox"
                checked={pieces[p.id]}
                onChange={(e) => setPieces((v) => ({ ...v, [p.id]: e.target.checked }))}
              />
              <span>{p.lb}</span>
            </label>
          ))}

          <div className="dm-lbl">
            Et pour la suite ?<span>facultatif</span>
          </div>
          <div className="dm-outs">
            {ISSUES.map((i) => (
              <button
                key={i.id}
                type="button"
                className="dm-out"
                aria-pressed={issue === i.id}
                onClick={() => setIssue((v) => (v === i.id ? null : i.id))}
              >
                {i.lb}
              </button>
            ))}
          </div>

          {issue === "later" && (
            <input
              type="date"
              className="dm-note"
              style={{ minHeight: 0, height: 36 }}
              value={revientLe}
              onChange={(e) => setRevientLe(e.target.value)}
              aria-label="Il revient quand"
            />
          )}

          <div className="dm-hint">
            <Icon name={choisie ? "flow" : "info"} className="ico-sm" />
            {choisie
              ? choisie.su
              : seq
                ? "Sans issue, l'échange est consigné et la séquence reprend comme prévu — rien n'est sauté."
                : "Aucune séquence ne tourne pour ce prospect : l'échange entre au fil, et rien d'autre ne bouge."}
          </div>

          <button className="dm-cta" disabled={envoi || !note.trim()} onClick={consigner}>
            <Icon name="check" className="ico-sm" />
            {envoi ? "Enregistrement…" : "Consigner l’échange"}
          </button>
        </div>
      )}
    </>
  );
}
