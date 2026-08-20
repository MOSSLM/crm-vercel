// Dry-run d'une attente sans délai — LECTURE SEULE, aucune écriture, aucune base.
//
// POURQUOI CE SCRIPT EXISTE
// Une étape `wait` en mode « réponse » sans `replyTimeoutDays` gare l'inscription
// indéfiniment : `processWaitStep` pose `next_run_at = null`, la ligne quitte la
// file du ticker, et rien ne la réveille. Au 19/08/2026, 59 inscriptions de la
// séquence « WhatsApp seul — sans e-mail » dormaient ainsi.
//
// La tentation est de poser un délai et de réveiller tout le monde. C'est le
// geste dangereux : tant que le délai vaut 0, `aUneBrancheSilence` rend `false`,
// donc l'éditeur n'a JAMAIS dessiné la voie « sans réponse » — personne n'a pu y
// écrire. Poser un délai rend atteignable l'étape de tronc suivante, qui a été
// rédigée pour quelqu'un qui vient de répondre.
//
// Ce script fait dire à `cheminSuppose` — la fonction que l'éditeur utilise
// vraiment — ce que recevrait un silencieux. On regarde avant d'écrire.
//
// Usage :
//   npx ts-node -O '{"module":"commonjs","moduleResolution":"node","isolatedModules":false}' \
//     scripts/campagne/dry-run-attente-sans-delai.ts

import {
  cheminSuppose,
  estAttenteReponse,
  aUneBrancheSilence,
  etapesDeBranche,
} from "../../src/lib/automations/branches";
import type { SequenceStep } from "../../src/components/automations/types";

/**
 * La définition relevée en production le 19/08/2026 sur
 * `automations` id `0e7a1f20-0000-4000-8000-000000000001`.
 *
 * Recopiée plutôt que lue en base : le script doit tourner sans identifiants, et
 * une définition figée rend le dry-run reproductible. La relire avant de s'en
 * servir sur une autre séquence.
 */
const STEPS: SequenceStep[] = [
  { id: "s1", day: 0, kind: "whatsapp", mode: "manual", branch: null, template: "…0001" },
  { id: "s2", day: 0, kind: "wait", branch: null, waitMode: "reply", replyTimeoutDays: 0 },
  { id: "s3", day: 0, kind: "whatsapp", mode: "manual", branch: null, template: "…0002" },
  { id: "s4", day: 0, kind: "wait", branch: null, waitMode: "reply", replyTimeoutDays: 3 },
  { id: "s5", day: 3, kind: "call", mode: "manual", branch: null, script: "…0002" },
];

/**
 * Ce que chaque étape envoie réellement, relevé dans `whatsapp_templates`.
 * Sans ce texte le dry-run dirait « s3 » — ce qui ne permet à personne de juger
 * si l'envoi est approprié. C'est le message qui décide, pas l'identifiant.
 */
const TEXTE: Record<string, string> = {
  s1: "« Bonjour, je suis bien avec {{company.name}} ? »",
  s3: "« Très bien, je me suis permis de faire une version plus vendeuse de votre site… »",
  s5: "(appel — script de 3 min)",
};

const decrire = (idx: number): string => {
  const s = STEPS[idx];
  const delai = (s as { replyTimeoutDays?: number }).replyTimeoutDays || 0;
  const attente = estAttenteReponse(s)
    ? ` — attente de réponse, sortie au bout de : ${delai ? `${delai} j` : "JAMAIS"}`
    : "";
  const texte = TEXTE[s.id] ? `\n           ${TEXTE[s.id]}` : "";
  return `    [${idx}] ${s.id} · ${s.kind}${attente}${texte}`;
};

console.log("\n╭─ ÉTAT DES ATTENTES ────────────────────────────────────────────\n");
STEPS.forEach((s, i) => {
  if (!estAttenteReponse(s)) return;
  console.log(
    `  ${s.id} (index ${i}) — voie « sans réponse » dessinée dans l'éditeur : ` +
      (aUneBrancheSilence(s) ? "OUI" : "NON"),
  );
  (["reply", "timeout"] as const).forEach((on) => {
    const idxs = etapesDeBranche(STEPS, s.id, on);
    const liste = idxs.length ? idxs.map((k: number) => STEPS[k].id).join(" → ") : "(aucune étape propre)";
    console.log(`      voie « ${on} » : ${liste}`);
  });
});

console.log("\n╭─ CE QUE TRAVERSE UN PROSPECT QUI A RÉPONDU ────────────────────\n");
cheminSuppose(STEPS, { s2: "reply", s4: "reply" }).forEach((i: number) => console.log(decrire(i)));

console.log("\n╭─ CE QUE RECEVRAIENT LES SILENCIEUX SI ON POSAIT UN DÉLAI ──────\n");
cheminSuppose(STEPS, { s2: "timeout", s4: "timeout" }).forEach((i: number) => console.log(decrire(i)));

console.log("");
