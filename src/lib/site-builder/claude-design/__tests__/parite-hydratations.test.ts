import { readFileSync } from "fs";
import { join } from "path";

/**
 * LES DEUX RENDUS DOIVENT HYDRATER LA MÊME CHOSE.
 *
 * Un design Claude est rendu à deux endroits : `LibrarySectionInline` (le site
 * PUBLIÉ, celui que le prospect ouvre) et `InlinePreview` (l'aperçu de
 * l'éditeur, celui que l'agent regarde avant d'envoyer). Chacun applique sa
 * propre chaîne d'hydratations, à la main, dans son propre fichier — et rien,
 * jusqu'ici, ne les tenait ensemble.
 *
 * LA DIVERGENCE S'EST PRODUITE DEUX FOIS, dans les deux sens :
 *
 *   - les certifications : l'aperçu réparait, le site publié gardait les logos
 *     du gabarit. Le site en ligne attribuait au client des qualifications
 *     qu'il n'a pas ;
 *   - le logo : le site publié composait la signature typographique, l'aperçu
 *     montrait encore l'image cassée du `src=""`. L'agent corrige alors à la
 *     main un défaut qui n'existe pas, ou tient la démo pour inutilisable.
 *
 *  Aucune des deux ne casse quoi que ce soit : les tests des modules passent,
 * chaque fichier se relit très bien seul. Elles ne se voient qu'en comparant
 * deux fichiers que personne n'ouvre en même temps. D'où cette vérification
 * mécanique : ajouter une hydratation à un rendu et pas à l'autre échoue ici,
 * avant de partir chez un prospect.
 *
 * Ce test ne prouve pas que l'ORDRE est le même — il ne lit que les imports.
 * C'est délibérément grossier : il attrape l'oubli complet, qui est le mode de
 * panne observé, sans prétendre relire la chaîne à la place d'un humain.
 */

const RACINE = process.cwd();
const PUBLIE = join(RACINE, "src/components/site-builder/LibrarySectionInline.tsx");
const APERCU = join(RACINE, "src/components/site-builder/claude-design/InlinePreview.tsx");

/**
 * Les modules qui RÉÉCRIVENT LE MARKUP en fonction de l'entreprise. Chacun
 * change ce que le prospect lit : ce que le site affirme de lui, ou ce qu'il
 * montre à la place de ce qui manque.
 *
 * Les modules qui n'en sont pas — polices, tampons de chemins, thème, runtime —
 * n'ont rien à faire ici : ils servent une seule des deux surfaces sans que ça
 * mente à personne.
 */
const HYDRATATIONS: Record<string, string> = {
  "condition-service-markup": "retire les régions des métiers que l'entreprise n'exerce pas",
  "hydrate-logo": "le vrai logo, ou la signature composée avec le nom",
  "hydrate-reviews": "les avis du client à la place de ceux du gabarit",
  "corriger-liens-avis": "le lien vers SA fiche Google, pas une recherche générique",
  "hydrate-stats": "les chiffres clés",
  "certifications-from-variables": "les qualifications RGE vérifiées, et le retrait du bloc sans elles",
};

/**
 * Les asymétries légitimes, avec leur raison. Une exemption se justifie, sinon
 * « ça ne passait pas » suffirait à en ajouter une.
 */
const ASYMETRIES: Record<string, string> = {
  "resolve-image-sets":
    "publié seulement : l'aperçu résout les jeux d'images DANS l'iframe, à partir des tags passés en JSON, pour que changer de service se voie sans re-rendre côté serveur",
};

const source = (chemin: string): string => readFileSync(chemin, "utf8");

describe("parité des hydratations entre le rendu publié et l'aperçu", () => {
  const publie = source(PUBLIE);
  const apercu = source(APERCU);

  // `module` serait le nom naturel, et il est INTERDIT : la règle
  // `@next/next/no-assign-module-variable` fait échouer le build de production
  // sur toute liaison portant ce nom, y compris dans un test — Jest, lui, ne
  // dit rien. C'est ce qui a cassé quatre déploiements d'affilée.
  for (const [hydratation, role] of Object.entries(HYDRATATIONS)) {
    it(`${hydratation} — ${role}`, () => {
      const chemin = `claude-design/${hydratation}`;
      expect(publie.includes(chemin)).toBe(true);
      expect(apercu.includes(chemin)).toBe(true);
    });
  }

  it("les asymétries connues sont celles qu'on a écrites", () => {
    // Le sens du test : une exemption doit rester vraie. Si `resolve-image-sets`
    // arrive un jour dans l'aperçu, la ligne qui l'excuse doit partir avec.
    for (const hydratation of Object.keys(ASYMETRIES)) {
      expect(publie.includes(`claude-design/${hydratation}`)).toBe(true);
      expect(apercu.includes(`claude-design/${hydratation}`)).toBe(false);
    }
  });

  it("aucune hydratation n'est à la fois listée et exemptée", () => {
    for (const hydratation of Object.keys(ASYMETRIES)) {
      expect(HYDRATATIONS[hydratation]).toBeUndefined();
    }
  });
});
