// DemObjections.ts — les objections courantes et leur réponse, pour la carte
// d'appel. Contenu fixe, au même titre que l'argumentaire
// (`src/lib/telephony/call-script.ts`) : ce n'est pas une donnée du prospect,
// c'est le discours commercial, le même pour tout le monde.

export const DEM_OBJECTIONS: { q: string; a: string }[] = [
  {
    q: "« J'ai déjà un site »",
    a: "Oui — et il ne vous ramène aucun appel. Regardez la démo à côté du vôtre sur votre téléphone, 30 secondes suffisent.",
  },
  {
    q: "« C'est trop cher »",
    a: "La démo et l'audit sont gratuits. On parle budget seulement si le rendu vous plaît.",
  },
  {
    q: "« Pas le temps »",
    a: "15 min en visio, je m'occupe des textes et des photos. Vous validez, on met en ligne sous 48 h.",
  },
  {
    q: "« Je vais voir avec mon neveu »",
    a: "Bien sûr. La différence, c'est le référencement local et la maintenance — c'est ce qui fait sonner le téléphone.",
  },
  {
    // Celle-ci manquait, et elle n'est pas « j'ai déjà un site » : un chantier
    // est EN COURS, avec quelqu'un. Attaquer le prestataire ferme la porte —
    // ce qui l'ouvre, c'est la date, parce qu'une date de mise en ligne qui
    // glisse est le moment où l'on redevient une option.
    q: "« Quelqu'un me refait déjà le site »",
    a: "Très bien, je ne vais pas vous vendre par-dessus. Juste : c'est prévu pour quand ? Si ça glisse, gardez mon numéro — la démo reste en ligne, elle ne vous engage à rien.",
  },
];
