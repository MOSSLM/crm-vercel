// variables.ts — le catalogue des variables de message, et lui seul.
//
// POURQUOI CE FICHIER EXISTE
// Trois conventions incompatibles cohabitaient. Le moteur ne connaît que les
// clés pointées (`{{company.name}}`) ; les modèles d'e-mail semés en base et
// l'éditeur de la messagerie écrivent `{{company_name}}` ; l'onglet WhatsApp
// écrit `{{prénom}}` avec ses propres modèles en `localStorage`. Conséquence :
// un modèle rédigé dans la messagerie, puis choisi dans une étape de séquence,
// partait au prospect avec ses variables VIDÉES — `interpolate` remplace par ''
// toute clé qu'il ne connaît pas, donc l'accident était silencieux.
//
// La correction ne réécrit aucun modèle existant : les anciennes écritures sont
// déclarées ici comme des alias de la clé canonique. Un même texte peut donc
// mélanger les deux conventions sans qu'on ait à trancher.
//
// Module PUR : ni base, ni horloge, ni React. Le builder, la bibliothèque de
// modèles, l'aperçu et le moteur lisent tous ce fichier.

/** Une variable proposée à l'insertion, telle que l'interface la présente. */
export interface VariableDef {
  /** La clé canonique, sans les accolades. */
  key: string
  /** Ce qu'on en dit à l'opérateur. */
  desc: string
  /** Valeur d'exemple, quand aucune entreprise réelle n'est chargée. */
  sample: string
}

/**
 * Le catalogue. L'ordre est celui de la barre d'insertion : d'abord ce qu'on
 * met dans une première phrase, ensuite les liens qu'on colle en fin de message.
 */
export const VARIABLES: readonly VariableDef[] = [
  { key: 'company.name', desc: 'Entreprise', sample: 'Toiture Martin' },
  { key: 'contact.first_name', desc: 'Prénom du contact', sample: 'Julien' },
  { key: 'contact.last_name', desc: 'Nom du contact', sample: 'Martin' },
  { key: 'contact.role', desc: 'Poste du contact', sample: 'Gérant' },
  { key: 'company.city', desc: 'Ville', sample: 'Angers' },
  { key: 'company.phone', desc: "Téléphone de l'entreprise", sample: '06 46 04 28 76' },
  { key: 'company.email', desc: "E-mail de l'entreprise", sample: 'contact@toituremartin.fr' },
  { key: 'company.website', desc: 'Site actuel du prospect', sample: 'toituremartin.fr' },
  { key: 'owner.first_name', desc: "Prénom de l'agent qui suit le prospect", sample: 'Alex' },
  { key: 'company.demo_url', desc: 'Lien du site démo', sample: 'https://toituremartin.samadigitalstudio.fr' },
  { key: 'company.audit_url', desc: "Lien du rapport d'audit (repli : PDF)", sample: 'https://rapport.samadigitalstudio.fr/a1b2c3' },
  { key: 'calendar_link', desc: 'Lien de réservation', sample: 'https://samadigitalstudio.fr/rdv' },
] as const

/** Le sac de valeurs résolu par le moteur : clé canonique → texte déjà rendu. */
export type VarBag = Record<string, string>

/**
 * Anciennes écritures encore présentes dans des modèles enregistrés, et leur
 * clé canonique.
 *
 * Ne JAMAIS retirer une entrée d'ici sans avoir réécrit les modèles concernés :
 * la clé redeviendrait inconnue, donc vide, et l'e-mail partirait amputé sans
 * que rien ne le signale.
 */
export const ALIASES: Readonly<Record<string, string>> = {
  // Modèles d'e-mail semés en base + éditeur de la messagerie.
  company_name: 'company.name',
  contact_name: 'contact.first_name',
  contact_email: 'company.email',
  lead_magnet_url: 'company.demo_url',
  calendly_link: 'calendar_link',
  // Onglet WhatsApp de la messagerie (accents compris : ils sont dans les modèles).
  'prénom': 'contact.first_name',
  prenom: 'contact.first_name',
  entreprise: 'company.name',
  ville: 'company.city',
  lien_site: 'company.demo_url',
  lien_demo: 'company.demo_url',
  lien_audit: 'company.audit_url',
  lien_lm: 'company.demo_url',
  lien_rdv: 'calendar_link',
}

