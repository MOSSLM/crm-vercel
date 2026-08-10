import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ConstatGoogle,
  ConstatGoogleDetaille,
  ContextePsi,
  ElementConstat,
} from "./types";

/**
 * PageSpeed Insights — la mesure que l'analyseur maison NE PEUT PAS faire.
 *
 * L'analyseur chronomètre le réseau et lit le HTML. Il ne voit ni le rendu, ni
 * l'exécution du JavaScript, donc ni LCP, ni CLS, ni INP. PSI les mesure dans un
 * vrai Chrome. C'est la seule raison d'appeler ce service, et c'est pour ça
 * qu'il est **à la demande uniquement** : jamais en masse sur le parc.
 *
 * MAIS LA NOTE N'EST PAS LE PLUS UTILE. Lighthouse renvoie une note ET la liste
 * de ce qui ne va pas, chaque ligne chiffrée et souvent assortie d'un gain
 * estimé. Sur un site que nous notions 88/100, Google relève 31 constats, dont
 * 3,9 s de scripts bloquant l'affichage et 1,1 Mo de JavaScript inutilisé. C'est
 * cette liste qu'on démarche, pas le chiffre — un chiffre se conteste, « voilà
 * les 31 points que Google relève sur votre site » ne se conteste pas.
 *
 * `locale=fr` fait faire la traduction ET le formatage par Google. On affiche
 * ses mots : « Économies estimées : 3 650 ms ». Aucune reformulation de notre
 * part, donc aucun endroit où notre paraphrase pourrait dépasser la mesure.
 *
 * COHABITATION DES DEUX VITESSES — la règle est dans le code, pas dans une note.
 * Quand `psi_performance` est frais, IL REMPLACE la note vitesse maison et la
 * page l'affiche avec la mention « mesuré par Google ». Sinon on affiche la note
 * maison, sans cette mention. Jamais les deux chiffres côte à côte : une page
 * qui se contredit détruit sa propre crédibilité, et c'est exactement ce qu'on
 * essaie de construire ici.
 *
 * `PAGESPEED_API_KEY` est optionnelle et DOIT le rester dans `src/env.ts` : ce
 * fichier est un `z.object(...)` qui jette à l'import quand une variable requise
 * manque — la rendre obligatoire casserait tout le déploiement, pas seulement
 * cette fonctionnalité.
 */

const ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

/**
 * Sans clé, le quota est très bas et les 429 fréquents ; avec clé, il est
 * largement suffisant pour du démarchage. Les deux protections servent à des
 * choses différentes : l'espacement évite le 429, le repli le survit.
 */
const ESPACEMENT_MS = 1_200;
const MAX_TENTATIVES = 3;
const TIMEOUT_MS = 45_000;

/** Trente jours : les Core Web Vitals d'un site figé ne bougent pas. */
export const TTL_PSI_JOURS = 30;

let dernierAppel = 0;

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

const attendreSonTour = async (): Promise<void> => {
  const attente = dernierAppel + ESPACEMENT_MS - Date.now();
  if (attente > 0) await dormir(attente);
  dernierAppel = Date.now();
};

/** Test-only : remet le cadenceur à zéro entre deux cas. */
export const __resetCadenceurPourTests = () => {
  dernierAppel = 0;
};

export interface MesurePsi {
  performance: number | null;
  seo: number | null;
  accessibilite: number | null;
  bonnesPratiques: number | null;
  lcpMs: number | null;
  cls: number | null;
  tbtMs: number | null;
  strategie: "mobile" | "desktop";
  /** Tout ce que Lighthouse relève en échec, du gain le plus fort au plus faible. */
  constats: ConstatGoogle[];
  /** Le dossier complet, conseils et éléments visés compris. Mis de côté, pas affiché. */
  contexte: ContextePsi;
}

