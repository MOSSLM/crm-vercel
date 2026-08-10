// types.ts — miroir de la réponse de /api/automations/week.
import type { WeekDay, WeekPlan, WeekSequenceSummary, WeekWave } from '@/lib/automations/week'

export type { WeekDay, WeekPlan, WeekSequenceSummary, WeekWave }

/** Un contact d'une vague, montré dans le panneau de détail. */
export interface WeekContactRow {
  enrollmentId: string
  contactId: string | null
  entrepriseId: number | null
  name: string
  company: string
}

export interface WeekView extends WeekPlan {
  /** Quelques contacts par vague — de quoi savoir à qui on parle. */
  contacts: Record<string, WeekContactRow[]>
  contactsSampleSize: number
}
