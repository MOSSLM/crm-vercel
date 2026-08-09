import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * PageSpeed Insights — la mesure que l'analyseur maison NE PEUT PAS faire.
 *
 * L'analyseur chronomètre le réseau et lit le HTML. Il ne voit ni le rendu, ni
 * l'exécution du JavaScript, donc ni LCP, ni CLS, ni INP. PSI les mesure dans un
 * vrai Chrome. C'est la seule raison d'appeler ce service, et c'est pour ça
 * qu'il est **à la demande uniquement** : jamais en masse sur le parc.
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
}

export interface PsiOptions {
  strategie?: "mobile" | "desktop";
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

interface RawLighthouse {
  categories?: Record<string, { score?: number | null }>;
  audits?: Record<string, { numericValue?: number | null }>;
}

/** Score Lighthouse (0..1) → note /100. `null` quand la catégorie manque. */
function note(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? Math.round(v * 100) : null;
}

function metrique(raw: RawLighthouse, cle: string): number | null {
  const v = raw.audits?.[cle]?.numericValue;
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export async function mesurerPsi(url: string, opts: PsiOptions = {}): Promise<MesurePsi> {
  const strategie = opts.strategie ?? "mobile";
  const doFetch = opts.fetchImpl ?? fetch;

  // Lu ici plutôt qu'importé de `@/env` : ce module doit pouvoir être testé
  // sans que le schéma d'environnement complet soit satisfait.
  const cle = process.env.PAGESPEED_API_KEY;

  const params = new URLSearchParams({ url, strategy: strategie });
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

  const { error } = await sb
    .from("entreprises_audit_site")
    .update({
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
  return { ok: true, mesure };
}

/** Une mesure PSI est-elle encore assez fraîche pour remplacer la note maison ? */
export function psiEstFraiche(recupereLe: string | null | undefined): boolean {
  if (!recupereLe) return false;
  const t = Date.parse(recupereLe);
  if (!Number.isFinite(t)) return false;
  return Date.now() - t < TTL_PSI_JOURS * 24 * 3600 * 1000;
}
