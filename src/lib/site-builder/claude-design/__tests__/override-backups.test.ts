import {
  pushBackup,
  readBackups,
  previousTokenHtml,
  nextExampleData,
  BACKUPS_KEY,
  PREV_HTML_KEY,
} from "../override-backups";

const overrides = { "0.1:image": { kind: "image", value: "A" } };

function backup(at: string, over = overrides) {
  return { at, reason: "import-pages", overrides: over };
}

describe("pushBackup / readBackups", () => {
  it("stacks newest first and caps the window", () => {
    let content: Record<string, unknown> = { __library: { section_id: "d-1" } };
    for (const at of ["1", "2", "3", "4", "5", "6"]) content = pushBackup(content, backup(at), 5);
    const list = readBackups(content);
    expect(list.map((b) => b.at)).toEqual(["6", "5", "4", "3", "2"]);
    // Untouched keys survive.
    expect(content.__library).toEqual({ section_id: "d-1" });
  });

  it("does not record an empty backup, which would evict a real one", () => {
    const content = pushBackup({}, backup("1"));
    const same = pushBackup(content, backup("2", {}));
    expect(readBackups(same).map((b) => b.at)).toEqual(["1"]);
  });

  it("tolerates missing or malformed stored backups", () => {
    expect(readBackups(null)).toEqual([]);
    expect(readBackups({})).toEqual([]);
    expect(readBackups({ [BACKUPS_KEY]: "nope" })).toEqual([]);
    expect(readBackups({ [BACKUPS_KEY]: [null, { at: 1 }, backup("ok")] }).map((b) => b.at)).toEqual(["ok"]);
  });
});

describe("nextExampleData", () => {
  it("merges over the previous data so other passes' keys survive", () => {
    const merged = nextExampleData(
      { __source_html: "OLD", __token_html: "OLD_T", __var_mapping: { "[Ville]": "entreprise.ville" } },
      { __source_html: "NEW", __token_html: "NEW_T", __page_js: "" },
      "OLD_T",
    );
    expect(merged.__var_mapping).toEqual({ "[Ville]": "entreprise.ville" });
    expect(merged.__token_html).toBe("NEW_T");
    expect(merged[PREV_HTML_KEY]).toBe("OLD_T");
  });

  it("keeps the last recorded markup when there is nothing to replace", () => {
    const merged = nextExampleData({ [PREV_HTML_KEY]: "KEEP" }, { __token_html: "NEW" }, null);
    expect(merged[PREV_HTML_KEY]).toBe("KEEP");
  });
});

describe("previousTokenHtml", () => {
  it("only reports a usable markup", () => {
    expect(previousTokenHtml({ [PREV_HTML_KEY]: "<div/>" })).toBe("<div/>");
    expect(previousTokenHtml({ [PREV_HTML_KEY]: "" })).toBeNull();
    expect(previousTokenHtml({})).toBeNull();
    expect(previousTokenHtml(null)).toBeNull();
  });
});
