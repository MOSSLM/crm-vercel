import { json, jsonError } from "@/app/api/_lib/respond";
import { requireUser } from "@/app/api/_lib/auth";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { construireDossier, universDe } from "@/lib/audit/dossier";
import { validerPreparation, type CartePreparee } from "@/lib/audit/preparation";
import { construirePage5 } from "@/lib/audit/offres-audit";
import { classerParForce } from "@/lib/audit/autres-ameliorations";
import { lireAudit, type AuditLu } from "@/lib/audit-site/lecture";
import { getDefaultAuditContent } from "@/lib/audit/default-content";
import { problemsFromKeys, AUDIT_ISSUE_CATALOG } from "@/data/auditIssues";
import type { AuditAvantApres, AuditContent } from "@/types";

/**
 * `POST /api/audit/preparation` — accepter une rédaction, sous contrat.
 *
 * Corps attendu : `{ opportunite_id, entreprise_id, preparation }`.
 *
 * Ce que fait cette route, dans l'ordre : elle reconstruit le dossier — donc
 * l'univers du dicible —, soumet la rédaction aux quatre règles, écrit ce qui
 * passe, et RÉPOND CE QUI NE PASSE PAS. Les rejets sont nommés un par un :
 * c'est ce qui permet à l'appelant de corriger plutôt que de deviner, et c'est
 * la différence entre un garde-fou et un mur.
 *
 * Le repli n'est pas un échec. Une rédaction entièrement rejetée laisse l'audit
 * avec le texte du catalogue : moins ajusté, toujours vrai, toujours envoyable.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  let body: { opportunite_id?: string; entreprise_id?: number; preparation?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonError("JSON invalide.", 400);
  }

  const opportuniteId = body.opportunite_id;
  const entrepriseId = Number(body.entreprise_id);
  if (!opportuniteId || !Number.isFinite(entrepriseId)) {
    return jsonError("opportunite_id et entreprise_id requis.", 400);
  }

  const sb = getServiceClient();

  const dossier = await construireDossier(sb, entrepriseId);
  if (!dossier) return jsonError("Entreprise introuvable.", 404);

  const verdict = validerPreparation(body.preparation, universDe(dossier));

  // Les observations sont enregistrées AVANT de juger du sort des cartes, et
  // même si aucune ne survit : un relevé juste est une mesure acquise, payée par
  // une visite du site. La perdre parce qu'une phrase ne passait pas obligerait
  // à revisiter le site au prochain essai.
  await enregistrerObservations(sb, entrepriseId, verdict.observations);

  // Rien n'a survécu : on le dit, on n'écrit pas, et l'audit garde le catalogue.
  if (!verdict.retenue) {
    return json({
      applique: false,
      motif: "aucune carte ne franchit le contrat",
      rejets: verdict.rejets,
      observations: verdict.observations,
    });
  }

  const p = verdict.retenue;
  const cles = p.cartes.map((c) => c.cle);

  // Relu pour ses PREUVES : le dossier ne porte pas les poids ni les gravités,
  // et c'est d'elles que dépend l'ordre des lignes du tableau.
  const lecture = await lireAudit(sb, entrepriseId);
  const auditLu: AuditLu | null = lecture.disponible ? lecture.audit : null;

  // L'audit existant, ou un document neuf : préparer ne doit pas exiger qu'on
  // ait d'abord ouvert l'éditeur.
  const { data: existant } = await sb
    .from("audits")
    .select("id, content")
    .eq("opportunite_id", opportuniteId)
    .maybeSingle();

  const base: AuditContent =
    ((existant as { content?: AuditContent } | null)?.content) ??
    getDefaultAuditContent({
      entreprise_nom: dossier.entreprise.nom ?? undefined,
      entreprise_ville: dossier.entreprise.ville ?? undefined,
    });

  // Les cartes gardent leur CLÉ de catalogue — c'est elle qui rattache la carte
  // à sa preuve dans tous les rendus. Seuls le titre et le texte sont ceux du
  // rédacteur : la personnalisation porte sur les mots, jamais sur le verdict.
  const problems = problemsFromKeys(cles).map((carte) => {
    const redigee = p.cartes.find((c) => c.cle === carte.key);
    return redigee ? { ...carte, title: redigee.titre, desc: redigee.texte } : carte;
  });

  const content: AuditContent = {
    ...base,
    page2: {
      ...base.page2,
      // `problems` n'est PLUS de l'affichage — le document compact rend le relevé
      // mesuré à cet endroit. C'est devenu le REGISTRE DE SÉLECTION : la liste à
      // cocher de l'éditeur, `codesRetenus` et `construirePage5` lisent tous
      // `page2.problems[].key` pour savoir quelles offres proposer. Le supprimer
      // en le croyant mort ferait taire la page tarifs.
      problems,
      section_intro: p.intro ?? base.page2.section_intro,
    },
    page3: { ...base.page3, avant_apres: lignesAvantApres(p.cartes, auditLu) },
    page5: construirePage5(base.page5, dossier.offres, cles),
  };

  const ligne = {
    opportunite_id: opportuniteId,
    content,
    statut: "draft" as const,
    updated_at: new Date().toISOString(),
  };

  const { error } = existant
    ? await sb.from("audits").update(ligne).eq("id", (existant as { id: string }).id)
    : await sb.from("audits").insert(ligne);

  if (error) return jsonError(`Écriture impossible : ${error.message}`, 500);

  return json({
    applique: true,
    cartes: cles,
    offres: p.offres,
    accroche: p.accroche ?? null,
    // Nommés même en cas de succès partiel : une carte silencieusement écartée
    // se remarque trois semaines plus tard, devant un prospect.
    rejets: verdict.rejets,
    observations: verdict.observations,
  });
}

/**
 * Le tableau avant/après : deux colonnes, deux origines qui ne se mélangent pas.
 *
 * À GAUCHE, ce que l'agent a écrit — mais seulement après être passé par les
 * quatre règles : la valeur est mesurée, elle figure dans le dossier, et sa
 * carte est adossée à une preuve en échec.
 *
 * À DROITE, le catalogue, et rien d'autre. On ne mesure pas le site démo ; sa
 * colonne est donc la seule du document qui promette un résultat, et deux
 * prospects doivent recevoir la même promesse pour le même problème. Un constat
 * dont le catalogue ne dit rien sort simplement sans côté droit : le rendu ne le
 * détaille pas et le compte dans son bandeau « +N constats de plus ». Mieux vaut
 * un constat non détaillé qu'une promesse inventée pour remplir une case.
 */
