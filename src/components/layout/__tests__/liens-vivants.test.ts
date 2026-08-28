/**
 * @jest-environment node
 */

/**
 * Aucun écran ne doit pointer sur une adresse qui n'existe pas.
 *
 * ── CE QUE CE TEST EMPÊCHE DE SE REPRODUIRE ──────────────────────────────
 * L'atelier proposait « Vue complète des lots » vers `/entreprises/lots`. Cette
 * adresse est celle de l'API ; l'écran, lui, est à `/prospection/lots`. Le lien
 * rendait un 404 et personne ne l'a vu : un lien mort ne casse rien, il perd
 * juste la sortie. `navigation-mobile.test.ts` tient déjà la même promesse pour
 * `spaces.ts` et la barre du bas — il ne voyait pas les liens écrits DANS les
 * composants, qui sont pourtant la majorité.
 *
 * ── POURQUOI UNE LECTURE DU TEXTE, ET PAS UN RENDU ───────────────────────
 * Monter cent cinquante écrans pour relever leurs liens demanderait autant de
 * mocks qu'il y a de contextes. On lit donc le SOURCE, et on n'y cherche que ce
 * qui est décidable sans l'exécuter : les chemins écrits en toutes lettres. Un
 * `href={`/entreprises/${id}`}` est ignoré — il n'est pas moins susceptible
 * d'être faux, mais un test qui prétendrait le vérifier mentirait.
 */

import fs from "fs";
import path from "path";

const RACINE = path.join(__dirname, "..", "..", "..");
const APP = path.join(RACINE, "app");

/**
 * Les chemins que Next sert, tels qu'il les compose : un dossier entre
 * parenthèses est un GROUPE, il structure le dépôt sans rien ajouter à l'URL.
 */
function routesDeclarees(): string[] {
  const routes: string[] = [];
  const parcourir = (dossier: string, segments: string[]) => {
    for (const e of fs.readdirSync(dossier, { withFileTypes: true })) {
      if (e.isDirectory()) {
        const groupe = e.name.startsWith("(") && e.name.endsWith(")");
        parcourir(path.join(dossier, e.name), groupe ? segments : [...segments, e.name]);
      } else if (e.name === "page.tsx" || e.name === "page.ts") {
        routes.push("/" + segments.join("/"));
      }
    }
  };
  parcourir(APP, []);
  return routes;
}

const ROUTES = routesDeclarees();

/** Un segment `[id]` accepte n'importe quoi ; un `[...reste]`, tout le reste. */
function adresseServie(href: string): boolean {
  const cible = (href.split("?")[0].split("#")[0] || "/").split("/").filter(Boolean);
  return ROUTES.some((route) => {
    const motif = route.split("/").filter(Boolean);
    const attrape = motif.findIndex((s) => s.startsWith("[..."));
    if (attrape >= 0) {
      return (
        cible.length >= attrape &&
        motif.slice(0, attrape).every((s, i) => s.startsWith("[") || s === cible[i])
      );
    }
    return (
      motif.length === cible.length &&
      motif.every((s, i) => s.startsWith("[") || s === cible[i])
    );
  });
}

/**
 * Les trois façons de nommer une destination dans ce dépôt : un `href`, une
 * poussée du routeur, une redirection serveur. Les gabarits (`${…}`) sont hors
 * de portée et sont donc exclus par la classe de caractères.
 */
const NAVIGATIONS = /(?:href=|router\.(?:push|replace)\(|redirect\()\s*\{?\s*["'](\/[^"'${}\s]*)["']/g;

function fichiersDEcran(): string[] {
  const trouves: string[] = [];
  const parcourir = (dossier: string) => {
    for (const e of fs.readdirSync(dossier, { withFileTypes: true })) {
      const complet = path.join(dossier, e.name);
      if (e.isDirectory()) {
        if (e.name !== "__tests__") parcourir(complet);
      } else if (e.name.endsWith(".tsx")) {
        trouves.push(complet);
      }
    }
  };
  parcourir(APP);
  parcourir(path.join(RACINE, "components"));
  return trouves;
}

/**
 * DEUX COMPOSANTS ORPHELINS, ET C'EST LA DETTE QU'ILS SIGNALENT.
 *
 * `WorkflowsPage` et `WorkflowEditor` pointent sur `/workflows`, une adresse qui
 * n'a jamais existé dans ce dépôt — les workflows vivent sous `/automations`.
 * Rien ne les monte : aucun fichier ne les importe. Ils sont donc listés ici
 * plutôt que corrigés, parce que la bonne correction n'est pas de réparer leurs
 * liens mais de décider s'ils doivent rester.
 *
 * Cette liste est un CONSTAT daté, pas une soupape : y ajouter un fichier pour
 * faire passer le test reviendrait à publier un lien mort en connaissance de
 * cause. Un écran vivant n'y entre pas.
 */
const ORPHELINS = ["components/WorkflowsPage.tsx", "components/WorkflowEditor.tsx"];

describe("les liens écrits dans les écrans", () => {
  it("connaît les routes du dépôt", () => {
    // Garde-fou du garde-fou : si le parcours de `app/` rendait une liste vide,
    // tout le reste passerait au vert en ne vérifiant rien.
    expect(ROUTES.length).toBeGreaterThan(100);
    expect(ROUTES).toContain("/prospection/lots");
    expect(ROUTES).toContain("/entreprises/explorateur");
  });

  it("ne mène jamais sur une adresse que Next ne sert pas", () => {
    const morts: string[] = [];
    let releves = 0;

    for (const fichier of fichiersDEcran()) {
      const court = path.relative(RACINE, fichier).split(path.sep).join("/");
      if (ORPHELINS.includes(court)) continue;
      const source = fs.readFileSync(fichier, "utf8");
      for (const m of source.matchAll(NAVIGATIONS)) {
        releves += 1;
        if (!adresseServie(m[1])) morts.push(`${court} → ${m[1]}`);
      }
    }

    // Sans ce compte, une expression rationnelle cassée rendrait zéro lien mort
    // en n'ayant rien lu — le vert le plus trompeur qui soit.
    expect(releves).toBeGreaterThan(100);
    expect(morts).toEqual([]);
  });

  it("reconnaît un chemin dynamique, et refuse ce qui n'existe pas", () => {
    expect(adresseServie("/prospection/lots/12")).toBe(true);
    expect(adresseServie("/prospection/lots?tri=nom")).toBe(true);
    expect(adresseServie("/entreprises/lots")).toBe(false); // le chemin de l'API
    expect(adresseServie("/prospection/lots/12/quelque-chose")).toBe(false);
  });
});
