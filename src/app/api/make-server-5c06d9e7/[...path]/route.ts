import { ContactChannel, ContactDirection, ContactOutcome } from "@/types";
import { preflight } from "@/app/api/_lib/cors";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";

import logger from '../../../../utils/logger';
// —— Next.js route options ——
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// —— Supabase (server, service-role) ——
const supabase = getServiceClient();

// —— Per-handler json builder. Each handler resolves its CORS headers up front
// and shadows `json` with this closure, so the existing handler bodies that
// call `json(data, status)` continue to work unchanged. ——
type JsonFn = (data: unknown, status?: number) => Response;
const buildJson = (cors: Record<string, string>): JsonFn =>
  (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json", ...cors },
    });

// —— Logger très simple ——
const log = (...args: any[]) => {
  try {
    logger.log("[api]", ...args);
  } catch {}
};

// ===================================================
// =============== KV STORE (table Supabase) =========
// ===================================================
const KV_TABLE = "kv_store_5c06d9e7";

async function kvSet(key: string, value: any) {
  const { error } = await supabase.from(KV_TABLE).upsert({ key, value });
  if (error) throw new Error(error.message);
}
async function kvGet(key: string) {
  const { data, error } = await supabase
    .from(KV_TABLE)
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.value;
}

// ===================================================
// =============== JOURNAL HELPERS ===================
// ===================================================
type JournalEntry = {
  date?: string;
  type_evenement: string;
  description?: string | null;
  opportunite_id?: string | null;
  entreprise_id?: number | null;
};

const resolveActivityType = (eventType: string): string => {
  if (eventType === "cold_call" || eventType === "appel") return "appel";
  if (eventType.startsWith("relance")) return "relance";
  if (eventType.startsWith("rdv")) return "rdv";
  if (eventType === "devis") return "devis";
  if (eventType === "signature") return "signature";
  if (eventType === "acompte" || eventType === "deposit") return "encaissement";
  return "note";
};

const resolvePipelineStage = (eventType: string): string | null => {
  if (eventType === "cold_call" || eventType === "appel") return "appel";
  if (eventType === "qualified") return "lead_qualifie";
  if (eventType.startsWith("rdv")) return "rdv";
  if (eventType === "devis") return "devis";
  if (eventType === "signature") return "signe";
  if (eventType === "acompte" || eventType === "deposit") return "acompte";
  return null;
};

type TouchpointPayload = {
  opportunite_id?: string | null;
  entreprise_id?: number | null;
  step_kind: string;
  channel: ContactChannel;
  direction?: ContactDirection;
  outcome?: ContactOutcome;
  details?: string | null;
};

type ContactTouchpointKind = "approche" | "relance" | "autre";

const translateTouchpointKind = (stepKind: string): ContactTouchpointKind => {
  switch (stepKind) {
    case "approche":
    case "cold_call":
      return "approche";
    case "relance":
      return "relance";
    default:
      return "autre";
  }
};

async function getNextTouchpointSequence({
  opportunite_id,
  entreprise_id,
  step_kind,
}: {
  opportunite_id?: string | null;
  entreprise_id?: number | null;
  step_kind: ContactTouchpointKind;
}): Promise<number> {
  let query = supabase
    .from("opportunity_touchpoints")
    .select("step_sequence")
    .eq("step_kind", step_kind)
    .order("step_sequence", { ascending: false })
    .limit(1);

  if (opportunite_id) {
    query = query.eq("opportunite_id", opportunite_id);
  } else if (entreprise_id) {
    query = query.eq("entreprise_id", entreprise_id);
  }

  const { data, error } = await query;
  if (error) throw error;

  const lastSequence = data?.[0]?.step_sequence ?? 0;
  return (typeof lastSequence === "number" ? lastSequence : parseInt(String(lastSequence), 10) || 0) + 1;
}

