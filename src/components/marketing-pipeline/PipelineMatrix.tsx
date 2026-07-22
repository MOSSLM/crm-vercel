"use client";

import React from "react";
import Link from "next/link";
import {
  Sparkles,
  ClipboardCheck,
  Globe,
  Search,
  UserPlus,
  Check,
  Lock,
  MoreVertical,
  MapPin,
  Eye,
  Pencil,
  RefreshCw,
  Loader2,
  User,
  EyeOff,
  AlertTriangle,
  ArrowRight,
  Rows3,
  LayoutGrid,
  Building2,
  Phone,
  FileText,
  Target,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { getCompanyDisplayName } from "@/utils/displayHelpers";
import type { BoardItem, AgentRef, TemplateRef, PipelineRef, MatrixHandlers } from "./types";
import "./mp-skin.css";

/* ── Stage model ──────────────────────────────────────────────────────────
 * The five production stages, mapped onto the board's milestone data. A row
 * (company) has, per stage, a status: done (passed), active (current, holds
 * the action) or locked (not yet reached). Validating the active stage's
 * action advances the milestone on the server, which — after refresh — turns
 * the next stage's cell active. Earlier "done" cells stay accessible (e.g. the
 * site card is still reachable while the row is on Audit).
 */
type StageId = "enrich" | "validation" | "site" | "audit" | "attribution";

interface StageDef {
  id: StageId;
  name: string;
  short: string;
  color: string;
  icon: LucideIcon;
}

const STAGES: StageDef[] = [
  { id: "enrich", name: "Enrichissement", short: "Enrichi", color: "#2A6FDB", icon: Sparkles },
  { id: "validation", name: "Validation données", short: "Validées", color: "#7A5AE0", icon: ClipboardCheck },
  { id: "site", name: "Site démo", short: "Site", color: "#E2552B", icon: Globe },
  { id: "audit", name: "Audit", short: "Audit", color: "#C8881F", icon: Search },
  { id: "attribution", name: "Attribution", short: "Attribué", color: "#1F8A5B", icon: UserPlus },
];

type CellStatus = "done" | "active" | "locked";

function siteValidated(item: BoardItem): boolean {
  return !!item.site && (item.site.is_published || item.site.build_stage === "pret");
}

/** Index of the current (active) stage; 5 means every stage is done. */
function activeStageIndex(item: BoardItem): number {
  if (!item.enriched) return 0;
  if (!item.project?.enrichment_validated) return 1;
  if (!siteValidated(item)) return 2;
  if (item.audit?.statut !== "ready") return 3;
  if (!item.agent) return 4;
  return 5;
}

function cellStatus(item: BoardItem, i: number): CellStatus {
  const a = activeStageIndex(item);
  return i < a ? "done" : i === a ? "active" : "locked";
}

/* ── small utils ──────────────────────────────────────────────────────── */
function rgba(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

const AGENT_COLORS = ["#E2552B", "#2A6FDB", "#7A5AE0", "#1F8A5B", "#C8881F", "#B5322F", "#2B7FB8"];
function colorForId(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AGENT_COLORS[h % AGENT_COLORS.length];
}

function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

function displayName(item: BoardItem): string {
  return getCompanyDisplayName(item.company_name || item.name, item.company_url) || item.name;
}

function normalizeUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  const t = url.trim();
  if (!t) return undefined;
  return /^https?:\/\//i.test(t) ? t : `https://${t.replace(/^\/+/, "")}`;
}

function valueLabel(item: BoardItem): string | null {
  if (item.type === "mrr" && item.mrr) return `${item.mrr.toLocaleString()}€/m`;
  if (item.montant) return `${item.montant.toLocaleString()}€`;
  return null;
}

function siteEditHref(site: NonNullable<BoardItem["site"]>): string {
  return site.is_claude_design ? `/site-builder/claude/${site.id}` : `/site-builder/${site.id}`;
}

/* ── Avatar ───────────────────────────────────────────────────────────── */
function Avatar({ initials, color, size = 22 }: { initials: string; color?: string; size?: number }) {
  return (
    <span
      className="av"
      style={{
        width: size,
        height: size,
        background: color || "var(--bg-3)",
        color: color ? "#fff" : "var(--text-2)",
        fontSize: Math.round(size * 0.4),
      }}
    >
      {initials}
    </span>
  );
}

/* ── Research shortcuts (enrichment / verification) ───────────────────── */
function ResearchLinks({ item, compact }: { item: BoardItem; compact?: boolean }) {
  const name = displayName(item);
  const q = encodeURIComponent(`${name} ${item.ville ?? ""}`.trim());
  const site = normalizeUrl(item.company_url);
  const links = [
    { k: "google", label: "Google", href: `https://www.google.com/search?q=${q}`, icon: Search },
    { k: "maps", label: "Maps", href: `https://www.google.com/maps/search/${q}`, icon: MapPin },
    ...(site ? [{ k: "site", label: "Site actuel", href: site, icon: Globe }] : []),
    { k: "pappers", label: "Pappers", href: `https://www.pappers.fr/recherche?q=${encodeURIComponent(name)}`, icon: Building2 },
  ];
  return (
    <div className="rlinks">
      {links.map((l) => {
        const I = l.icon;
        return (
          <a key={l.k} className="rlink" href={l.href} target="_blank" rel="noopener noreferrer" title={l.label} onClick={(e) => e.stopPropagation()}>
            <I className="ico-sm" />
            {!compact && <span>{l.label}</span>}
          </a>
        );
      })}
    </div>
  );
}

/* ── Column head ──────────────────────────────────────────────────────── */
function ColHead({ stage, i, counts }: { stage: StageDef; i: number; counts: Record<string, { active: number; done: number }> }) {
  const c = counts[stage.id] ?? { active: 0, done: 0 };
  const I = stage.icon;
  return (
    <div className="mx-colhead">
      <div className="hd">
        <span className="sw" style={{ background: rgba(stage.color, 0.12), color: stage.color }}>
          <I className="ico-sm" />
        </span>
        <span className="nm">{stage.name}</span>
        <span className="idx">{String(i + 1).padStart(2, "0")}</span>
      </div>
      <div className="meta">
        <b style={{ color: stage.color }}>{c.active}</b> en cours · {c.done} faites
      </div>
    </div>
  );
}

/* ── Row head ─────────────────────────────────────────────────────────── */
function RowHead({ item, onMenu, onAssignClick }: { item: BoardItem; onMenu: (e: React.MouseEvent, item: BoardItem) => void; onAssignClick: (e: React.MouseEvent, item: BoardItem) => void }) {
  const active = activeStageIndex(item);
  const doneCount = Math.min(active, STAGES.length);
  const done = active >= STAGES.length;
  const name = displayName(item);
  const val = valueLabel(item);
  const website = normalizeUrl(item.company_url);
  const statusLabel = done ? "Attribué · transféré" : `${doneCount}/${STAGES.length} validées`;

  return (
    <div className={"mx-rowhead" + (done ? " row-done" : "")}>
      <div className="rh-top">
        {item.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="rh-logo" src={item.logo_url} alt="" />
        ) : (
          <span className="rh-logo" style={{ background: colorForId(item.id) }}>
            {initialsOf(name)}
          </span>
        )}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="rh-name">{name}</div>
          <div className="rh-meta">
            {item.tags ? <span>{item.tags.split(",")[0]}</span> : null}
            {item.ville ? (
              <>
                {item.tags ? <span className="g">·</span> : null}
                <MapPin className="ico-xs" />
                {item.ville}
              </>
            ) : null}
          </div>
        </div>
        <button className="rh-more" onClick={(e) => onMenu(e, item)} title="Options">
          <MoreVertical className="ico-sm" />
        </button>
      </div>

      <div>
        <div className="rail">
          {STAGES.map((s, i) => {
            const st = cellStatus(item, i);
            const cls = st === "done" ? "done" : st === "active" ? "act" : "";
            return <i key={s.id} className={cls} style={{ "--seg": s.color } as React.CSSProperties} />;
          })}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 7 }}>
          <span className="rh-status">{statusLabel}</span>
          {val && <span className="rh-status mono" style={{ color: "var(--text-2)", fontWeight: 600 }}>{val}</span>}
        </div>
      </div>

      <div className="rh-foot">
        {item.agent ? (
          <button className="assign has" title="Réattribuer" onClick={(e) => onAssignClick(e, item)}>
            <Avatar initials={initialsOf(item.agent.name)} color={colorForId(item.agent.id)} size={20} />
            {item.agent.name.split(" ")[0]}
          </button>
        ) : (
          <button className="assign" title="Attribuer" onClick={(e) => onAssignClick(e, item)}>
            <User className="ico-sm" />
            Non attribué
          </button>
        )}
        <div className="rh-links">
          {website ? (
            <a href={website} target="_blank" rel="noopener noreferrer" title={item.company_url ?? undefined}>
              <Globe className="ico-sm" />
            </a>
          ) : null}
          <button title="Voir / modifier la fiche" onClick={(e) => onMenu(e, item)}>
            <Phone className="ico-sm" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Cell ─────────────────────────────────────────────────────────────── */
