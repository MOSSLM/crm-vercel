import {
  initHistory,
  pushSnapshot,
  undo,
  redo,
  canUndo,
  canRedo,
  currentSnapshot,
  HISTORY_DEPTH,
  type DesignSnapshot,
} from "../override-history";

const snap = (label: string): DesignSnapshot => ({
  overrides: { inst1: { "0.0:image": { kind: "image", value: label } } },
  tweaks: {},
});

describe("override-history", () => {
  it("starts with a single present entry and nothing to undo/redo", () => {
    const h = initHistory(snap("a"));
    expect(h.cursor).toBe(0);
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(false);
    expect(currentSnapshot(h)?.overrides.inst1["0.0:image"]).toEqual({ kind: "image", value: "a" });
  });

  it("pushes discrete steps and walks back/forward through them", () => {
    let h = initHistory(snap("a"));
    h = pushSnapshot(h, snap("b"));
    h = pushSnapshot(h, snap("c"));
    expect(h.stack).toHaveLength(3);
    expect(canUndo(h)).toBe(true);

    h = undo(h);
    expect(currentSnapshot(h)?.overrides.inst1["0.0:image"]).toMatchObject({ value: "b" });
    h = undo(h);
    expect(currentSnapshot(h)?.overrides.inst1["0.0:image"]).toMatchObject({ value: "a" });
    expect(canUndo(h)).toBe(false);

    h = redo(h);
    expect(currentSnapshot(h)?.overrides.inst1["0.0:image"]).toMatchObject({ value: "b" });
  });

  it("undo/redo are no-ops at the ends", () => {
    let h = initHistory(snap("a"));
    expect(undo(h)).toBe(h); // already at start
    h = pushSnapshot(h, snap("b"));
    expect(redo(h)).toBe(h); // already at end
  });

  it("truncates the redo future when a new edit follows an undo", () => {
    let h = initHistory(snap("a"));
    h = pushSnapshot(h, snap("b"));
    h = pushSnapshot(h, snap("c"));
    h = undo(h); // back to b, future = [c]
    expect(canRedo(h)).toBe(true);
    h = pushSnapshot(h, snap("d")); // new branch drops c
    expect(canRedo(h)).toBe(false);
    expect(h.stack.map((s) => s.overrides.inst1["0.0:image"])).toMatchObject([
      { value: "a" }, { value: "b" }, { value: "d" },
    ]);
  });

  it("coalesces consecutive edits that share a tag into one step", () => {
    let h = initHistory(snap("a"));
    h = pushSnapshot(h, snap("b1"), "tweak:accent");
    h = pushSnapshot(h, snap("b2"), "tweak:accent");
    h = pushSnapshot(h, snap("b3"), "tweak:accent");
    // a + one coalesced tweak entry = 2 steps, present is the latest value.
    expect(h.stack).toHaveLength(2);
    expect(currentSnapshot(h)?.overrides.inst1["0.0:image"]).toMatchObject({ value: "b3" });
    h = undo(h);
    expect(currentSnapshot(h)?.overrides.inst1["0.0:image"]).toMatchObject({ value: "a" });
  });

  it("does not coalesce across different tags or untagged edits", () => {
    let h = initHistory(snap("a"));
    h = pushSnapshot(h, snap("b"), "tweak:accent");
    h = pushSnapshot(h, snap("c"), "tweak:police"); // different tag → new step
    h = pushSnapshot(h, snap("d")); // untagged → new step
    expect(h.stack).toHaveLength(4);
  });

  it("bounds the stack depth, dropping the oldest entries", () => {
    let h = initHistory(snap("0"));
    for (let i = 1; i < HISTORY_DEPTH + 20; i++) h = pushSnapshot(h, snap(String(i)));
    expect(h.stack).toHaveLength(HISTORY_DEPTH);
    expect(h.cursor).toBe(HISTORY_DEPTH - 1);
    // newest is preserved; oldest ("0") has been dropped.
    expect(currentSnapshot(h)?.overrides.inst1["0.0:image"]).toMatchObject({
      value: String(HISTORY_DEPTH + 19),
    });
    expect(h.stack[0].overrides.inst1["0.0:image"]).not.toMatchObject({ value: "0" });
  });
});