function lignesAvantApres(
  cartes: readonly CartePreparee[],
  audit: AuditLu | null,
): AuditAvantApres[] {
  // L'ORDRE EST MESURÉ, PAS PROPOSÉ. L'agent choisit de quoi parler ; le
  // classement décide dans quel ordre. Un serveur qui dépasse son seuil de
  // 120 ms ne doit pas ouvrir un document où le formulaire de contact est
  // absent — et espérer que le rédacteur y pense à chaque prospect serait le
  // genre de discipline qui tient trois audits.
  const rang = classerParForce(cartes.map((c) => c.cle), audit);
  const place = new Map(rang.map((cle, i) => [cle, i]));

  return [...cartes]
    .sort((a, b) => (place.get(a.cle) ?? 99) - (place.get(b.cle) ?? 99))
    .map((c) => {
      const apres = AUDIT_ISSUE_CATALOG.find((d) => d.key === c.cle)?.apres;
      return {
        cle: c.cle,
        avant: c.avant,
        precision: c.titre,
        apres: apres?.valeur,
        reponse: apres?.comment,
      };
    });
}

/**
 * Range les observations avec la MESURE, pas avec la rédaction.
 *
 * `entreprises_audit_site.detail` et non `audits.content`, et c'est la frontière
 * de tout le dispositif : le contenu est éditable à la main, les chiffres ne le
 * sont par personne. Une observation posée dans le document deviendrait
 * retouchable dans l'éditeur, et un relevé qu'on peut corriger à la main n'est
 * plus un relevé.
 *
 * `analyserEntreprise` les reconduit à chaque ré-analyse — voir
 * `chargerDetailConserve` — donc le cron ne les efface pas.
 *
 * Best-effort et silencieux : l'audit doit s'écrire même si cette ligne échoue.
 * On lit avant d'écrire pour ne pas emporter `detail.google` au passage.
 */
async function enregistrerObservations(
  sb: ReturnType<typeof getServiceClient>,
  entrepriseId: number,
  observations: unknown[],
): Promise<void> {
  if (observations.length === 0) return;

  const { data, error } = await sb
    .from("entreprises_audit_site")
    .select("detail")
    .eq("entreprise_id", entrepriseId)
    .maybeSingle();

  if (error) return;

  const detail = {
    ...(((data as { detail?: Record<string, unknown> } | null)?.detail) ?? {}),
    observations,
  };

  await sb.from("entreprises_audit_site").update({ detail }).eq("entreprise_id", entrepriseId);
}
