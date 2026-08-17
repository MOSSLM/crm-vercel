import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";
import { resolveAgentContext } from "@/app/api/_lib/require-capability";
import { assignProspectsToAgent } from "@/app/api/admin/_assign";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = (req: Request) => preflight(req);

/**
 * LE POOL, VU PAR L'AGENT — et ce qu'il peut s'en attribuer.
 *
 * CE QUE ÇA RÉSOUT
 * La file de démarchage ne montre que les entreprises dont l'agent est
 * propriétaire (`entreprises.owner_id`). Un agent à qui l'admin n'a rien
 * attribué ouvre donc un écran vide — pas « rien à faire aujourd'hui », mais
 * « rien à faire, jamais ». Le seul chemin existant était
 * `/api/agent/claim` : une DEMANDE, que l'admin valide ensuite depuis la page
 * Agents. C'est le bon défaut quand plusieurs agents se partagent un pool
 * commun, et c'est un aller-retour inutile quand celui qui démarche est aussi
 * celui qui décide.
 *
 * D'où cette route, ouverte agent par agent
 * (`agent_settings.can_self_assign`) : se servir soi-même, tout de suite, dans
 * ce qui n'appartient à personne.
 *
 * CE QU'ELLE NE PERMET PAS, ET C'EST L'ESSENTIEL
 * Prendre une entreprise déjà attribuée. Le pool, c'est `owner_id is null` —
 * une fiche qui appartient à quelqu'un ne figure ni dans la liste, ni dans ce
 * qu'une attribution accepte. On ne se sert jamais chez le voisin.
 *
 * L'attribution elle-même n'est pas réécrite ici : `assignProspectsToAgent`
 * est la même fonction que le bouton admin. Elle réutilise l'affaire existante
 * plutôt que d'en créer une seconde, qualifie la fiche, et sème la tâche
 * « Appel à froid » — c'est cette tâche-là qui fait apparaître le prospect dans
 * la file. Deux chemins d'attribution qui ne feraient pas exactement la même
 * chose finiraient par produire deux parcs différents.
 */

/** Ce qu'une seule requête peut attribuer — garde-fou anti-timeout. */
const MAX_ATTRIBUTION = 50;

/** Ce que la liste rend en une fois : de quoi choisir, pas de quoi tout charger. */
const LIMITE_DEFAUT = 40;
const LIMITE_MAX = 200;

type PoolRow = {
  id: number;
  name: string | null;
  ville: string | null;
  code_postal: string | null;
  departement: string | null;
  telephone: string | null;
  email: string | null;
  site_web_canonique: string | null;
  cohorte_demarchage: string | null;
  nombre_avis: number | null;
  note_moyenne: number | null;
};

const SELECT_POOL =
  "id, name, ville, code_postal, departement, telephone, email, site_web_canonique, " +
  "cohorte_demarchage, nombre_avis, note_moyenne";

/**
 * Le pool : qualifiée, sans propriétaire, ni archivée ni fusionnée.
 *
 * Mêmes critères que `fetchPool` côté admin (`owner_id is null`, `qualifie`),
 * plus les deux exclusions que l'écran admin oublie : une fiche archivée ou
 * absorbée par un doublon n'est pas un prospect à démarcher.
 */
const requetePool = (sc: ReturnType<typeof getServiceClient>) =>
  sc
    .from("entreprises")
    .select(SELECT_POOL, { count: "exact" })
    .is("owner_id", null)
    .is("archived_at", null)
    .is("merged_into_id", null)
    .eq("qualifie", true);

