import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuditContent } from "@/types";
import { FORME_JETON } from "@/lib/audit/plaquette-lien";
import { getDefaultAuditContent } from "@/lib/audit/default-content";
import { construirePage5, versOffreAudit, type OffreAudit } from "@/lib/audit/offres-audit";
import { contenuImpersonnel } from "@/utils/audit/htmlCompact";
import { buildScreens } from "@/utils/audit/htmlMobile";
import { esc, logoSvg, makeGrainSvgUrl } from "@/utils/audit/htmlShared";

/**
 * La plaquette : le document de la cohorte sans site.
 *
 * LE PROBLÈME QU'ELLE RÉSOUT. On démarche du 17 au 26 août deux cohortes qu'on
 * compare au même âge : celles qui ont un site faible reçoivent la note d'audit,
 * celles qui n'ont pas de site du tout ne peuvent rien recevoir de tel — il n'y
 * a rien à mesurer, et un document qui affiche « 0 / 100 · mesuré le… » sur une
 * entreprise sans site est un faux. Elles reçoivent donc le MÊME document, dans
 * la MÊME charte, par le MÊME moteur de rendu, amputé de tout ce qui suppose une
 * mesure : ce qu'on livre, ce que ça coûte, comment on démarre.
 *
 * CE QUI LA REND DIFFÉRENTE D'UN AUDIT, ET C'EST LA SEULE CHOSE : elle n'est
 * rangée nulle part. Un audit vit dans `audits.content`, et ce contenu FIGE les
 * prix au jour de sa création — quatre audits en base annoncent encore 1490 € et
 * 89 €/mois, tarif qu'on ne pratique plus. La plaquette est reconstruite à
 * chaque ouverture depuis la table `offres` : elle dit le prix du jour, toujours,
 * sans que personne ait à y penser. C'est pour ça qu'aucun montant n'est écrit
 * ici, et qu'aucun ne doit y apparaître.
 *
 * Elle part par WhatsApp : le rendu normal est le rendu mobile.
 */

/**
 * Le contenu de la plaquette : le document par défaut, dépersonnalisé, avec la
 * page tarifs reconstruite depuis le catalogue.
 *
 * `construirePage5` est appelé avec une liste de constats VIDE, et c'est la
 * définition même d'un document non personnalisé : sans constat retenu, aucune
 * addition n'est proposée — le catalogue n'en suggère jamais une qui ne réponde
 * à rien — et il ne reste que le socle, son hébergement et l'alternative. Soit
 * exactement ce qu'on annonce à quelqu'un dont on ne sait rien.
 */
export function construirePlaquette(offres: readonly OffreAudit[]): AuditContent {
  const base = contenuImpersonnel(getDefaultAuditContent());

  return {
    ...base,
    page1: {
      ...base.page1,
      // « Audit · Août 2026 » sur un document qui n'audite rien annoncerait la
      // mauvaise chose dès la première ligne. Le mois reste : c'est lui qui date
      // les tarifs, et il se recalcule à chaque ouverture.
      date: base.page1.date.replace(/^Audit\b/, "Nos offres"),
      eyebrow: "Sites internet pour artisans",
      title_line1: "Le site",
      title_line2: "qui vous amène",
      title_line3: "des clients.",
      subtitle:
        "Nous construisons des sites pour les artisans et les entreprises du bâtiment. Livré sous sept jours, hébergé et maintenu par nous, pensé pour qu'on vous trouve sur Google. Voici ce qu'il contient, et ce qu'il coûte.",
    },
    page4: {
      ...base.page4,
      // Les compteurs de section repartent à 01. Ceux de l'audit numérotent SIX
      // demi-pages ; repris tels quels, la plaquette s'ouvrirait sur « 03 · Ce
      // que vous recevez » et enchaînerait 04, 05 — un lecteur cherche alors les
      // deux sections manquantes, et ne les trouve pas.
      section_label: "01 · Ce que vous recevez",
      // La version de l'audit annonce « le point faible qu'il corrige » — elle
      // parle d'un relevé fait sur le site du lecteur. Ici il n'y a pas eu de
      // relevé, et il n'y a pas de site : la phrase promettrait un travail qu'on
      // n'a pas fait. Les trois volets, eux, ne bougent pas.
      section_subtitle:
        "Trois volets : ce que contient le site, ce qu'on installe sur Google, et ce dont on s'occupe ensuite.",
    },
    page5: { ...construirePage5(base.page5, offres, []), section_label: "02 · L’investissement" },
    page6: { ...base.page6, section_label: "03 · Pour démarrer" },
  };
}

