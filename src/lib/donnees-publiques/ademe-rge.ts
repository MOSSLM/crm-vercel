/**
 * Client ADEME — jeu `liste-des-entreprises-rge-2` (API data-fair).
 *
 * POURQUOI C'EST LA SOURCE QUI FAIT FOI
 * Le jeu est alimenté par les organismes certificateurs et n'est JAMAIS
 * déclaratif : une entreprise n'a aucun moyen d'y entrer ni d'en sortir. Il est
 * donc plus fiable que le site du client. Cas vérifié : ECLEIS
 * (35137835100040) affiche des logos RGE sur son site alors que l'ADEME rend 0
 * ligne et que `est_rge` vaut `false`. Afficher un logo RGE non détenu sur un
 * site qu'on produit est une allégation trompeuse — le contrôle ADEME protège.
 *
 * Mise à jour quotidienne, ~162 000 lignes, une ligne par qualification.
 */

import { normalizeSiren, normalizeSiret } from "./siret";

const BASE = "https://data.ademe.fr/data-fair/api/v1/datasets/liste-des-entreprises-rge-2/lines";

/** Une qualification, telle qu'on la stocke. */
export type QualificationRge = {
  siret: string;
  codeQualification: string;
  /**
   * Libellé du certificat. C'est la clé de `public/rge/mapping.json`, donc ce
   * qui détermine le logo affiché.
   */
  nomCertificat: string | null;
  /**
   * Libellé long. ATTENTION : accents mutilés à la source (« Pose de gnrateur
   * photovoltaque raccord au rseau »). Stocké pour référence, à NE PAS afficher
   * tel quel.
   */
  nomQualification: string | null;
  organisme: string | null;
  domaine: string | null;
  metaDomaine: string | null;
  particulier: boolean | null;
  urlQualification: string | null;
  dateDebut: string | null;
  dateFin: string | null;
};

/** Coordonnées déclarées par l'entreprise à son certificateur. */
export type ContactAdeme = {
  email: string | null;
  telephone: string | null;
  siteInternet: string | null;
  nomEntreprise: string | null;
};

export type ResultatRge = {
  qualifications: QualificationRge[];
  /**
   * Source officielle d'email et de téléphone, non exploitée jusqu'ici. Elle
   * avait déjà rendu 9 adresses sur 32 fiches testées. Ce n'est PAS une adresse
   * devinée : elle est déclarée par l'entreprise à son organisme certificateur.
   */
  contact: ContactAdeme | null;
};

type RawLine = {
  siret?: string;
  code_qualification?: string;
  nom_certificat?: string;
  nom_qualification?: string;
  organisme?: string;
  domaine?: string;
  meta_domaine?: string;
  particulier?: boolean;
  url_qualification?: string;
  lien_date_debut?: string;
  lien_date_fin?: string;
  email?: string;
  telephone?: string;
  site_internet?: string;
  nom_entreprise?: string;
};

const str = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
};

/** Une date ISO `YYYY-MM-DD`, ou `null`. Les dates vides sortent en `null`. */
const date = (v: unknown): string | null => {
  const s = str(v);
  return s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
};

export const parseLine = (raw: RawLine): QualificationRge | null => {
  const siret = normalizeSiret(raw.siret ?? null) ?? str(raw.siret);
  const code = str(raw.code_qualification);
  // Sans porteur ni code, la ligne n'a pas de clé naturelle : on ne peut pas la
  // dédupliquer, donc on la laisse tomber plutôt que de créer un doublon par jour.
  if (!siret || !code) return null;

  return {
    siret,
    codeQualification: code,
    nomCertificat: str(raw.nom_certificat),
    nomQualification: str(raw.nom_qualification),
    organisme: str(raw.organisme),
    domaine: str(raw.domaine),
    metaDomaine: str(raw.meta_domaine),
    particulier: typeof raw.particulier === "boolean" ? raw.particulier : null,
    urlQualification: str(raw.url_qualification),
    dateDebut: date(raw.lien_date_debut),
    dateFin: date(raw.lien_date_fin),
  };
};