export const GET = withAuth({ role: "freelance" }, async ({ user, req, cors }) => {
  const ctx = await resolveAgentContext(user.id);

  const params = new URL(req.url).searchParams;

  // Le droit se REND, il ne se refuse pas en 403 : l'écran a besoin de savoir
  // s'il doit proposer le bouton avant que quiconque ait cliqué dessus, et un
  // 403 au chargement de la page se lit comme une panne.
  if (!ctx.canSelfAssign) {
    return json(
      { autorise: false, total: 0, prospects: [], tronque: false },
      { headers: cors },
    );
  }

  // `apercu=1` ne veut que le compte : c'est ce que la page demande au montage
  // pour décider d'afficher le bouton, sans charger quarante fiches que
  // personne n'a encore demandé à voir.
  const apercu = params.get("apercu") === "1";
  const sc = getServiceClient();

  const q = (params.get("q") ?? "").trim();
  const departement = (params.get("departement") ?? "").trim();
  const avecTel = params.get("avec_tel") === "1";
  const limite = Math.min(
    Math.max(Number(params.get("limit")) || LIMITE_DEFAUT, 1),
    LIMITE_MAX,
  );

  let requete = requetePool(sc);
  if (departement) requete = requete.eq("departement", departement);
  // Démarcher, c'est appeler ou écrire sur WhatsApp : une fiche sans numéro
  // n'ouvre aucune des deux portes. Le filtre est proposé, jamais imposé —
  // une entreprise sans téléphone reste attribuable, elle se travaille
  // autrement.
  if (avecTel) requete = requete.not("telephone", "is", null);

  if (q) {
    // Mêmes précautions que `/api/entreprises/recherche` : `,` et `()` sont la
    // syntaxe du `or` PostgREST, `%` et `_` les jokers de LIKE. Une frappe
    // comme « a,b » serait sinon relue comme un filtre.
    const echappe = q.replace(/[%_,()\\]/g, " ").trim();
    if (echappe) {
      requete = requete.or(
        [
          `name.ilike.%${echappe}%`,
          `ville.ilike.%${echappe}%`,
          `adresse.ilike.%${echappe}%`,
          `code_postal.ilike.${echappe}%`,
        ].join(","),
      );
    }
  }

  if (apercu) {
    const { count, error } = await requete.limit(1);
    if (error) return jsonError(error.message, 500, {}, cors);
    return json({ autorise: true, total: count ?? 0, prospects: [], tronque: false }, { headers: cors });
  }

  const { data, count, error } = await requete
    // Les mieux notées d'abord : à travail égal, autant démarcher celles qui
    // ont déjà une réputation à défendre — ce sont elles qui répondent.
    .order("nombre_avis", { ascending: false, nullsFirst: false })
    .order("name", { nullsFirst: false })
    .limit(limite);
  if (error) return jsonError(error.message, 500, {}, cors);

  const rows = (data ?? []) as unknown as PoolRow[];
  const total = count ?? rows.length;

  return json(
    {
      autorise: true,
      total,
      // Dit à l'écran qu'il ne voit pas tout, pour qu'il puisse le DIRE plutôt
      // que de laisser croire que le pool tient en quarante lignes.
      tronque: total > rows.length,
      prospects: rows.map((e) => ({
        id: e.id,
        name: e.name,
        ville: e.ville,
        code_postal: e.code_postal,
        departement: e.departement,
        telephone: e.telephone,
        a_email: !!(e.email ?? "").trim(),
        // Avec ou sans site : c'est la distinction des deux cohortes de la
        // campagne, donc l'accroche et le document qu'on enverra. Elle se lit
        // AVANT de s'attribuer le lot, pas après.
        a_site: !!(e.site_web_canonique ?? "").trim(),
        cohorte: e.cohorte_demarchage,
        avis: e.nombre_avis,
        note: e.note_moyenne,
      })),
    },
    { headers: cors },
  );
});

/**
 * POST — l'agent s'attribue les entreprises qu'il vient de cocher.
 *
 * Refuse en bloc si l'une d'elles a trouvé preneur entre l'affichage de la
 * liste et le clic : mieux vaut une erreur qui dit lesquelles qu'une
 * attribution partielle silencieuse, où l'agent croirait avoir pris trente
 * fiches et en aurait vingt-huit.
 */
export const POST = withAuth({ role: "freelance", capability: "self_assign" }, async ({ user, req, cors }) => {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonError("JSON invalide", 400, {}, cors);
  }

  const brut = Array.isArray(body.entreprise_ids)
    ? body.entreprise_ids
    : body.entreprise_id != null
      ? [body.entreprise_id]
      : [];
  const ids = [...new Set(brut.map(Number).filter((n) => Number.isFinite(n) && n > 0))];

  if (ids.length === 0) return jsonError("entreprise_ids requis", 400, {}, cors);
  if (ids.length > MAX_ATTRIBUTION) {
    return jsonError(`Maximum ${MAX_ATTRIBUTION} entreprises par attribution.`, 400, {}, cors);
  }

  const sc = getServiceClient();

  // La garde qui tient tout : on ne s'attribue QUE ce qui n'appartient à
  // personne. Lue ici et pas déduite de la liste affichée — celle-ci a pu
  // vieillir de plusieurs minutes dans l'onglet resté ouvert.
  const { data: fiches, error: lectureErr } = await sc
    .from("entreprises")
    .select("id, name, owner_id")
    .in("id", ids);
  if (lectureErr) return jsonError(lectureErr.message, 500, {}, cors);

  const parId = new Map((fiches ?? []).map((e) => [Number(e.id), e as { id: number; name: string | null; owner_id: string | null }]));
  const introuvables = ids.filter((id) => !parId.has(id));
  const prises = ids.filter((id) => {
    const owner = parId.get(id)?.owner_id ?? null;
    return owner !== null && owner !== user.id;
  });

  if (introuvables.length > 0 || prises.length > 0) {
    return jsonError(
      prises.length > 0
        ? "Certaines entreprises viennent d'être attribuées à quelqu'un d'autre."
        : "Certaines entreprises n'existent plus.",
      409,
      { deja_prises: prises, introuvables },
      cors,
    );
  }

  const res = await assignProspectsToAgent(ids, user.id);
  if (!res.ok) return jsonError(res.error, 500, {}, cors);
  if (res.assigned.length === 0) {
    return jsonError(res.failed[0]?.error ?? "attribution_impossible", 500, { failed: res.failed }, cors);
  }

  // Une demande d'attribution encore en attente sur ces fiches n'a plus d'objet :
  // l'agent vient de les prendre. La laisser « pending » ferait apparaître à
  // l'admin une décision à rendre sur un dossier déjà clos.
  try {
    await sc
      .from("prospect_claim_requests")
      .update({ status: "approved", decided_at: new Date().toISOString(), decided_by: user.id })
      .in("entreprise_id", res.assigned.map((a) => a.entreprise_id))
      .eq("agent_id", user.id)
      .eq("status", "pending");
  } catch {
    // best effort : l'attribution a eu lieu, c'est elle qui compte
  }

  return json(
    { ok: true, attribuees: res.assigned.length, failed: res.failed },
    { status: 201, headers: cors },
  );
});
