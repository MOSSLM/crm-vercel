/**
 * Les issues d'un appel du cockpit — un seul vocabulaire, pour trois lecteurs.
 *
 * POURQUOI CE FICHIER EXISTE
 * Ces six identifiants étaient écrits deux fois : dans `Cockpit.tsx` pour les
 * boutons, et recopiés dans `/api/telephony/cockpit/outcome` pour le libellé,
 * avec le commentaire « recopiées et non importées, sinon la route tire React
 * dans son bundle ». La gêne était réelle, la conclusion trop rapide : c'est une
 * TABLE, pas un composant — sortie du fichier client, elle s'importe des deux
 * côtés sans rien tirer du tout.
 *
 * Un troisième lecteur est arrivé depuis, et c'est lui qui rend la duplication
 * coûteuse : l'entonnoir de campagne compte « a répondu » en relisant
 * `email_logs.outcome`. Il connaissait le vocabulaire des séquences
 * (`STEP_OUTCOMES` : answered, lukewarm…) et ignorait celui-ci — donc un appel
 * conclu « RDV pris » au cockpit, la preuve la plus forte qu'on ait qu'un
 * prospect a parlé, ne comptait pas comme une réponse. Sur une campagne qui se
 * joue au téléphone, l'étage 3 serait resté quasi vide sans que rien ne cloche.
 *
 * LES DEUX VOCABULAIRES RESTENT DISTINCTS, ET C'EST VOULU. « Répondeur » et
 * « pas de réponse » sont deux choses différentes au téléphone et la même chose
 * dans une séquence écrite. On ne les fond pas ; on les fait lire ensemble.
 */

export type DispositionAppel = {
  id: string;
  label: string;
  /** Classe de teinte de la pastille (`dchip ${kind}`) — vocabulaire du skin. */
  kind: string;
  /**
   * Un humain a décroché et parlé. C'est ce qui fait de cette issue une preuve
   * de réponse pour l'entonnoir, au même titre qu'un `answered` de séquence.
   * Un répondeur ou une sonnerie dans le vide n'en sont pas : la ligne a été
   * composée, personne n'a répondu.
   */
  aParle: boolean;
};

export const DISPOSITIONS_APPEL: readonly DispositionAppel[] = [
  { id: "rdv", label: "RDV pris", kind: "magic", aParle: true },
  { id: "interesse", label: "Intéressé", kind: "ok", aParle: true },
  { id: "rappel", label: "À rappeler", kind: "warn", aParle: true },
  { id: "repondeur", label: "Répondeur", kind: "info", aParle: false },
  { id: "absent", label: "Pas de réponse", kind: "muted", aParle: false },
  // Un refus est une réponse : le prospect a écouté et a dit non. Le compter
  // comme un silence gonflerait la perte de l'étage précédent et masquerait la
  // vraie question — pourquoi ils disent non.
  { id: "refus", label: "Pas intéressé", kind: "danger", aParle: true },
];

/**
 * Le libellé d'une disposition, ou le code brut si elle est inconnue.
 *
 * Le repli est délibérément laid : une issue ajoutée à la table et pas encore
 * traduite doit se voir dans l'historique, pas disparaître.
 */
export const libelleDisposition = (id: string): string =>
  DISPOSITIONS_APPEL.find((d) => d.id === id)?.label ?? id;

/** Les issues d'appel qui prouvent qu'on a parlé à quelqu'un. */
export const DISPOSITIONS_REPONSE: readonly string[] = DISPOSITIONS_APPEL.filter(
  (d) => d.aParle,
).map((d) => d.id);
