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

import { aDemarcher, inscriptionVivante, rienRecu, type BoardItem } from "./types";

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
  | "audit_valide"
  // Le logo du prospect
  | "logo_present"
  | "logo_absent"
  // Lui a-t-on déjà parlé ? (cf. `rienRecu` — trois preuves, aucune ne suffit)
  | "touche_oui"
  | "touche_non"
  // Où en est son inscription en séquence
  | "seq_jamais"
  | "seq_vivante"
  | "seq_close"
  // Ses métiers, et ce que l'allowlist en dit
  | "metier_aucun"
  | "metier_autorise"
  | "metier_sans_autorise"
  | "metier_vendu"
  // Sa plaquette nominative
  | "plaquette_aucune"
  | "plaquette_creee"
  | "plaquette_vue"
  // Sa fiche Google Business
  | "google_oui"
  | "google_non";

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
  {
    id: "contact",
    titre: "Premier message",
    aide:
      "« Reçu » veut dire qu’un geste est RÉELLEMENT parti : un appel bouclé, " +
      "un WhatsApp ou un e-mail journalisé. Une inscription en séquence ne prouve rien.",
    options: [
      {
        cle: "touche_non",
        label: "Jamais rien reçu",
        aide:
          "Ni appel bouclé, ni message journalisé. Le 30/08/2026, 637 fiches étaient " +
          "dans ce cas dont 431 portaient pourtant une inscription active.",
      },
      { cle: "touche_oui", label: "A déjà reçu quelque chose" },
    ],
  },
  {
    id: "sequence",
    titre: "Séquence",
    aide:
      "Où en est l’inscription — pas ce qui est parti. Les deux se croisent : " +
      "une inscription vivante peut n’avoir encore rien envoyé.",
    options: [
      {
        cle: "seq_jamais",
        label: "Jamais inscrite (le stock)",
        aide:
          "Jamais inscrite, ou sortie sans que rien ne parte (canal mort, réattribution). " +
          "C’est ce qu’on attribue.",
      },
      { cle: "seq_vivante", label: "Inscription en cours", aide: "active ou en pause." },
      {
        cle: "seq_close",
        label: "Séquence finie",
        aide: "Terminée, a répondu, ou sortie après avoir été démarchée. Réinscriptible en lot.",
      },
    ],
  },
  {
    id: "logo",
    titre: "Logo",
    aide:
      "Le logo ne conditionne RIEN — `hydrate-logo` compose le nom dans la police du " +
      "design. Ce qui se travaille est le clivage : à prendre sur un vrai site, ou rien à chercher.",
    options: [
      { cle: "logo_present", label: "Logo enregistré" },
      {
        cle: "logo_absent",
        label: "Sans logo",
        aide: "738 fiches sur 60 445 en ont un : c’est le cas ordinaire, pas un retard.",
      },
    ],
  },
  {
    id: "metier",
    titre: "Métiers du prospect",
    aide:
      "`entreprises.service_tags` croisé avec l’allowlist des Paramètres. Les fiches dont " +
      "un métier est FERMÉ ne sont pas ici : elles sont retirées côté serveur, avant la carte.",
    options: [
      {
        cle: "metier_aucun",
        label: "Aucun métier connu",
        aide: "L’enrichissement n’est pas passé. Ce n’est pas « elle n’en a pas ».",
      },
      {
        cle: "metier_autorise",
        label: "Au moins un métier autorisé",
        aide:
          "Explicitement `allowed = true` dans les Paramètres — la MÊME règle que celle qui " +
          "décide si la fiche est complète. Sans elle, « Service tags » manque.",
      },
      {
        cle: "metier_sans_autorise",
        label: "Des métiers, aucun autorisé",
        aide:
          "Elle porte des étiquettes, mais aucune n’est au catalogue — souvent un libellé " +
          "RGE générique. C’est ce qui lui vaut « Service tags » en champ manquant.",
      },
      {
        cle: "metier_vendu",
        label: "Au moins un métier démarché",
        aide:
          "Axe INDÉPENDANT du précédent : `allowed` dit si l’enrichissement peut POSER le " +
          "tag, `demarchable` si on veut de ces artisans dans nos files.",
      },
    ],
  },
  {
    id: "plaquette",
    titre: "Plaquette",
    aide: "Le lien nominatif — l’étage « document ouvert » de l’entonnoir pour la cohorte sans site.",
    options: [
      { cle: "plaquette_aucune", label: "Pas de jeton" },
      { cle: "plaquette_creee", label: "Préparée, jamais ouverte" },
      { cle: "plaquette_vue", label: "Ouverte par le prospect", aide: "Le signal qui vaut une relance." },
    ],
  },
  {
    id: "google",
    titre: "Fiche Google",
    options: [
      { cle: "google_oui", label: "Fiche trouvée" },
      { cle: "google_non", label: "Aucune fiche", aide: "Rien à lire chez Maps : à envoyer au lissage." },
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

    case "logo_present":
      return !!item.logo_url;
    case "logo_absent":
      return !item.logo_url;

    // ⚠️ `touche_non` N'EST PAS `seq_jamais`. Le premier demande « lui a-t-on
    // parlé », le second « où en est la machine » — et les deux ont divergé de
    // 454 fiches le 30/08/2026, quand 431 inscriptions actives n'avaient
    // encore rien envoyé. Les fondre en une seule case ferait disparaître de
    // « à démarcher » des gens à qui personne n'a jamais rien dit.
    case "touche_non":
      return rienRecu(item);
    case "touche_oui":
      return !rienRecu(item);

    case "seq_jamais":
      return aDemarcher(item);
    case "seq_vivante":
      return inscriptionVivante(item.sequence);
    case "seq_close":
      return !aDemarcher(item) && !inscriptionVivante(item.sequence);

    case "metier_aucun":
      return servicesDe(item).length === 0;
    case "metier_autorise":
      return (item.metiers?.autorises ?? 0) > 0;
    case "metier_sans_autorise":
      return servicesDe(item).length > 0 && (item.metiers?.autorises ?? 0) === 0;
    case "metier_vendu":
      return (item.metiers?.vendus ?? 0) > 0;

    // « Aucun jeton » et « jeton jamais ouvert » ne se corrigent pas pareil :
    // le premier est un geste de masse (« Créer les plaquettes »), le second
    // une relance. Les confondre ferait refabriquer ce qui existe déjà.
    case "plaquette_aucune":
      return !item.plaquette?.url;
    case "plaquette_creee":
      return !!item.plaquette?.url && (item.plaquette?.vues ?? 0) === 0;
    case "plaquette_vue":
      return (item.plaquette?.vues ?? 0) > 0;

    case "google_oui":
      return !!item.google_url || !!item.google_maps_url;
    case "google_non":
      return !item.google_url && !item.google_maps_url;

    default:
      return true;
  }
}

