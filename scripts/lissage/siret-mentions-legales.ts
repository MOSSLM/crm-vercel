/**
 * Le SIRET écrit sur le site du prospect — le dernier endroit où le chercher.
 *
 * ── POURQUOI CE CHEMIN EXISTE ─────────────────────────────────────────────
 * Quand l'annuaire ne rend rien sur le nom NI sur l'adresse, il reste une
 * source : la loi. Les mentions légales d'un site commercial portent le SIREN
 * ou le SIRET, et un artisan qui a fait faire un site les a presque toujours.
 * Mesuré le 03/09/2026 : 18 fiches de la file de Bilal et Matteo étaient
 * introuvables au registre, toutes avec un site en ligne.
 *
 * ⚠️ CE QUI EST TROUVÉ ICI N'EST PAS VÉRIFIÉ. Un numéro à quatorze chiffres sur
 * une page web est une CHAÎNE, pas une identité : la clé de Luhn valide la
 * forme, jamais l'existence. C'est `validerCandidat` qui tranche, en
 * réinterrogeant l'annuaire — d'où `source: 'recherche_web'`, qui dit d'où
 * vient le numéro et permet de le retrouver des mois plus tard.
 *
 * ── LE CHEMIN DES MENTIONS NE SE DEVINE PAS, IL SE LIT ────────────────────
 * La première version essayait cinq chemins probables (`/mentions-legales`,
 * `/mentions`, `/legal`…). Résultat mesuré sur les 49 fiches sans SIRET du
 * portefeuille : **zéro**. Les cinq rendaient 404 partout — les mentions de
 * COLDEX vivent en `/home/mentionslegales/`, celles d'e-Novelec en
 * `/cms/2-mentions-legales-e-novelec`. Aucune liste ne rattrape ça.
 *
 * Le pied de page, lui, porte le lien. On lit donc l'accueil, on en EXTRAIT les
 * liens légaux, et on suit ceux-là ; les chemins devinés ne restent qu'en
 * dernier recours, pour un site dont l'accueil ne se laisse pas lire.
 *
 * ── UN SIREN VAUT AUTANT QU'UN SIRET, ET IL EST PLUS COURANT ──────────────
 * Un pied de page écrit « RCS SAINT-MALO 425 110 376 » aussi souvent qu'un
 * SIRET à quatorze chiffres. Ne prendre que les quatorze jetait la moitié de la
 * matière : `chercherCandidats` sait déplier un SIREN en établissements
 * (chemin 2), et c'est ce qu'on lui donne.
 *
 * ⚠️ MAIS UN SIREN EST PLUS DANGEREUX : neuf chiffres, ça ressemble aussi à un
 * numéro de téléphone ou à une référence produit. Deux gardes, tous les deux
 * nécessaires : le numéro doit être ancré à « SIREN » ou « RCS » — jamais au
 * hasard dans la page — ET passer la clé de Luhn (`isValidSiren`).
 *
 * Le script n'exécute aucun script : on lit du HTML, on ne visite pas un site.
 * Au plus quatre pages par fiche.
 */
import { createClient } from "@supabase/supabase-js";

import { chercherCandidats, validerCandidat } from "@/lib/donnees-publiques/resolution";
import { isValidSiren, normalizeSiren, normalizeSiret } from "@/lib/donnees-publiques/siret";

const OWNERS = ["76353de0-ac50-4645-9530-8be2db55c7a3", "66ee3ab7-0ec4-4f4c-995b-d33f58cab585"];
const ECRIRE = process.argv.includes("--ecrire");

const url = [process.env.SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_URL].find((v) =>
  /^https?:\/\//.test(v ?? ""),
);
if (!url || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("env Supabase absente");
const sb = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY);

/**
 * Chemins devinés — DERNIER RECOURS, quand l'accueil n'a pas pu être lu et
 * qu'il n'y a donc aucun lien à suivre. Sur les 49 fiches du 03/09, ils n'ont
 * rien trouvé à eux seuls : voir l'en-tête.
 */
const CHEMINS = ["/mentions-legales", "/mentions-legales/", "/mentions", "/legal", "/cgv"];

/** Ce qui, dans une URL ou un libellé de lien, annonce une page légale. */
const INDICE_LEGAL = /mention|legal|légal|cgv|cgu|informations?-?legales/i;