/**
 * Le motif d'une variable dans un texte.
 *
 * `[\w.]` ne suffisait pas : `prénom` porte un accent, et une clé non reconnue
 * est remplacée par du vide — l'ancien motif laissait donc `{{prénom}}` intact
 * dans le message envoyé, ce qui est encore pire qu'un blanc. `\p{L}` couvre
 * les lettres accentuées ; le drapeau `u` est requis pour ça.
 */
const VAR_PATTERN = /\{\{\s*([\p{L}\w.]+)\s*\}\}/gu

/** La clé canonique d'une écriture donnée — elle-même si elle est déjà canonique. */
export function canonicalKey(raw: string): string {
  const k = raw.trim()
  return ALIASES[k] ?? ALIASES[k.toLowerCase()] ?? k
}

/** Toutes les clés canoniques citées par un texte, sans doublon, dans l'ordre. */
export function usedVariables(text: string | null | undefined): string[] {
  const out: string[] = []
  for (const m of (text ?? '').matchAll(VAR_PATTERN)) {
    const key = canonicalKey(m[1])
    if (!out.includes(key)) out.push(key)
  }
  return out
}

/**
 * Les variables citées par le texte pour lesquelles le sac n'a rien à donner.
 *
 * C'est ce que l'aperçu montre en creux : un message qui compile en apparence
 * mais qui partira avec un trou se repère avant l'envoi, pas après.
 */
export function missingVariables(text: string | null | undefined, vars: VarBag): string[] {
  return usedVariables(text).filter((k) => !vars[k])
}

/**
 * Remplace les variables d'un texte par leurs valeurs.
 *
 * Les alias sont résolus AVANT la substitution, donc un texte peut mélanger les
 * conventions. Une clé sans valeur devient une chaîne vide — comportement
 * historique, conservé : un `{{…}}` laissé brut dans un message envoyé à un
 * prospect est plus embarrassant qu'un blanc.
 */
export function interpolateVars(text: string | null | undefined, vars: VarBag): string {
  return (text ?? '').replace(VAR_PATTERN, (_, raw: string) => vars[canonicalKey(raw)] ?? '')
}

// ── Deux variations d'un même message ──────────────────────────────────────
//
// POURQUOI DEUX TEXTES ET PAS UN
// Un modèle ne se dit pas pareil selon qu'on sache À QUI on écrit.
// « Bonjour, je suis bien avec Toiture Martin ? » s'adresse à une enseigne ;
// « Bonjour, je suis bien avec Julien de Toiture Martin ? » s'adresse à une
// personne — et n'a de sens que si on connaît son prénom.
//
// Avec un seul texte il fallait trancher pour tout le parc : soit citer
// `{{contact.first_name}}` et l'envoyer amputé aux fiches sans contact (sur les
// 275 entreprises qualifiées, 70 n'ont AUCUNE ligne `contacts` — le prospect
// lisait « je suis bien avec  de Toiture Martin ? »), soit ne nommer personne,
// jamais, y compris quand on a le nom du gérant sous les yeux.
//
// LA VERSION ENTREPRISE FAIT FOI. Elle marche toujours, c'est la seule que
// portent les modèles écrits avant cette bascule, et c'est là qu'on retombe dès
// qu'un doute existe sur l'identité du contact.

export type MessageVariant = 'company' | 'contact'

export const VARIANTS: readonly MessageVariant[] = ['company', 'contact'] as const

/** Le vocabulaire des deux versions — partagé par la bibliothèque et le builder. */
export const VARIANT_LABELS: Readonly<Record<MessageVariant, { tab: string; short: string; hint: string }>> = {
  company: {
    tab: 'À l’entreprise',
    short: 'version entreprise',
    hint: 'Ce qui part quand on ne connaît que l’enseigne. Une variable du contact y partirait vide.',
  },
  contact: {
    tab: 'À un contact',
    short: 'version contact',
    hint: 'Ce qui part quand on sait à qui on écrit. Laissée vide, c’est la version entreprise qui part.',
  },
}