/* ── LES SERVICES : un axe à part, et pourquoi ────────────────────────────
 *
 * Les quatre groupes ci-dessus sont des vocabulaires FERMÉS : trois états de
 * site, trois niveaux de note. `entreprises.service_tags` n'en est pas un —
 * 60 726 fiches portent des centaines de libellés distincts, dont « Isolation
 * des murs par l'extérieur » (8 464 entreprises) et « Pompe à chaleur :
 * chauffage » (15 303). Une liste de cases ne s'y prête pas ; il faut chercher.
 *
 * MÊME GRAMMAIRE POURTANT : plusieurs services cochés = OU (une entreprise qui
 * fait l'un OU l'autre), et l'ensemble se combine en ET avec les autres
 * groupes. C'est ce qui rend « isolation par l'extérieur ET sans site »
 * exprimable — la question de départ.
 *
 * ⚠️ ON NE NORMALISE PAS LES LIBELLÉS. « climatisation » et « Installateur
 * climatisation » sont deux étiquettes différentes en base, et les fondre ici
 * inventerait une population que personne ne pourrait retrouver en SQL. La
 * recherche du panneau les fait remonter toutes les deux ; c'est à l'humain de
 * cocher ce qu'il veut.
 */

/** Les services d'une ligne, toujours un tableau. */
export const servicesDe = (item: BoardItem): string[] => item.service_tags ?? [];

/** Cette ligne porte-t-elle au moins un des services demandés ? */
const tientService = (item: BoardItem, services: ReadonlySet<string>): boolean => {
  if (services.size === 0) return true;
  return servicesDe(item).some((s) => services.has(s));
};

/**
 * Tous les services présents dans le tableau, du plus porté au moins porté.
 *
 * Comptés sur les lignes RÉELLEMENT chargées : un service annoncé à 300 alors
 * que la page n'en montre que 40 ferait un compte qu'aucun clic ne retrouve.
 */
export function servicesPresents(
  items: readonly BoardItem[],
): { service: string; n: number }[] {
  const par = new Map<string, number>();
  for (const item of items) {
    for (const s of servicesDe(item)) par.set(s, (par.get(s) ?? 0) + 1);
  }
  return [...par.entries()]
    .map(([service, n]) => ({ service, n }))
    .sort((a, b) => b.n - a.n || a.service.localeCompare(b.service, "fr"));
}

/**
 * La ligne passe-t-elle les cases cochées ?
 *
 * Aucune case cochée = tout passe. Un groupe sans case cochée ne filtre RIEN :
 * c'est ce qui permet de cocher « sans site » sans devoir aussi se prononcer
 * sur la démo, l'audit et la note. Les services sont un cinquième groupe, servi
 * par un panneau de recherche plutôt que par des cases — cf. ci-dessus.
 */
export function passeLesFiltres(
  item: BoardItem,
  coches: ReadonlySet<CleFiltre>,
  services: ReadonlySet<string> = new Set(),
): boolean {
  if (!tientService(item, services)) return false;
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