async function createTouchpoint(payload: TouchpointPayload) {
  const touchpoint_kind = translateTouchpointKind(payload.step_kind);
  let step_sequence: number | null = null;

  if (touchpoint_kind === "relance") {
    step_sequence = await getNextTouchpointSequence({
      opportunite_id: payload.opportunite_id ?? undefined,
      entreprise_id: payload.entreprise_id ?? undefined,
      step_kind: touchpoint_kind,
    });
  } else if (touchpoint_kind === "approche") {
    step_sequence = 1;
  }

  const { error } = await supabase.from("opportunity_touchpoints").insert({
    opportunite_id: payload.opportunite_id ?? null,
    entreprise_id: payload.entreprise_id ?? null,
    step_kind: touchpoint_kind,
    step_sequence: step_sequence ?? null,
    channel: payload.channel,
    direction: payload.direction ?? ContactDirection.Outgoing,
    outcome: payload.outcome ?? ContactOutcome.Inconnu,
    details: payload.details ?? null,
  });

  if (error) throw error;

  return {
    step_sequence,
    touchpoint_kind,
  };
}

async function logEvent(
  entry: Omit<JournalEntry, "date"> & {
    channel?: ContactChannel | null;
    details?: string | null;
  },
) {
  const metadata: Record<string, any> = {
    type_evenement: entry.type_evenement,
  };
  if (entry.channel) {
    metadata.channel = entry.channel;
  }
  if (entry.details) {
    metadata.details = entry.details;
  }

  const payload: Record<string, any> = {
    occurred_at: new Date().toISOString(),
    activity_type: resolveActivityType(entry.type_evenement),
    status: "faite",
    title: entry.type_evenement,
    description: entry.description ?? null,
    opportunite_id: entry.opportunite_id ?? null,
    entreprise_id: entry.entreprise_id ?? null,
    metadata,
  };

  const { error } = await supabase.from("activity_log").insert(payload);
  if (error) throw error;

  const stage = resolvePipelineStage(entry.type_evenement);
  if (stage) {
    const { error: pipelineError } = await supabase.from("pipeline_events").insert({
      event_at: new Date().toISOString(),
      stage,
      opportunite_id: entry.opportunite_id ?? null,
      entreprise_id: entry.entreprise_id ?? null,
      metadata: {
        type_evenement: entry.type_evenement,
        channel: entry.channel ?? null,
      },
    });
    if (pipelineError) throw pipelineError;
  }

  await incrementKpiDailyFact(entry);
}

const getKpiIncrementColumn = (eventType: string): string | null => {
  if (eventType === "cold_call" || eventType === "appel") return "appels";
  if (eventType === "qualified") return "leads_qualifies";
  if (eventType.startsWith("relance")) return "relances";
  if (eventType.startsWith("rdv")) return "rdv";
  if (eventType === "devis") return "devis";
  if (eventType === "signature") return "signatures";
  if (eventType === "acompte" || eventType === "deposit") return "acomptes";
  return null;
};

async function incrementKpiDailyFact(entry: { type_evenement: string }) {
  const column = getKpiIncrementColumn(entry.type_evenement);
  if (!column) return;

  const today = new Date().toISOString().slice(0, 10);
  const zeroRow = {
    fact_date: today,
    leads_trouves: 0,
    leads_qualifies: 0,
    appels: 0,
    rdv: 0,
    devis: 0,
    relances: 0,
    signatures: 0,
    acomptes: 0,
    ca: 0,
    mrr: 0,
  } as Record<string, string | number>;

  zeroRow[column] = 1;

  const { error } = await supabase
    .from("kpi_daily_facts")
    .insert(zeroRow);

  if (error) {
    log("kpi_daily_facts increment error", error);
  }
}

async function getNextSequenceNumber(
  type_prefix: string,
  opportunite_id?: string,
  entreprise_id?: number
): Promise<number> {
  const requestedType =
    type_prefix === "relance" ? "relance" :
    type_prefix === "rdv" ? "rdv" :
    type_prefix === "cold_call" || type_prefix === "appel" ? "appel" :
    type_prefix === "devis" ? "devis" :
    type_prefix === "signature" ? "signature" :
    type_prefix === "acompte" ? "encaissement" :
    "note";

  let query = supabase
    .from("activity_log")
    .select("id")
    .eq("activity_type", requestedType);

  if (opportunite_id) query = query.eq("opportunite_id", opportunite_id);
  else if (entreprise_id) query = query.eq("entreprise_id", entreprise_id);

  let { data, error } = await query;
  if (error && shouldUseLegacyJournalTable(error)) {
    let legacyQuery = supabase
      .from("journal_succes")
      .select("id")
      .eq("type_evenement", type_prefix);
    if (opportunite_id) legacyQuery = legacyQuery.eq("opportunite_id", opportunite_id);
    else if (entreprise_id) legacyQuery = legacyQuery.eq("entreprise_id", entreprise_id);
    const legacy = await legacyQuery;
    data = legacy.data;
    error = legacy.error;
  }

  if (error) return 1;
  return (data?.length ?? 0) + 1;
}

