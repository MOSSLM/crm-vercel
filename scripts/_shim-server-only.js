/**
 * Rendre les modules `server-only` importables par un script.
 *
 * `import "server-only"` est une convention Next : le paquet n'expose sa
 * résolution que sous la condition `react-server`, et Node seul ne le trouve
 * pas. Les scripts de `scripts/audit/` réutilisent volontairement le code de
 * production — c'est ce qui garantit qu'un PDF sorte identique à l'aperçu — et
 * ils traversent donc ces gardes, dont la raison d'être (ne pas partir dans un
 * bundle navigateur) ne les concerne pas.
 *
 * On remplace la résolution plutôt que le contenu : le fichier de production
 * garde son garde-fou, intact, pour le seul contexte où il sert.
 */
const Module = require("module");
const resolutionOrigine = Module._resolveFilename;

Module._resolveFilename = function (requete, ...reste) {
  if (requete === "server-only" || requete === "client-only") {
    return require.resolve("./_vide.js");
  }
  return resolutionOrigine.call(this, requete, ...reste);
};
