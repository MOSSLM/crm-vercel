import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "planches";

/** Every board id in the subtree rooted at `rootId` (inclusive of the root). */
export async function collectBoardIds(
  supabase: SupabaseClient,
  rootId: string,
): Promise<string[]> {
  const all = [rootId];
  const queue = [rootId];
  while (queue.length) {
    const id = queue.shift();
    if (!id) break;
    const { data } = await supabase.from("planches").select("id").eq("parent_board_id", id);
    for (const row of data ?? []) {
      all.push(row.id as string);
      queue.push(row.id as string);
    }
  }
  return all;
}

/** Delete every uploaded object stored under the given boards' folders. */
export async function purgeBoardStorage(
  supabase: SupabaseClient,
  boardIds: string[],
): Promise<void> {
  for (const id of boardIds) {
    const { data } = await supabase.storage.from(BUCKET).list(id);
    if (data && data.length) {
      await supabase.storage.from(BUCKET).remove(data.map((obj) => `${id}/${obj.name}`));
    }
  }
}

/** Delete specific storage objects by their full paths. */
export async function removeStoragePaths(
  supabase: SupabaseClient,
  paths: string[],
): Promise<void> {
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
}
