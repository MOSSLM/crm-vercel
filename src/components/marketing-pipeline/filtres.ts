/**
 * Les filtres à cocher du tableau — et la seule règle qui compte : **OU dans un
 * groupe, ET entre les groupes.**
 *
 * « Sans site » **ou** « on ne sait pas », **et** « note faible » : c'est la
 * grammaire que tout le monde attend d'une liste de cases, et c'est celle des
 * pastilles de lemlist. L'inverse — un ET partout — donnerait un tableau qui se
 * vide dès la deuxième case, et qu'on cesserait d'utiliser.
 *
 * Module pur, sans React : c'est ce qui permet de tester la grammaire sans
 * monter un écran, et d'être sûr qu'un groupe vide ne filtre RIEN plutôt que de
 * tout écarter — la faute qui rend une barre de filtres inutilisable.
 *
 * ⚠️ LE SITE DU PROSPECT A TROIS ÉTATS, PAS DEUX. « vérifié sans site » et « on
 * ne sait pas » sont deux populations différentes : la première se démarche sur
 * l'accroche « création », la seconde s'envoie au lissage. Les fondre en « pas
 * de site » ferait promettre un site à quelqu'un qui en a peut-être un — la
 * faute que `constats_presence` existe précisément pour empêcher.
 */

import type { BoardItem } from "./types";

export type CleFiltre =
  // Le site du prospect (v_entreprises_presence_site)
  | "site_present"
  | "site_absent"
  | "site_inconnu"
  | "site_jamais_regarde"
  // Ce que vaut ce site, quand il a été mesuré
  | "note_faible"
  | "note_correcte"
  | "note_absente"
  // Notre démo
  | "demo_aucune"
  | "demo_brouillon"
  | "demo_publiee"
  // L'audit
  | "audit_aucun"
  | "audit_redige"
  | "audit_valide";

export interface GroupeFiltre {
  id: string;
  titre: string;
  aide?: string;
  options: { cle: CleFiltre; label: string; aide?: string }[];
}

/** Sous cette note, le site est un argument de vente. Le seuil de la cohorte A. */
export const NOTE_FAIBLE = 50;

export const GROUPES: GroupeFiltre[] = [
  {
    id: "site",
    titre: "Site du prospect",
    aide: "Ce qu'on a CONSTATÉ, pas ce que la colonne dit — un constat l'emporte toujours.",
    options: [
      { cle: "site_present", label: "A un site" },
      {
        cle: "site_absent",
        label: "Vérifié sans site",
        aide: "On a regardé, il n'en a pas. C'est la cohorte « création ».",
      },
      {
        cle: "site_inconnu",
        label: "Regardé sans conclure",
        aide: "Un outil a cherché et n'a pas tranché — à repasser au lissage.",
      },
      {
        cle: "site_jamais_regarde",
        label: "Jamais regardé",
        aide: "Personne n'a mesuré. Ce n'est pas « il n'en a pas ».",
      },
    ],
  },
  {
    id: "note",
    titre: "Note du site",
    options: [
      { cle: "note_faible", label: `Faible (moins de ${NOTE_FAIBLE})` },
      { cle: "note_correcte", label: `Correcte (${NOTE_FAIBLE} et plus)` },
      { cle: "note_absente", label: "Jamais analysé" },
    ],
  },
  {
    id: "demo",
    titre: "Notre démo",
    options: [
      { cle: "demo_aucune", label: "Pas encore créée" },
      { cle: "demo_brouillon", label: "Créée, pas publiée" },
      { cle: "demo_publiee", label: "En ligne" },
    ],
  },
  {
    id: "audit",
    titre: "Audit",
    options: [
      { cle: "audit_aucun", label: "Aucun" },
      { cle: "audit_redige", label: "Rédigé, à valider" },
      { cle: "audit_valide", label: "Validé" },
    ],
  },
];

/** Le groupe auquel une clé appartient — pour le « OU dans un groupe ». */
const GROUPE_DE = new Map<CleFiltre, string>(
  GROUPES.flatMap((g) => g.options.map((o) => [o.cle, g.id] as const)),
);

/** Une ligne satisfait-elle CETTE case ? */
function tient(item: BoardItem, cle: CleFiltre): boolean {
  const presence = item.presence_site?.statut ?? null;
  const note = item.note_site?.globale ?? null;
  switch (cle) {
    case "site_present":
      return presence === "present";
    case "site_absent":
      return presence === "absent";
    case "site_inconnu":
      return presence === "inconnu";
    case "site_jamais_regarde":
      return presence == null;
    case "note_faible":
      return note != null && note < NOTE_FAIBLE;
    case "note_correcte":
      return note != null && note >= NOTE_FAIBLE;
    case "note_absente":
      return note == null;
    case "demo_aucune":
      return !item.site;
    case "demo_brouillon":
      return !!item.site && !item.site.is_published;
    case "demo_publiee":
      return !!item.site && item.site.is_published;
    case "audit_aucun":
      return !item.audit;
    // « Rédigé » n'est pas « existe » : c'est `prepare`, la seule preuve qu'une
    // rédaction a eu lieu. Sans cette distinction, 67 documents vides ont déjà
    // été validés en lot.
    case "audit_redige":
      return !!item.audit && item.audit.prepare && item.audit.statut !== "ready";
    case "audit_valide":
      return item.audit?.statut === "ready";
    default:
      return true;
  }
}

/**
 * La ligne passe-t-elle les cases cochées ?
 *
 * Aucune case cochée = tout passe. Un groupe sans case cochée ne filtre RIEN :
 * c'est ce qui permet de cocher « sans site » sans devoir aussi se prononcer
 * sur la démo, l'audit et la note.
 */
export function passeLesFiltres(item: BoardItem, coches: ReadonlySet<CleFiltre>): boolean {
  if (coches.size === 0) return true;
  const parGroupe = new Map<string, CleFiltre[]>();
  for (const cle of coches) {
    const g = GROUPE_DE.get(cle);
    if (!g) continue;
    const liste = parGroupe.get(g);
    if (liste) liste.push(cle);
    else parGroupe.set(g, [cle]);
  }
  for (const [, cles] of parGroupe) {
    if (!cles.some((c) => tient(item, c))) return false;
  }
  return true;
}

/** Combien de lignes chaque case retiendrait — affiché à côté d'elle. */
export function compter(items: readonly BoardItem[]): Record<CleFiltre, number> {
  const out = {} as Record<CleFiltre, number>;
  for (const g of GROUPES) {
    for (const o of g.options) out[o.cle] = 0;
  }
  for (const item of items) {
    for (const g of GROUPES) {
      for (const o of g.options) if (tient(item, o.cle)) out[o.cle] += 1;
    }
  }
  return out;
}