const lire = async (u: string): Promise<string> => {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 12000);
    const r = await fetch(u, { signal: ctl.signal, redirect: "follow", headers: { "user-agent": "Mozilla/5.0" } });
    clearTimeout(t);
    if (!r.ok) return "";
    const type = r.headers.get("content-type") ?? "";
    if (!type.includes("html") && !type.includes("text")) return "";
    return (await r.text()).slice(0, 400_000);
  } catch {
    return "";
  }
};

/**
 * Les liens légaux d'une page, absolus et dédoublonnés.
 *
 * On teste l'URL **et** le libellé : beaucoup de pieds de page écrivent
 * « Mentions légales » sur un `href="/page/12"` qui ne dit rien. Trois au plus,
 * dans l'ordre du document — le pied de page vient en dernier dans le HTML, et
 * c'est justement là qu'est le bon lien, donc on ne coupe pas au premier.
 */
const liensLegaux = (html: string, racine: URL): string[] => {
  const sorties = new Set<string>();
  const ancre = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]{0,120}?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = ancre.exec(html))) {
    const href = m[1];
    const libelle = m[2].replace(/<[^>]+>/g, " ");
    if (!INDICE_LEGAL.test(href) && !INDICE_LEGAL.test(libelle)) continue;
    if (/^(mailto:|tel:|javascript:|#)/i.test(href)) continue;
    try {
      const abs = new URL(href, racine);
      // Hors du site du prospect : un lien vers les CGV d'un fournisseur ne
      // porte pas SON identité, et l'y chercher écrirait le SIRET d'un tiers.
      if (abs.hostname !== racine.hostname) continue;
      abs.hash = "";
      sorties.add(abs.toString());
    } catch {
      // Un href illisible ne fait pas tomber la fiche.
    }
  }
  return [...sorties].slice(-3);
};

/**
 * Les identifiants candidats d'une page : SIRET à 14 chiffres, SIREN à 9.
 *
 * Le HTML sépare volontiers les chiffres (« 123 456 789 00012 ») : on lit donc
 * des groupes de chiffres séparés d'espaces ou de points, puis on recolle. Le
 * mot « SIRET », « SIREN » ou « RCS » doit être à moins de 120 caractères —
 * sans cette ancre, un numéro de téléphone international ou une référence
 * produit passent.
 *
 * Le SIREN passe en plus par `isValidSiren` (clé de Luhn). Pas le SIRET : il a
 * sa propre clé, et `normalizeSiret` la contrôle déjà.
 */
const identifiantsDeLaPage = (html: string): { sirets: string[]; sirens: string[] } => {
  const texte = html.replace(/<[^>]+>/g, " ").replace(/&nbsp;?/g, " ").replace(/\s+/g, " ");
  const sirets = new Set<string>();
  const sirens = new Set<string>();
  const ancre = /(SIRET|SIREN|R\.?C\.?S)/gi;
  let m: RegExpExecArray | null;
  while ((m = ancre.exec(texte))) {
    // Un « SIRET » ancre les deux longueurs (le SIREN en est le préfixe) ; un
    // « SIREN » ou « RCS » n'annonce que neuf chiffres.
    const fenetre = texte.slice(m.index, m.index + 120);
    for (const brut of fenetre.match(/[\d][\d .]{7,20}[\d]/g) ?? []) {
      const chiffres = brut.replace(/\D/g, "");
      if (chiffres.length === 14) {
        const s = normalizeSiret(chiffres);
        if (s) sirets.add(s);
      } else if (chiffres.length === 9 && isValidSiren(chiffres)) {
        const s = normalizeSiren(chiffres);
        if (s) sirens.add(s);
      }
    }
  }
  // Un SIREN déjà couvert par un SIRET trouvé n'apporte rien : le SIRET dit
  // l'établissement, le SIREN laisserait un choix à faire.
  for (const siret of sirets) sirens.delete(siret.slice(0, 9));
  return { sirets: [...sirets], sirens: [...sirens] };
};

async function main() {
  const { data } = await sb
    .from("entreprises")
    .select("id, name, ville, code_postal, adresse, site_web_canonique, canonical_url")
    .in("owner_id", OWNERS)
    .is("archived_at", null)
    .is("merged_into_id", null)
    .or("siret.is.null,siret.eq.")
    .order("id");

  type Ligne = {
    id: number;
    name: string | null;
    ville: string | null;
    code_postal: string | null;
    adresse: string | null;
    site_web_canonique: string | null;
    canonical_url: string | null;
  };
  const fiches = ((data ?? []) as Ligne[])
    .map((f) => ({
      id: f.id,
      nom: f.name ?? "",
      ville: f.ville,
      cp: f.code_postal,
      adresse: f.adresse,
      site: (f.site_web_canonique || f.canonical_url || "").trim(),
    }))
    .filter((f) => /^https?:\/\//.test(f.site) || /^[a-z0-9.-]+\.[a-z]{2,}/i.test(f.site));

  console.log(`${fiches.length} fiches sans SIRET avec un site`);
  let trouves = 0;
  let ecrits = 0;
  let injoignables = 0;

  for (const f of fiches) {
    const base = f.site.startsWith("http") ? f.site : `https://${f.site}`;
    let racine: URL;
    try {
      racine = new URL(base);
    } catch {
      continue;
    }

    // L'accueil d'abord : c'est lui qui porte le lien vers les mentions, et
    // parfois le numéro lui-même dans son pied de page.
    const accueil = await lire(base);
    if (!accueil) injoignables += 1;
    const pages = accueil
      ? liensLegaux(accueil, racine)
      : CHEMINS.map((c) => `${racine.origin}${c}`);

    const sirets = new Set<string>();
    const sirens = new Set<string>();
    const avaler = (html: string) => {
      const r = identifiantsDeLaPage(html);
      for (const s of r.sirets) sirets.add(s);
      for (const s of r.sirens) sirens.add(s);
    };
    if (accueil) avaler(accueil);
    for (const p of pages) {
      // Un SIRET suffit : il ne laisse aucun établissement à choisir.
      if (sirets.size > 0) break;
      const html = await lire(p);
      if (html) avaler(html);
    }
    if (sirets.size === 0 && sirens.size === 0) continue;

    trouves += 1;
    console.log(
      `  #${f.id} ${f.nom.slice(0, 40)} → ${[...sirets].join(", ")}${
        sirens.size > 0 ? ` (SIREN ${[...sirens].join(", ")})` : ""
      }`,
    );
    if (!ECRIRE) continue;

    // Les SIRET d'abord, puis les SIREN dépliés : du plus précis au moins.
    const aTenter: Array<{ siret: string; via: string }> = [...sirets].map((siret) => ({
      siret,
      via: "SIRET lu dans les mentions légales du site du prospect",
    }));
    for (const siren of sirens) {
      // `chercherCandidats` chemin 2 : il déplie le SIREN et classe ses
      // établissements. On ne prend QUE le premier — s'il y a un doute entre
      // deux établissements, c'est un choix humain, pas un choix de script.
      const candidats = await chercherCandidats({
        entreprise_id: f.id,
        name: f.nom,
        ville: f.ville,
        code_postal: f.cp,
        adresse: f.adresse,
        siren_connu: siren,
      });
      const premier = candidats[0]?.candidat.siret;
      if (premier) {
        aTenter.push({
          siret: premier,
          via: `SIREN ${siren} lu dans les mentions légales, établissement déplié au registre`,
        });
      }
    }

    for (const { siret, via } of aTenter) {
      // ⚠️ C'est ICI que le numéro devient une identité : `validerCandidat`
      // réinterroge l'annuaire, et refuse ce qu'il ne connaît pas.
      const r = await validerCandidat(sb, {
        entreprise_id: f.id,
        siret,
        decide_par: null,
        source: "recherche_web",
        commentaire: `${via}, puis vérifié au registre`,
      });
      if (r.ok) {
        ecrits += 1;
        console.log(`    ✔ ${siret}${r.avertissements.length ? "  ⚠ " + r.avertissements.join(" ; ") : ""}`);
        break;
      }
      console.log(`    ✖ ${siret} : ${r.erreur}`);
    }
  }
  console.log(
    `${trouves} fiche(s) portent un identifiant sur leur site, ${ecrits} écrit(s)` +
      ` — ${injoignables} site(s) injoignables`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
