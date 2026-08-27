/**
 * Pousser une notification vers les appareils d'un utilisateur.
 *
 * ── LES CLÉS SE LISENT À L'APPEL, JAMAIS À L'IMPORT ──────────────────────
 * `env.ts` valide tout son schéma au chargement du module : une variable
 * absente ou mal formée y éteindrait l'API entière. La leçon a déjà été payée
 * le 20/08 avec `RESEND_FROM_EMAIL`, et `api/email/entrant` a tranché pareil.
 * Ici l'enjeu est le même en pire — le push est un CONFORT. Le jour où les clés
 * VAPID manquent, le CRM doit continuer de fonctionner exactement comme avant,
 * sans notification et sans erreur. C'est ce que fait `configurer()` : il rend
 * `false`, et tout le reste devient un no-op silencieux.
 *
 * ── UN ÉCHEC DE PUSH N'EST JAMAIS UN ÉCHEC MÉTIER ────────────────────────
 * `pousser` ne jette pas. Un rendez-vous pris doit être pris même si le
 * téléphone du commercial a changé d'adresse push entre-temps ; faire remonter
 * l'erreur ferait échouer la réservation pour une bannière manquée.
 *
 * ── LES ADRESSES MORTES SE FERMENT TOUTES SEULES ─────────────────────────
 * Un endpoint révoqué répond 404 ou 410, définitivement. On supprime la ligne
 * dès la première de ces deux réponses : ce n'est pas une panne passagère, il
 * n'y a rien à réessayer. Les autres erreurs (réseau, 5xx du service de push)
 * incrémentent `echecs`, et l'index de lecture cesse de servir l'abonnement au
 * bout de cinq — sans quoi on pousserait indéfiniment vers du vide.
 */

import webpush from "web-push";
import { getServiceClient } from "@/app/api/_lib/service-client";

/** Ce qu'une notification poussée transporte. Le service worker lit ce JSON. */
export type ChargePush = {
  titre: string;
  corps?: string;
  /** Où le clic emmène. Chemin relatif au CRM. */
  url?: string;
  /**
   * Regroupe les notifications d'un même sujet : la nouvelle REMPLACE la
   * précédente au lieu de s'empiler. Une séquence qui rebondit dix fois doit
   * poser une bannière, pas dix.
   */
  groupe?: string;
};

/** Au-delà, l'abonnement sort de l'index de lecture (cf. la migration). */
const ECHECS_MAX = 5;

let configure: boolean | null = null;

/**
 * Arme `web-push` si les trois variables sont là. Mémorisé — mais seulement
 * quand ça a marché : un `false` reste réévalué, pour qu'ajouter les clés en
 * production n'exige pas un redéploiement.
 */
function configurer(): boolean {
  if (configure) return true;

  const publique = process.env.VAPID_PUBLIC_KEY;
  const privee = process.env.VAPID_PRIVATE_KEY;
  const sujet = process.env.VAPID_SUBJECT;
  if (!publique || !privee || !sujet) return false;

  webpush.setVapidDetails(sujet, publique, privee);
  configure = true;
  return true;
}

/** La clé publique, pour que le navigateur puisse s'abonner. */
export function clePubliqueVapid(): string | null {
  return process.env.VAPID_PUBLIC_KEY ?? null;
}

type Abonnement = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  echecs: number;
};

/**
 * Pousse vers tous les appareils d'un utilisateur.
 *
 * Rend le nombre d'appareils effectivement atteints — zéro n'est pas une
 * anomalie : c'est le cas de quelqu'un qui n'a jamais autorisé les
 * notifications, et c'est la majorité des comptes.
 */
export async function pousser(userId: string, charge: ChargePush): Promise<number> {
  if (!configurer()) return 0;

  const sb = getServiceClient();
  const { data, error } = await sb
    .from("push_abonnements")
    .select("id, endpoint, p256dh, auth, echecs")
    .eq("user_id", userId)
    .lt("echecs", ECHECS_MAX);

  if (error || !data || data.length === 0) return 0;

  const corps = JSON.stringify(charge);
  let atteints = 0;

  // En parallèle : un service de push lent ne doit pas retarder les autres
  // appareils. `allSettled` parce qu'un rejet ici ne doit rien interrompre.
  const resultats = await Promise.allSettled(
    (data as Abonnement[]).map(async (ab) => {
      try {
        await webpush.sendNotification(
          { endpoint: ab.endpoint, keys: { p256dh: ab.p256dh, auth: ab.auth } },
          corps,
        );
        await sb
          .from("push_abonnements")
          .update({ dernier_ok: new Date().toISOString(), echecs: 0 })
          .eq("id", ab.id);
        return true;
      } catch (e: unknown) {
        const statut = (e as { statusCode?: number })?.statusCode;
        if (statut === 404 || statut === 410) {
          // Révoqué pour de bon. Rien à réessayer, on ferme la ligne.
          await sb.from("push_abonnements").delete().eq("id", ab.id);
        } else {
          await sb
            .from("push_abonnements")
            .update({ echecs: ab.echecs + 1 })
            .eq("id", ab.id);
        }
        return false;
      }
    }),
  );

  for (const r of resultats) if (r.status === "fulfilled" && r.value) atteints += 1;
  return atteints;
}

/**
 * Écrit une notification ET la pousse — le seul point d'entrée à utiliser.
 *
 * POURQUOI LES DEUX ENSEMBLE. `notifications` était écrite par trois appelants
 * qui ne se connaissaient pas ; en ajouter un quatrième pour le push aurait
 * garanti la divergence — une notification poussée sans trace en base, ou
 * l'inverse. Ici l'écriture fait foi et la poussée en découle : si la poussée
 * échoue, la notification reste lisible dans le panneau, ce qui est le
 * comportement d'avant.
 */
export async function notifier(params: {
  userId: string;
  type: string;
  titre: string;
  corps?: string;
  url?: string;
  groupe?: string;
  statut?: "success" | "partial" | "error";
  resume?: Record<string, unknown>;
}): Promise<void> {
  const sb = getServiceClient();

  await sb.from("notifications").insert({
    user_id: params.userId,
    type: params.type,
    title: params.titre,
    status: params.statut ?? "success",
    summary: params.resume ?? (params.corps ? { corps: params.corps } : null),
  });

  await pousser(params.userId, {
    titre: params.titre,
    corps: params.corps,
    url: params.url,
    groupe: params.groupe,
  });
}
