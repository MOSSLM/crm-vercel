/**
 * Rendre le document d'audit hors du CRM, pour mesurer ce qu'il coupe.
 *
 * POURQUOI CE SCRIPT EXISTE. `.sheet` et `.half` portent tous deux
 * `overflow:hidden`, et la feuille de style le dit elle-même : ça fait
 * disparaître SANS RIEN SIGNALER tout bloc qui déborde. Le seul plafond en
 * amont est `MAX_LIGNES_AVANT_APRES = 3` ; rien ne borne les six cartes d'axes,
 * ni la longueur des intros, ni le nombre de livrables. Le symptôme n'apparaît
 * donc qu'au moment le plus coûteux : devant le prospect, sur le PDF enregistré
 * depuis la fenêtre d'impression.
 *
 * Le rendu étant une fonction pure `(contenu, mesures) => string`, il se joue
 * ici sans base, sans session et sans navigateur du CRM. On l'ouvre ensuite
 * dans un navigateur pour comparer, demi-page par demi-page, la hauteur du
 * contenu à celle de sa boîte — à l'écran ET aux dimensions d'impression.
 *
 *   npx ts-node -r tsconfig-paths/register \
 *     -O '{"module":"commonjs","moduleResolution":"node","jsx":"react-jsx","isolatedModules":false}' \
 *     scripts/audit/apercu-debordement.ts
 *
 * Le cas rendu est le PIRE cas réaliste, pas un cas moyen : six axes publiés
 * (Google a mesuré les quatre catégories, nos deux axes maison suivent), trois
 * lignes avant/après, un bandeau de constats supplémentaires. C'est exactement
 * ce que produira un dossier mesuré par PageSpeed — donc ce que le nouveau
 * barème rendra courant, et non exceptionnel.
 */

import { writeFileSync } from "fs";
import { getDefaultAuditContent } from "@/lib/audit/default-content";
import { corpsCompact } from "@/utils/audit/htmlCompact";
import { documentAudit } from "@/utils/audit/compactCss";
import { NOTE_DEMO, type MesuresAudit } from "@/lib/audit/mesures";
import type { AuditContent } from "@/types";

/** Un relevé complet, aux valeurs relevées sur des dossiers réels du parc. */
function mesuresPireCas(): MesuresAudit {
  return {
    url: "https://www.exemple-installateur.fr/",
    captureUrl: null,
    mesureLe: "2026-08-11T09:12:00.000Z",
    mesureParGoogle: true,
    injoignable: false,
    httpStatus: 200,
    noteGlobale: 35,
    noteBase: 42,
    noteMalus: [
      { libelle: "Vos avis clients n’apparaissent pas sur le site", points: 2 },
      { libelle: "Mentions légales absentes", points: 2 },
      { libelle: "Fiche d’entreprise non déclarée à Google", points: 1 },
      { libelle: "Votre ville n’apparaît pas dans le titre du site", points: 2 },
    ],
    libelle: "Faible",
    reperes: { prospect: 35, demo: NOTE_DEMO, mediane: 77, medianeN: 1313 },
    axes: [
      { id: "vitesse", nom: "Rapidité", note: 42, mesureGoogle: true, valeur: "8,4 s pour afficher le contenu principal", constats: [] },
      { id: "seo", nom: "Visibilité sur Google", note: 100, mesureGoogle: true, valeur: null, constats: [] },
      { id: "accessibilite", nom: "Accessibilité", note: 84, mesureGoogle: true, valeur: "Contrastes insuffisants sur 12 éléments", constats: [] },
      { id: "bonnes_pratiques", nom: "Bonnes pratiques", note: 73, mesureGoogle: true, valeur: "3 erreurs dans la console", constats: [] },
      { id: "conversion", nom: "Prise de contact", note: 63, mesureGoogle: false, valeur: "absents", constats: [] },
      { id: "popularite", nom: "Notoriété", note: 58, mesureGoogle: false, valeur: "détenue mais absente du site", constats: [] },
    ],
    axesNonTestes: [],
    constats: [
      { cle: "google:largest-contentful-paint", libelle: "Affichage du contenu principal", valeur: "8,4 s", seuil: "2,5 s" },
      { cle: "avis", libelle: "Avis clients affichés sur le site", valeur: "absents", seuil: null },
      { cle: "rge_affiche", libelle: "Qualification RGE mise en avant", valeur: "détenue mais absente du site", seuil: null },
      { cle: "jsonld", libelle: "Fiche entreprise structurée", valeur: "absente", seuil: null },
      { cle: "nap", libelle: "Nom, adresse et téléphone dans la page", valeur: "incomplets", seuil: null },
      { cle: "reseaux", libelle: "Liens vers vos réseaux sociaux", valeur: "0", seuil: "1" },
      { cle: "mentions", libelle: "Mentions légales", valeur: "absentes", seuil: null },
    ],
    observations: [],
  };
}

function contenuPireCas(): AuditContent {
  const c = getDefaultAuditContent({
    entreprise_nom: "Installations Thermiques du Val de Loire",
    entreprise_ville: "Saint-Cyr-sur-Loire",
    demo_url: "https://demo.samadigitalstudio.fr/itvl",
  });

  // Trois lignes avant/après, longueur haute mais plausible : c'est le maximum
  // que `MAX_LIGNES_AVANT_APRES` autorise, donc le cas qui doit tenir.
  c.page3.avant_apres = [
    {
      cle: "slow_site",
      avant: "8,4 s",
      apres: "moins d’une seconde",
      precision: "Pendant ces huit secondes, l’écran reste blanc : rien ne s’affiche encore.",
      reponse: "Un site servi en statique, images compressées et différées.",
    },
    {
      cle: "no_reviews_on_site",
      avant: "0 avis affiché",
      apres: "vos avis en page d’accueil",
      precision: "Vous avez 62 avis Google, aucun n’apparaît sur votre site.",
      reponse: "Vos meilleurs avis repris dès le premier écran, mis à jour tout seuls.",
    },
    {
      cle: "rge_not_highlighted",
      avant: "4 qualifications invisibles",
      apres: "vos logos RGE en évidence",
      precision: "Quatre qualifications Qualibat valides jusqu’en 2030, citées nulle part.",
      reponse: "Les logos officiels, avec leurs dates de validité, en page d’accueil.",
    },
  ];

  return c;
}

const html = documentAudit(
  "Audit — mesure de débordement",
  corpsCompact(contenuPireCas(), mesuresPireCas()),
  // On NE neutralise PAS `overflow:hidden` : on veut mesurer ce que le document
  // réel coupe, pas ce qu'il afficherait s'il ne coupait pas.
  { debordement: false },
);

const sortie = process.argv[2] ?? "/tmp/audit-pire-cas.html";
writeFileSync(sortie, html, "utf8");
console.log(sortie);
