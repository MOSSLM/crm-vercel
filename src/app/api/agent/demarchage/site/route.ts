// /api/agent/demarchage/site — ce que l'agent a VU de ses yeux.
//
// ─────────────────────────────────────────────────────────────────────────────
// CE QUE ÇA RÉSOUT
// ─────────────────────────────────────────────────────────────────────────────
// Le filtre « avec site / sans site · vérifié / sans site · à vérifier » de la
// file (cf. `src/lib/agent-portal/etat-site.ts`) ne trie que ce que la base
// sait. Or au 01/09/2026 elle ne sait presque rien : 74 absences constatées
// pour 34 244 fiches que personne n'a jamais regardées. Le stock ne se remplit
// pas tout seul — le bot de dossiers web s'arrête sur un CAPTCHA, et
// l'analyse automatique se trompe dans les deux sens.
//
// Ce qui remplit ce stock pour de bon, c'est l'agent : il cherche le nom sur
// Google en composant le numéro, il voit en trois secondes s'il y a un site, et
// jusqu'ici cette information mourait avec l'appel. Cette route est le seul
// endroit du CRM où un HUMAIN pose un constat de présence.
//
// ─────────────────────────────────────────────────────────────────────────────
// DEUX GESTES, ET LE MÊME SOUCI DE NE PAS SE CONTREDIRE
// ─────────────────────────────────────────────────────────────────────────────
//   · UNE ADRESSE — on écrit `entreprises.site_web_canonique` et on pose un
//     constat `present`. C'est aussi le geste de CORRECTION : l'adresse déjà en
//     base peut être fausse, et la remplacer est le seul moyen de le dire.
//   · AUCUN SITE — on pose un constat `absent`, ET on efface l'adresse s'il y en
//     avait une. Le troisième piège de `20260817_constats_presence_trois_etats`
//     est exactement là : « un constat absent posé sur une fiche dont le CRM
//     détient déjà une URL contredit sa propre table », et c'est l'URL qui
//     gagne. Sans cet effacement, cocher « aucun site » ne changerait RIEN à
//     l'écran, et l'agent le referait trois fois avant de comprendre.
//
// L'ORDRE N'EST PAS LIBRE : le constat s'écrit AVANT la fiche. La table est
// append-only, elle est la trace ; la colonne, elle, s'écrase. Et si la seconde
// écriture échoue, l'état calculé reste celui d'AVANT (une URL en base fait
// foi) — on ne fabrique jamais une absence qu'on n'a pas su enregistrer.
// L'adresse précédente part dans `preuve.url_precedente` : c'est le seul
// endroit où elle survit à sa propre correction.
//
// ⚠️ CETTE ROUTE NE CHERCHE RIEN. Elle enregistre ce qu'un humain a vu. La
// recherche automatique existe ailleurs (`scripts/prospection/`), elle est
// aboutie, et elle bute sur le CAPTCHA de Google — le bouton « Google » de
// l'écran ouvre simplement un onglet, ce qui est la seule façon qui marche.
import { z } from "zod";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";
import { logAgentAction } from "@/app/api/agent/qualification/_lib";
import { etatSiteDe, normaliserUrlSite } from "@/lib/agent-portal/etat-site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = (req: Request) => preflight(req);

/**
 * `url` et `aucun_site` s'excluent : l'un dit « le voici », l'autre « il n'y en
 * a pas ». Les recevoir tous les deux serait une bogue d'écran, pas une
 * intention — on refuse plutôt que de deviner laquelle des deux compte.
 */
const Corps = z
  .object({
    entreprise_id: z.number().int().positive(),
    url: z.string().max(2048).nullish(),
    aucun_site: z.boolean().optional(),
  })
  .refine((c) => c.aucun_site === true || (c.url ?? "").trim() !== "", {
    message: "url ou aucun_site requis",
  })
  .refine((c) => !(c.aucun_site === true && (c.url ?? "").trim() !== ""), {
    message: "url et aucun_site s'excluent",
  });

/** Ce qu'on écrit dans `source` : lisible dans la table, et jamais confondu
 *  avec un bot (`dossier-web`, `verifier-sites`, `reconciliation`). */
