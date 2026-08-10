/**
 * @jest-environment node
 */
// Les étapes du pipeline marketing sont décrites DEUX fois : côté serveur pour
// le calcul d'avancement (`agent-progress.ts`) et côté écran pour la matrice
// (`PipelineMatrix.tsx`). Le docstring d'`agent-progress.ts` assume ce
// copier-coller ; rien ne le gardait. Une teinte changée d'un seul côté, et la
// barre de progression de l'agent ne parle plus la même langue que la colonne
// qu'elle résume.
import { MARKETING_STAGES } from '../agent-progress'
import { STAGES } from '@/components/marketing-pipeline/PipelineMatrix'

describe('étapes du pipeline marketing', () => {
  it('portent les mêmes identifiants, libellés et couleurs des deux côtés', () => {
    const byId = new Map(STAGES.map((s) => [s.id, s]))

    for (const stage of MARKETING_STAGES) {
      const twin = byId.get(stage.id)
      expect(twin).toBeDefined()
      expect({ id: stage.id, label: stage.label, color: stage.color }).toEqual({
        id: twin!.id,
        label: twin!.name,
        color: twin!.color,
      })
    }
  })

  it('couvrent toutes les colonnes de la matrice sauf l’attribution', () => {
    // `attribution` est une colonne de la matrice, pas une étape d'avancement :
    // elle mesure qui prend l'entreprise, pas ce qui a été produit.
    const matrixIds = STAGES.map((s) => s.id).filter((id) => id !== 'attribution')
    expect(MARKETING_STAGES.map((s) => s.id)).toEqual(matrixIds)
  })
})
