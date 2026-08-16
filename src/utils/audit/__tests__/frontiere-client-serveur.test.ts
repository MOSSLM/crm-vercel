import fs from "fs";
import path from "path";

/**
 * AUCUN MODULE RENDU CÔTÉ SERVEUR NE DOIT IMPORTER D'UN MODULE `'use client'`.
 *
 * L'INCIDENT QUE CE TEST REJOUE. `compactCss.ts` lisait la palette dans
 * `AuditShared.tsx`, qui porte `'use client'`. Tant que le document d'audit
 * n'était fabriqué que dans le navigateur, personne ne s'en apercevait. La
 * plaquette est rendue côté serveur : sur ce chemin, importer une valeur depuis
 * un module client rend une RÉFÉRENCE client, dont les propriétés valent
 * `undefined`. Et `compactCss` calcule ses triplets RGB à l'évaluation du
 * module — `rgb(C.nuit)` faisait donc un `.replace` sur `undefined`.
 *
 * Ce qui rend ce test nécessaire plutôt que superflu : RIEN d'autre ne l'attrape.
 * Jest n'applique pas la frontière client/serveur — il voit un objet ordinaire,
 * et les 3068 tests passaient. `tsc` ne la voit pas non plus : les types sont
 * corrects des deux côtés. Seul `next build` la voit, et il l'annonce par
 * « Failed to collect page data », sans nommer ni le fichier ni la cause. Quatre
 * déploiements de production sont tombés dessus.
 *
 * On vérifie les imports RELATIFS et les alias `@/` de premier niveau : c'est
 * là que le défaut se produit, et remonter tout le graphe transitif coûterait
 * plus qu'il ne rapporte.
 */

const RACINE = path.join(__dirname, "..", "..", "..");

/**
 * Les modules qu'un rendu serveur évalue. La plaquette est servie par deux
 * pages serveur (`/plaquette` et `/plaquette/{jeton}`) et tire tout ce graphe.
 */
const MODULES_SERVEUR = [
  "utils/audit/palette.ts",
  "utils/audit/compactCss.ts",
  "utils/audit/htmlCompact.ts",
  "utils/audit/htmlShared.ts",
  "utils/audit/htmlMobile.ts",
  "utils/audit/mobileCss.ts",
  "lib/audit/plaquette.ts",
  "lib/audit/plaquette-lien.ts",
  "lib/audit/default-content.ts",
  "lib/audit/offres-audit.ts",
  "lib/audit/mesures.ts",
];

const lire = (relatif: string): string => fs.readFileSync(path.join(RACINE, relatif), "utf8");

/** Les chemins importés par ce fichier, alias `@/` et relatifs confondus. */
function importsDe(source: string): string[] {
  const chemins: string[] = [];
  const motif = /(?:^|\n)\s*(?:import|export)\b[^;]*?from\s+['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = motif.exec(source)) !== null) chemins.push(m[1]);
  return chemins;
}

/** Le fichier visé par un import, ou null quand il sort de `src/`. */
function resoudre(depuis: string, specificateur: string): string | null {
  let base: string;
  if (specificateur.startsWith("@/")) base = path.join(RACINE, specificateur.slice(2));
  else if (specificateur.startsWith(".")) base = path.join(RACINE, path.dirname(depuis), specificateur);
  else return null; // paquet npm

  for (const suffixe of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    const candidat = `${base}${suffixe}`;
    if (fs.existsSync(candidat)) return candidat;
  }
  return null;
}

const estClient = (fichier: string): boolean =>
  /^\s*['"]use client['"]/.test(fs.readFileSync(fichier, "utf8"));

describe("la frontière client / serveur du document d'audit", () => {
  for (const relatif of MODULES_SERVEUR) {
    it(`${relatif} n'importe rien d'un module « use client »`, () => {
      const source = lire(relatif);
      const fautifs = importsDe(source)
        .map((spec) => ({ spec, fichier: resoudre(relatif, spec) }))
        .filter((x) => x.fichier !== null && estClient(x.fichier))
        .map((x) => x.spec);

      // Le message porte la correction, pas seulement le constat : sans elle on
      // relit le fichier en cherchant ce qui cloche, et rien n'y paraît.
      expect(fautifs).toEqual([]);
    });
  }

  it("lui-même ne se trompe pas : AuditShared EST bien un module client", () => {
    // Si ce test tombe, c'est la sonde qui est cassée, pas le code : sans un
    // module client réel à détecter, tous les autres passeraient à vide.
    expect(estClient(path.join(RACINE, "components/audit/AuditShared.tsx"))).toBe(true);
  });

  it("la palette reste la seule définition des cinq couleurs", () => {
    // `AuditShared` réexporte plutôt que redéfinir : deux définitions
    // divergeraient à la première retouche de charte, et le document sortirait
    // dans deux bleus différents selon la page qui le rend.
    const partage = lire("components/audit/AuditShared.tsx");
    expect(partage).not.toMatch(/export const C = \{/);
    expect(partage).toContain("@/utils/audit/palette");
  });
});