export interface PsiOptions {
  strategie?: "mobile" | "desktop";
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

interface RawAudit {
  title?: string;
  description?: string;
  score?: number | null;
  scoreDisplayMode?: string;
  displayValue?: string;
  numericValue?: number | null;
  details?: {
    overallSavingsMs?: number | null;
    overallSavingsBytes?: number | null;
    items?: unknown[];
  };
}

interface RawCategorie {
  score?: number | null;
  /** Les audits que cette catégorie agrège — c'est ce qui rattache un constat à un axe. */
  auditRefs?: Array<{ id?: string }>;
}

interface RawLighthouse {
  lighthouseVersion?: string;
  categories?: Record<string, RawCategorie>;
  audits?: Record<string, RawAudit>;
}

/**
 * À quelle catégorie appartient chaque audit.
 *
 * Sans ce rattachement, les constats forment une liste indifférenciée et on ne
 * peut pas dire « voilà ce qui pèse sur votre référencement » — seulement
 * « voilà 31 choses ». L'ordre de priorité tranche les audits comptés dans
 * plusieurs catégories : celle qui explique le mieux le constat gagne.
 */
const PRIORITE_CATEGORIES = ["performance", "seo", "accessibility", "best-practices"];

function categoriesParAudit(lh: RawLighthouse): Map<string, string> {
  const out = new Map<string, string>();
  const cats = lh.categories ?? {};

  for (const nom of [...PRIORITE_CATEGORIES, ...Object.keys(cats)]) {
    for (const ref of cats[nom]?.auditRefs ?? []) {
      if (ref?.id && !out.has(ref.id)) out.set(ref.id, nom);
    }
  }
  return out;
}

/**
 * Ce qui n'est pas une note et n'a donc pas à être jugé : audits sans objet sur
 * ce site, contrôles à faire à la main, audits en erreur. Les écarter ici évite
 * d'annoncer au prospect un « problème » qui n'en est pas un.
 *
 * `informative` n'y figure pas volontairement : `total-byte-weight` — « la taille
 * totale était de 5 104 Kio », l'un des constats les plus parlants — en fait
 * partie selon les versions de Lighthouse. C'est le score numérique qui tranche.
 */
const MODES_SANS_VERDICT = new Set(["notApplicable", "manual", "error"]);

/** Le seuil de Google lui-même : au-dessus de 0,9 l'audit est vert. */
const SEUIL_REUSSITE = 0.9;

function entier(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : null;
}

/**
 * Les audits en échec, triés par ce qu'ils rapportent.
 *
 * L'ordre n'est pas cosmétique : c'est lui qui décide des constats qu'on montre
 * en premier et de ceux qui finissent dans « et X autres améliorations ». Le gain
 * chiffré passe donc devant, parce que c'est ce qui se défend le mieux — et à
 * gain égal, le rouge devant l'orange.
 */
export function constatsDe(lh: RawLighthouse): ConstatGoogle[] {
  const out: ConstatGoogle[] = [];
  const categorie = categoriesParAudit(lh);

  for (const [id, a] of Object.entries(lh.audits ?? {})) {
    if (!a?.title) continue;
    if (MODES_SANS_VERDICT.has(a.scoreDisplayMode ?? "")) continue;
    if (typeof a.score !== "number" || a.score >= SEUIL_REUSSITE) continue;

    out.push({
      id,
      categorie: categorie.get(id) ?? null,
      titre: a.title,
      valeur: a.displayValue?.trim() || null,
      gainMs: entier(a.details?.overallSavingsMs),
      gainOctets: entier(a.details?.overallSavingsBytes),
      elements: Array.isArray(a.details?.items) ? a.details.items.length : null,
      verdict: a.score < 0.5 ? "probleme" : "moyen",
    });
  }

  return out.sort(
    (x, y) =>
      (y.gainMs ?? 0) - (x.gainMs ?? 0) ||
      (y.gainOctets ?? 0) - (x.gainOctets ?? 0) ||
      Number(y.verdict === "probleme") - Number(x.verdict === "probleme") ||
      x.id.localeCompare(y.id),
  );
}

/** Score Lighthouse (0..1) → note /100. `null` quand la catégorie manque. */
function note(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? Math.round(v * 100) : null;
}

function metrique(raw: RawLighthouse, cle: string): number | null {
  const v = raw.audits?.[cle]?.numericValue;
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Bornes de conservation. Lighthouse peut lister deux cents ressources pour un
 * seul audit ; on n'en garde que de quoi nommer des exemples précis. Sans ces
 * bornes, le contexte d'un gros site dépasse le mégaoctet et devient inutilisable
 * — trop lourd à stocker, trop long à relire, et de toute façon jamais lu en
 * entier par qui prépare l'audit.
 */
const MAX_ELEMENTS_PAR_CONSTAT = 15;
const MAX_LONGUEUR_URL = 300;
const MAX_LONGUEUR_ELEMENT = 200;

/** Les métriques chiffrées qu'on garde nommément, dans l'ordre où on les lit. */
const METRIQUES = [
  "first-contentful-paint",
  "largest-contentful-paint",
  "speed-index",
  "interactive",
  "total-blocking-time",
  "cumulative-layout-shift",
  "server-response-time",
  "total-byte-weight",
] as const;

function texte(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/**
 * Les éléments visés par un constat, à plat.
 *
 * La forme des `items` change d'un audit à l'autre — c'est du Lighthouse, pas un
 * schéma stable. On lit donc ce qu'on reconnaît et on ignore le reste, plutôt
 * que de supposer une structure : un champ absent doit produire `null`, jamais
 * une exception au milieu d'une mesure qui a coûté quarante secondes.
 */
function elementsDe(items: unknown[] | undefined): ElementConstat[] {
  if (!Array.isArray(items)) return [];

  return items.slice(0, MAX_ELEMENTS_PAR_CONSTAT).flatMap((brut) => {
    if (!brut || typeof brut !== "object") return [];
    const it = brut as Record<string, unknown>;
    const node = (it.node ?? {}) as Record<string, unknown>;
    const source = (it.source ?? {}) as Record<string, unknown>;

    const el: ElementConstat = {
      url: texte(it.url ?? source.url, MAX_LONGUEUR_URL),
      element: texte(node.selector ?? node.snippet ?? it.label, MAX_LONGUEUR_ELEMENT),
      gainMs: entier(it.wastedMs as number),
      gainOctets: entier(it.wastedBytes as number),
      tailleOctets: entier((it.totalBytes ?? it.transferSize) as number),
    };

    // Une ligne qui ne nomme rien et ne chiffre rien n'apprend rien.
    return Object.values(el).some((v) => v != null) ? [el] : [];
  });
}

/**
 * Le dossier d'instruction complet : notes, métriques, constats détaillés avec
 * le conseil de Google, et la liste de ce qui passe.
 *
 * `conseil` est la seule partie de Lighthouse qui EXPLIQUE — « Les ressources
 * bloquent le premier affichage de votre page. Envisagez de… ». C'est elle qu'on
 * garde pour la rédaction ; le reste ne fait que constater.
 */
export function contextePsi(
  lh: RawLighthouse,
  meta: { url: string; strategie: "mobile" | "desktop"; recupereLe: string },
): ContextePsi {
  const audits = lh.audits ?? {};

  const constats: ConstatGoogleDetaille[] = constatsDe(lh).map((c) => ({
    ...c,
    conseil: texte(audits[c.id]?.description, 1_200) ?? "",
    elementsDetail: elementsDe(audits[c.id]?.details?.items),
  }));

  const metriques = METRIQUES.flatMap((cle) => {
    const a = audits[cle];
    if (!a?.title) return [];
    return [
      {
        cle,
        titre: a.title,
        valeur: texte(a.displayValue, 80),
        numerique: typeof a.numericValue === "number" ? a.numericValue : null,
      },
    ];
  });

  const reussis = Object.entries(audits)
    .filter(([, a]) => typeof a?.score === "number" && a.score >= SEUIL_REUSSITE)
    .map(([id]) => id)
    .sort();

  return {
    url: meta.url,
    strategie: meta.strategie,
    recupereLe: meta.recupereLe,
    versionLighthouse: texte(lh.lighthouseVersion, 20),
    categories: Object.fromEntries(
      Object.entries(lh.categories ?? {}).map(([id, c]) => [id, note(c?.score)]),
    ),
    metriques,
    constats,
    reussis,
  };
}

export async function mesurerPsi(url: string, opts: PsiOptions = {}): Promise<MesurePsi> {
  const strategie = opts.strategie ?? "mobile";
  const doFetch = opts.fetchImpl ?? fetch;

  // Lu ici plutôt qu'importé de `@/env` : ce module doit pouvoir être testé
  // sans que le schéma d'environnement complet soit satisfait.
  const cle = process.env.PAGESPEED_API_KEY;

  // `locale=fr` : Google rend les intitulés ET les valeurs en français, déjà
  // formatés à la française (« 3 650 ms », « 5 104 Kio »). Rien à traduire, donc
  // rien à traduire de travers.
  const params = new URLSearchParams({ url, strategy: strategie, locale: "fr" });
  for (const c of ["PERFORMANCE", "SEO", "ACCESSIBILITY", "BEST_PRACTICES"]) {
    params.append("category", c);
  }
  if (cle) params.set("key", cle);

  for (let tentative = 1; ; tentative += 1) {
    await attendreSonTour();

    const res = await doFetch(`${ENDPOINT}?${params.toString()}`, {
      signal: opts.signal ?? AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: "application/json" },
    });

    if ((res.status === 429 || res.status >= 500) && tentative < MAX_TENTATIVES) {
      // `Retry-After` fait foi quand le serveur le donne : deviner mieux que ce
      // qu'il annonce n'aurait pas de sens.
      const annonce = Number(res.headers?.get?.("retry-after"));
      const attente = Number.isFinite(annonce) && annonce > 0 ? annonce * 1000 : 2 ** tentative * 1000;
      await dormir(attente);
      continue;
    }

    if (!res.ok) {
      throw new Error(
        res.status === 429
          ? "PageSpeed Insights : quota dépassé. Posez PAGESPEED_API_KEY pour en obtenir un plus large."
          : `PageSpeed Insights HTTP ${res.status}`,
      );
    }

    const body = (await res.json()) as { lighthouseResult?: RawLighthouse };
    const lh = body.lighthouseResult ?? {};

    return {
      performance: note(lh.categories?.performance?.score),
      seo: note(lh.categories?.seo?.score),
      accessibilite: note(lh.categories?.accessibility?.score),
      bonnesPratiques: note(lh.categories?.["best-practices"]?.score),
      lcpMs: metrique(lh, "largest-contentful-paint"),
      cls: metrique(lh, "cumulative-layout-shift"),
      tbtMs: metrique(lh, "total-blocking-time"),
      strategie,
      constats: constatsDe(lh),
      contexte: contextePsi(lh, { url, strategie, recupereLe: new Date().toISOString() }),
    };
  }
}

/** Mesure et enregistre. Ne lève pas : l'appelant est une route qui doit répondre. */
export async function mesurerEtEnregistrer(
  sb: SupabaseClient,
  entrepriseId: number,
  url: string,
  opts: PsiOptions = {},
): Promise<{ ok: true; mesure: MesurePsi } | { ok: false; erreur: string }> {
  let mesure: MesurePsi;
  try {
    mesure = await mesurerPsi(url, opts);
  } catch (e) {
    return { ok: false, erreur: e instanceof Error ? e.message : "Mesure impossible." };
  }

  /**
   * Les constats vont dans `detail.google`, PAS dans une colonne à eux.
   *
   * Les migrations de ce dépôt s'appliquent à la main, et un `update` qui NOMME
   * une colonne absente échoue en entier : on perdrait aussi les notes PSI, qui
   * elles fonctionnent déjà. Loger les constats dans un `jsonb` existant les
   * rend disponibles dès le déploiement, sans rien à appliquer d'abord.
   *
   * Lecture puis fusion, parce que `detail` appartient à l'analyseur : on ajoute
   * une clé, on ne réécrit pas les preuves des cinq axes. Si la lecture échoue,
   * on n'écrit PAS `detail` du tout — mieux vaut se passer des constats que
   * remplacer les preuves existantes par un objet ne contenant qu'eux.
   */
  const { data: ligne, error: erreurLecture } = await sb
    .from("entreprises_audit_site")
    .select("detail")
    .eq("entreprise_id", entrepriseId)
    .maybeSingle();

  const detail = erreurLecture
    ? null
    : { ...((ligne?.detail as Record<string, unknown>) ?? {}), google: mesure.constats };

  const { error } = await sb
    .from("entreprises_audit_site")
    .update({
      ...(detail ? { detail } : {}),
      psi_performance: mesure.performance,
      psi_seo: mesure.seo,
      psi_accessibilite: mesure.accessibilite,
      psi_bonnes_pratiques: mesure.bonnesPratiques,
      psi_lcp_ms: mesure.lcpMs == null ? null : Math.round(mesure.lcpMs),
      psi_cls: mesure.cls,
      psi_tbt_ms: mesure.tbtMs == null ? null : Math.round(mesure.tbtMs),
      psi_strategie: mesure.strategie,
      psi_recupere_le: new Date().toISOString(),
    })
    .eq("entreprise_id", entrepriseId);

  if (error) return { ok: false, erreur: error.message };

  await enregistrerContexte(sb, entrepriseId, mesure.contexte);
  return { ok: true, mesure };
}

/**
 * Le dossier complet, dans sa table à part.
 *
 * Best-effort ASSUMÉ : un échec ici ne fait pas échouer la mesure. Les notes et
 * les constats courts sont déjà écrits et suffisent à l'audit ; le dossier, lui,
 * ne sert qu'à la préparation. Faire remonter l'erreur reviendrait à annoncer
 * « mesure impossible » alors que la mesure a réussi — et à pousser l'opérateur
 * à relancer un appel de quarante secondes pour rien.
 *
 * En particulier `42P01` : sur un environnement où
 * `sql/20260812_audit_psi_contexte.sql` n'est pas encore appliquée, tout continue
 * de fonctionner sans le dossier.
 */
async function enregistrerContexte(
  sb: SupabaseClient,
  entrepriseId: number,
  contexte: ContextePsi,
): Promise<void> {
  await sb.from("entreprises_audit_psi").upsert(
    {
      entreprise_id: entrepriseId,
      url: contexte.url,
      strategie: contexte.strategie,
      version_lighthouse: contexte.versionLighthouse,
      categories: contexte.categories,
      metriques: contexte.metriques,
      constats: contexte.constats,
      reussis: contexte.reussis,
      recupere_le: contexte.recupereLe,
      maj_le: new Date().toISOString(),
    },
    { onConflict: "entreprise_id" },
  );
}

/**
 * Le dossier PageSpeed d'une entreprise. `null` quand il n'y en a pas — ou quand
 * la table n'existe pas encore, ce qui, pour l'appelant, revient au même.
 */
export async function lireContextePsi(
  sb: SupabaseClient,
  entrepriseId: number,
): Promise<ContextePsi | null> {
  const { data, error } = await sb
    .from("entreprises_audit_psi")
    .select("*")
    .eq("entreprise_id", entrepriseId)
    .maybeSingle();

  if (error || !data) return null;
  const r = data as Record<string, unknown>;

  return {
    url: (r.url as string) ?? "",
    strategie: r.strategie === "desktop" ? "desktop" : "mobile",
    recupereLe: (r.recupere_le as string) ?? "",
    versionLighthouse: (r.version_lighthouse as string) ?? null,
    categories: (r.categories as Record<string, number | null>) ?? {},
    metriques: (r.metriques as ContextePsi["metriques"]) ?? [],
    constats: (r.constats as ContextePsi["constats"]) ?? [],
    reussis: (r.reussis as string[]) ?? [],
  };
}

/** Une mesure PSI est-elle encore assez fraîche pour remplacer la note maison ? */
export function psiEstFraiche(recupereLe: string | null | undefined): boolean {
  if (!recupereLe) return false;
  const t = Date.parse(recupereLe);
  if (!Number.isFinite(t)) return false;
  return Date.now() - t < TTL_PSI_JOURS * 24 * 3600 * 1000;
}
