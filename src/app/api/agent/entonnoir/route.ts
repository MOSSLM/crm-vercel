import { json } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";
import { intentByEnterprise } from "@/lib/analytics-radar/site-intent";
import { getGa4Config } from "@/lib/analytics-radar/ga4-client";
import { readReplies } from "@/lib/automations/week";
import { STEP_OUTCOMES } from "@/lib/sales-pipeline/stages";
import { DISPOSITIONS_REPONSE } from "@/lib/telephony/dispositions";
import { stageRole } from "@/lib/opportunites/stage-roles";
import {
  NON_DATEES_STATIQUES,
  compterSorties,
  construireEntonnoir,
  lectureParAge,
  lireCohorte,
  type CleEtage,
  type Cohorte,
  type FaitsEntreprise,
  type ReponseEntonnoir,
  type SourcesMuettes,
} from "@/lib/entonnoir/etages";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);

/**
 * L'entonnoir de la campagne d'août, cadré sur l'appelant.
 *
 * CETTE ROUTE NE CALCULE RIEN
 * Elle pose les requêtes, en tire un fait par entreprise, et laisse
 * `@/lib/entonnoir/etages` faire l'arithmétique. C'est ce qui rend la mesure
 * testable sans base, et l'écran incapable d'afficher autre chose que ce qui a
 * été mesuré.
 *
 * CHAQUE SOURCE PEUT SE TAIRE, ET ALORS ELLE LE DIT
 * Une requête en échec ne vide pas l'écran et ne renvoie pas zéro : elle
 * remplit `muettes[étage]` avec la raison, et l'étage s'affiche « non mesuré ».
 * C'est la seule façon de ne pas conclure « la cohorte B n'ouvre jamais ses
 * documents » un jour où c'est GA4 qui est en panne.
 */

type LigneEntreprise = {
  id: number;
  name: string | null;
  cohorte_demarchage: string | null;
  premiere_touche_le: string | null;
};

type LigneOpportunite = { id: string; entreprise_id: number | null; stage_id: number | null };
type LigneTache = { entreprise_id: number | null; done_at: string | null };
type LigneInscription = { entreprise_id: number | null; vars: unknown };
type LigneNote = { entreprise_id: number | null; created_at: string | null };
type LigneEtat = { opportunite_id: string; replied: boolean | null; state: string | null; updated_at: string | null };
type LigneOffre = { opportunite_id: string; created_at: string | null };
type LignePlaquette = { entreprise_id: number | null; plaquette_vues: number | null; plaquette_vu_le: string | null };
/**
 * `stage_apres` est un `smallint`, comme `etapes_pipeline.id` (vérifié en base
 * le 16/08/2026 : la migration du journal recopie le type de la colonne
 * d'origine). On le manipule quand même en chaîne, parce que c'est une CLÉ DE
 * `Map` : `nomEtape` est indexée par le même `String(id)`, et deux
 * représentations d'un même identifiant dans une seule Map, c'est un jalon
 * perdu sans message d'erreur.
 */
type LigneJournal = { entreprise_id: number | null; opportunite_id: string | null; stage_apres: number | null; survenu_le: string | null };

/**
 * Ce qui vaut « il a répondu », dans les DEUX vocabulaires qui coexistent.
 *
 * Une séquence écrite parle en `STEP_OUTCOMES` (answered, lukewarm) ; un appel
 * du cockpit parle en dispositions (rdv, intéressé, à rappeler, pas
 * intéressé). Les deux atterrissent dans la même colonne `email_logs.outcome`,
 * et cet étage n'en lisait qu'un : sur une campagne qui se joue au téléphone,
 * « a répondu » serait resté quasi vide en comptant les seules réponses
 * écrites. Chaque vocabulaire dit lui-même lesquelles de ses issues prouvent
 * qu'un humain a parlé — on les réunit, on ne les réécrit pas ici.
 */
const ISSUES_REPONSE = [
  ...STEP_OUTCOMES.filter((o) => o.releasesWait).map((o) => o.id),
  ...DISPOSITIONS_REPONSE,
];