interface CellProps {
  item: BoardItem;
  stage: StageDef;
  status: CellStatus;
  working: string | null;
  templateId: string;
  handlers: MatrixHandlers;
}

/* Body content for a reached (done or active) stage cell — identical in both
 * states so the card keeps its size and elements. */
function StageBody({ item, stage }: { item: BoardItem; stage: StageDef }) {
  const missing = item.missing_for_site ?? [];
  const website = normalizeUrl(item.enrichment?.website_url) ?? normalizeUrl(item.company_url);
  switch (stage.id) {
    case "enrich": {
      const failed = item.project?.statut === "failed";
      return (
        <div className="c-body" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {failed && item.project?.enrichment_error ? (
            <div className="alert" title={item.project.enrichment_error}>
              <AlertTriangle className="ico-sm" />
              <span className="clamp2">{item.project.enrichment_error}</span>
            </div>
          ) : null}
          <ResearchLinks item={item} compact />
        </div>
      );
    }
    case "validation":
      return (
        <div className="c-body" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {item.ville ? (
            <div className="kv"><MapPin className="ico-sm" />{item.ville}</div>
          ) : null}
          {website ? (
            <a className="kv" href={website} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
              <Globe className="ico-sm" />
              {(item.enrichment?.website_url || item.company_url || "").replace(/^https?:\/\//, "")}
            </a>
          ) : null}
          {missing.length > 0 ? (
            <span className="pill danger" title={`Manquant : ${missing.join(", ")}`} style={{ alignSelf: "flex-start" }}>
              Incomplet · {missing.length}
            </span>
          ) : (
            <span className="pill ok" style={{ alignSelf: "flex-start" }}>Variables OK</span>
          )}
        </div>
      );
    case "site":
      return (
        <div className="c-body" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div className="prev"><span>{item.site ? "maquette" : "à créer"}</span></div>
          {item.site?.url ? (
            <a className="kv" href={item.site.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
              <Globe className="ico-sm" />
              {item.site.url.replace(/^https?:\/\//, "")}
            </a>
          ) : item.site ? (
            <div className="kv"><Globe className="ico-sm" />Non déployé</div>
          ) : missing.length > 0 ? (
            <span className="pill danger" title={`Manquant : ${missing.join(", ")}`} style={{ alignSelf: "flex-start" }}>
              Incomplet · {missing.length}
            </span>
          ) : null}
        </div>
      );
    case "audit":
      return (
        <div className="c-body">
          {item.audit ? (
            <span className={"pill " + (item.audit.statut === "ready" ? "ok" : "warn")}>
              {item.audit.statut === "ready" ? "Audit prêt" : "Audit brouillon"}
            </span>
          ) : (
            <span className="pill">Aucun audit</span>
          )}
        </div>
      );
    default:
      return null;
  }
}

/* Actions for a reached cell. "Valider" appears only while the stage is active;
 * everything else (Éditer, Régénérer, Voir, Fiche) stays available once done so
 * earlier stages remain fully actionable (e.g. regenerate the site from Audit). */
function StageActions({ item, stage, done, busy, templateId, handlers }: { item: BoardItem; stage: StageDef; done: boolean; busy: boolean; templateId: string; handlers: MatrixHandlers }) {
  switch (stage.id) {
    case "enrich": {
      const failed = item.project?.statut === "failed";
      return (
        <div className="c-foot">
          <button className="btn sm" disabled={busy} title={failed ? "Relancer l'enrichissement" : "Enrichir"} onClick={() => handlers.onEnrich(item)}>
            {failed ? <RefreshCw className="ico-sm" /> : <Sparkles className="ico-sm" />}
            {failed ? "Relancer" : "Enrichir"}
          </button>
          <button className="btn ghost sm icon" disabled={busy} title="Voir / modifier la fiche" onClick={() => handlers.onDetails(item)}>
            <Pencil className="ico-sm" />
          </button>
        </div>
      );
    }
    case "validation":
      return (
        <div className="c-foot">
          <button className="btn ghost sm" disabled={busy} title="Vérifier / modifier la fiche" onClick={() => handlers.onDetails(item)}>
            <ClipboardCheck className="ico-sm" />
            Fiche
          </button>
          {!done && (
            <button className="btn ok sm icon" disabled={busy || !item.project} title="Valider les données" onClick={() => handlers.onValidateEnrich(item)}>
              <Check className="ico-sm" />
            </button>
          )}
        </div>
      );
    case "site":
      if (item.site) {
        return (
          <div className="c-foot">
            <Link className="btn ghost sm icon" href={siteEditHref(item.site)} title="Éditer le site">
              <Pencil className="ico-sm" />
            </Link>
            <button className="btn ghost sm icon" disabled={busy || item.entreprise_id == null || !templateId} title="Régénérer le site (nouvelle démo depuis les infos à jour)" onClick={() => handlers.onRegenerateSite(item)}>
              <RefreshCw className="ico-sm" />
            </button>
            {!done && (
              <button className="btn ok sm icon" disabled={busy} title="Valider le site" onClick={() => handlers.onValidateSite(item)}>
                <Check className="ico-sm" />
              </button>
            )}
          </div>
        );
      }
      return (
        <div className="c-foot">
          <button className="btn sm" disabled={busy || item.entreprise_id == null || !templateId} title={templateId ? "Créer le site démo" : "Choisis un template"} onClick={() => handlers.onCreateSite(item)}>
            <Globe className="ico-sm" />
            Créer
          </button>
          <button className="btn ghost sm icon" disabled={busy} title="Voir / modifier la fiche" onClick={() => handlers.onDetails(item)}>
            <Pencil className="ico-sm" />
          </button>
        </div>
      );
    case "audit":
      if (item.audit) {
        return (
          <div className="c-foot">
            <Link className="btn ghost sm icon" href={`/audits/${item.id}`} title="Éditer l'audit">
              <Pencil className="ico-sm" />
            </Link>
            {item.audit.pdf_url ? (
              <a className="btn ghost sm icon" href={item.audit.pdf_url} target="_blank" rel="noopener noreferrer" title="Voir le PDF">
                <Eye className="ico-sm" />
              </a>
            ) : null}
            {!done && (
              <button className="btn ok sm icon" disabled={busy} title="Valider l'audit" onClick={() => handlers.onValidateAudit(item)}>
                <Check className="ico-sm" />
              </button>
            )}
          </div>
        );
      }
      return (
        <div className="c-foot">
          <button className="btn sm" disabled={busy} title="Créer l'audit" onClick={() => handlers.onCreateAudit(item)}>
            <FileText className="ico-sm" />
            Créer l&apos;audit
          </button>
        </div>
      );
    default:
      return null;
  }
}

function StageCell({ item, stage, status, working, templateId, handlers }: CellProps) {
  const seg = {
    "--seg": stage.color,
    "--seg-soft": rgba(stage.color, 0.22),
    "--seg-wash": rgba(stage.color, 0.05),
  } as React.CSSProperties;

  if (status === "locked") {
    return (
      <div className="mx-cell locked">
        <div className="locked-ph">
          <Lock className="ico-sm" />
          <span className="t">À débloquer</span>
        </div>
      </div>
    );
  }

  const done = status === "done";
  const busy = working !== null;
  return (
    <div className={"mx-cell " + (done ? "done" : "active-cell")} style={seg}>
      <div className={"card " + (done ? "is-done" : "active")}>
        <div className="c-hd">
          {done ? (
            <span className="done-check"><Check className="ico-sm" strokeWidth={3} /></span>
          ) : (
            <span className="live-dot" />
          )}
          <span className="c-ttl">{stage.short}</span>
          <span className="c-tag">
            {done ? <span className="pill ok">Validé</span> : <span className="pill accent">En cours</span>}
          </span>
        </div>
        <StageBody item={item} stage={stage} />
        <StageActions item={item} stage={stage} done={done} busy={busy} templateId={templateId} handlers={handlers} />
      </div>
    </div>
  );
}

/* Attribution cell — keeps the agent picker in every state (also lets you
 * reassign once done). */
function AttributionCell({ item, stage, status, agents, working, handlers }: { item: BoardItem; stage: StageDef; status: CellStatus; agents: AgentRef[]; working: string | null; handlers: MatrixHandlers }) {
  const seg = {
    "--seg": stage.color,
    "--seg-soft": rgba(stage.color, 0.22),
    "--seg-wash": rgba(stage.color, 0.05),
  } as React.CSSProperties;

  if (status === "locked") {
    return (
      <div className="mx-cell locked">
        <div className="locked-ph">
          <Lock className="ico-sm" />
          <span className="t">À débloquer</span>
        </div>
      </div>
    );
  }

  const done = status === "done";
  const busy = working !== null;
  return (
    <div className={"mx-cell " + (done ? "done" : "active-cell")} style={seg}>
      <div className={"card " + (done ? "is-done" : "active")}>
        <div className="c-hd">
          {done ? (
            <span className="done-check"><Check className="ico-sm" strokeWidth={3} /></span>
          ) : (
            <span className="live-dot" />
          )}
          <span className="c-ttl">{stage.short}</span>
          <span className="c-tag">
            {done ? <span className="pill ok">Attribué</span> : <span className="pill accent">À attribuer</span>}
          </span>
        </div>
        {done && item.agent ? (
          <div className="c-body">
            <div className="done-line">
              <Avatar initials={initialsOf(item.agent.name)} color={colorForId(item.agent.id)} size={20} />
              {item.agent.name.split(" ")[0]}
            </div>
          </div>
        ) : (
          <div className="c-body muted" style={{ fontSize: 11 }}>Choisir l&apos;agent :</div>
        )}
        {agents.length === 0 ? (
          <div className="muted" style={{ fontSize: 11 }}>Aucun agent</div>
        ) : (
          <div className="agents">
            {agents.map((a) => (
              <button key={a.id} className="agent-pick" title={"Attribuer à " + a.name} disabled={busy} onClick={() => handlers.onAssign(item, a.id)}>
                <Avatar initials={initialsOf(a.name)} color={colorForId(a.id)} size={18} />
                {a.name.split(" ")[0]}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── The matrix view ──────────────────────────────────────────────────── */
type MenuState = { kind: "row" | "assign"; item: BoardItem; x: number; y: number } | null;
type AttributionFilter = "all" | "assigned" | "unassigned";

interface PipelineMatrixProps {
  items: BoardItem[];
  agents: AgentRef[];
  templates: TemplateRef[];
  pipelines: PipelineRef[];
  templateId: string;
  onTemplateChange: (id: string) => void;
  loading: boolean;
  working: string | null;
  onRefresh: () => void;
  handlers: MatrixHandlers;
}

export function PipelineMatrix({
  items,
  agents,
  templates,
  pipelines,
  templateId,
  onTemplateChange,
  loading,
  working,
  onRefresh,
  handlers,
}: PipelineMatrixProps) {
  const [q, setQ] = React.useState("");
  const [attribution, setAttribution] = React.useState<AttributionFilter>("all");
  const [owner, setOwner] = React.useState<string>("all");
  const [hideAttributed, setHideAttributed] = React.useState(false);
  const [pipelineFilter, setPipelineFilter] = React.useState("all");
  const [hidden, setHidden] = React.useState<Set<string>>(new Set());
  const [menu, setMenu] = React.useState<MenuState>(null);

  const toggleHidden = (id: string) =>
    setHidden((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const visibleRows = React.useMemo(() => {
    const nq = q.trim().toLowerCase();
    return items.filter((it) => {
      if (hidden.has(it.id)) return false;
      if (hideAttributed && it.agent) return false;
      if (attribution === "assigned" && !it.agent) return false;
      if (attribution === "unassigned" && it.agent) return false;
      if (owner !== "all" && it.agent?.id !== owner) return false;
      if (pipelineFilter !== "all" && it.pipeline_id !== pipelineFilter) return false;
      if (nq) {
        const hay = [displayName(it), it.ville ?? "", it.company_url ?? "", it.tags ?? ""].join(" ").toLowerCase();
        if (!hay.includes(nq)) return false;
      }
      return true;
    });
  }, [items, q, attribution, owner, hideAttributed, pipelineFilter, hidden]);

  const counts = React.useMemo(() => {
    const m: Record<string, { active: number; done: number }> = {};
    STAGES.forEach((s) => (m[s.id] = { active: 0, done: 0 }));
    visibleRows.forEach((it) =>
      STAGES.forEach((s, i) => {
        const st = cellStatus(it, i);
        if (st === "active") m[s.id].active++;
        else if (st === "done") m[s.id].done++;
      }),
    );
    return m;
  }, [visibleRows]);

  const stats = React.useMemo(() => {
    const total = items.length;
    const attribues = items.filter((it) => !!it.agent).length;
    const enCours = items.filter((it) => activeStageIndex(it) < STAGES.length && !it.agent).length;
    return { total, attribues, enCours };
  }, [items]);

  const openMenu = (e: React.MouseEvent, item: BoardItem, kind: "row" | "assign" = "row") => {
    e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    let x = kind === "assign" ? r.left : r.right - 220;
    x = Math.max(12, Math.min(x, window.innerWidth - 232));
    setMenu({ kind, item, x, y: r.bottom + 6 });
  };

  const hiddenCount = hidden.size;

  return (
    <div className="mp-scope">
      {/* ── header ── */}
      <div className="topbar">
        <div>
          <div className="kick">
            <span className="bt">
              <Target className="ico-xs" />
              Acquisition
            </span>
            <ChevronRight className="ico-xs" />
            <span>Marketing &amp; Web · pré-vente</span>
          </div>
          <h1 className="disp">Tableau d&apos;avancement</h1>
          <div className="sub">
            Chaque ligne est une <em>entreprise en préparation</em>. Validez une étape pour <em>débloquer la carte suivante</em> — les cartes précédentes restent accessibles sur la ligne ; la dernière l&apos;<em>attribue à un agent</em>.
          </div>
        </div>
        <div className="topbar-actions">
          <div className="seg">
            <button className="on">
              <Rows3 className="ico-sm" />
              Tableau
            </button>
            <button onClick={() => toast("Vue pipeline classique — bientôt")}>
              <LayoutGrid className="ico-sm" />
              Pipeline
            </button>
          </div>
          <button className="btn ghost sm" onClick={onRefresh} disabled={loading}>
            <RefreshCw className={"ico-sm" + (loading ? " spin" : "")} />
            Rafraîchir
          </button>
        </div>
      </div>

      {/* ── toolbar ── */}
      <div className="toolbar">
        <div className="search">
          <Search className="ico-sm" />
          <input placeholder="Rechercher une entreprise…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>

        <div className="tb-div" />
        <span className="tb-lb">Attribution</span>
        <div className="seg">
          {(
            [
              ["all", "Tous"],
              ["assigned", "Attribués"],
              ["unassigned", "Non attribués"],
            ] as [AttributionFilter, string][]
          ).map(([v, l]) => (
            <button key={v} className={attribution === v ? "on" : ""} onClick={() => setAttribution(v)}>
              {l}
            </button>
          ))}
        </div>

        {agents.length > 0 && (
          <div className="own-filter" title="Filtrer par agent">
            {agents.slice(0, 6).map((a) => (
              <button
                key={a.id}
                className={"av-btn" + (owner === a.id ? " sel" : owner !== "all" ? " dim" : "")}
                title={a.name}
                onClick={() => setOwner(owner === a.id ? "all" : a.id)}
              >
                <Avatar initials={initialsOf(a.name)} color={colorForId(a.id)} size={26} />
              </button>
            ))}
          </div>
        )}

        <div className="tb-div" />
        <button className={"btn subtle sm" + (hideAttributed ? " on" : "")} onClick={() => setHideAttributed((v) => !v)}>
          {hideAttributed ? <EyeOff className="ico-sm" /> : <Check className="ico-sm" />}
          Masquer attribués
        </button>
        {hiddenCount > 0 && (
          <button className="btn ghost sm" onClick={() => setHidden(new Set())}>
            <Eye className="ico-sm" />
            {hiddenCount} masqué{hiddenCount > 1 ? "s" : ""}
          </button>
        )}

        <div className="tb-div" />
        <span className="tb-lb">Template</span>
        <select className="mp-select" value={templateId} onChange={(e) => onTemplateChange(e.target.value)} title="Template utilisé pour créer les sites démo">
          {templates.length === 0 ? (
            <option value="">Aucun template</option>
          ) : (
            templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))
          )}
        </select>

        {pipelines.length > 0 && (
          <select className="mp-select" value={pipelineFilter} onChange={(e) => setPipelineFilter(e.target.value)} title="Filtrer par pipeline">
            <option value="all">Toutes les pipelines</option>
            {pipelines.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nom}
              </option>
            ))}
          </select>
        )}

        <div className="tb-stats">
          <div className="stat">
            <span className="v">{stats.total}</span>
            <span className="l">Prospects</span>
          </div>
          <div className="stat">
            <span className="v acc">{stats.enCours}</span>
            <span className="l">En cours</span>
          </div>
          <div className="stat">
            <span className="v ok">{stats.attribues}</span>
            <span className="l">Attribués</span>
          </div>
        </div>
      </div>

      {/* ── matrix ── */}
      <div className="mx-scroll">
        <div className="matrix" style={{ "--ncol": STAGES.length } as React.CSSProperties}>
          <div className="mx-corner">
            <div className="t">Entreprise</div>
            <div className="s">{visibleRows.length} lignes</div>
          </div>
          {STAGES.map((s, i) => (
            <ColHead key={s.id} stage={s} i={i} counts={counts} />
          ))}

          {loading && visibleRows.length === 0 ? (
            <div className="empty">
              <Loader2 className="ico spin" />
              <div className="t">Chargement…</div>
            </div>
          ) : visibleRows.length === 0 ? (
            <div className="empty">
              <Search className="ico" />
              <div className="t">Aucune entreprise</div>
              <div className="s">Ajustez les filtres ou la recherche.</div>
            </div>
          ) : (
            visibleRows.map((r) => (
              <React.Fragment key={r.id}>
                <RowHead item={r} onMenu={(e, it) => openMenu(e, it, "row")} onAssignClick={(e, it) => openMenu(e, it, "assign")} />
                {STAGES.map((s, i) => {
                  const status = cellStatus(r, i);
                  if (s.id === "attribution") {
                    return <AttributionCell key={s.id} item={r} stage={s} status={status} agents={agents} working={working} handlers={handlers} />;
                  }
                  return <StageCell key={s.id} item={r} stage={s} status={status} working={working} templateId={templateId} handlers={handlers} />;
                })}
              </React.Fragment>
            ))
          )}
        </div>
      </div>

      {/* ── legend ── */}
      <div className="legend">
        <span className="it">
          <span className="k" style={{ background: "var(--ok)" }} />
          Étape validée
        </span>
        <span className="it">
          <span className="k" style={{ background: "var(--accent)" }} />
          En cours (à valider)
        </span>
        <span className="it">
          <span className="k" style={{ background: "var(--bg-3)", border: "1px dashed var(--border-2)" }} />
          À débloquer
        </span>
        <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)" }}>
          {visibleRows.length} entreprises · {STAGES.length} étapes
        </span>
      </div>

      {/* ── row / assign menu ── */}
      {menu && (
        <>
          <div className="mp-scope-pop-scrim" onClick={() => setMenu(null)} />
          <div className="mp-scope-pop" style={{ top: menu.y, left: menu.x }}>
            {menu.kind === "assign" ? (
              <>
                <div className="ph">Attribuer à</div>
                {agents.length === 0 && <div className="pop-item">Aucun agent</div>}
                {agents.map((a) => (
                  <button
                    key={a.id}
                    className="pop-item"
                    onClick={() => {
                      handlers.onAssign(menu.item, a.id);
                      setMenu(null);
                    }}
                  >
                    <Avatar initials={initialsOf(a.name)} color={colorForId(a.id)} size={22} />
                    {a.name}
                    {menu.item.agent?.id === a.id && <Check className="ico-sm" style={{ marginLeft: "auto", color: "var(--ok)" }} />}
                  </button>
                ))}
              </>
            ) : (
              <>
                <div className="ph">{displayName(menu.item)}</div>
                <button
                  className="pop-item"
                  onClick={() => {
                    handlers.onDetails(menu.item);
                    setMenu(null);
                  }}
                >
                  <Building2 className="ico-sm" />
                  Voir / modifier la fiche
                </button>
                <button
                  className="pop-item"
                  onClick={() => {
                    toggleHidden(menu.item.id);
                    setMenu(null);
                  }}
                >
                  <EyeOff className="ico-sm" />
                  Masquer la ligne
                </button>
                {pipelines.length > 0 && (
                  <>
                    <div className="pop-sep" />
                    <div className="ph">Déplacer vers un pipeline</div>
                    {pipelines.map((p) => (
                      <button
                        key={p.id}
                        className="pop-item"
                        onClick={() => {
                          handlers.onMove(menu.item, p.id);
                          setMenu(null);
                        }}
                      >
                        <ArrowRight className="ico-sm" />
                        {p.nom}
                      </button>
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
