/**
 * Le côté navigateur du push : s'abonner, se désabonner, savoir où on en est.
 *
 * ── LA CONVERSION DE CLÉ N'EST PAS UNE FORMALITÉ ─────────────────────────
 * `applicationServerKey` veut un `Uint8Array` d'octets bruts. La clé VAPID
 * circule en base64url. Passer la chaîne telle quelle « marche » sur certains
 * navigateurs et rend un `InvalidCharacterError` sur les autres — panne
 * asymétrique, donc invisible pendant des semaines si on ne teste que sur son
 * propre téléphone. On convertit explicitement.
 *
 * ── CE QUE « REFUSÉ » VEUT DIRE, ET POURQUOI ON NE REDEMANDE PAS ─────────
 * Un `Notification.permission` à `"denied"` est définitif côté application : le
 * navigateur ne réaffichera plus jamais la demande, seul l'utilisateur peut la
 * lever dans ses réglages de site. Rappeler `requestPermission()` dans ce cas
 * rend `"denied"` immédiatement, sans rien afficher — donc un bouton qui ne fait
 * visiblement rien. L'état est distingué pour que l'écran puisse le DIRE.
 *
 * ── iOS : L'INSTALLATION D'ABORD ─────────────────────────────────────────
 * Safari n'expose `PushManager` que dans une app ajoutée à l'écran d'accueil.
 * Sur un Safari ordinaire, `estDisponible()` rend `false` — ce n'est pas une
 * panne, c'est la marche à suivre, et l'écran doit l'expliquer plutôt que de
 * proposer un bouton mort.
 */

import { authedFetch } from "@/utils/authedFetch";

export type EtatPush =
  /** Ni service worker ni PushManager : navigateur trop ancien, ou iOS non installé. */
  | "indisponible"
  /** Disponible, jamais demandé. */
  | "inactif"
  /** Abonné sur cet appareil. */
  | "actif"
  /** Refusé au niveau du navigateur — seul l'utilisateur peut le lever. */
  | "refuse";

/**
 * base64url → octets bruts, ce qu'attend `applicationServerKey`.
 *
 * Le tampon est alloué explicitement plutôt que par `new Uint8Array(longueur)` :
 * depuis TypeScript 5.7, un `Uint8Array` est générique sur son tampon, et la
 * forme courte rend `Uint8Array<ArrayBufferLike>` — que `BufferSource` refuse,
 * parce qu'un `SharedArrayBuffer` ne peut pas être transféré.
 */
function versOctets(base64url: string): Uint8Array<ArrayBuffer> {
  const bourrage = "=".repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + bourrage).replace(/-/g, "+").replace(/_/g, "/");
  const brut = atob(base64);
  const octets = new Uint8Array(new ArrayBuffer(brut.length));
  for (let i = 0; i < brut.length; i += 1) octets[i] = brut.charCodeAt(i);
  return octets;
}

export function estDisponible(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** L'état sur CET appareil. Un même compte peut être actif ici et pas ailleurs. */
export async function lireEtat(): Promise<EtatPush> {
  if (!estDisponible()) return "indisponible";
  if (Notification.permission === "denied") return "refuse";

  const enregistrement = await navigator.serviceWorker.getRegistration();
  const abonnement = await enregistrement?.pushManager.getSubscription();
  return abonnement ? "actif" : "inactif";
}

/**
 * Abonne cet appareil. Rend l'état obtenu — jamais d'exception pour un refus,
 * qui est une réponse et non une panne.
 */
export async function abonner(): Promise<EtatPush> {
  if (!estDisponible()) return "indisponible";

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "refuse" : "inactif";

  const reponse = await fetch("/api/push/abonnement");
  const { cle } = (await reponse.json()) as { cle: string | null };
  // Pas de clé serveur : le push n'est pas armé en production. Ce n'est pas
  // une erreur de l'utilisateur, et surtout pas la peine de laisser un
  // abonnement local orphelin derrière soi.
  if (!cle) return "indisponible";

  // `ready` et non `getRegistration` : au tout premier abonnement, le service
  // worker peut être en cours d'installation, et `pushManager` n'existe pas
  // encore sur un enregistrement non activé.
  const enregistrement = await navigator.serviceWorker.ready;

  const existant = await enregistrement.pushManager.getSubscription();
  const abonnement =
    existant ??
    (await enregistrement.pushManager.subscribe({
      // Obligatoire sur Chrome : promettre que chaque poussée sera visible.
      userVisibleOnly: true,
      applicationServerKey: versOctets(cle),
    }));

  const r = await authedFetch("/api/push/abonnement", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ abonnement: abonnement.toJSON() }),
  });
  if (!r.ok) throw new Error("Abonnement refusé par le serveur");

  return "actif";
}

/**
 * Désabonne cet appareil. On retire la ligne serveur AVANT de résilier côté
 * navigateur : dans l'autre ordre, un échec réseau laisserait une adresse en
 * base que plus personne n'écoute, et le CRM pousserait dans le vide.
 */
export async function desabonner(): Promise<EtatPush> {
  if (!estDisponible()) return "indisponible";

  const enregistrement = await navigator.serviceWorker.getRegistration();
  const abonnement = await enregistrement?.pushManager.getSubscription();
  if (!abonnement) return "inactif";

  await authedFetch("/api/push/abonnement", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: abonnement.endpoint }),
  }).catch(() => {
    /* On résilie localement quand même : l'utilisateur a demandé à ne plus rien recevoir. */
  });

  await abonnement.unsubscribe();
  return "inactif";
}