const cleEtape = (v: number | null | undefined): string | null => (v == null ? null : String(v));

const instant = (v: string | null | undefined): number | null => {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
};

/**
 * Découpe une liste d'identifiants en lots avant de les passer à `.in()`.
 *
 * Six cents entreprises font une URL de plusieurs kilo-octets, et six cents
 * uuids d'affaires bien davantage : passée une certaine longueur, la requête
 * est rejetée par le proxy et la source paraît vide alors qu'elle est pleine.
 * Un lot en échec suffit à déclarer la source muette — on ne renvoie jamais un
 * total amputé en le faisant passer pour complet.
 */
async function parLots<T>(
  ids: Array<string | number>,
  taille: number,
  requete: (lot: Array<string | number>) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<{ lignes: T[]; erreur: string | null }> {
  if (ids.length === 0) return { lignes: [], erreur: null };
  const lots: Array<Array<string | number>> = [];
  for (let i = 0; i < ids.length; i += taille) lots.push(ids.slice(i, i + taille));

  const reponses = await Promise.all(lots.map((lot) => requete(lot)));
  const erreur = reponses.find((r) => r.error)?.error?.message ?? null;
  return { lignes: reponses.flatMap((r) => ((r.data ?? []) as T[])), erreur };
}

export const GET = withAuth({ role: "freelance" }, async ({ user, req, cors }) => {
  const sc = getServiceClient();
  const filtre = lireCohorte(new URL(req.url).searchParams.get("cohorte"));
  const mesureLe = new Date();

  // Les effectifs sont passés à part : quand on filtre sur une cohorte encore
  // vide, le sélecteur doit continuer d'afficher le poids de l'autre — sinon la
  // page a l'air cassée alors qu'elle dit la vérité.
  const vide = (
    indisponible: string | null,
    effectifs: Record<Cohorte, number> = { A_site_faible: 0, B_sans_site: 0 },
  ): ReponseEntonnoir => ({
    cohorte: filtre,
    etages: construireEntonnoir([], {}),
    parAge: [],
    nonDatees: NON_DATEES_STATIQUES,
    sortie: { perdu: 0, nurturing: 0, total: 0 },
    effectifs,
    mesureLe: mesureLe.toISOString(),
    indisponible,
  });

  // ── Étage 1 : les entreprises ciblées ─────────────────────────────────
  // Le filtre de cohorte porte sur l'entonnoir, pas sur les effectifs : on lit
  // les deux cohortes pour toujours pouvoir afficher « A 300 · B 300 » en haut
  // d'écran, même quand on regarde une seule des deux.
  const { data: entRaw, error: entErr } = await sc
    .from("entreprises")
    .select("id, name, cohorte_demarchage, premiere_touche_le")
    .eq("owner_id", user.id)
    .is("archived_at", null)
    .not("cohorte_demarchage", "is", null)
    .limit(5000);

  if (entErr) {
    // La colonne existe en production depuis le 16/08 ; ce repli couvre le
    // reste — base injoignable, environnement de recette non migré. La page
    // doit s'ouvrir et dire ce qui manque, pas renvoyer une erreur nue.
    return json(vide(`entreprises.cohorte_demarchage illisible — ${entErr.message}`), { headers: cors });
  }

  const toutes = (entRaw ?? []) as unknown as LigneEntreprise[];
  const effectifs: Record<Cohorte, number> = { A_site_faible: 0, B_sans_site: 0 };
  const faits = new Map<number, FaitsEntreprise>();

  for (const e of toutes) {
    const cohorte = lireCohorte(e.cohorte_demarchage);
    // Une valeur de cohorte inconnue n'est pas rattachée d'office à A ou B :
    // on ne devine pas le périmètre d'une comparaison.
    if (!cohorte) continue;
    effectifs[cohorte] += 1;
    if (filtre && cohorte !== filtre) continue;
    faits.set(e.id, {
      id: e.id,
      nom: e.name,
      cohorte,
      premiereTouche: e.premiere_touche_le,
      atteints: new Map(),
      sortie: null,
    });
  }

  if (faits.size === 0) return json(vide(null, effectifs), { headers: cors });

  /** Marque un étage atteint. La PREMIÈRE fois fait foi — sinon la lecture par âge glisse. */
  const marquer = (entrepriseId: number | null | undefined, cle: CleEtage, le: string | null) => {
    if (entrepriseId == null) return;
    const f = faits.get(entrepriseId);
    if (!f) return;
    if (!f.atteints.has(cle)) {
      f.atteints.set(cle, le);
      return;
    }
    const actuel = instant(f.atteints.get(cle) ?? null);
    const candidat = instant(le);
    if (candidat != null && (actuel == null || candidat < actuel)) f.atteints.set(cle, le);
  };

  const idsEntreprises = [...faits.keys()];
  for (const f of faits.values()) {
    if (f.premiereTouche) marquer(f.id, "touchee", f.premiereTouche);
  }

  const muettes: SourcesMuettes = {};
  const nonDatees: SourcesMuettes = { ...NON_DATEES_STATIQUES };

  // ── Les affaires, socle des trois derniers étages ──────────────────────
  const { lignes: opps, erreur: oppsErr } = await parLots<LigneOpportunite>(
    idsEntreprises,
    300,
    (lot) =>
      sc
        .from("opportunites")
        .select("id, entreprise_id, stage_id")
        .in("entreprise_id", lot)
        .is("archived_at", null)
        .not("is_test", "is", true)
        .limit(5000),
  );
  const idsOpportunites = opps.map((o) => o.id);
  const entrepriseParOpportunite = new Map(opps.map((o) => [o.id, o.entreprise_id]));

  // ── Tout le reste, en parallèle ────────────────────────────────────────
  const [taches, inscriptions, notes, etats, offres, journal, plaquettes, intents] = await Promise.all([
    parLots<LigneTache>(idsEntreprises, 300, (lot) =>
      sc
        .from("prospection_tasks")
        .select("entreprise_id, done_at")
        .eq("kind", "call")
        .eq("status", "done")
        .in("entreprise_id", lot)
        .limit(5000),
    ),
    parLots<LigneInscription>(idsEntreprises, 300, (lot) =>
      sc.from("sequence_enrollments").select("entreprise_id, vars").in("entreprise_id", lot).limit(5000),
    ),
    parLots<LigneNote>(idsEntreprises, 300, (lot) =>
      sc
        .from("email_logs")
        .select("entreprise_id, created_at")
        .eq("channel", "note")
        .in("outcome", ISSUES_REPONSE)
        .in("entreprise_id", lot)
        .limit(5000),
    ),
    parLots<LigneEtat>(idsOpportunites, 150, (lot) =>
      sc.from("sales_pipeline_state").select("opportunite_id, replied, state, updated_at").in("opportunite_id", lot),
    ),
    parLots<LigneOffre>(idsOpportunites, 150, (lot) =>
      sc.from("opportunite_offres").select("opportunite_id, created_at").in("opportunite_id", lot).limit(5000),
    ),
    parLots<LigneJournal>(idsEntreprises, 300, (lot) =>
      sc
        .from("opportunite_etapes_journal")
        .select("entreprise_id, opportunite_id, stage_apres, survenu_le")
        .in("entreprise_id", lot)
        .order("survenu_le", { ascending: true })
        .limit(20000),
    ),
    // Les ouvertures de plaquette. GA4 ne peut PAS les attribuer : il rattache
    // les sessions par nom d'hôte de site de démo, or la plaquette vit sur
    // l'hôte du CRM. C'est le jeton par prospect qui fait le lien, et le
    // compteur qu'il incrémente est la seule mesure d'ouverture dont dispose la
    // cohorte B — celle qui, par définition, n'a pas de site.
    parLots<LignePlaquette>(idsEntreprises, 300, (lot) =>
      sc
        .from("entreprises_rapport_public")
        .select("entreprise_id, plaquette_vues, plaquette_vu_le")
        .gt("plaquette_vues", 0)
        .in("entreprise_id", lot)
        .limit(5000),
    ),
    // Une panne GA4 ne doit jamais faire échouer la page — même remède que la
    // file de démarchage. La fenêtre reste celle par défaut (7 jours) : le cache
    // de `intentBySite` est partagé, l'élargir ici rendrait « chauds » des
    // prospects vus il y a trois semaines dans la file d'appel.
    intentByEnterprise(sc).catch(() => null),
  ]);

  // ── Étage 3 : a répondu ────────────────────────────────────────────────
  // Trois sources pour un seul fait, parce qu'aucune n'est complète à elle
  // seule. `email_logs` n'a pas de sens de circulation et ne contient que des
  // messages sortants : « les emails entrants » n'existent pas dans cette base
  // (mesuré le 16/08/2026). Ce qui en tient lieu, c'est la note d'issue prise
  // par le commercial — issue de séquence ou issue d'appel, cf. ISSUES_REPONSE.
  for (const i of inscriptions.lignes) {
    const reponses = Object.values(readReplies(i.vars)).sort();
    if (reponses.length > 0) marquer(i.entreprise_id, "repondu", reponses[0]);
  }
  for (const n of notes.lignes) marquer(n.entreprise_id, "repondu", n.created_at);
  for (const e of etats.lignes) {
    if (e.replied !== true) continue;
    // `updated_at` n'est pas la date de la réponse mais celle du dernier
    // changement de la ligne : c'est la seule que cette table porte.
    marquer(entrepriseParOpportunite.get(e.opportunite_id), "repondu", e.updated_at);
  }
  if (inscriptions.erreur && notes.erreur && etats.erreur) {
    muettes.repondu = `aucune des trois sources de réponse n'est lisible — ${inscriptions.erreur}`;
  }

  // ── Étage 4 : document ouvert ──────────────────────────────────────────
  //
  // DEUX SOURCES, ET AUCUNE NE COUVRE LES DEUX COHORTES.
  // GA4 mesure les visites de sites de démo, attribuées par nom d'hôte : c'est
  // la seule mesure possible pour la cohorte A, et elle est aveugle à la
  // plaquette, qui vit sur l'hôte du CRM. Le compteur `plaquette_vues`, lui, ne
  // sait rien des démos mais attribue l'ouverture au prospect par son jeton :
  // c'est la seule mesure possible pour la cohorte B, définie par l'absence de
  // site. On additionne donc deux aveuglements complémentaires.
  //
  // L'étage n'est déclaré MUET que si GA4 l'est, et le compteur de plaquettes ne
  // rachète pas ce silence — il rachèterait la cohorte B, pas la A, et `muettes`
  // est indexé par étage, pas par cohorte. Annoncer « mesuré » alors que la
  // moitié des prospects sont invisibles dirait un chiffre faux, ce que la règle
  // n°1 de ce module interdit précisément.
  for (const p of plaquettes.lignes) {
    if ((p.plaquette_vues ?? 0) <= 0) continue;
    marquer(p.entreprise_id, "document_ouvert", p.plaquette_vu_le);
  }
  if (!getGa4Config()) {
    muettes.document_ouvert = "GA4 n'est pas configuré sur cet environnement";
  } else if (!intents) {
    muettes.document_ouvert = "GA4 n'a pas répondu";
  } else {
    for (const [entrepriseId, intent] of intents) {
      if ((intent.sessions ?? 0) <= 0) continue;
      marquer(entrepriseId, "document_ouvert", intent.days?.[0] ?? null);
    }
  }

  // ── Étage 5 : conversation ─────────────────────────────────────────────
  for (const t of taches.lignes) marquer(t.entreprise_id, "conversation", t.done_at);
  if (taches.erreur) muettes.conversation = `prospection_tasks illisible — ${taches.erreur}`;

  // ── Étage 6 : offre envoyée ────────────────────────────────────────────
  for (const o of offres.lignes) {
    marquer(entrepriseParOpportunite.get(o.opportunite_id), "offre_envoyee", o.created_at);
  }
  if (oppsErr || offres.erreur) {
    muettes.offre_envoyee = `opportunite_offres illisible — ${oppsErr ?? offres.erreur}`;
  }

  // ── Étages 7 et 8 : décision attendue, payée ───────────────────────────
  // Le rôle de l'étape, jamais son libellé : les affaires de l'agent vivent
  // dans leur pipeline d'origine, et « Signature » y remplace « Client signé ».
  const idsEtapes = [
    ...new Set(
      [...opps.map((o) => cleEtape(o.stage_id)), ...journal.lignes.map((j) => cleEtape(j.stage_apres))].filter(
        (v): v is string => v != null,
      ),
    ),
  ];
  const { data: etapesRaw, error: etapesErr } = await sc
    .from("etapes_pipeline")
    .select("id, nom")
    .in("id", idsEtapes.map(Number));
  const nomEtape = new Map(
    ((etapesRaw ?? []) as Array<{ id: number; nom: string | null }>).map((s) => [String(s.id), s.nom]),
  );

  // Le journal date les passages ; l'étape courante dit où en est l'affaire.
  // Les deux servent : une affaire signée sans passage enregistré par « RDV »
  // ne se voit PAS attribuer d'étape de décision qu'elle n'a jamais eue — le
  // trou apparaîtra en clair dans la perte, et c'est le but.
  const jalon = new Map<string, string>();
  for (const j of journal.lignes) {
    const role = stageRole(nomEtape.get(cleEtape(j.stage_apres) ?? "") ?? null);
    const cle: CleEtage | null =
      role === "rdv" || role === "propo" ? "decision_attendue" : role === "signe" ? "payee" : null;
    if (!cle) continue;
    marquer(j.entreprise_id, cle, j.survenu_le);
    const k = `${j.opportunite_id}:${cle}`;
    if (!jalon.has(k) && j.survenu_le) jalon.set(k, j.survenu_le);
  }

  for (const o of opps) {
    const role = stageRole(nomEtape.get(cleEtape(o.stage_id) ?? "") ?? null);
    if (role === "rdv" || role === "propo") {
      marquer(o.entreprise_id, "decision_attendue", jalon.get(`${o.id}:decision_attendue`) ?? null);
    } else if (role === "signe") {
      marquer(o.entreprise_id, "payee", jalon.get(`${o.id}:payee`) ?? null);
    } else if (role === "perdu") {
      const f = o.entreprise_id != null ? faits.get(o.entreprise_id) : undefined;
      if (f) f.sortie = "perdu";
    }
  }

  if (oppsErr || etapesErr) {
    const pourquoi = `étapes des affaires illisibles — ${oppsErr ?? etapesErr?.message}`;
    muettes.decision_attendue = pourquoi;
    muettes.payee = pourquoi;
  }
  if (journal.erreur) {
    // Les totaux restent vrais (l'étape courante suffit à les compter), mais
    // sans journal on ne sait plus QUAND l'affaire est arrivée là : la lecture
    // par âge de ces deux étages doit se taire plutôt que d'inventer une date.
    const pourquoi = `opportunite_etapes_journal illisible — ${journal.erreur}`;
    nonDatees.decision_attendue = pourquoi;
    nonDatees.payee = pourquoi;
  }

  // ── La sortie ──────────────────────────────────────────────────────────
  // « Perdu » l'emporte sur le nurturing : une affaire abandonnée n'est pas
  // une affaire en attente, même si sa ligne d'état est restée en nurturing.
  for (const e of etats.lignes) {
    if (e.state !== "nurt") continue;
    const entrepriseId = entrepriseParOpportunite.get(e.opportunite_id);
    const f = entrepriseId != null ? faits.get(entrepriseId) : undefined;
    if (f && f.sortie == null) f.sortie = "nurturing";
  }

  const population = [...faits.values()];
  const reponse: ReponseEntonnoir = {
    cohorte: filtre,
    etages: construireEntonnoir(population, muettes),
    parAge: lectureParAge(population, { muettes, nonDatees, maintenant: mesureLe }),
    nonDatees,
    sortie: compterSorties(population),
    effectifs,
    mesureLe: mesureLe.toISOString(),
    indisponible: null,
  };

  return json(reponse, { headers: cors });
});
