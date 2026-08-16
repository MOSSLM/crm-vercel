/**
 * Les cinq couleurs de la marque, dans un module PUR.
 *
 * POURQUOI ELLES NE VIVENT PLUS DANS `AuditShared.tsx`. Ce fichier-là porte
 * `'use client'`. Tant que le document d'audit n'était fabriqué que dans le
 * navigateur — l'éditeur est un composant client, et l'export PDF ouvre une
 * fenêtre — personne ne s'en apercevait. La plaquette, elle, est rendue CÔTÉ
 * SERVEUR : sur ce chemin, importer une valeur depuis un module client ne rend
 * pas la valeur mais une référence client, dont les propriétés valent
 * `undefined`.
 *
 * Le symptôme était muet et différé. `compactCss.ts` calcule ses trois triplets
 * RGB à l'ÉVALUATION du module :
 *
 *     const NUIT = rgb(C.nuit);
 *
 * `rgb` fait un `.replace('#','')`, donc l'import lui-même levait
 * « Cannot read properties of undefined (reading 'replace') » — sans nommer ni
 * la couleur, ni le fichier, ni la vraie cause. Le build de production tombait
 * sur « Failed to collect page data for /plaquette/[jeton] », quatre
 * déploiements de suite, alors que les 3068 tests passaient : Jest n'applique
 * pas la frontière client/serveur, il voit un objet ordinaire.
 *
 * RÈGLE À RETENIR : tout ce qu'un rendu serveur consomme doit vivre dans un
 * module sans `'use client'` et sans React. `AuditShared.tsx` réexporte ces
 * constantes, donc les composants qui les lisaient continuent de marcher et il
 * n'y a toujours qu'une seule source pour les couleurs.
 */

/** Les tokens de marque du document d'audit et de la plaquette. */
export const C = {
  nuit: '#0A1B33',
  azur: '#2F7AE0',
  brume: '#B5D0F0',
  creme: '#F7FAFD',
  blanc: '#E8F3FF',
};

/** Le tracé de l'étoile SAMA, en une seule copie. */
export const LOGO_PATH =
  "M50,4 L55.85,20.58 L67.6,7.5 L66.67,25.06 L82.5,17.5 L74.95,33.33 L92.5,32.4 L79.42,44.15 L96,50 L79.42,55.85 L92.5,67.6 L74.95,66.67 L82.5,82.5 L66.67,74.94 L67.6,92.5 L55.85,79.42 L50,96 L44.15,79.42 L32.4,92.5 L33.33,74.94 L17.5,82.5 L25.05,66.67 L7.5,67.6 L20.58,55.85 L4,50 L20.58,44.15 L7.5,32.4 L25.05,33.33 L17.5,17.5 L33.33,25.06 L32.4,7.5 L44.15,20.58 Z M50,36 A14,14 0 1 0 50,64 A14,14 0 1 0 50,36 Z";