/** Les deux écritures d'un même champ. `contact` vide = pas de version dédiée. */
export interface VariantPair {
  company: string | null | undefined
  contact: string | null | undefined
}

const blank = (s: string | null | undefined): boolean => !(s ?? '').trim()

/** Les variables du CONTACT citées par un texte que le sac ne peut pas remplir. */
export function missingContactVariables(text: string | null | undefined, vars: VarBag): string[] {
  return missingVariables(text, vars).filter((k) => k.startsWith('contact.'))
}

/**
 * Laquelle des deux versions part, pour ce prospect-là.
 *
 * La version contact n'est retenue que si on peut la tenir jusqu'au bout : un
 * texte qui dit « je suis bien avec {{contact.first_name}} » et qu'on envoie à
 * une fiche sans prénom est PIRE que la version entreprise — il annonce qu'on
 * connaît quelqu'un, puis laisse le trou. On retombe donc sur l'entreprise dès
 * qu'une variable du contact manque, plutôt que d'envoyer une phrase amputée.
 *
 * Les champs sont jugés ENSEMBLE : sur un e-mail, l'objet et le corps partent
 * dans la même enveloppe, il n'y a pas de sens à tutoyer dans l'un et pas dans
 * l'autre. Un champ sans version contact se replie sur l'entreprise (cf.
 * `variantText`), donc n'écrire que le corps reste possible.
 */
export function pickVariant(pairs: readonly VariantPair[], vars: VarBag): MessageVariant {
  const ecrits = pairs.map((p) => p.contact).filter((t) => !blank(t))
  if (ecrits.length === 0) return 'company'
  if (ecrits.some((t) => missingContactVariables(t, vars).length > 0)) return 'company'
  return 'contact'
}

/** Le texte d'un champ dans la version choisie — repli sur la version entreprise. */
export function variantText(pair: VariantPair, variant: MessageVariant): string {
  if (variant === 'contact' && !blank(pair.contact)) return pair.contact as string
  return pair.company ?? ''
}

/**
 * Le sac tel que la version le voit — POUR L'ÉCRITURE, pas pour l'envoi.
 *
 * La version entreprise existe précisément pour les prospects dont on ne
 * connaît personne : la prévisualiser avec un prénom rempli masquerait le seul
 * défaut qu'elle puisse avoir. En vidant `contact.*`, l'aperçu montre le cas
 * qu'elle doit tenir, et l'avertissement « cette variable partira vide » de
 * l'éditeur se déclenche là où il faut.
 *
 * Le moteur, lui, interpole avec le sac COMPLET : quand un modèle n'a pas de
 * version contact, sa version entreprise part aussi à des fiches qui, elles,
 * ont un prénom — le vider serait une régression.
 */
export function varsForVariant(vars: VarBag, variant: MessageVariant): VarBag {
  if (variant === 'contact') return vars
  const out: VarBag = { ...vars }
  for (const k of Object.keys(out)) if (k.startsWith('contact.')) out[k] = ''
  return out
}

/** Le sac d'exemple, pour un aperçu quand aucune entreprise réelle n'est choisie. */
export function sampleVars(): VarBag {
  const bag: VarBag = {}
  for (const v of VARIABLES) bag[v.key] = v.sample
  return bag
}

/**
 * Insère une variable dans un texte à la position du curseur.
 *
 * Renvoie le texte ET la nouvelle position, parce que l'appelant doit replacer
 * le curseur derrière l'insertion : sans ça, cliquer deux variables de suite
 * les empile toutes les deux au même endroit, dans l'ordre inverse.
 */
export function insertVariable(
  text: string,
  key: string,
  selectionStart: number,
  selectionEnd: number = selectionStart,
): { text: string; cursor: number } {
  const token = `{{${key}}}`
  const start = Math.max(0, Math.min(selectionStart, text.length))
  const end = Math.max(start, Math.min(selectionEnd, text.length))
  return {
    text: text.slice(0, start) + token + text.slice(end),
    cursor: start + token.length,
  }
}
