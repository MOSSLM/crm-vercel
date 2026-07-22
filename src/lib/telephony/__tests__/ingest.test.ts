import { ingestCallEvent } from "../ingest";
import type { CallEvent } from "../core/types";

/**
 * Minimal stateful Supabase-client stub. Each `from(table)` gets fresh chain
 * state; terminal calls resolve based on table + whether insert/update ran.
 */
function makeClient(opts: { existingCall?: Record<string, unknown> | null } = {}) {
  const inserted: Record<string, unknown[]> = {};
  const updated: Record<string, unknown[]> = {};

  const from = (table: string) => {
    const state: { insertRow: unknown; updateRow: unknown } = {
      insertRow: null,
      updateRow: null,
    };
    const resolve = () => {
      if (table === "calls") {
        if (state.insertRow) return { data: { id: "call-1" } };
        if (state.updateRow) return { data: null };
        return { data: opts.existingCall ?? null };
      }
      if (table === "call_recordings") {
        if (state.insertRow) return { data: { id: "rec-1" } };
        return { data: null };
      }
      return { data: [] }; // contacts / entreprises / opportunites / phone_numbers
    };
    const b: Record<string, unknown> = {
      select: () => b,
      eq: () => b,
      ilike: () => b,
      order: () => b,
      limit: () => b,
      insert: (row: unknown) => {
        state.insertRow = row;
        (inserted[table] ||= []).push(row);
        return b;
      },
      update: (row: unknown) => {
        state.updateRow = row;
        (updated[table] ||= []).push(row);
        return b;
      },
      maybeSingle: () => Promise.resolve(resolve()),
      then: (f: (v: unknown) => unknown, r?: (e: unknown) => unknown) =>
        Promise.resolve(resolve()).then(f, r),
    };
    return b;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { client: { from } as any, inserted, updated };
}

const inboundRinging: CallEvent = {
  type: "ringing",
  providerCallId: "call-xyz",
  direction: "inbound",
  from: "+33600000000",
  to: "+33100000000",
  startedAt: "2026-07-22 10:00:00",
  raw: {},
};

describe("ingestCallEvent", () => {
  it("inserts a new call when none exists", async () => {
    const { client, inserted } = makeClient({ existingCall: null });
    const res = await ingestCallEvent(client, inboundRinging);
    expect(res.created).toBe(true);
    expect(res.callId).toBe("call-1");
    expect(inserted.calls).toHaveLength(1);
    expect(inserted.calls[0]).toMatchObject({
      provider: "zadarma",
      provider_call_id: "call-xyz",
      direction: "inbound",
      from_e164: "+33600000000",
    });
  });

  it("updates (not re-inserts) a re-delivered event", async () => {
    const { client, inserted, updated } = makeClient({ existingCall: { id: "call-1" } });
    const res = await ingestCallEvent(client, {
      ...inboundRinging,
      type: "ended",
      disposition: "answered",
      durationSec: 30,
      endedAt: "2026-07-22 10:01:00",
    });
    expect(res.created).toBe(false);
    expect(inserted.calls).toBeUndefined();
    expect(updated.calls).toHaveLength(1);
    expect(updated.calls[0]).toMatchObject({ disposition: "answered", duration_sec: 30 });
  });

  it("creates a pending recording row on a recording event", async () => {
    const { client, inserted } = makeClient({ existingCall: { id: "call-1" } });
    await ingestCallEvent(client, {
      ...inboundRinging,
      type: "recording_ready",
      recordingProviderId: "rec-abc",
    });
    expect(inserted.call_recordings).toHaveLength(1);
    expect(inserted.call_recordings[0]).toMatchObject({
      call_id: "call-1",
      provider_record_id: "rec-abc",
    });
  });

  it("skips events without a provider call id", async () => {
    const { client } = makeClient();
    const res = await ingestCallEvent(client, { ...inboundRinging, providerCallId: "" });
    expect(res).toEqual({ callId: null, created: false });
  });
});
