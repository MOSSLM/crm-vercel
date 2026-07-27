import {
  missingColumnFrom,
  selectDroppingMissingColumns,
  UNDEFINED_COLUMN,
} from "../schema-drift";

const undefinedColumn = (column: string) => ({
  code: UNDEFINED_COLUMN,
  message: `column sites.${column} does not exist`,
});

describe("missingColumnFrom", () => {
  it("reads the column name out of a Postgres 42703 message", () => {
    // The exact message that took every preview and every published site down.
    expect(missingColumnFrom("column sites.paywall_enabled does not exist")).toBe(
      "paywall_enabled",
    );
    expect(missingColumnFrom("column booking_url does not exist")).toBe("booking_url");
    expect(missingColumnFrom('column "client_brief" does not exist')).toBe("client_brief");
  });

  it("returns null when the message names no column", () => {
    expect(missingColumnFrom("permission denied for table sites")).toBeNull();
    expect(missingColumnFrom("")).toBeNull();
  });
});

describe("selectDroppingMissingColumns", () => {
  const COLUMNS = ["id", "name", "paywall_enabled", "booking_url"] as const;

  it("passes the full column list through when the schema is up to date", async () => {
    const seen: string[] = [];
    const res = await selectDroppingMissingColumns(COLUMNS, (select) => {
      seen.push(select);
      return Promise.resolve({ data: { id: "s1" }, error: null });
    });

    expect(seen).toEqual(["id, name, paywall_enabled, booking_url"]);
    expect(res.dropped).toEqual([]);
    expect(res.data).toEqual({ id: "s1" });
  });

  it("retries without a column the database doesn't have", async () => {
    const seen: string[] = [];
    const res = await selectDroppingMissingColumns(COLUMNS, (select) => {
      seen.push(select);
      return Promise.resolve(
        select.includes("paywall_enabled")
          ? { data: null, error: undefinedColumn("paywall_enabled") }
          : { data: { id: "s1" }, error: null },
      );
    });

    expect(seen).toEqual([
      "id, name, paywall_enabled, booking_url",
      "id, name, booking_url",
    ]);
    expect(res.dropped).toEqual(["paywall_enabled"]);
    expect(res.error).toBeNull();
    expect(res.data).toEqual({ id: "s1" });
  });

  it("drops several missing columns, one pass each", async () => {
    // A whole unapplied migration: paywall_enabled AND booking_url absent.
    const res = await selectDroppingMissingColumns(COLUMNS, (select) => {
      for (const col of ["paywall_enabled", "booking_url"]) {
        if (select.includes(col)) return Promise.resolve({ data: null, error: undefinedColumn(col) });
      }
      return Promise.resolve({ data: { id: "s1" }, error: null });
    });

    expect(res.dropped).toEqual(["paywall_enabled", "booking_url"]);
    expect(res.data).toEqual({ id: "s1" });
  });

  it("surfaces errors that aren't about a missing column", async () => {
    let calls = 0;
    const error = { code: "PGRST116", message: "no rows returned" };
    const res = await selectDroppingMissingColumns(COLUMNS, () => {
      calls += 1;
      return Promise.resolve({ data: null, error });
    });

    expect(calls).toBe(1);
    expect(res.error).toBe(error);
    expect(res.dropped).toEqual([]);
  });

  it("gives up instead of looping when the column isn't one we selected", async () => {
    // e.g. a missing column used in a .eq() filter — dropping select entries
    // can never fix it, so this must terminate rather than spin.
    let calls = 0;
    const res = await selectDroppingMissingColumns(COLUMNS, () => {
      calls += 1;
      return Promise.resolve({ data: null, error: undefinedColumn("is_published") });
    });

    expect(calls).toBe(1);
    expect(res.dropped).toEqual([]);
    expect(res.error?.code).toBe(UNDEFINED_COLUMN);
  });

  it("terminates when every column turns out to be missing", async () => {
    let calls = 0;
    const res = await selectDroppingMissingColumns(["a", "b"], (select) => {
      calls += 1;
      return Promise.resolve({ data: null, error: undefinedColumn(select.split(",")[0].trim()) });
    });

    expect(calls).toBe(2);
    expect(res.dropped).toEqual(["a", "b"]);
    expect(res.data).toBeNull();
  });
});
