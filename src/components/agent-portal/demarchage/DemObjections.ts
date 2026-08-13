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
];
