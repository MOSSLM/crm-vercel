import { jsonError } from '@/app/api/_lib/respond'
import { isSchemaGap, migrationMessage } from '@/app/api/_lib/schema-gap'

import { ArchiveError } from './service'

/**
 * Traduction commune des échecs d'archivage en réponse HTTP, partagée par
 * `/api/archive` et `/api/agent/archive` (un fichier `route.ts` ne peut pas
 * exporter autre chose que ses handlers).
 */
export const ARCHIVE_MIGRATION_FILE = 'sql/20260809_archivage_motive_et_concurrents.sql'

const MIGRATION_503 = (cors: Record<string, string>) =>
  jsonError(
    migrationMessage(ARCHIVE_MIGRATION_FILE, 'L’archivage n’existe pas encore en base'),
    503,
    {},
    cors,
  )

/**
 * Une migration non jouée sort en 503 nommant le fichier SQL plutôt qu'en 500
 * opaque : les boards continuent de fonctionner sans archivage, et le message
 * dit quoi faire au lieu de laisser croire à un bug du code.
 */
export const archiveFailure = (e: unknown, cors: Record<string, string>): Response => {
  if (e instanceof ArchiveError) {
    if (isSchemaGap({ message: e.message })) return MIGRATION_503(cors)
    return jsonError(e.message, e.status, {}, cors)
  }
  const err = e as { code?: string; message?: string } | null
  if (isSchemaGap(err)) return MIGRATION_503(cors)
  return jsonError(err?.message ?? 'internal_error', 500, {}, cors)
}