function shouldUseLegacyJournalTable(error: any): boolean {
  const code = String(error?.code || "");
  const message = String(error?.message || "").toLowerCase();
  return code === "42P01" || code === "PGRST205" || message.includes("activity_log");
}

async function getJournalStats(opportunite_id?: string, entreprise_id?: number) {
  let query = supabase.from("activity_log").select("activity_type");
  if (opportunite_id) query = query.eq("opportunite_id", opportunite_id);
  else if (entreprise_id) query = query.eq("entreprise_id", entreprise_id);

  let { data, error } = await query;
  if (error && shouldUseLegacyJournalTable(error)) {
    let legacyQuery = supabase.from("journal_succes").select("type_evenement");
    if (opportunite_id) legacyQuery = legacyQuery.eq("opportunite_id", opportunite_id);
    else if (entreprise_id) legacyQuery = legacyQuery.eq("entreprise_id", entreprise_id);
    const legacy = await legacyQuery;
    data = legacy.data?.map((row: any) => ({ activity_type: row.type_evenement })) ?? [];
    error = legacy.error;
  }

  if (error) {
    return {
      appels: 0,
      relances: 0,
      rdvs: 0,
      devis: 0,
      signatures: 0,
      acomptes: 0,
    };
  }
  const stats: any = {
    appels: 0,
    relances: 0,
    rdvs: 0,
    devis: 0,
    signatures: 0,
    acomptes: 0,
  };
  (data || []).forEach((row) => {
    const t = row.activity_type || "";
    if (t === "appel") stats.appels++;
    else if (t === "relance") stats.relances++;
    else if (t === "rdv") stats.rdvs++;
    else if (t === "devis") stats.devis++;
    else if (t === "signature") stats.signatures++;
    else if (t === "encaissement") stats.acomptes++;
  });
  return stats;
}
const JOURNAL_HISTORY_COLUMNS = "occurred_at,activity_type,description,opportunite_id,entreprise_id";

async function getJournalHistory(
  opportunite_id?: string,
  entreprise_id?: number,
  limit = 10
) {
  const safeLimit = Number.isFinite(limit) && limit > 0 ? limit : 10;
  let query = supabase
    .from("activity_log")
    .select(JOURNAL_HISTORY_COLUMNS)
    .order("occurred_at", { ascending: false })
    .limit(safeLimit);
  if (opportunite_id) query = query.eq("opportunite_id", opportunite_id);
  else if (entreprise_id) query = query.eq("entreprise_id", entreprise_id);

  const { data, error } = await query;
  if (error && shouldUseLegacyJournalTable(error)) {
    let legacyQuery = supabase
      .from("journal_succes")
      .select("date,type_evenement,description,opportunite_id,entreprise_id")
      .order("date", { ascending: false })
      .limit(safeLimit);
    if (opportunite_id) legacyQuery = legacyQuery.eq("opportunite_id", opportunite_id);
    else if (entreprise_id) legacyQuery = legacyQuery.eq("entreprise_id", entreprise_id);
    const legacy = await legacyQuery;
    if (legacy.error) throw legacy.error;
    return (legacy.data || []).map((row: any) => ({
      date: row.date,
      type_evenement: row.type_evenement,
      description: row.description,
      opportunite_id: row.opportunite_id,
      entreprise_id: row.entreprise_id,
    }));
  }

  if (error) throw error;
  return (data || []).map((row: any) => ({
    date: row.occurred_at,
    type_evenement: row.activity_type,
    description: row.description,
    opportunite_id: row.opportunite_id,
    entreprise_id: row.entreprise_id,
  }));
}
type LogOptions = {
  description?: string | null;
  channel?: ContactChannel;
  details?: string | null;
  skipTouchpoint?: boolean;
  direction?: ContactDirection;
  outcome?: ContactOutcome;
};