/**
 * Les offres que la plaquette a le droit d'annoncer.
 *
 * Même filtre que partout ailleurs : `versOffreAudit` écarte ce qui n'a pas de
 * `metadata.role_audit`, parce que le catalogue contient des offres
 * préparatoires qu'on ne vend pas encore. Catalogue injoignable ⇒ liste vide, et
 * `construirePage5` retombe alors sur les tarifs du contenu par défaut : mieux
 * vaut un tarif à revoir qu'une page de tarifs vide devant un prospect.
 */
export async function chargerOffresPlaquette(sb: SupabaseClient): Promise<OffreAudit[]> {
  // `*` plutôt que la liste des colonnes : `metadata` et `billing_period` ont
  // été ajoutés par des migrations successives, et nommer une colonne absente
  // ferait échouer la requête entière au lieu de rendre moins.
  const { data } = await sb.from("offres").select("*").eq("actif", true);
  return (data ?? [])
    .map((row) => versOffreAudit(row as Record<string, unknown>))
    .filter((o): o is OffreAudit => o !== null);
}

// ─────────────────────────────────────────────────────────────────────────────
// Le jeton — une URL par prospect, pour un document identique
// ─────────────────────────────────────────────────────────────────────────────

/**
 * CE QUE LE JETON SERT, ET CE QU'IL NE SERT PAS.
 *
 * Il ne personnalise RIEN : `/plaquette/{jeton}` rend mot pour mot ce que rend
 * `/plaquette`. Il sert à savoir QUI a ouvert — sans lui, les trois cents
 * entreprises de la cohorte B partagent une URL, et l'étage « document ouvert »
 * de l'entonnoir de campagne reste vide pour la moitié de la campagne. Un
 * entonnoir plat se lit comme un désintérêt des prospects ; ce serait faux, et
 * on n'aurait aucun moyen de le savoir.
 *
 * DEUX MESURES, PARCE QU'AUCUNE NE SUFFIT SEULE. GA4 est monté par le layout du
 * groupe `(public)`, mais `intentBySite` n'attribue les sessions que par NOM
 * D'HÔTE, et la plaquette vit sur l'hôte du CRM : GA4 verra les visites sans
 * savoir les rattacher. C'est `plaquette_vues`, incrémenté par la page à chaque
 * ouverture, qui donne le lien prospect ↔ ouverture aujourd'hui ; le jeton dans
 * le chemin est ce qui rendra la même attribution possible côté GA4 le jour où
 * on lira `pagePath`.
 */

/**
 * Le lien et le diagnostic de migration vivent dans `plaquette-lien.ts` : ils
 * sont les seuls que l'écran ait besoin de connaître, et ce module-ci traîne
 * tout le moteur de rendu de l'audit. Réexportés ici pour que le côté serveur
 * n'ait toujours qu'un seul endroit où regarder.
 */
export {
  MESSAGE_MIGRATION_PLAQUETTE,
  fonctionPlaquetteAbsente,
  urlPlaquette,
} from "./plaquette-lien";
export { FORME_JETON };

export interface JetonPlaquette {
  entrepriseId: number;
  jeton: string;
  /** Vrai si le jeton existait AVANT cet appel — donc rien n'a été créé. */
  dejaPrete: boolean;
}

