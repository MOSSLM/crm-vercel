import { createClient } from "@supabase/supabase-js";

// —— Next.js route options ——
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Contexte large compatible avec Next
type RouteContext = { params: Record<string, string | string[]> };

// —— Supabase (server) ——
const supabase = createClient(
  process.env.SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

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
    console.log("[api]", ...args);
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

async function logEvent(entry: Omit<JournalEntry, "date">) {
  const { error } = await supabase.from("journal_succes").insert({
    date: new Date().toISOString(),
    type_evenement: entry.type_evenement,
    description: entry.description ?? null,
    opportunite_id: entry.opportunite_id ?? null,
    entreprise_id: entry.entreprise_id ?? null,
  });
  if (error) throw error;
}

async function getNextSequenceNumber(
  type_prefix: string,
  opportunite_id?: string,
  entreprise_id?: number
): Promise<number> {
  let query = supabase
    .from("journal_succes")
    .select("type_evenement")
    .like("type_evenement", `${type_prefix}_%`);

  if (opportunite_id) query = query.eq("opportunite_id", opportunite_id);
  else if (entreprise_id) query = query.eq("entreprise_id", entreprise_id);

  const { data, error } = await query;
  if (error) return 1;
  if (!data || data.length === 0) return 1;

  const existing = data
    .map((r) => {
      const m = r.type_evenement?.match(new RegExp(`^${type_prefix}_(\\d+)$`));
      return m ? parseInt(m[1], 10) : 0;
    })
    .filter((n) => n > 0);
  return Math.max(...existing, 0) + 1;
}

async function getJournalStats(opportunite_id?: string, entreprise_id?: number) {
  let query = supabase.from("journal_succes").select("type_evenement");
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
    const t = row.type_evenement || "";
    if (t === "cold_call" || t === "appel") stats.appels++;
    else if (t.startsWith("relance_")) stats.relances++;
    else if (t.startsWith("rdv_")) stats.rdvs++;
    else if (t === "devis") stats.devis++;
    else if (t === "signature") stats.signatures++;
    else if (t === "acompte") stats.acomptes++;
  });
  return stats;
}
async function getJournalHistory(opportunite_id?: string, entreprise_id?: number) {
  let query = supabase
    .from("journal_succes")
    .select("*")
    .order("date", { ascending: false });
  if (opportunite_id) query = query.eq("opportunite_id", opportunite_id);
  else if (entreprise_id) query = query.eq("entreprise_id", entreprise_id);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}