async function logCall(
  opportunite_id?: string,
  entreprise_id?: number,
  options: LogOptions = {},
) {
  const channel = options.channel ?? ContactChannel.PasDefini;
  if (!options.skipTouchpoint) {
    await createTouchpoint({
      opportunite_id,
      entreprise_id,
      step_kind: "cold_call",
      channel,
      direction: options.direction,
      outcome: options.outcome,
      details: options.details ?? options.description ?? null,
    });
  }

  await logEvent({
    type_evenement: "cold_call",
    description: options.description ?? null,
    opportunite_id,
    entreprise_id,
    channel,
    details: options.details ?? null,
  });
}

async function logRelance(
  opportunite_id?: string,
  entreprise_id?: number,
  options: LogOptions = {},
) {
  const channel = options.channel ?? ContactChannel.PasDefini;
  if (!options.skipTouchpoint) {
    await createTouchpoint({
      opportunite_id,
      entreprise_id,
      step_kind: "relance",
      channel,
      direction: options.direction,
      outcome: options.outcome,
      details: options.details ?? options.description ?? null,
    });
  }

  const n = await getNextSequenceNumber("relance", opportunite_id, entreprise_id);
  await logEvent({
    type_evenement: `relance_${n}`,
    description: options.description ?? null,
    opportunite_id,
    entreprise_id,
    channel,
    details: options.details ?? null,
  });
}

async function logRdv(
  opportunite_id?: string,
  entreprise_id?: number,
  options: LogOptions = {},
) {
  const channel = options.channel ?? ContactChannel.PasDefini;
  if (!options.skipTouchpoint) {
    await createTouchpoint({
      opportunite_id,
      entreprise_id,
      step_kind: "rdv",
      channel,
      direction: options.direction,
      outcome: options.outcome,
      details: options.details ?? options.description ?? null,
    });
  }

  const n = await getNextSequenceNumber("rdv", opportunite_id, entreprise_id);
  await logEvent({
    type_evenement: `rdv_${n}`,
    description: options.description ?? null,
    opportunite_id,
    entreprise_id,
    channel,
    details: options.details ?? null,
  });
}

async function logDevis(
  opportunite_id?: string,
  entreprise_id?: number,
  options: LogOptions = {},
) {
  const channel = options.channel ?? ContactChannel.PasDefini;
  if (!options.skipTouchpoint) {
    await createTouchpoint({
      opportunite_id,
      entreprise_id,
      step_kind: "devis",
      channel,
      direction: options.direction,
      outcome: options.outcome,
      details: options.details ?? options.description ?? null,
    });
  }

  await logEvent({
    type_evenement: "devis",
    description: options.description ?? null,
    opportunite_id,
    entreprise_id,
    channel,
    details: options.details ?? null,
  });
}

async function logSignature(
  opportunite_id?: string,
  entreprise_id?: number,
  options: LogOptions = {},
) {
  const channel = options.channel ?? ContactChannel.PasDefini;
  if (!options.skipTouchpoint) {
    await createTouchpoint({
      opportunite_id,
      entreprise_id,
      step_kind: "signature",
      channel,
      direction: options.direction,
      outcome: options.outcome,
      details: options.details ?? options.description ?? null,
    });
  }

  await logEvent({
    type_evenement: "signature",
    description: options.description ?? null,
    opportunite_id,
    entreprise_id,
    channel,
    details: options.details ?? null,
  });
}

async function logAcompte(
  opportunite_id?: string,
  entreprise_id?: number,
  options: LogOptions = {},
) {
  const channel = options.channel ?? ContactChannel.PasDefini;
  if (!options.skipTouchpoint) {
    await createTouchpoint({
      opportunite_id,
      entreprise_id,
      step_kind: "acompte",
      channel,
      direction: options.direction,
      outcome: options.outcome,
      details: options.details ?? options.description ?? null,
    });
  }

  await logEvent({
    type_evenement: "acompte",
    description: options.description ?? null,
    opportunite_id,
    entreprise_id,
    channel,
    details: options.details ?? null,
  });
}