/**
 * Prépare les jetons de plaquette d'un lot d'entreprises.
 *
 * TOUT LE TRAVAIL EST DANS LA FONCTION SQL, et ce n'est pas un caprice : une
 * version « lire, trier, écrire » depuis ici laisse une fenêtre pendant laquelle
 * deux agents qui cliquent en même temps produisent deux jetons pour la même
 * entreprise, dont un envoyé à personne. Elle rend aussi `deja_prete` depuis la
 * MÊME requête que l'écriture — une seconde lecture verrait l'état d'après et
 * annoncerait « 0 créée, 300 déjà prêtes » sur un lot tout neuf.
 *
 * Les identifiants inconnus ne sont pas une erreur : ils manquent simplement du
 * résultat, et l'appelant les signale un par un. C'est délibéré — une entreprise
 * supprimée entre l'affichage du board et le clic ne doit pas faire échouer les
 * 299 autres.
 */
export async function assurerJetonsPlaquette(
  sb: SupabaseClient,
  entrepriseIds: readonly number[],
  creePar: string | null,
): Promise<{ jetons: JetonPlaquette[]; erreur?: { code?: string; message: string } }> {
  if (entrepriseIds.length === 0) return { jetons: [] };

  const { data, error } = await sb.rpc("assurer_jetons_plaquette", {
    p_entreprise_ids: entrepriseIds,
    p_cree_par: creePar,
  });
  if (error) return { jetons: [], erreur: error };

  const lignes = (data ?? []) as Array<{
    entreprise_id: number | string;
    jeton: string | null;
    deja_prete: boolean | null;
  }>;

  return {
    jetons: lignes
      // `entreprise_id` est un `bigint` : PostgREST le rend en nombre tant qu'il
      // tient, mais la conversion est faite ici pour que la clé de recherche des
      // appelants soit toujours du même type que la leur.
      .map((l) => ({
        entrepriseId: Number(l.entreprise_id),
        jeton: l.jeton ?? "",
        dejaPrete: l.deja_prete === true,
      }))
      .filter((j) => j.jeton !== ""),
  };
}

/**
 * Compte une ouverture. Best-effort, jamais bloquant, et VOLONTAIREMENT muet
 * sur les jetons qu'il ne connaît pas : la mise à jour ne touche aucune ligne,
 * on ne le distingue pas d'une ouverture normale, et la page n'a donc aucun
 * moyen — ni aucune raison — de dire au visiteur que son lien est mort.
 */