const SOURCE = "agent:demarchage";

export const POST = withAuth({ role: "freelance" }, async ({ user, req, cors }) => {
  let brut: unknown;
  try {
    brut = await req.json();
  } catch {
    return jsonError("JSON invalide", 400, {}, cors);
  }
  const parse = Corps.safeParse(brut);
  if (!parse.success) {
    return jsonError(parse.error.issues[0]?.message ?? "corps invalide", 400, {}, cors);
  }
  const { entreprise_id: entrepriseId, aucun_site: aucunSite } = parse.data;

  const url = aucunSite ? null : normaliserUrlSite(parse.data.url);
  if (!aucunSite && !url) {
    return jsonError("Cette adresse n'en est pas une — vérifiez la saisie.", 400, {}, cors);
  }

  const sc = getServiceClient();

  const { data: entreprise, error: lectureErr } = await sc
    .from("entreprises")
    .select("id, name, ville, site_web_canonique, owner_id")
    .eq("id", entrepriseId)
    .maybeSingle();
  if (lectureErr) return jsonError(lectureErr.message, 500, {}, cors);
  if (!entreprise) return jsonError("introuvable", 404, {}, cors);

  // Même garde que la lecture de la fiche (`demarchage/company`) : la sienne, ou
  // une entreprise encore dans le pool commun. On ne corrige pas la fiche du
  // voisin — mais constater un site sur une fiche que personne n'a prise est
  // du travail rendu à tout le monde.
  const proprietaire = (entreprise as { owner_id: string | null }).owner_id;
  if (proprietaire && proprietaire !== user.id) {
    return jsonError("forbidden", 403, {}, cors);
  }

  const urlPrecedente = ((entreprise as { site_web_canonique: string | null }).site_web_canonique ?? "").trim() || null;

  // 1. LE CONSTAT D'ABORD — voir l'en-tête. La contrainte `constat_coherent`
  //    exige une valeur sur `present` et son absence sur `absent` ; c'est elle
  //    qui interdit d'écrire « il a un site » sans dire lequel.
  const constateLe = new Date().toISOString();
  const { error: constatErr } = await sc.from("constats_presence").insert({
    entreprise_id: entrepriseId,
    sujet: "site_web",
    etat: aucunSite ? "absent" : "present",
    valeur: url,
    // Un humain qui a ouvert la page : il n'y a pas de meilleure preuve dans ce
    // CRM. Les bots, eux, écrivent « moyenne » ou « faible ».
    confiance: "certaine",
    source: SOURCE,
    constate_par: user.id,
    preuve: {
      // La seule trace qui reste d'une adresse corrigée ou effacée.
      ...(urlPrecedente ? { url_precedente: urlPrecedente } : {}),
      verifie_par_email: user.email ?? null,
    },
    constate_le: constateLe,
  });
  if (constatErr) return jsonError(constatErr.message, 500, {}, cors);

  // 2. LA FICHE ENSUITE, et seulement si elle change vraiment — le trigger
  //    `updated_at` réécrit la ligne à chaque UPDATE, et une repasse identique
  //    ferait bouger la date de mise à jour sans rien changer.
  const cible = aucunSite ? null : url;
  if (cible !== urlPrecedente) {
    const { error: majErr } = await sc
      .from("entreprises")
      .update({ site_web_canonique: cible })
      .eq("id", entrepriseId);
    if (majErr) return jsonError(majErr.message, 500, {}, cors);
  }

  // `agent_activity_events` est le seul journal dont on sait qu'il ne contient
  // que des gestes humains (cf. CLAUDE.md) : c'est ce qui fait apparaître ce
  // travail dans `/equipe`. Best effort — le constat, lui, est déjà écrit.
  await logAgentAction({
    agentId: user.id,
    entrepriseId,
    action: "verifier_site",
    metadata: { etat: aucunSite ? "absent" : "present", url: cible, url_precedente: urlPrecedente },
  });

  return json(
    {
      ok: true,
      site_web_canonique: cible,
      etat_site: etatSiteDe(cible, aucunSite ? "absent" : "present"),
      site_constate_le: constateLe,
    },
    { headers: cors },
  );
});
