/**
 * « Combien sont prêtes pour une démo ? » — la lecture des comptes.
 *
 * ── CE QUE CE MODULE N'EST PAS ───────────────────────────────────────────
 * Il ne DÉCIDE pas si une fiche est prête : ce jugement est rendu en base par
 * `pretes_pour_demo_des_lots()`, parce que l'appliquer en TypeScript
 * demanderait de lire 60 000 fiches pour rendre un compteur. Ici on ne fait que
 * nommer, ordonner et présenter ce que la base a compté.
 *
 * ⚠️ LA DÉFINITION DE « PRÊTE » VIT À TROIS ENDROITS, ET C'EST ASSUMÉ.
 * `SITE_REQUIRED` (`components/marketing-pipeline/required-fields.ts`) pour
 * l'écran, `missingForSite` (`api/marketing-pipeline/_board.ts`) pour l'API, et
 * `pretes_pour_demo_des_lots()` pour le comptage de masse. Les deux premières
 * sont déjà tenues alignées par `missing-for-site.test.ts` ; `pret-demo.test.ts`
 * ajoute la troisième en figeant la liste des causes que la fonction SQL rend.
 * Si une règle bouge sans que la liste bouge, le test tombe.
 *
 * ── LE LOGO EST HORS CONDITION, ET LE RESTE ──────────────────────────────
 * 738 fiches sur 60 445 ont un logo — 1,2 %. Un artisan sans logo n'a pas
 * oublié de le renseigner, il n'a jamais payé de graphiste, et `hydrate-logo`
 * compose désormais son nom dans la police du design. L'exiger ne produirait
 * pas 59 000 logos.
 *
 * Ce qui se travaille, ce n'est donc pas « combien en ont un » — la réponse est
 * « presque aucune », partout — mais la distinction entre un logo INTROUVABLE
 * et un logo QU'ON N'A PAS ENCORE PRIS. Une fiche avec un vrai site en porte
 * forcément un ; une fiche sans aucune URL n'en a nulle part. Les afficher
 * ensemble ferait passer des impossibilités pour du retard.
 */

/** Une ligne de `pretes_pour_demo_des_lots()`, telle que la base la rend. */
export interface LignePretDemo {
  lot_id: number | string;
  total: number | string;
  pretes: number | string;
  sans_ville: number | string;
  sans_code_postal: number | string;
  sans_telephone: number | string;
  sans_service_tags: number | string;
  note_incoherente: number | string;
  avec_logo: number | string;
  logo_sur_le_site: number | string;
  logo_sur_reseau: number | string;
  logo_introuvable: number | string;
}

export interface PretDemo {
  lotId: number;
  total: number;
  pretes: number;
  /** Ce qui manque aux autres, par cause — jamais un total seul. */
  manques: { cle: CleManque; nombre: number }[];
  logo: {
    avec: number;
    /** Sans logo, mais un vrai site en porte un : à prendre. */
    surLeSite: number;
    /** Sans logo, mais une page sociale : la photo de profil fait l'affaire. */
    surReseau: number;
    /** Aucune URL : il n'y a rien à aller chercher. */
    introuvable: number;
  };
}

export type CleManque =
  | "ville"
  | "code_postal"
  | "telephone"
  | "service_tags"
  | "note";

/**
 * Le libellé de chaque cause, et le geste qui la comble.
 *
 * L'ORDRE EST CELUI DE L'EFFORT, pas celui du schéma : les tags de service se
 * choisissent dans une liste (c'est un tri, il se fait en série), une ville et
 * un code postal se retrouvent au registre (le lissage sait le faire), un
 * téléphone se cherche à la main. Afficher la cause la plus fréquente en
 * premier ne servirait à rien si elle est aussi la plus coûteuse à combler.
 */
export const MANQUES: Record<CleManque, { libelle: string; geste: string }> = {
  service_tags: {
    libelle: "Sans tag de service",
    geste: "À choisir dans la liste — c'est ce qui commande les pages du site.",
  },
  ville: { libelle: "Sans ville", geste: "Le lissage la ramène avec le SIRET." },
  code_postal: { libelle: "Sans code postal", geste: "Le lissage le ramène avec le SIRET." },
  telephone: { libelle: "Sans téléphone", geste: "À chercher — fiche Google, ou annuaire." },
  note: {
    libelle: "Avis annoncés sans note",
    geste: "Incohérence : le bloc noté sortirait vide. Rafraîchir la fiche Google.",
  },
};

const nombre = (v: number | string | null | undefined): number => {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export function lirePretDemo(l: LignePretDemo): PretDemo {
  const manques: { cle: CleManque; nombre: number }[] = (
    [
      ["service_tags", l.sans_service_tags],
      ["ville", l.sans_ville],
      ["code_postal", l.sans_code_postal],
      ["telephone", l.sans_telephone],
      ["note", l.note_incoherente],
    ] as const
  )
    .map(([cle, v]) => ({ cle: cle as CleManque, nombre: nombre(v) }))
    // Une cause à zéro n'est pas une bonne nouvelle à afficher, c'est une ligne
    // de moins à lire. Même règle que `DossierEntreprise` : un bloc vide ne se
    // rend pas.
    .filter((m) => m.nombre > 0);

  return {
    lotId: nombre(l.lot_id),
    total: nombre(l.total),
    pretes: nombre(l.pretes),
    manques,
    logo: {
      avec: nombre(l.avec_logo),
      surLeSite: nombre(l.logo_sur_le_site),
      surReseau: nombre(l.logo_sur_reseau),
      introuvable: nombre(l.logo_introuvable),
    },
  };
}

/** La part prête, entre 0 et 1. Zéro fiche = zéro, jamais NaN. */
export const partPrete = (p: PretDemo): number =>
  p.total === 0 ? 0 : p.pretes / p.total;

/**
 * Les logos qu'on peut encore aller chercher : ceux qui existent quelque part.
 * C'est le seul nombre de ce bloc sur lequel on puisse agir.
 */
export const logosAPrendre = (p: PretDemo): number => p.logo.surLeSite + p.logo.surReseau;
