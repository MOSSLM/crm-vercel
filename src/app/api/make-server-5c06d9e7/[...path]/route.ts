import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "@/env";
import { ContactChannel, ContactDirection, ContactOutcome } from "@/types";

import logger from '../../../../utils/logger';
// —— Next.js route options ——
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// —— Supabase (server) ——
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// —— CORS helpers ——
const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
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
async function kvGetByPrefix(prefix: string) {
  const { data, error } = await supabase
    .from(KV_TABLE)
    .select("key,value")
    .like("key", `${prefix}%`);
  if (error) throw new Error(error.message);
  return data?.map((d) => d.value) ?? [];
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
  const payload: Record<string, any> = {
    occurred_at: new Date().toISOString(),
    activity_type: resolveActivityType(entry.type_evenement),
    status: "faite",
    title: entry.type_evenement,
    description: entry.description ?? null,
    opportunite_id: entry.opportunite_id ?? null,
    entreprise_id: entry.entreprise_id ?? null,
  };

  if (entry.details) {
    payload.details = entry.details;
  }
  if (entry.channel) {
    payload.channel = entry.channel;
  }

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

  const { data, error } = await query;
  if (error) return 1;
  return (data?.length ?? 0) + 1;
}

async function getJournalStats(opportunite_id?: string, entreprise_id?: number) {
  let query = supabase.from("activity_log").select("activity_type");
  if (opportunite_id) query = query.eq("opportunite_id", opportunite_id);
  else if (entreprise_id) query = query.eq("entreprise_id", entreprise_id);

  const { data, error } = await query;
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
// =============== KPI/period helpers ================
// ===================================================
function getWeekNumber(date: Date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}
function monthNameFr(m: number) {
  return [
    "Janvier","Février","Mars","Avril","Mai","Juin",
    "Juillet","Août","Septembre","Octobre","Novembre","Décembre"
  ][m];
}
function getPeriodColumnName(type: string) {
  switch (type) {
    case "week": return "total_week";
    case "month": return "total_month";
    case "quarter": return "total_quarter";
    case "year": return "total_year";
    default: return "total_month";
  }
}
function getCurrentPeriod(now: Date, type: string) {
  let startDate = new Date(now), endDate = new Date(now), label = "";
  switch (type) {
    case "week":
      startDate = new Date(now);
      startDate.setDate(now.getDate() - now.getDay() + 1);
      endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 6);
      label = `Semaine ${getWeekNumber(startDate)}`;
      break;
    case "month":
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      label = `${monthNameFr(now.getMonth())} ${now.getFullYear()}`;
      break;
    case "quarter":
      const q = Math.floor(now.getMonth() / 3);
      startDate = new Date(now.getFullYear(), q * 3, 1);
      endDate = new Date(now.getFullYear(), (q + 1) * 3, 0);
      label = `Q${q + 1} ${now.getFullYear()}`;
      break;
    case "year":
      startDate = new Date(now.getFullYear(), 0, 1);
      endDate = new Date(now.getFullYear(), 11, 31);
      label = `${now.getFullYear()}`;
      break;
  }
  return { startDate, endDate, label };
}
function extractAmountFromDescription(desc?: string | null) {
  if (!desc) return 0;
  const pats = [
    /(\d+(?:\s?\d+)*)[€\s]*euros?/i,
    /(\d+(?:\s?\d+)*)\s*€/i,
    /(\d+(?:[\s,]\d+)*)/i,
  ];
  for (const p of pats) {
    const m = desc.match(p);
    if (m) {
      const n = parseInt(m[1].replace(/\s|,/g, ""), 10);
      if (!isNaN(n)) return n;
    }
  }
  return 0;
}
function genHistoricalPeriod(now: Date, type: string, index: number) {
  let startDate = new Date(), endDate = new Date(), label = "";
  switch (type) {
    case "week": {
      const d = new Date(now);
      d.setDate(now.getDate() - index * 7);
      startDate = new Date(d);
      startDate.setDate(d.getDate() - d.getDay() + 1);
      endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 6);
      label = `S${getWeekNumber(startDate)}`;
      break;
    }
    case "month": {
      const d = new Date(now.getFullYear(), now.getMonth() - index, 1);
      startDate = new Date(d.getFullYear(), d.getMonth(), 1);
      endDate = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      label = `${monthNameFr(d.getMonth()).slice(0,3)} ${d.getFullYear().toString().slice(-2)}`;
      break;
    }
    case "quarter": {
      const d = new Date(now);
      d.setMonth(now.getMonth() - index * 3);
      const q = Math.floor(d.getMonth() / 3) + 1;
      startDate = new Date(d.getFullYear(), (q - 1) * 3, 1);
      endDate = new Date(d.getFullYear(), q * 3, 0);
      label = `Q${q} ${d.getFullYear().toString().slice(-2)}`;
      break;
    }
    case "year": {
      const y = now.getFullYear() - index;
      startDate = new Date(y, 0, 1);
      endDate = new Date(y, 11, 31);
      label = `${y}`;
      break;
    }
  }
  return { startDate, endDate, label };
}
async function getHistoricalDataFromJournal(type: string, limit: number) {
  const out: any[] = [];
  const now = new Date();
  for (let i = limit - 1; i >= 0; i--) {
    const period = genHistoricalPeriod(now, type, i);
    const { data, error } = await supabase
      .from("kpi_daily_facts")
      .select("leads_trouves, leads_qualifies, appels, rdv, devis, relances, signatures, acomptes, ca, mrr")
      .gte("fact_date", period.startDate.toISOString().split("T")[0])
      .lte("fact_date", period.endDate.toISOString().split("T")[0]);

    const metrics = {
      leads_trouves: 0,
      leads_qualifies: 0,
      appels: 0,
      rdv: 0,
      devis: 0,
      relances: 0,
      signatures: 0,
      acomptes: 0,
      leadmagnets: 0,
      relances_total: 0,
      ca: 0,
      mrr: 0,
    };

    if (!error) {
      (data || []).forEach((row: any) => {
        metrics.leads_trouves += Number(row.leads_trouves ?? 0);
        metrics.leads_qualifies += Number(row.leads_qualifies ?? 0);
        metrics.appels += Number(row.appels ?? 0);
        metrics.rdv += Number(row.rdv ?? 0);
        metrics.devis += Number(row.devis ?? 0);
        metrics.relances += Number(row.relances ?? 0);
        metrics.signatures += Number(row.signatures ?? 0);
        metrics.acomptes += Number(row.acomptes ?? 0);
        metrics.ca += Number(row.ca ?? 0);
        metrics.mrr += Number(row.mrr ?? 0);
      });
      metrics.relances_total = metrics.relances;
    }

    out.push({
      period_start: period.startDate.toISOString().split("T")[0],
      period_end: period.endDate.toISOString().split("T")[0],
      period_type: type,
      period_label: period.label,
      ...metrics,
    });
  }
  return out;
}

