/**
 * A tiny, pure undo/redo history for the Claude Design editor. A snapshot is the
 * whole editable state (every page's inline overrides + the theme tweaks), so an
 * undo restores the design exactly — even across pages. Cursor-based: `stack[cursor]`
 * is always the present; editing truncates any redo future, undo/redo just move
 * the cursor.
 *
 * Consecutive edits that share a `tag` coalesce into a single step (e.g. dragging
 * the same tweak), so one Ctrl+Z doesn't unwind a dozen micro-changes. Discrete
 * edits (image picks, deletes) pass no tag and always get their own step. Same
 * shape as the Relume builder's history (RelumeBuilderProvider `pushHistory`),
 * kept framework-free here so it can be unit-tested in isolation.
 */

export interface DesignSnapshot {
  /** instanceId → that page's `__overrides` map. Values are opaque here. */
  overrides: Record<string, Record<string, unknown>>;
  /** The site's theme tweaks. */
  tweaks: Record<string, unknown>;
  /** Coalescing tag: consecutive snapshots sharing it collapse into one step. */
  _tag?: string;
}

export interface History {
  stack: DesignSnapshot[];
  cursor: number;
}

/** Max retained steps; older ones are dropped so the stack can't grow unbounded. */
export const HISTORY_DEPTH = 100;

/** A fresh history whose only (present) entry is `snapshot`. */
export function initHistory(snapshot: DesignSnapshot): History {
  return { stack: [{ ...snapshot, _tag: undefined }], cursor: 0 };
}

/**
 * Records `snapshot` as the new present. Drops any redo future, coalesces with
 * the current entry when `tag` matches (replace, don't stack), and bounds depth.
 */
export function pushSnapshot(history: History, snapshot: DesignSnapshot, tag?: string): History {
  const base = history.stack.slice(0, history.cursor + 1);
  const currentTop = base[base.length - 1];
  const entry: DesignSnapshot = { ...snapshot, _tag: tag };

  let stack: DesignSnapshot[];
  if (tag !== undefined && currentTop && currentTop._tag === tag) {
    stack = [...base.slice(0, -1), entry]; // coalesce onto the current present
  } else {
    stack = [...base, entry];
  }
  if (stack.length > HISTORY_DEPTH) stack = stack.slice(stack.length - HISTORY_DEPTH);
  return { stack, cursor: stack.length - 1 };
}

export function canUndo(history: History): boolean {
  return history.cursor > 0;
}

export function canRedo(history: History): boolean {
  return history.cursor < history.stack.length - 1;
}

/** Present snapshot, or null on an empty history. */
export function currentSnapshot(history: History): DesignSnapshot | null {
  return history.stack[history.cursor] ?? null;
}

/** Moves the cursor back one step (no-op at the start). */
export function undo(history: History): History {
  return canUndo(history) ? { ...history, cursor: history.cursor - 1 } : history;
}

/** Moves the cursor forward one step (no-op at the end). */
export function redo(history: History): History {
  return canRedo(history) ? { ...history, cursor: history.cursor + 1 } : history;
}
