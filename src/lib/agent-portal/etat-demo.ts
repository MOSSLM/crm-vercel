/**
 * OÙ EN EST SA DÉMO — les trois états, et pourquoi trois. Pur, sans base ni React.
 *
 * POURQUOI PAS UN BOOLÉEN. La demande était « bleu quand la démo n'est pas
 * prête, vert quand elle l'est ». Mesuré le 03/09/2026 sur la file de Bilal et
 * Matteo (332 tâches) : 28 % ont une démo prête, **23 % ont une démo en
 * chantier**, 49 % n'ont rien du tout. Les deux dernières se ressemblent sur un
 * booléen et ne se ressemblent pas au téléphone : « il y a un site, il reste à
 * le valider » se règle en un clic depuis la fiche, « il n'y a rien » demande de
 * fabriquer. Écraser les 77 lignes du milieu ferait passer un clic pour un
 * chantier.
 *
 * ⚠️ LA DÉFINITION DE « PRÊTE » N'EST PAS ÉCRITE ICI. C'est
 * `choisirSiteMontrable` — publié, ou explicitement marqué `pret` — et c'est
 * elle que lisent déjà la plaquette, le moteur d'automatisations et le cockpit
 * RDV. Une seconde définition ferait qu'un lien partirait chez un prospect
 * depuis un écran pendant qu'un autre écran le dirait « pas prêt ».
 *
 * ⚠️ CE N'EST PAS `etat_site`, ET LES CONFONDRE INVERSE LE SENS. `etat-site.ts`
 * dit si LE PROSPECT a un site — c'est l'argument de vente. Celui-ci dit si NOUS
 * avons quelque chose à lui montrer. Un prospect sans site dont la démo est
 * prête est le cas le plus favorable de la file ; sur un booléen commun, les
 * deux « absences » se seraient additionnées.
 */

import { choisirSiteMontrable, type SiteMontrableLike } from "@/lib/site-builder/demo-share-url";

/** Les trois états, du plus favorable au moins. */
export type EtatDemo = "prete" | "chantier" | "aucune";

/**
 * L'état de la démo d'une entreprise, d'après SES sites.
 *
 * `chantier` veut dire « un site existe mais ni publié ni marqué prêt » : c'est
 * exactement ce que `choisirSiteMontrable` refuse de rendre, et la raison pour
 * laquelle on ne peut pas se contenter de sa valeur de retour.
 */
export function etatDemoDe(sites: readonly SiteMontrableLike[] | null | undefined): EtatDemo {
  const propres = (sites ?? []).filter((s) => s.is_template !== true);
  if (propres.length === 0) return "aucune";
  return choisirSiteMontrable([...propres]) ? "prete" : "chantier";
}

/** Ce que dit l'infobulle du liseré. Une phrase, parce qu'une couleur seule ne s'apprend pas. */
export const ETAT_DEMO_AIDE: Record<EtatDemo, string> = {
  prete: "Démo prête — le lien peut partir.",
  chantier: "Démo fabriquée mais pas validée : rien à envoyer tant qu'elle n'est pas marquée prête.",
  aucune: "Aucune démo : il n'y a rien à montrer à ce prospect.",
};

/**
 * L'ordre de présentation : ce qu'on peut envoyer, ce qu'il reste à valider,
 * ce qu'il faut fabriquer. C'est aussi l'ordre du travail — la pastille du
 * haut est celle qui rapporte tout de suite.
 */
export const ETAT_DEMO_ORDER: readonly EtatDemo[] = ["prete", "chantier", "aucune"] as const;

/** Le libellé d'une pastille de filtre — deux mots, la place est comptée. */
export const ETAT_DEMO_LABEL: Record<EtatDemo, string> = {
  prete: "démo prête",
  chantier: "démo à valider",
  aucune: "pas de démo",
};

/**
 * CE QUE LA LIGNE ÉCRIT — et pourquoi `aucune` n'écrit RIEN.
 *
 * Le liseré du bord droit se voit d'un coup d'œil sur la colonne entière, mais
 * une couleur ne se lit qu'après l'avoir apprise : le grief est arrivé mot pour
 * mot (« je comprends pas »). L'étiquette dit donc en toutes lettres ce que le
 * trait dit en couleur, sur les deux états où il y a quelque chose À FAIRE.
 *
 * `aucune` reste muet parce que c'est 49 % de la file au 03/09/2026, et qu'une
 * étiquette portée par une ligne sur deux ne partage plus rien — c'est la même
 * règle que « a un site », qui ne s'affiche que face à une cohorte qui prétend
 * l'inverse. Son absence se lit, et le liseré gris reste là pour l'infobulle.
 */
export const ETAT_DEMO_TAG: Record<EtatDemo, string | null> = {
  prete: "démo prête",
  chantier: "démo à valider",
  aucune: null,
};

export const estEtatDemo = (v: unknown): v is EtatDemo =>
  typeof v === "string" && (ETAT_DEMO_ORDER as readonly string[]).includes(v);

/** Combien de lignes portent chaque état — ce que les pastilles annoncent. */
export function countByEtatDemo(
  taches: readonly { demo_etat?: EtatDemo | null }[],
): Record<EtatDemo, number> {
  const par: Record<EtatDemo, number> = { prete: 0, chantier: 0, aucune: 0 };
  for (const t of taches) {
    if (t.demo_etat) par[t.demo_etat] += 1;
  }
  return par;
}