async function logLeadMagnet(
  opportunite_id?: string,
  entreprise_id?: number,
  options: LogOptions = {},
) {
  const channel = options.channel ?? ContactChannel.PasDefini;
  if (!options.skipTouchpoint) {
    await createTouchpoint({
      opportunite_id,
      entreprise_id,
      step_kind: "lead_magnet",
      channel,
      direction: options.direction,
      outcome: options.outcome,
      details: options.details ?? options.description ?? null,
    });
  }

  await logEvent({
    type_evenement: "lead_magnet",
    description: options.description ?? null,
    opportunite_id,
    entreprise_id,
    channel,
    details: options.details ?? null,
  });
}

// ===================================================
// =============== ROUTER (catch-all) ================
// ===================================================

export const OPTIONS = (req: Request) => preflight(req);

type RouterParams = { path?: string[] };

export const GET = withAuth<undefined, RouterParams>({}, async ({ req, params, cors }) => {
  const json = buildJson(cors);

  try {
    const segs = params.path ?? [];
    const path = `/${segs.join("/")}`;
    const url = new URL(req.url);

    // Journal stats
    if (path === "/journal/stats") {
      const opportunite_id = url.searchParams.get("opportunite_id") || undefined;
      const entreprise_id = url.searchParams.get("entreprise_id")
        ? parseInt(url.searchParams.get("entreprise_id") as string, 10)
        : undefined;
      const stats = await getJournalStats(opportunite_id, entreprise_id);
      return json(stats);
    }

    // Journal history
    if (path === "/journal/history") {
      const opportunite_id = url.searchParams.get("opportunite_id") || undefined;
      const entreprise_id = url.searchParams.get("entreprise_id")
        ? parseInt(url.searchParams.get("entreprise_id") as string, 10)
        : undefined;
      const limit = parseInt(url.searchParams.get("limit") || "10", 10);
      const hist = await getJournalHistory(opportunite_id, entreprise_id, limit);
      return json(hist);
    }

    // Next sequence
    const nextSeqMatch = path.match(/^\/journal\/next-sequence\/([^/]+)$/);
    if (nextSeqMatch) {
      const type = nextSeqMatch[1];
      const opportunite_id = url.searchParams.get("opportunite_id") || undefined;
      const entreprise_id = url.searchParams.get("entreprise_id")
        ? parseInt(url.searchParams.get("entreprise_id") as string, 10)
        : undefined;
      const nextNumber = await getNextSequenceNumber(type, opportunite_id, entreprise_id);
      return json({ nextNumber });
    }

    // KPI totals from daily facts
    if (path === "/kpi/journal-totals") {
      let data: any[] | null = null;

      const { data: dailyFactsData, error: dailyFactsError } = await supabase
        .from("kpi_daily_facts")
        .select("fact_date, appels, relances, rdv, devis, signatures, acomptes, leads_qualifies");

      if (dailyFactsError) {
        // Fallback compatible avec la refonte SQL: vue v_kpi_daily
        const { data: viewData, error: viewError } = await supabase
          .from("v_kpi_daily")
          .select("fact_date, appels, relances, rdv, devis, signatures, acomptes, leads_qualifies");

        if (viewError) {
          log("KPI totals read error from daily facts and view", {
            dailyFactsError,
            viewError,
          });
          return json({
            total_appels: 0,
            total_relances: 0,
            total_rdvs: 0,
            total_devis: 0,
            total_signatures: 0,
            total_acomptes: 0,
            total_lead_magnets: 0,
            total_qualified: 0,
            week: {
              total_appels: 0,
              total_relances: 0,
              total_rdvs: 0,
              total_devis: 0,
              total_signatures: 0,
              total_acomptes: 0,
              total_lead_magnets: 0,
              total_qualified: 0,
            },
            month: {
              total_appels: 0,
              total_relances: 0,
              total_rdvs: 0,
              total_devis: 0,
              total_signatures: 0,
              total_acomptes: 0,
              total_lead_magnets: 0,
              total_qualified: 0,
            },
            quarter: {
              total_appels: 0,
              total_relances: 0,
              total_rdvs: 0,
              total_devis: 0,
              total_signatures: 0,
              total_acomptes: 0,
              total_lead_magnets: 0,
              total_qualified: 0,
            },
            year: {
              total_appels: 0,
              total_relances: 0,
              total_rdvs: 0,
              total_devis: 0,
              total_signatures: 0,
              total_acomptes: 0,
              total_lead_magnets: 0,
              total_qualified: 0,
            },
          });
        }

        data = viewData;
      } else {
        data = dailyFactsData;
      }

      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const monthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
      const quarterAgo = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
      const yearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());

      const toDate = (value: string) => new Date(`${value}T00:00:00Z`);
      const sumByDate = (rows: any[], fromDate: Date, key: string) => rows
        .filter((row) => toDate(row.fact_date) >= fromDate)
        .reduce((acc, row) => acc + Number(row[key] ?? 0), 0);
      const sumAll = (rows: any[], key: string) => rows
        .reduce((acc, row) => acc + Number(row[key] ?? 0), 0);

      const rows = data || [];

      // Count lead magnets directly from opportunites.lead_magnet = true
      const { data: lmData } = await supabase
        .from("opportunites")
        .select("id, updated_at")
        .eq("lead_magnet", true);
      const lmRows = (lmData ?? []) as Array<{ id: string; updated_at: string }>;
      const lmByDate = (fromDate: Date) =>
        lmRows.filter((r) => new Date(r.updated_at) >= fromDate).length;

      const totals = {
        total_appels: sumAll(rows, "appels"),
        total_relances: sumAll(rows, "relances"),
        total_rdvs: sumAll(rows, "rdv"),
        total_devis: sumAll(rows, "devis"),
        total_signatures: sumAll(rows, "signatures"),
        total_acomptes: sumAll(rows, "acomptes"),
        total_lead_magnets: lmRows.length,
        total_qualified: sumAll(rows, "leads_qualifies"),
        week: {
          total_appels: sumByDate(rows, weekAgo, "appels"),
          total_relances: sumByDate(rows, weekAgo, "relances"),
          total_rdvs: sumByDate(rows, weekAgo, "rdv"),
          total_devis: sumByDate(rows, weekAgo, "devis"),
          total_signatures: sumByDate(rows, weekAgo, "signatures"),
          total_acomptes: sumByDate(rows, weekAgo, "acomptes"),
          total_lead_magnets: lmByDate(weekAgo),
          total_qualified: sumByDate(rows, weekAgo, "leads_qualifies"),
        },
        month: {
          total_appels: sumByDate(rows, monthAgo, "appels"),
          total_relances: sumByDate(rows, monthAgo, "relances"),
          total_rdvs: sumByDate(rows, monthAgo, "rdv"),
          total_devis: sumByDate(rows, monthAgo, "devis"),
          total_signatures: sumByDate(rows, monthAgo, "signatures"),
          total_acomptes: sumByDate(rows, monthAgo, "acomptes"),
          total_lead_magnets: lmByDate(monthAgo),
          total_qualified: sumByDate(rows, monthAgo, "leads_qualifies"),
        },
        quarter: {
          total_appels: sumByDate(rows, quarterAgo, "appels"),
          total_relances: sumByDate(rows, quarterAgo, "relances"),
          total_rdvs: sumByDate(rows, quarterAgo, "rdv"),
          total_devis: sumByDate(rows, quarterAgo, "devis"),
          total_signatures: sumByDate(rows, quarterAgo, "signatures"),
          total_acomptes: sumByDate(rows, quarterAgo, "acomptes"),
          total_lead_magnets: lmByDate(quarterAgo),
          total_qualified: sumByDate(rows, quarterAgo, "leads_qualifies"),
        },
        year: {
          total_appels: sumByDate(rows, yearAgo, "appels"),
          total_relances: sumByDate(rows, yearAgo, "relances"),
          total_rdvs: sumByDate(rows, yearAgo, "rdv"),
          total_devis: sumByDate(rows, yearAgo, "devis"),
          total_signatures: sumByDate(rows, yearAgo, "signatures"),
          total_acomptes: sumByDate(rows, yearAgo, "acomptes"),
          total_lead_magnets: lmByDate(yearAgo),
          total_qualified: sumByDate(rows, yearAgo, "leads_qualifies"),
        },
      };

      return json(totals);
    }

    // Not found
    return json({ error: "Not Found" }, 404);
  } catch (err) {
    log("GET error", err);
    return json({ error: "Internal server error" }, 500);
  }
});