export type AdemeOptions = {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  /**
   * Chercher sur TOUS les établissements du SIREN plutôt que sur le seul SIRET.
   *
   * Corrige un piège réel : `liste_rge` vit sur l'ÉTABLISSEMENT, et une
   * entreprise multi-sites peut être qualifiée sur un établissement secondaire
   * et pas sur son siège. Interroger le seul SIRET du siège rendrait alors 0
   * qualification pour une entreprise qui en détient.
   *
   * Activé par défaut : le coût est le même (une requête), la couverture est
   * strictement meilleure.
   */
  tousEtablissements?: boolean;
  maxLignes?: number;
};

/**
 * La requête ADEME.
 *
 * Deux points non négociables :
 *
 * 1. On filtre sur le CHAMP `siret`, via `qs`, et non par la recherche plein
 *    texte `q`. `q` cherche dans tout le document : un SIRET qui apparaîtrait
 *    dans un autre champ ramènerait une ligne étrangère. `qs=siret:"..."` est
 *    exact.
 * 2. L'ADEME ne matche QUE sur 14 chiffres. Un SIREN à 9 chiffres rend 0 ligne
 *    SANS erreur — un silence qu'on prendrait pour « pas de RGE ». D'où le
 *    joker `siret:123456789*` quand on veut couvrir le SIREN entier.
 */
const buildQs = (identifiant: string, tous: boolean): string | null => {
  const siret = normalizeSiret(identifiant);
  if (siret && !tous) return `siret:"${siret}"`;
  const siren = siret ? siret.slice(0, 9) : normalizeSiren(identifiant);
  if (!siren) return null;
  // Le joker ne doit PAS être entre guillemets : data-fair traiterait alors
  // l'astérisque comme un caractère littéral et ne rendrait rien.
  return `siret:${siren}*`;
};

export const fetchQualifications = async (
  identifiant: string,
  opts: AdemeOptions = {},
): Promise<ResultatRge> => {
  const tous = opts.tousEtablissements ?? true;
  const qs = buildQs(identifiant, tous);
  if (!qs) return { qualifications: [], contact: null };

  const params = new URLSearchParams({ qs, size: String(opts.maxLignes ?? 200) });
  const doFetch = opts.fetchImpl ?? fetch;
  const res = await doFetch(`${BASE}?${params.toString()}`, {
    signal: opts.signal,
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new Error(`ademe HTTP ${res.status}`);

  const body = (await res.json()) as { results?: RawLine[] };
  const lines = Array.isArray(body.results) ? body.results : [];

  const qualifications: QualificationRge[] = [];
  const vues = new Set<string>();
  for (const line of lines) {
    const q = parseLine(line);
    if (!q) continue;
    // Déduplication sur la clé naturelle. `_id` de l'ADEME porte la date de
    // publication du jeu ('45415-32-2026-06-11') et change à chaque
    // rafraîchissement : s'en servir créerait un doublon par jour.
    const cle = `${q.siret}|${q.codeQualification}|${q.dateDebut ?? ""}`;
    if (vues.has(cle)) continue;
    vues.add(cle);
    qualifications.push(q);
  }

  // Les coordonnées sont répétées sur chaque ligne ; on prend la première
  // renseignée. Aucune adresse n'est construite ni devinée ici — uniquement ce
  // que le registre porte.
  const avecContact = lines.find((l) => str(l.email) || str(l.telephone));
  const contact = avecContact
    ? {
        email: str(avecContact.email),
        telephone: str(avecContact.telephone),
        siteInternet: str(avecContact.site_internet),
        nomEntreprise: str(avecContact.nom_entreprise),
      }
    : null;

  return { qualifications, contact };
};

/** Une qualification est-elle encore valide à la date donnée ? */
export const estValide = (q: Pick<QualificationRge, "dateFin">, le: Date = new Date()): boolean => {
  if (!q.dateFin) return true;
  return q.dateFin >= le.toISOString().slice(0, 10);
};
