/**
 * Fabrique une paire de clés VAPID pour les notifications poussées.
 *
 *   node scripts/pwa/vapid.mjs
 *
 * Puis reporter les trois valeurs dans l'environnement (Vercel → Settings →
 * Environment Variables), et rien d'autre : le CRM lit ces variables à l'appel,
 * pas à l'import, donc leur absence n'éteint rien — elle désactive simplement
 * le push (cf. `src/lib/push/envoyer.ts`).
 *
 * ── LA CLÉ PRIVÉE NE VA PAS DANS LE DÉPÔT ────────────────────────────────
 * Ce script IMPRIME la paire, il ne l'écrit nulle part. C'est délibéré : un
 * `.env` généré finit committé. Le dépôt porte déjà un secret pg_cron en clair
 * dans `sql/20260808_donnees_publiques_cron.sql`, noté comme point ouvert dans
 * CLAUDE.md — on n'en ajoute pas un deuxième.
 *
 * ── CHANGER DE PAIRE INVALIDE TOUS LES ABONNEMENTS ───────────────────────
 * La clé publique est scellée dans chaque abonnement au moment où le navigateur
 * le crée. En changer révoque donc silencieusement tout le parc : les poussées
 * partent, les services de push les refusent, et `push_abonnements.echecs`
 * monte jusqu'à ce que les lignes sortent de l'index. Ne regénérer que pour
 * remplacer une clé compromise, et vider la table dans la foulée pour que
 * chacun se réabonne.
 */

import webpush from "web-push";

const { publicKey, privateKey } = webpush.generateVAPIDKeys();

console.log(`
Trois variables à poser dans l'environnement :

VAPID_PUBLIC_KEY=${publicKey}
VAPID_PRIVATE_KEY=${privateKey}
VAPID_SUBJECT=mailto:contact@samadigitalstudio.fr

  · VAPID_SUBJECT doit être un mailto: ou une URL https: que le service de push
    puisse contacter en cas d'abus. Une valeur bidon fait rejeter les envois.
  · La clé PUBLIQUE est servie par /api/push/abonnement et n'a rien de secret.
  · La clé PRIVÉE ne sort jamais du serveur, et ne va pas dans le dépôt.
`);