export const POST = withAuth<undefined, RouterParams>({}, async ({ req, params, cors }) => {
  const json = buildJson(cors);

  try {
    const segs = params.path ?? [];
    const path = `/${segs.join("/")}`;
    const body = await (async () => {
      try { return await req.json(); } catch { return {}; }
    })();
    // Journal endpoints
    if (path === "/journal/log") {
      await logEvent(body);
      return json({ success: true });
    }
    if (path === "/journal/touchpoint") {
      const {
        opportunite_id,
        entreprise_id,
        step_kind,
        channel,
        direction,
        outcome,
        details,
      } = body;

      if (!step_kind || !channel) {
        return json({ error: "step_kind et channel sont requis" }, 400);
      }

      try {
        const { step_sequence, touchpoint_kind } = await createTouchpoint({
          opportunite_id: opportunite_id ?? null,
          entreprise_id: entreprise_id ?? null,
          step_kind,
          channel,
          direction,
          outcome,
          details: details ?? null,
        });
        return json({ success: true, step_sequence, touchpoint_kind });
      } catch (error: any) {
        log("Touchpoint insertion error", error);
        return json({ error: error?.message || "Failed to create touchpoint" }, 500);
      }
    }
    if (path === "/journal/call") {
      const { opportunite_id, entreprise_id, description, channel, details, skipTouchpoint, direction, outcome } = body;
      await logCall(opportunite_id, entreprise_id, {
        description,
        channel,
        details,
        skipTouchpoint,
        direction,
        outcome,
      });
      return json({ success: true });
    }
    if (path === "/journal/relance") {
      const { opportunite_id, entreprise_id, description, channel, details, skipTouchpoint, direction, outcome } = body;
      await logRelance(opportunite_id, entreprise_id, {
        description,
        channel,
        details,
        skipTouchpoint,
        direction,
        outcome,
      });
      return json({ success: true });
    }
    if (path === "/journal/rdv") {
      const { opportunite_id, entreprise_id, description, channel, details, skipTouchpoint, direction, outcome } = body;
      await logRdv(opportunite_id, entreprise_id, {
        description,
        channel,
        details,
        skipTouchpoint,
        direction,
        outcome,
      });
      return json({ success: true });
    }
    if (path === "/journal/devis") {
      const { opportunite_id, entreprise_id, description, channel, details, skipTouchpoint, direction, outcome } = body;
      await logDevis(opportunite_id, entreprise_id, {
        description,
        channel,
        details,
        skipTouchpoint,
        direction,
        outcome,
      });
      return json({ success: true });
    }
    if (path === "/journal/signature") {
      const { opportunite_id, entreprise_id, description, channel, details, skipTouchpoint, direction, outcome } = body;
      await logSignature(opportunite_id, entreprise_id, {
        description,
        channel,
        details,
        skipTouchpoint,
        direction,
        outcome,
      });
      return json({ success: true });
    }
    if (path === "/journal/acompte") {
      const { opportunite_id, entreprise_id, description, channel, details, skipTouchpoint, direction, outcome } = body;
      await logAcompte(opportunite_id, entreprise_id, {
        description,
        channel,
        details,
        skipTouchpoint,
        direction,
        outcome,
      });
      return json({ success: true });
    }
    if (path === "/journal/lead-magnet") {
      const { opportunite_id, entreprise_id, description, channel, details, skipTouchpoint, direction, outcome } = body;
      await logLeadMagnet(opportunite_id, entreprise_id, {
        description,
        channel,
        details,
        skipTouchpoint,
        direction,
        outcome,
      });
      return json({ success: true });
    }

    return json({ error: "Not Found" }, 404);
  } catch (err) {
    log("POST error", err);
    return json({ error: "Internal server error" }, 500);
  }
});