export async function marquerPlaquetteVue(sb: SupabaseClient, jeton: string): Promise<void> {
  if (!FORME_JETON.test(jeton)) return;
  try {
    await sb.rpc("plaquette_vue", { p_token: jeton });
  } catch {
    // La fonction peut ne pas exister (migration non appliquée). Un compteur
    // manquant ne doit pas empêcher un prospect de lire la plaquette.
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Le rendu mobile — celui qu'on envoie
// ─────────────────────────────────────────────────────────────────────────────

type EcranMobile = ReturnType<typeof buildScreens>[number];

/**
 * Les écrans du rendu mobile que la plaquette reprend, par leur libellé.
 *
 * Ce sont exactement ceux que `buildScreens` construit à partir des pages 4, 5
 * et 6. Tout le reste parle du site DU LECTEUR : la couverture le nomme, le
 * contexte annonce « N points relevés sur votre site actuel », les notes et
 * l'avant/après supposent une mesure, la méthode explique comment on a analysé
 * sa page d'accueil. Envoyés à quelqu'un qui n'a pas de site, ces écrans sont
 * faux — pas maladroits, faux.
 *
 * COUPLAGE ASSUMÉ, DONC SURVEILLÉ. Renommer un libellé dans `htmlMobile.ts`
 * retirerait l'écran de la plaquette sans rien casser ailleurs : personne ne le
 * verrait avant le prospect. D'où le test qui vérifie que le prix, les trois
 * volets et le bloc de contact sont bien encore là.
 *
 * Reprendre les écrans plutôt que les redessiner n'est pas une économie de
 * lignes : c'est ce qui garantit qu'une correction de la grille tarifaire ou du
 * numéro de téléphone vaut pour les deux documents le même jour.
 */
const ECRANS_PLAQUETTE = new Set([
  "Livrables",
  "Livrables (suite)",
  "Investissement",
  "Services additionnels",
  "Prochaines étapes",
  "Contact",
]);

/** Le pied d'écran nomme le client dans l'audit. Ici, il n'y en a pas. */
const MENTION_PIED = "SAMA · Agence digitale indépendante";

/** Le grain des écrans sombres — mêmes réglages que le rendu d'audit. */
function grainMobile(c: AuditContent): string {
  const gs = c.global_style;
  return `<div class="grain" style="opacity:${gs?.grain_opacity ?? 0.045};background-image:${makeGrainSvgUrl(gs?.grain_base_frequency, gs?.grain_color)}"></div>`;
}

/**
 * La couverture mobile.
 *
 * Celle de `buildScreens` ouvre sur « Préparé pour {nom} » : sur un document
 * collectif, elle afficherait « votre entreprise », ce qui dit au lecteur en
 * trois mots que le document n'est pas pour lui. Celle-ci dit ce qu'on vend et à
 * qui, et rien d'autre — le titre, le chapô et la date restent lus du contenu,
 * pour que les deux documents ne puissent pas raconter deux histoires.
 */
function couvertureMobile(c: AuditContent): EcranMobile {
  const p = c.page1;
  return {
    dark: true,
    label: "Couverture",
    inner: `
    <div class="m-top"><div class="m-brand">${logoSvg(20)}<span>SAMA</span></div><span class="m-date">${esc(p.date)}</span></div>
    <div class="m-body" style="justify-content:center;gap:0">
      <div class="m-eyebrow">${esc(p.eyebrow)}</div>
      <div class="m-title" style="font-size:40px">${esc(p.title_line1)}<br>${esc(p.title_line2)}<br><em>${esc(p.title_line3)}</em></div>
      <div class="m-intro">${esc(p.subtitle)}</div>
      <div class="m-client" style="margin-top:28px"><div class="m-client-label">Pour qui</div><div class="m-client-name">Artisans du bâtiment</div><div class="m-client-meta">Couvreurs, menuisiers, plombiers, électriciens, maçons.</div></div>
      <div class="m-scroll">Faites défiler<b>↓</b></div>
    </div>`,
  };
}

/**
 * La séquence mobile complète, prête à être injectée dans la page.
 *
 * L'enveloppe (`.doc`, `.screen`, le pied numéroté) est celle de
 * `renderAuditMobile`, redite ici pour une seule raison : son pied écrit le nom
 * du client à chaque écran. Le reste — classes, structure, ordre — est
 * volontairement identique, et `AUDIT_MOBILE_CSS` sert les deux documents.
 */
export function rendrePlaquetteMobile(c: AuditContent): string {
  // Le même verrou que côté A4 : la plaquette ne doit pas POUVOIR nommer
  // quelqu'un, quel que soit le contenu qu'on lui passe.
  const impersonnel = contenuImpersonnel(c);
  const ecrans: EcranMobile[] = [
    couvertureMobile(impersonnel),
    ...buildScreens(impersonnel).filter((e) => ECRANS_PLAQUETTE.has(e.label)),
  ];
  const total = ecrans.length;

  return `<div class="doc">${ecrans
    .map(
      (o, i) =>
        `<div class="screen${o.dark ? " dark" : ""}${o.auto ? " auto" : ""}">${
          o.dark ? `<div class="m-sky"></div>${grainMobile(c)}` : ""
        }<div class="m-in">${o.inner}
<div class="m-foot"><span>${esc(MENTION_PIED)}</span><b>${String(i + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}</b></div></div></div>`,
    )
    .join("")}</div>`;
}