async function getRecentPeriodsDataFromJournal(type: string, count: number) {
  const data = await getHistoricalDataFromJournal(type, count);
  return data.slice(-count);
}

function transformRealKpiDataByPeriod(kpiData: any[], periodType: string) {
  const now = new Date();
  const current = getCurrentPeriod(now, periodType);
  const metrics: any = {
    leads_trouves: 0, leads_qualifies: 0, appels: 0, rdv: 0, devis: 0,
    relances: 0, signatures: 0, acomptes: 0, leadmagnets: 0, relances_total: 0,
    ca: 0, mrr: 0,
  };
  kpiData.forEach((row) => {
    const col = getPeriodColumnName(periodType);
    const value = row[col] || 0;
    switch (row.metric) {
      case "cold_call":
      case "appels":
        metrics.appels = value; break;
      case "relances":
        metrics.relances = value; break;
      case "rdv":
      case "rdvs":
        metrics.rdv = value; break;
      case "devis":
        metrics.devis = value; break;
      case "signature":
      case "signatures":
        metrics.signatures = value; break;
      case "deposit":
      case "acomptes":
        metrics.acomptes = value; break;
      case "lead_magnet":
      case "leadmagnets":
        metrics.leadmagnets = value; break;
      case "qualified":
      case "leads_qualifies":
        metrics.leads_qualifies = value; break;
      case "leads_trouves":
        metrics.leads_trouves = value; break;
      case "ca":
      case "chiffre_affaires":
        metrics.ca = value; break;
      case "mrr":
        metrics.mrr = value; break;
    }
  });
  const relancesTotal = kpiData
    .filter((r) => String(r.metric || "").includes("relance"))
    .reduce((s, r) => s + (r[getPeriodColumnName(periodType)] || 0), 0);
  metrics.relances_total = relancesTotal;

  return [
    {
      period_start: current.startDate.toISOString().split("T")[0],
      period_end: current.endDate.toISOString().split("T")[0],
      period_type: periodType,
      period_label: current.label,
      ...metrics,
    },
  ];
}

