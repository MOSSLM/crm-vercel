/**
 * Un handler qui lit `body` DOIT déclarer son schéma. Sinon il lit `undefined`.
 *
 * ── LE BUG QUE CE TEST EMPÊCHE DE REVENIR ─────────────────────────────────
 * `withAuth` ne parse la requête que lorsqu'on lui passe `body:` :
 *
 *     if (opts.body) { … body = parsed.data }      // with-auth.ts
 *
 * Le paramètre de type générique, lui, ne fait que TYPER ce qu'on croit
 * recevoir — il ne déclenche aucune lecture. Écrire
 * `withAuth<CorpsCreation>({ role: 'admin' }, …)` compile, se relit très bien,
 * et rend `body === undefined` à chaque appel.
 *
 * Constaté le 20/08/2026 sur `POST /api/lissage/passes` : la route refusait
 * toute création en répondant « Une passe se nomme » à quelqu'un qui venait de
 * la nommer. Le symptôme accuse l'utilisateur, la cause est dans la signature —
 * c'est ce qui rend cette faute coûteuse à retrouver.
 *
 * On la cherche donc dans la SOURCE, et pas au cas par cas : un test par route
 * ne couvrirait que les routes auxquelles on a pensé, alors que la faute est
 * invisible à la relecture et peut naître dans n'importe quel fichier neuf.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const RACINE = join(process.cwd(), 'src/app/api')

function routes(dossier: string): string[] {
  const trouves: string[] = []
  for (const entree of readdirSync(dossier)) {
    const chemin = join(dossier, entree)
    if (statSync(chemin).isDirectory()) trouves.push(...routes(chemin))
    else if (entree === 'route.ts') trouves.push(chemin)
  }
  return trouves
}

/**
 * Les appels `withAuth(<options>, async ({ <arguments> }) => …)`.
 *
 * On lit les OPTIONS et les ARGUMENTS DÉSTRUCTURÉS, pas le corps du handler :
 * ce qui compte est de savoir si le handler s'est fait donner `body`, pas ce
 * qu'il en fait ensuite.
 */
const APPELS = /withAuth\s*(?:<[^>]*>)?\s*\(\s*(\{.*?\})\s*,\s*async\s*\(\s*\{([^}]*)\}/gs

describe('withAuth : lire `body` exige de déclarer son schéma', () => {
  const fichiers = routes(RACINE)

  it('trouve bien les routes à inspecter', () => {
    // Un test qui ne lit aucun fichier passerait en silence, et c'est
    // exactement le genre de garde-fou qui rassure sans rien garder.
    expect(fichiers.length).toBeGreaterThan(50)
  })

  it('aucun handler ne lit un `body` que personne n’a parsé', () => {
    const fautifs: string[] = []
    for (const fichier of fichiers) {
      const source = readFileSync(fichier, 'utf8')
      for (const appel of source.matchAll(APPELS)) {
        const [entier, options, args] = appel
        const litLeBody = /\bbody\b/.test(args)
        const declareLeSchema = /\bbody\s*:/.test(options)
        if (litLeBody && !declareLeSchema) {
          const ligne = source.slice(0, appel.index ?? 0).split('\n').length
          fautifs.push(`${fichier.replace(process.cwd() + '/', '')}:${ligne}`)
          void entier
        }
      }
    }
    expect(fautifs).toEqual([])
  })
})