async function logCall(opportunite_id?: string, entreprise_id?: number, description?: string) {
  await logEvent({ type_evenement: "cold_call", description, opportunite_id, entreprise_id });
}
async function logRelance(opportunite_id?: string, entreprise_id?: number, description?: string) {
  const n = await getNextSequenceNumber("relance", opportunite_id, entreprise_id);
  await logEvent({ type_evenement: `relance_${n}`, description, opportunite_id, entreprise_id });
}
async function logRdv(opportunite_id?: string, entreprise_id?: number, description?: string) {
  const n = await getNextSequenceNumber("rdv", opportunite_id, entreprise_id);
  await logEvent({ type_evenement: `rdv_${n}`, description, opportunite_id, entreprise_id });
}
async function logDevis(opportunite_id?: string, entreprise_id?: number, description?: string) {
  await logEvent({ type_evenement: "devis", description, opportunite_id, entreprise_id });
}
async function logSignature(opportunite_id?: string, entreprise_id?: number, description?: string) {
  await logEvent({ type_evenement: "signature", description, opportunite_id, entreprise_id });
}
async function logAcompte(opportunite_id?: string, entreprise_id?: number, description?: string) {
  await logEvent({ type_evenement: "acompte", description, opportunite_id, entreprise_id });
}
async function logLeadMagnet(opportunite_id?: string, entreprise_id?: number, description?: string) {
  await logEvent({ type_evenement: "lead_magnet", description, opportunite_id, entreprise_id });
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
      .from("journal_succes")
      .select("type_evenement, description, date")
      .gte("date", period.startDate.toISOString())
      .lt("date", period.endDate.toISOString());
    if (error) {
      out.push({
        period_start: period.startDate.toISOString().split("T")[0],
        period_end: period.endDate.toISOString().split("T")[0],
        period_type: type,
        period_label: period.label,
        leads_trouves: 0, leads_qualifies: 0, appels: 0, rdv: 0, devis: 0,
        relances: 0, signatures: 0, acomptes: 0, leadmagnets: 0, relances_total: 0,
        ca: 0, mrr: 0,
      });
      continue;
    }
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
    (data || []).forEach((e) => {
      const t = e.type_evenement || "";
      if (t === "cold_call") metrics.appels++;
      else if (t.startsWith("relance_")) {
        metrics.relances++;
        metrics.relances_total++;
      } else if (t.startsWith("rdv_")) metrics.rdv++;
      else if (t === "devis") metrics.devis++;
      else if (t === "signature") metrics.signatures++;
      else if (t === "deposit") metrics.acomptes++; // compat
      else if (t === "acompte") metrics.acomptes++;
      else if (t === "lead_magnet") metrics.leadmagnets++;
      else if (t === "qualified") metrics.leads_qualifies++;
      if (e.description && (t.includes("ca") || t.includes("chiffre"))) {
        metrics.ca += extractAmountFromDescription(e.description) || 0;
      }
      if (e.description && t.includes("mrr")) {
        metrics.mrr += extractAmountFromDescription(e.description) || 0;
      }
    });
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
  const now = new Date();
  const arr: any[] = [];
  for (let i = 0; i < count; i++) {
    const period = genHistoricalPeriod(now, type, i);
    const { data } = await supabase
      .from("journal_succes")
      .select("type_evenement, description")
      .gte("date", period.startDate.toISOString())
      .lt("date", period.endDate.toISOString());
    const metrics = {
      leads_trouves: 0, leads_qualifies: 0, appels: 0, rdv: 0, devis: 0,
      relances: 0, signatures: 0, acomptes: 0, leadmagnets: 0, relances_total: 0,
      ca: 0, mrr: 0,
    };
    (data || []).forEach((e) => {
      const t = e.type_evenement || "";
      if (t === "cold_call") metrics.appels++;
      else if (t.startsWith("relance_")) { metrics.relances++; metrics.relances_total++; }
      else if (t.startsWith("rdv_")) metrics.rdv++;
      else if (t === "devis") metrics.devis++;
      else if (t === "signature") metrics.signatures++;
      else if (t === "deposit") metrics.acomptes++;
      else if (t === "acompte") metrics.acomptes++;
      else if (t === "lead_magnet") metrics.leadmagnets++;
      else if (t === "qualified") metrics.leads_qualifies++;
    });
    arr.push({
      period_start: period.startDate.toISOString().split("T")[0],
      period_end: period.endDate.toISOString().split("T")[0],
      period_type: type,
      period_label: period.label,
      ...metrics,
    });
  }
  return arr.reverse();
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

export async function GET(req: Request, context: RouteContext) {
  try {
    const params = context.params;
    const raw = params["path"];
    const segs = Array.isArray(raw) ? raw : (raw ? [raw] : []);
    const path = `/${segs.join("/")}`;
    const url = new URL(req.url);

    // Health
    if (path === "/health") {
      return json({ status: "OK", timestamp: new Date().toISOString() });
    }

    // Contacts list
    if (path === "/contacts") {
      const { data: contacts, error } = await supabase
        .from("contacts")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) return json({ error: "Failed to fetch contacts" }, 500);

      const enhanced = await Promise.all(
        (contacts || []).map(async (c: any) => {
          try {
            const ext = (await kvGet(`contact_extended_${c.id}`)) || {};
            return { ...c, ...ext, nom: c.last_name, prenom: c.first_name };
          } catch {
            return { ...c, nom: c.last_name, prenom: c.first_name };
          }
        })
      );
      return json(enhanced);
    }

    // Contacts by company
    const companyMatch = path.match(/^\/contacts\/company\/(\d+)$/);
    if (companyMatch) {
      const companyId = parseInt(companyMatch[1], 10);
      const { data: contacts, error } = await supabase
        .from("contacts")
        .select("*")
        .eq("entreprise_id", companyId);
      if (error) return json({ error: "Failed to fetch contacts" }, 500);

      const enhanced = await Promise.all(
        (contacts || []).map(async (c: any) => {
          try {
            const ext = (await kvGet(`contact_extended_${c.id}`)) || {};
            return { ...c, ...ext, nom: c.last_name, prenom: c.first_name };
          } catch {
            return { ...c, nom: c.last_name, prenom: c.first_name };
          }
        })
      );
      return json(enhanced);
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
      const periode = kpiProgressMatch[1];
      const { data, error } = await supabase
        .from("v_kpi_totals_from_journal")
        .select("metric, total, total_week, total_month, total_quarter, total_year");
      if (error) return json({ error: "Erreur lors de la récupération des données KPI" }, 500);
      const periodData = transformRealKpiDataByPeriod(data || [], periode);
      return json(periodData);
    }

    // KPI by-period (alias)
    if (path === "/kpi/by-period") {
      const type = url.searchParams.get("type") || "month";
      const { data, error } = await supabase
        .from("v_kpi_totals_from_journal")
        .select("metric, total, total_week, total_month, total_quarter, total_year");
      if (error) return json({ error: "Erreur lors de la récupération des données KPI" }, 500);
      const periodData = transformRealKpiDataByPeriod(data || [], type);
      return json(periodData);
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
      const hist = await getJournalHistory(opportunite_id, entreprise_id);
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

    // KPI totals from journal (view with fallback)
    if (path === "/kpi/journal-totals") {
      const { data, error } = await supabase
        .from("v_kpi_totals_from_journal")
        .select("metric, total, total_week, total_month, total_quarter, total_year");

      if (error) {
        // Fallback direct compute
        const { data: jdata, error: jerr } = await supabase
          .from("journal_succes")
          .select("type_evenement, created_at");
        if (jerr) return json({ error: "Failed to fetch KPI totals" }, 500);

        const now = new Date();
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const monthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
        const quarterAgo = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
        const yearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
        const f = (arr: any[], d: Date) => arr.filter((r) => new Date(r.created_at) >= d);

        const all = (t: string | ((x: any) => boolean)) =>
          (jdata || []).filter((r) => (typeof t === "string" ? r.type_evenement === t : t(r)));

        const res = {
          total_appels: all("cold_call").length,
          total_relances: all((r) => r.type_evenement?.startsWith("relance_")).length,
          total_rdvs: all((r) => r.type_evenement?.startsWith("rdv_")).length,
          total_devis: all("devis").length,
          total_signatures: all("signature").length,
          total_acomptes: all("deposit").length + all("acompte").length,
          total_lead_magnets: all("lead_magnet").length,
          total_qualified: all("qualified").length,
          week: {
            total_appels: f(all("cold_call"), weekAgo).length,
            total_relances: f(all((r) => r.type_evenement?.startsWith("relance_")), weekAgo).length,
            total_rdvs: f(all((r) => r.type_evenement?.startsWith("rdv_")), weekAgo).length,
            total_devis: f(all("devis"), weekAgo).length,
            total_signatures: f(all("signature"), weekAgo).length,
            total_acomptes: f(all("deposit").concat(all("acompte")), weekAgo).length,
            total_lead_magnets: f(all("lead_magnet"), weekAgo).length,
            total_qualified: f(all("qualified"), weekAgo).length,
          },
          month: {
            total_appels: f(all("cold_call"), monthAgo).length,
            total_relances: f(all((r) => r.type_evenement?.startsWith("relance_")), monthAgo).length,
            total_rdvs: f(all((r) => r.type_evenement?.startsWith("rdv_")), monthAgo).length,
            total_devis: f(all("devis"), monthAgo).length,
            total_signatures: f(all("signature"), monthAgo).length,
            total_acomptes: f(all("deposit").concat(all("acompte")), monthAgo).length,
            total_lead_magnets: f(all("lead_magnet"), monthAgo).length,
            total_qualified: f(all("qualified"), monthAgo).length,
          },
          quarter: {
            total_appels: f(all("cold_call"), quarterAgo).length,
            total_relances: f(all((r) => r.type_evenement?.startsWith("relance_")), quarterAgo).length,
            total_rdvs: f(all((r) => r.type_evenement?.startsWith("rdv_")), quarterAgo).length,
            total_devis: f(all("devis"), quarterAgo).length,
            total_signatures: f(all("signature"), quarterAgo).length,
            total_acomptes: f(all("deposit").concat(all("acompte")), quarterAgo).length,
            total_lead_magnets: f(all("lead_magnet"), quarterAgo).length,
            total_qualified: f(all("qualified"), quarterAgo).length,
          },
          year: {
            total_appels: f(all("cold_call"), yearAgo).length,
            total_relances: f(all((r) => r.type_evenement?.startsWith("relance_")), yearAgo).length,
            total_rdvs: f(all((r) => r.type_evenement?.startsWith("rdv_")), yearAgo).length,
            total_devis: f(all("devis"), yearAgo).length,
            total_signatures: f(all("signature"), yearAgo).length,
            total_acomptes: f(all("deposit").concat(all("acompte")), yearAgo).length,
            total_lead_magnets: f(all("lead_magnet"), yearAgo).length,
            total_qualified: f(all("qualified"), yearAgo).length,
          },
        };
        return json(res);
      }

      // Transform view
      const totals: any = {
        total_appels: 0, total_relances: 0, total_rdvs: 0, total_devis: 0,
        total_signatures: 0, total_acomptes: 0, total_lead_magnets: 0, total_qualified: 0,
        week: {}, month: {}, quarter: {}, year: {},
      };
      const setAll = (k: string, t: any) => {
        totals[k] = t.total || 0;
        (totals.week as any)[k] = t.total_week || 0;
        (totals.month as any)[k] = t.total_month || 0;
        (totals.quarter as any)[k] = t.total_quarter || 0;
        (totals.year as any)[k] = t.total_year || 0;
      };

      (data || []).forEach((row) => {
        const map = (m: string) => {
          switch (m) {
            case "cold_call":
            case "appels": return "total_appels";
            case "relances": return "total_relances";
            case "rdv":
            case "rdvs": return "total_rdvs";
            case "devis": return "total_devis";
            case "signature":
            case "signatures": return "total_signatures";
            case "deposit":
            case "acomptes": return "total_acomptes";
            case "lead_magnet":
            case "lead_magnets":
            case "leadmagnets": return "total_lead_magnets";
            case "qualified": return "total_qualified";
            default: return null;
          }
        };
        const key = map(row.metric);
        if (key) setAll(key, row);
      });

      return json(totals);
    }

    // Not found
    return json({ error: "Not Found" }, 404);
  } catch (err) {
    log("GET error", err);
    return json({ error: "Internal server error" }, 500);
  }
}

export async function POST(req: Request, context: RouteContext) {
  try {
    const params = context.params;
    const raw = params["path"];
    const segs = Array.isArray(raw) ? raw : (raw ? [raw] : []);
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
      if (!Array.isArray(objectives))
        return json({ error: "Format invalide: objectives doit être un tableau" }, 400);

      for (const o of objectives) {
        await supabase
          .from("kpi_objectives")
          .delete()
          .eq("period_unit", o.period_unit)
          .eq("period_start", o.period_start);

        const { error } = await supabase.from("kpi_objectives").insert([{
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
          leadmagnets: o.leadmagnets || 0,
          relances_total: o.relances_total || 0,
          ca: o.ca || 0,
          mrr: o.mrr || 0,
          label: o.label || null,
        }]);
        if (error) return json({ error: "Erreur lors de la sauvegarde" }, 500);
      }
      return json({ success: true, count: objectives.length });
    }

    // Journal endpoints
    if (path === "/journal/log") {
      await logEvent(body);
      return json({ success: true });
    }
    if (path === "/journal/call") {
      const { opportunite_id, entreprise_id, description } = body;
      await logCall(opportunite_id, entreprise_id, description);
      return json({ success: true });
    }
    if (path === "/journal/relance") {
      const { opportunite_id, entreprise_id, description } = body;
      await logRelance(opportunite_id, entreprise_id, description);
      return json({ success: true });
    }
    if (path === "/journal/rdv") {
      const { opportunite_id, entreprise_id, description } = body;
      await logRdv(opportunite_id, entreprise_id, description);
      return json({ success: true });
    }
    if (path === "/journal/devis") {
      const { opportunite_id, entreprise_id, description } = body;
      await logDevis(opportunite_id, entreprise_id, description);
      return json({ success: true });
    }
    if (path === "/journal/signature") {
      const { opportunite_id, entreprise_id, description } = body;
      await logSignature(opportunite_id, entreprise_id, description);
      return json({ success: true });
    }
    if (path === "/journal/acompte") {
      const { opportunite_id, entreprise_id, description } = body;
      await logAcompte(opportunite_id, entreprise_id, description);
      return json({ success: true });
    }
    if (path === "/journal/lead-magnet") {
      const { opportunite_id, entreprise_id, description } = body;
      await logLeadMagnet(opportunite_id, entreprise_id, description);
      return json({ success: true });
    }

    return json({ error: "Not Found" }, 404);
  } catch (err) {
    log("POST error", err);
    return json({ error: "Internal server error" }, 500);
  }
}

export async function PUT(req: Request, context: RouteContext) {
  try {
    const params = context.params;
    const raw = params["path"];
    const segs = Array.isArray(raw) ? raw : (raw ? [raw] : []);
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

export async function DELETE(_req: Request, context: RouteContext) {
  try {
    const params = context.params;
    const raw = params["path"];
    const segs = Array.isArray(raw) ? raw : (raw ? [raw] : []);
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
