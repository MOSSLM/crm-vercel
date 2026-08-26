/**
 * /api/push/abonnement — le carnet d'adresses des appareils à notifier.
 *
 * GET     rend la clé publique VAPID (ou `null` si le push n'est pas armé).
 * POST    inscrit un appareil, ou renouvelle un abonnement expiré.
 * DELETE  retire un appareil.
 *
 * ── LE SEUL POINT DÉLICAT : LE RENOUVELLEMENT N'A PAS DE SESSION ─────────
 * Quand le navigateur révoque un abonnement, il réveille le service worker sur
 * `pushsubscriptionchange`. Ce contexte n'a PAS de session Supabase : il n'y a
 * ni onglet ouvert ni jeton à joindre. Un renouvellement ne peut donc pas être
 * authentifié comme le reste.
 *
 * Il est identifié autrement : par l'ANCIEN endpoint, que le serveur connaît
 * déjà puisqu'il est en base. On ne crée jamais de ligne par cette porte — on
 * ne fait que déplacer un abonnement existant vers sa nouvelle adresse, en
 * gardant son `user_id`. Un appelant qui devine un endpoint ne peut donc rien
 * s'attribuer : il peut au pire faire migrer l'abonnement de quelqu'un d'autre
 * vers une adresse qu'il contrôle. C'est le compromis standard du push web, et
 * il tient parce qu'un endpoint est une URL opaque à haute entropie, jamais
 * exposée par le CRM.
 *
 * Sans cette porte, un abonnement révoqué mourrait en silence : le CRM
 * continuerait de pousser vers une adresse morte, et personne ne recevrait plus
 * rien sans qu'aucune erreur ne remonte.
 */

import { z } from "zod";
import { json, jsonError } from "@/app/api/_lib/respond";
import { requireUser } from "@/app/api/_lib/auth";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { clePubliqueVapid } from "@/lib/push/envoyer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Abonnement = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

const CorpsPost = z.object({
  abonnement: Abonnement,
  /** Présent uniquement pour un renouvellement : l'endpoint qui vient d'expirer. */
  remplace: z.string().url().optional(),
});

export async function GET(): Promise<Response> {
  return json({ cle: clePubliqueVapid() });
}

export async function POST(req: Request): Promise<Response> {
  let brut: unknown;
  try {
    brut = await req.json();
  } catch {
    return jsonError("invalid_body", 400);
  }

  const parse = CorpsPost.safeParse(brut);
  if (!parse.success) return jsonError("invalid_body", 400, { details: parse.error.flatten() });
  const { abonnement, remplace } = parse.data;

  const sb = getServiceClient();
  const agent = req.headers.get("user-agent")?.slice(0, 300) ?? null;

  // Chemin 1 — renouvellement sans session, identifié par l'ancien endpoint.
  if (remplace) {
    const { data: ancien } = await sb
      .from("push_abonnements")
      .select("id, user_id")
      .eq("endpoint", remplace)
      .maybeSingle();

    // Aucun ancien abonnement : on ne crée rien. Cette porte déplace, elle
    // n'inscrit pas — c'est ce qui l'empêche d'être une inscription anonyme.
    if (!ancien) return jsonError("abonnement_inconnu", 404);

    const { error } = await sb
      .from("push_abonnements")
      .update({
        endpoint: abonnement.endpoint,
        p256dh: abonnement.keys.p256dh,
        auth: abonnement.keys.auth,
        agent,
        echecs: 0,
      })
      .eq("id", ancien.id);

    if (error) return jsonError(error.message, 500);
    return json({ renouvele: true });
  }

  // Chemin 2 — inscription ordinaire, authentifiée.
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  // `endpoint` est unique : un réabonnement du même appareil écrase au lieu
  // d'empiler, et `echecs` repart de zéro puisque l'adresse vient d'être
  // confirmée vivante par le navigateur lui-même.
  const { error } = await sb.from("push_abonnements").upsert(
    {
      user_id: auth.user.id,
      endpoint: abonnement.endpoint,
      p256dh: abonnement.keys.p256dh,
      auth: abonnement.keys.auth,
      agent,
      echecs: 0,
    },
    { onConflict: "endpoint" },
  );

  if (error) return jsonError(error.message, 500);
  return json({ abonne: true });
}

export async function DELETE(req: Request): Promise<Response> {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  let brut: unknown;
  try {
    brut = await req.json();
  } catch {
    return jsonError("invalid_body", 400);
  }

  const endpoint = (brut as { endpoint?: unknown })?.endpoint;
  if (typeof endpoint !== "string") return jsonError("endpoint_requis", 400);

  // Le filtre sur `user_id` n'est pas redondant avec le filtre sur `endpoint` :
  // sans lui, connaître un endpoint suffirait à désabonner quelqu'un d'autre.
  const { error } = await getServiceClient()
    .from("push_abonnements")
    .delete()
    .eq("endpoint", endpoint)
    .eq("user_id", auth.user.id);

  if (error) return jsonError(error.message, 500);
  return json({ desabonne: true });
}
