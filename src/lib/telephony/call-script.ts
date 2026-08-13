/**
 * L'argumentaire pas-à-pas d'un appel à froid — partagé entre le cockpit
 * d'appel (`Cockpit.tsx`) et la carte d'action du poste de travail Démarchage
 * (`StageActionCard.tsx`), pour que les deux montrent le même discours au
 * lieu de deux copies qui pourraient diverger.
 *
 * `{org}`/`{ville}` sont remplacés au rendu par le nom de l'entreprise et sa
 * ville — voir l'usage dans les deux composants.
 */
export const SCRIPT_STEPS = [
  { title: "Accroche", body: "Bonjour {org}, je vous appelle car j'ai vu votre présence en ligne — 30 secondes ?" },
  { title: "Découverte", body: "Comment gérez-vous aujourd'hui vos demandes entrantes / votre site ?" },
  { title: "Valeur", body: "On aide les entreprises de {ville} à convertir plus, sans effort de leur côté." },
  { title: "Closing RDV", body: "Je vous propose un point de 15 min cette semaine — plutôt mardi ou jeudi ?" },
];
