import { json, jsonError } from "@/app/api/_lib/respond";
import { requireUser } from "@/app/api/_lib/auth";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { construireDossier, universDe } from "@/lib/audit/dossier";
import { validerPreparation, type CartePreparee } from "@/lib/audit/preparation";
import { construirePage5 } from "@/lib/audit/offres-audit";
import { classerParForce } from "@/lib/audit/autres-ameliorations";
import { lireAudit, type AuditLu } from "@/lib/audit-site/lecture";
import { activerJetonRapport } from "@/lib/audit-site/rapport";
import { getDefaultAuditContent } from "@/lib/audit/default-content";
import { problemsFromKeys, AUDIT_ISSUE_CATALOG, APRES_PAR_AXE } from "@/data/auditIssues";
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

  /**
   * L'audit est rédigé : son lien public s'ouvre.
   *
   * C'EST LE SEUL ENDROIT QUI RÉACTIVE UN JETON, et c'est ce qui rend la règle
   * tenable sans surveillance — un lien vit exactement quand il mène à un
   * document rédigé. Le 12/08, 37 jetons pointaient vers le contenu par défaut ;
   * ils ont été révoqués en masse, et seule une vraie préparation les rouvre.
   *
   * L'échec ne fait pas échouer la préparation : le texte est écrit, il vaut
   * mieux qu'un opérateur rouvre le lien à la main que de perdre la rédaction.
   * Il est donc rapporté dans la réponse plutôt que levé.
   */
  const { erreur: erreurJeton } = await activerJetonRapport(sb, entrepriseId, auth.user.id);

  return json({
    applique: true,
    cartes: cles,
    offres: p.offres,
    accroche: p.accroche ?? null,
    lien_rouvert: !erreurJeton,
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

  // L'axe d'une preuve, pour retrouver la promesse générique quand le constat
  // n'est pas au catalogue.
  const axeDe = new Map<string, string>();
  for (const axe of audit?.axes ?? []) {
    for (const p of axe.preuves) axeDe.set(p.cle, axe.id);
  }

  return [...cartes]
    .sort((a, b) => (place.get(a.cle) ?? 99) - (place.get(b.cle) ?? 99))
    .map((c) => {
      // Le constat s'il est au catalogue ; sinon la promesse de son axe. Le
      // rédacteur n'est pas tenu à nos 28 cases : sur un site donné, l'argument
      // le plus fort est souvent un relevé de Google qu'aucune ne nomme. Sans ce
      // repli, sa carte sortait sans colonne droite — donc non détaillée par le
      // rendu, et comptée dans le bandeau « +N ». Le meilleur argument de
      // l'audit devenait un nombre.
      const apres =
        AUDIT_ISSUE_CATALOG.find((d) => d.key === c.cle)?.apres ??
        APRES_PAR_AXE[axeDe.get(c.fonde_sur[0]) ?? ""] ??
        APRES_PAR_AXE[axeGoogleDe(c.fonde_sur[0]) ?? ""];

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
 * L'axe d'un fondement `google:<id>`, que nos preuves ne portent pas.
 *
 * Les constats Google vivent hors des axes maison — ils sont rangés par
 * catégorie Lighthouse. Sans cette table, une carte fondée sur le meilleur
 * relevé de Google resterait sans promesse, c'est-à-dire sans colonne droite.
 */
function axeGoogleDe(fondement: string): string | null {
  if (!fondement?.startsWith("google:")) return null;
  const id = fondement.slice("google:".length);
  if (/contrast|alt|aria|label|tap|font-size/.test(id)) return "accessibilite";
  if (/meta|title|crawl|robots|canonical|hreflang|structured/.test(id)) return "seo";
  if (/https|deprecat|console|image-size|csp/.test(id)) return "bonnes_pratiques";
  // Le reste de Lighthouse parle de vitesse : rendu bloqué, poids, cache, JS.
  return "vitesse";
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