// ===================================================
// =============== ROUTER (catch-all) ================
// ===================================================

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  try {
    const { path: raw } = await params;
    const segs = raw ?? [];
    const path = `/${segs.join("/")}`;
    const url = new URL(req.url);

    // Health
    if (path === "/health") {
      return json({ status: "OK", timestamp: new Date().toISOString() });
    }

    // Contacts list
    if (path === "/contacts") {
      const pageSizeParam = Number(url.searchParams.get("pageSize"));
      const pageSize = Number.isFinite(pageSizeParam) && pageSizeParam > 0
        ? Math.min(pageSizeParam, 200)
        : 50;
      const after = url.searchParams.get("after");

      const { data: contacts, error } = await supabase.rpc(
        "list_company_contacts",
        {
          p_company_id: null,
          p_after: after || null,
          p_page_size: pageSize,
        }
      );
      if (error) return json({ error: "Failed to fetch contacts" }, 500);

      const contactList = contacts ?? [];
      const enhanced = await Promise.all(
        contactList.map(async (c: any) => {
          try {
            const ext = (await kvGet(`contact_extended_${c.id}`)) || {};
            return { ...c, ...ext, nom: c.last_name, prenom: c.first_name };
          } catch {
            return { ...c, nom: c.last_name, prenom: c.first_name };
          }
        })
      );
      const nextCursor = contactList.length
        ? contactList[contactList.length - 1].created_at ?? null
        : null;
      return json({ data: enhanced, nextCursor });
    }

    // Contacts by company
    const companyMatch = path.match(/^\/contacts\/company\/(\d+)$/);
    if (companyMatch) {
      const companyId = parseInt(companyMatch[1], 10);
      const pageSizeParam = Number(url.searchParams.get("pageSize"));
      const pageSize = Number.isFinite(pageSizeParam) && pageSizeParam > 0
        ? Math.min(pageSizeParam, 200)
        : 50;
      const after = url.searchParams.get("after");

      const { data: contacts, error } = await supabase.rpc(
        "list_company_contacts",
        {
          p_company_id: companyId,
          p_after: after || null,
          p_page_size: pageSize,
        }
      );
      if (error) return json({ error: "Failed to fetch contacts" }, 500);

      const contactList = contacts ?? [];
      const enhanced = await Promise.all(
        contactList.map(async (c: any) => {
          try {
            const ext = (await kvGet(`contact_extended_${c.id}`)) || {};
            return { ...c, ...ext, nom: c.last_name, prenom: c.first_name };
          } catch {
            return { ...c, nom: c.last_name, prenom: c.first_name };
          }
        })
      );
      const nextCursor = contactList.length
        ? contactList[contactList.length - 1].created_at ?? null
        : null;
      return json({ data: enhanced, nextCursor });
    }

    // Contact notes
    const notesListMatch = path.match(/^\/contacts\/([^/]+)\/notes$/);
    if (notesListMatch) {
      const contactId = notesListMatch[1];
      const notes = (await kvGet(`contact_notes_${contactId}`)) || [];
      return json(notes);
    }

    // Searches
    if (path === "/searches") {
      const searches = await kvGetByPrefix("search_");
      const list = searches.map((s: any) => ({
        ...s,
        id: s.id || crypto.randomUUID(),
        created_at: s.created_at || new Date().toISOString(),
      }));
      return json(list);
    }

    // Companies
    if (path === "/companies") {
      const companies = await kvGetByPrefix("company_");
      const list = companies.map((c: any) => ({
        ...c,
        id: c.id || Date.now(),
        created_at: c.created_at || new Date().toISOString(),
        updated_at: c.updated_at || new Date().toISOString(),
      }));
      return json(list);
    }

    // KPI targets
    if (path === "/kpi/targets") {
      const targets = await kvGetByPrefix("kpi_target_");
      return json(targets);
    }

    // KPI progress by period (current)
    const kpiProgressMatch = path.match(/^\/kpi\/progress\/([^/]+)$/);
    if (kpiProgressMatch) {
      const periode = kpiProgressMatch[1] || "month";
      const current = await getHistoricalDataFromJournal(periode, 1);
      return json(current);
    }

    // KPI by-period (alias)
    if (path === "/kpi/by-period") {
      const type = url.searchParams.get("type") || "month";
      const current = await getHistoricalDataFromJournal(type, 1);
      return json(current);
    }

    // KPI historical
    if (path === "/kpi/historical") {
      const type = url.searchParams.get("type") || "month";
      const limit = parseInt(url.searchParams.get("limit") || "24", 10);
      const hist = await getHistoricalDataFromJournal(type, limit);
      return json(hist);
    }

    // KPI recent periods
    if (path === "/kpi/recent-periods") {
      const type = url.searchParams.get("type") || "month";
      const count = parseInt(url.searchParams.get("count") || "6", 10);
      const recent = await getRecentPeriodsDataFromJournal(type, count);
      return json(recent);
    }

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
      const { data, error } = await supabase
        .from("kpi_daily_facts")
        .select("fact_date, appels, relances, rdv, devis, signatures, acomptes, leads_qualifies");

      if (error) {
        return json({ error: "Failed to fetch KPI totals" }, 500);
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
      const totals = {
        total_appels: sumAll(rows, "appels"),
        total_relances: sumAll(rows, "relances"),
        total_rdvs: sumAll(rows, "rdv"),
        total_devis: sumAll(rows, "devis"),
        total_signatures: sumAll(rows, "signatures"),
        total_acomptes: sumAll(rows, "acomptes"),
        total_lead_magnets: 0,
        total_qualified: sumAll(rows, "leads_qualifies"),
        week: {
          total_appels: sumByDate(rows, weekAgo, "appels"),
          total_relances: sumByDate(rows, weekAgo, "relances"),
          total_rdvs: sumByDate(rows, weekAgo, "rdv"),
          total_devis: sumByDate(rows, weekAgo, "devis"),
          total_signatures: sumByDate(rows, weekAgo, "signatures"),
          total_acomptes: sumByDate(rows, weekAgo, "acomptes"),
          total_lead_magnets: 0,
          total_qualified: sumByDate(rows, weekAgo, "leads_qualifies"),
        },
        month: {
          total_appels: sumByDate(rows, monthAgo, "appels"),
          total_relances: sumByDate(rows, monthAgo, "relances"),
          total_rdvs: sumByDate(rows, monthAgo, "rdv"),
          total_devis: sumByDate(rows, monthAgo, "devis"),
          total_signatures: sumByDate(rows, monthAgo, "signatures"),
          total_acomptes: sumByDate(rows, monthAgo, "acomptes"),
          total_lead_magnets: 0,
          total_qualified: sumByDate(rows, monthAgo, "leads_qualifies"),
        },
        quarter: {
          total_appels: sumByDate(rows, quarterAgo, "appels"),
          total_relances: sumByDate(rows, quarterAgo, "relances"),
          total_rdvs: sumByDate(rows, quarterAgo, "rdv"),
          total_devis: sumByDate(rows, quarterAgo, "devis"),
          total_signatures: sumByDate(rows, quarterAgo, "signatures"),
          total_acomptes: sumByDate(rows, quarterAgo, "acomptes"),
          total_lead_magnets: 0,
          total_qualified: sumByDate(rows, quarterAgo, "leads_qualifies"),
        },
        year: {
          total_appels: sumByDate(rows, yearAgo, "appels"),
          total_relances: sumByDate(rows, yearAgo, "relances"),
          total_rdvs: sumByDate(rows, yearAgo, "rdv"),
          total_devis: sumByDate(rows, yearAgo, "devis"),
          total_signatures: sumByDate(rows, yearAgo, "signatures"),
          total_acomptes: sumByDate(rows, yearAgo, "acomptes"),
          total_lead_magnets: 0,
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
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  try {
    const { path: raw } = await params;
    const segs = raw ?? [];
    const path = `/${segs.join("/")}`;
    const body = await (async () => {
      try { return await req.json(); } catch { return {}; }
    })();

    // Create contact
    if (path === "/contacts") {
      const basic = {
        entreprise_id: body.entreprise_id,
        first_name: body.first_name,
        last_name: body.last_name,
        email: body.email,
        tel: body.tel,
      };
      const ext = {
        poste: body.poste,
        linkedin: body.linkedin,
        is_decision_maker: body.is_decision_maker,
        notes: body.notes,
      };
      const { data: contact, error } = await supabase
        .from("contacts")
        .insert([basic])
        .select()
        .single();
      if (error) return json({ error: "Failed to create contact" }, 500);

      try {
        await kvSet(`contact_extended_${contact.id}`, ext);
      } catch (e) {
        log("KV set error", e);
      }
      return json({ ...contact, ...ext, nom: contact.last_name, prenom: contact.first_name });
    }

    // Create contact note
    const notesCreateMatch = path.match(/^\/contacts\/([^/]+)\/notes$/);
    if (notesCreateMatch) {
      const contactId = notesCreateMatch[1];
      const existing = (await kvGet(`contact_notes_${contactId}`)) || [];
      const newNote = {
        id: Date.now(),
        contact_id: contactId,
        note: body.note,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const updated = [newNote, ...existing];
      await kvSet(`contact_notes_${contactId}`, updated);
      return json(newNote);
    }

    // KPI targets save
    if (path === "/kpi/targets") {
      const { periode, targets } = body || {};
      await kvSet(`kpi_target_${periode}`, {
        periode,
        ...targets,
        created_at: new Date().toISOString(),
      });
      return json({ success: true });
    }

    // Objectives upsert (array)
    if (path === "/objectives") {
      const { objectives } = body || {};
      if (!Array.isArray(objectives)) {
        return json({ error: "Format invalide: objectives doit être un tableau" }, 400);
      }

      for (const o of objectives) {
        const payload = {
          scope: "global",
          owner_id: null,
          period_unit: o.period_unit,
          period_start: o.period_start,
          period_end: o.period_end,
          leads_trouves: o.leads_trouves || 0,
          leads_qualifies: o.leads_qualifies || 0,
          appels: o.appels || 0,
          rdv: o.rdv || 0,
          devis: o.devis || 0,
          relances: o.relances || 0,
          signatures: o.signatures || 0,
          acomptes: o.acomptes || 0,
          ca: o.ca || 0,
          mrr: o.mrr || 0,
          label: o.label || null,
        };

        const { error } = await supabase
          .from("kpi_targets")
          .upsert(payload, { onConflict: "scope,owner_id,period_unit,period_start" });

        if (error) return json({ error: "Erreur lors de la sauvegarde" }, 500);
      }

      return json({ success: true, count: objectives.length });
    }

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
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  try {
    const { path: raw } = await params;
    const segs = raw ?? [];
    const path = `/${segs.join("/")}`;
    const body = await (async () => {
      try { return await req.json(); } catch { return {}; }
    })();

    // Update contact
    const contactUpdateMatch = path.match(/^\/contacts\/([^/]+)$/);
    if (contactUpdateMatch) {
      const contactId = contactUpdateMatch[1];
      const basic: any = {};
      if (body.entreprise_id !== undefined) basic.entreprise_id = body.entreprise_id;
      if (body.first_name !== undefined) basic.first_name = body.first_name;
      if (body.last_name !== undefined) basic.last_name = body.last_name;
      if (body.email !== undefined) basic.email = body.email;
      if (body.tel !== undefined) basic.tel = body.tel;
      if (body.updated_at !== undefined) basic.updated_at = body.updated_at;

      const ext: any = {};
      if (body.poste !== undefined) ext.poste = body.poste;
      if (body.linkedin !== undefined) ext.linkedin = body.linkedin;
      if (body.is_decision_maker !== undefined) ext.is_decision_maker = body.is_decision_maker;
      if (body.notes !== undefined) ext.notes = body.notes;

      let updated = null;
      if (Object.keys(basic).length > 0) {
        const { data, error } = await supabase
          .from("contacts")
          .update(basic)
          .eq("id", contactId)
          .select()
          .single();
        if (error) return json({ error: "Failed to update contact" }, 500);
        updated = data;
      } else {
        const { data, error } = await supabase
          .from("contacts")
          .select("*")
          .eq("id", contactId)
          .single();
        if (error) return json({ error: "Failed to fetch contact" }, 500);
        updated = data;
      }

      if (Object.keys(ext).length > 0) {
        try {
          const existing = (await kvGet(`contact_extended_${contactId}`)) || {};
          await kvSet(`contact_extended_${contactId}`, { ...existing, ...ext });
        } catch (e) {
          log("KV update error", e);
        }
      }
      const finalExt = (await kvGet(`contact_extended_${contactId}`)) || {};
      return json({
        ...updated,
        ...finalExt,
        nom: updated.last_name,
        prenom: updated.first_name,
      });
    }

    // Update note
    const notesUpdateMatch = path.match(/^\/contacts\/([^/]+)\/notes\/(\d+)$/);
    if (notesUpdateMatch) {
      const contactId = notesUpdateMatch[1];
      const noteId = parseInt(notesUpdateMatch[2], 10);
      const existing = (await kvGet(`contact_notes_${contactId}`)) || [];
      const updatedNotes = existing.map((n: any) =>
        n.id === noteId ? { ...n, note: body.note, updated_at: new Date().toISOString() } : n
      );
      await kvSet(`contact_notes_${contactId}`, updatedNotes);
      const updatedNote = updatedNotes.find((n: any) => n.id === noteId);
      return json(updatedNote);
    }

    return json({ error: "Not Found" }, 404);
  } catch (err) {
    log("PUT error", err);
    return json({ error: "Internal server error" }, 500);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  try {
    const { path: raw } = await params;
    const segs = raw ?? [];
    const path = `/${segs.join("/")}`;

    // Delete note
    const notesDeleteMatch = path.match(/^\/contacts\/([^/]+)\/notes\/(\d+)$/);
    if (notesDeleteMatch) {
      const contactId = notesDeleteMatch[1];
      const noteId = parseInt(notesDeleteMatch[2], 10);
      const existing = (await kvGet(`contact_notes_${contactId}`)) || [];
      const updated = existing.filter((n: any) => n.id !== noteId);
      await kvSet(`contact_notes_${contactId}`, updated);
      return json({ success: true });
    }

    return json({ error: "Not Found" }, 404);
  } catch (err) {
    log("DELETE error", err);
    return json({ error: "Internal server error" }, 500);
  }
}
