/**
 * Tolerating a database whose schema lags the code.
 *
 * The site tables are built by ~85 hand-applied SQL migrations with no runner in
 * CI, so an environment regularly trails the code by a column or two. A single
 * missing column failed the whole select, which read as "site not found" and
 * became a bare 404 — one unapplied migration took every preview AND every
 * published site offline, with nothing on screen naming the cause.
 *
 * Kept out of site-resolver.ts so it can be tested without a Supabase client.
 */

/** Postgres `undefined_column`. */
export const UNDEFINED_COLUMN = "42703";

export interface PgErrorLike {
  code?: string;
  message: string;
}

/** "column sites.paywall_enabled does not exist" → "paywall_enabled" */
export function missingColumnFrom(message: string): string | null {
  return /column\s+(?:\w+\.)?"?(\w+)"?\s+does not exist/i.exec(message)?.[1] ?? null;
}

/**
 * Run a select, retrying without any column this environment doesn't have.
 *
 * Callers must read every optional field defensively (`?? default`), which the
 * resolvers already do — so dropping an absent column disables exactly one
 * feature instead of taking the whole page down.
 *
 * Each pass removes one named column, so this terminates in at most
 * `columns.length` passes. It also stops as soon as the error stops naming a
 * column we selected — e.g. a missing column used in a `.eq()` filter, which no
 * change to the select list can repair.
 */
export async function selectDroppingMissingColumns<T>(
  columns: readonly string[],
  run: (select: string) => PromiseLike<{ data: T | null; error: PgErrorLike | null }>,
): Promise<{ data: T | null; error: PgErrorLike | null; dropped: string[] }> {
  const remaining = [...columns];
  const dropped: string[] = [];

  for (;;) {
    const { data, error } = await run(remaining.join(", "));
    if (!error || error.code !== UNDEFINED_COLUMN) return { data, error, dropped };

    const missing = missingColumnFrom(error.message);
    const at = missing ? remaining.indexOf(missing) : -1;
    if (at < 0) return { data, error, dropped };

    remaining.splice(at, 1);
    dropped.push(missing as string);
    if (remaining.length === 0) return { data, error, dropped };
  }
}
