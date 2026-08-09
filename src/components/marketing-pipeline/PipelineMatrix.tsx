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
  MessageSquare,
  ListChecks,
  Gauge,
  Share2,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { getCompanyDisplayName } from "@/utils/displayHelpers";
import { PartagerDemoDialog } from "@/components/site-builder/PartagerDemoDialog";
import { authedFetch } from "@/utils/authedFetch";
import type {
  BoardItem,
  AgentRef,
  TemplateRef,
  PipelineRef,
  MatrixHandlers,
  BulkHandlers,
  NoteSubject,
} from "./types";
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

/** Les 5 étapes du board admin. */
export const STAGES: StageDef[] = [
  { id: "enrich", name: "Enrichissement", short: "Enrichi", color: "#2A6FDB", icon: Sparkles },
  { id: "validation", name: "Validation données", short: "Validées", color: "#7A5AE0", icon: ClipboardCheck },
  { id: "site", name: "Site démo", short: "Site", color: "#E2552B", icon: Globe },
  { id: "audit", name: "Audit", short: "Audit", color: "#C8881F", icon: Search },
  { id: "attribution", name: "Attribution", short: "Attribué", color: "#1F8A5B", icon: UserPlus },
];

/**
 * Les 4 étapes du board agent. L'attribution a déjà eu lieu — l'agent ne voit
 * que ses propres entreprises — donc la dernière colonne n'a plus de sens et
 * disparaît, avec tout ce qui l'accompagne (filtres d'attribution, bouton de
 * réattribution, menu « Attribuer à »).
 */
export const AGENT_STAGES: StageDef[] = STAGES.filter((s) => s.id !== "attribution");

type CellStatus = "done" | "active" | "locked";

function siteValidated(item: BoardItem): boolean {
  return !!item.site && (item.site.is_published || item.site.build_stage === "pret");
}

/**
 * Index de l'étape en cours ; `stages.length` signifie « tout est fait ».
 * L'étape d'attribution n'est évaluée que si elle fait partie du jeu d'étapes.
 */
function activeStageIndex(item: BoardItem, stages: StageDef[] = STAGES): number {
  if (!item.enriched) return 0;
  if (!item.project?.enrichment_validated) return 1;
  if (!siteValidated(item)) return 2;
  if (item.audit?.statut !== "ready") return 3;
  if (!stages.some((s) => s.id === "attribution")) return 4;
  if (!item.agent) return 4;
  return 5;
}

function cellStatus(item: BoardItem, i: number, stages: StageDef[] = STAGES): CellStatus {
  const a = activeStageIndex(item, stages);
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

/**
 * L'éditeur d'audit admin (`/audits/[id]`) passe par `AppLayout`, qui renvoie
 * tout non-admin sur son portail : un agent qui cliquait « Éditer l'audit »
 * atterrissait sur son dashboard. Le portail agent a donc sa propre route, qui
 * monte exactement le même éditeur.
 */
function auditEditHref(item: BoardItem, agentMode: boolean): string {
  return agentMode ? `/espace-agent/audits/${item.id}` : `/audits/${item.id}`;
}

/** Nombre de tickets non résolus sur la ligne (0 si la ligne n'en a pas). */
function openNotes(item: BoardItem): number {
  return item.notes?.open ?? 0;
}

/** La ligne a-t-elle un ticket ouvert sur cette étape ? */
function hasOpenNoteFor(item: BoardItem, subject: NoteSubject): boolean {
  return (item.notes?.open_subjects ?? []).includes(subject);
}

/**
 * Le site affiché vient-il d'un AUTRE template que celui sélectionné en haut ?
 * On ne conclut que si le site porte son template d'origine — sans la migration
 * `source_template_id`, on ne sait pas, et on ne crie pas au loup.
 */
function templateMismatch(item: BoardItem, templateId: string): boolean {
  const from = item.site?.template_id;
  return !!from && !!templateId && from !== templateId;
}

/** Nombre de variables requises encore manquantes (tri « incomplets d'abord »). */
function missingCount(item: BoardItem): number {
  return item.missing_for_site?.length ?? 0;
}

/**
 * « Partager » depuis la cellule Site.
 *
 * Un composant à part parce que le rendu des cellules est une simple fonction,
 * pas un composant : elle ne peut pas porter de `useState`, et le dialogue en a
 * besoin. C'est aussi le seul endroit du pipeline d'où l'on envoie réellement un
 * lien, donc le bon endroit pour voir la vignette avant de l'envoyer.
 */
function PartagerButton({ item }: { item: BoardItem }) {
  const [open, setOpen] = React.useState(false);
  if (!item.site) return null;
  return (
    <>
      <button
        className="btn ghost sm icon"
        title="Voir la vignette de partage et envoyer"
        onClick={() => setOpen(true)}
      >
        <Share2 className="ico-sm" />
      </button>
      <PartagerDemoDialog
        open={open}
        onOpenChange={setOpen}
        demo={{ id: item.site.id, published_subdomain: item.site.published_subdomain ?? null }}
        companyName={displayName(item)}
        entrepriseId={item.entreprise_id}
        opportuniteId={item.id}
      />
    </>
  );
}

/**
 * La vignette de partage, telle qu'elle partira sur WhatsApp.
 *
 * ELLE EST ICI POUR QU'UN DÉFAUT SE VOIE AVANT L'ENVOI. Un logo illisible, une
 * capture blanche, un téléphone manquant : tout cela ne se constatait
 * jusqu'ici que dans la conversation du prospect, c'est-à-dire trop tard, et
 * sans qu'on sache lequel des 113 sites est concerné.
 *
 * Les avertissements de fabrication sont affichés tels quels, sous l'image :
 * ce sont eux qui distinguent « carte complète » de « carte rendue sans son
 * aperçu parce que le site n'avait pas fini de s'afficher ».
 */
function VignetteCell({ item }: { item: BoardItem }) {
  const [url, setUrl] = React.useState<string | null>(item.site?.og_image_url ?? null);
  const [warnings, setWarnings] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState(false);

  // La ligne peut être remplacée par un rafraîchissement du board : on suit la
  // valeur venue du serveur tant qu'on n'a pas fabriqué nous-mêmes.
  React.useEffect(() => {
    setUrl((prev) => prev ?? item.site?.og_image_url ?? null);
  }, [item.site?.og_image_url]);

  const preparer = async (force: boolean) => {
    if (!item.site) return;
    setBusy(true);
    try {
      const res = await authedFetch(
        `/api/og/demo/${item.site.id}/prepare${force ? "?force=1" : ""}`,
        { method: "POST" },
      );
      const body = (await res.json().catch(() => ({}))) as {
        url?: string;
        warnings?: string[];
        error?: string;
      };
      if (!res.ok || !body.url) throw new Error(body.error || `Erreur ${res.status}`);
      setUrl(body.url);
      setWarnings(body.warnings ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Fabrication impossible");
    } finally {
      setBusy(false);
    }
  };

  if (!item.site) {
    return (
      <div className="vign-cell">
        <div className="vign-vide">Pas encore de site</div>
      </div>
    );
  }

  // Avant validation, la vignette photographierait un site en cours de
  // retouche : on l'annonce plutôt que de fabriquer une image à jeter.
  if (!siteValidated(item)) {
    return (
      <div className="vign-cell">
        <div className="vign-vide">Vignette après validation du site</div>
        {url ? <div className="vign-warn">Une vignette existe déjà — elle sera refaite.</div> : null}
      </div>
    );
  }

  return (
    <div className="vign-cell">
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer" title="Ouvrir en grand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="vign-img" src={url} alt="Vignette de partage" loading="lazy" />
        </a>
      ) : (
        <div className="vign-vide">
          {busy ? "Fabrication… (~20 s)" : "Aucune vignette — le lien partirait nu"}
        </div>
      )}

      {warnings.map((w) => (
        <div key={w} className="vign-warn">
          {w}
        </div>
      ))}

      <div className="vign-actions">
        <button
          className="btn ghost sm"
          disabled={busy}
          title={url ? "Refaire la vignette, captures comprises" : "Fabriquer la vignette"}
          onClick={() => preparer(Boolean(url))}
        >
          {busy ? <Loader2 className="ico-sm spin" /> : <RefreshCw className="ico-sm" />}
          {url ? "Refaire" : "Fabriquer"}
        </button>
      </div>
    </div>
  );
}

/** Bouton « Signaler un problème » posé sur les cartes d'étape. */
function NoteButton({
  item,
  subject,
  handlers,
}: {
  item: BoardItem;
  subject: NoteSubject;
  handlers: MatrixHandlers;
}) {
  const flagged = hasOpenNoteFor(item, subject);
  return (
    <button
      className={"btn ghost sm icon" + (flagged ? " danger-h" : "")}
      title={flagged ? "Ticket ouvert sur cette étape — voir le fil" : "Signaler un problème (ticket)"}
      style={flagged ? { color: "var(--danger)" } : undefined}
      onClick={() => handlers.onNotes(item, subject)}
    >
      <MessageSquare className="ico-sm" />
    </button>
  );
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
/**
 * L'en-tête est aussi le filtre de l'étape : un clic ne garde que les lignes qui
 * en sont là (« celles qui ont besoin du site », « … de l'audit »), un second
 * clic l'enlève. Les compteurs, eux, ignorent ce filtre pour rester lisibles.
 */
function ColHead({
  stage,
  i,
  counts,
  filtered,
  onFilter,
}: {
  stage: StageDef;
  i: number;
  counts: Record<string, { active: number; done: number }>;
  filtered: boolean;
  onFilter: () => void;
}) {
  const c = counts[stage.id] ?? { active: 0, done: 0 };
  const I = stage.icon;
  return (
    <div className={"mx-colhead" + (filtered ? " filt" : "")} style={{ "--seg": stage.color } as React.CSSProperties}>
      <button
        type="button"
        className="colhead-btn"
        onClick={onFilter}
        title={filtered ? "Enlever le filtre" : `N'afficher que les lignes à l'étape « ${stage.name} »`}
      >
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
      </button>
    </div>
  );
}

/* ── Row head ─────────────────────────────────────────────────────────── */
function RowHead({
  item,
  stages,
  canAssign,
  selected,
  onToggleSelect,
  onMenu,
  onAssignClick,
  onNotes,
}: {
  item: BoardItem;
  stages: StageDef[];
  canAssign: boolean;
  selected: boolean;
  onToggleSelect: (item: BoardItem) => void;
  onMenu: (e: React.MouseEvent, item: BoardItem) => void;
  onAssignClick: (e: React.MouseEvent, item: BoardItem) => void;
  onNotes: (item: BoardItem) => void;
}) {
  const active = activeStageIndex(item, stages);
  const doneCount = Math.min(active, stages.length);
  const done = active >= stages.length;
  const name = displayName(item);
  const val = valueLabel(item);
  const website = normalizeUrl(item.company_url);
  const missing = missingCount(item);
  const notesOpen = openNotes(item);
  const notesTotal = item.notes?.total ?? 0;
  const statusLabel = done
    ? canAssign
      ? "Attribué · transféré"
      : "Prêt · toutes les étapes validées"
    : `${doneCount}/${stages.length} validées`;

  return (
    <div className={"mx-rowhead" + (done ? " row-done" : "") + (selected ? " row-sel" : "")}>
      <div className="rh-top">
        <input
          type="checkbox"
          className="rh-check"
          checked={selected}
          onChange={() => onToggleSelect(item)}
          title="Sélectionner pour une action de masse"
          aria-label={`Sélectionner ${name}`}
        />
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
          {stages.map((s, i) => {
            const st = cellStatus(item, i, stages);
            const cls = st === "done" ? "done" : st === "active" ? "act" : "";
            return <i key={s.id} className={cls} style={{ "--seg": s.color } as React.CSSProperties} />;
          })}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 7, gap: 6 }}>
          <span className="rh-status">{statusLabel}</span>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {missing > 0 && (
              <span className="pill danger" title={`Variables manquantes : ${item.missing_for_site.join(", ")}`}>
                {missing} manquant{missing > 1 ? "s" : ""}
              </span>
            )}
            {val && <span className="rh-status mono" style={{ color: "var(--text-2)", fontWeight: 600 }}>{val}</span>}
          </span>
        </div>
      </div>

      <div className="rh-foot">
        {!canAssign ? (
          <span className="assign" style={{ pointerEvents: "none" }}>
            <User className="ico-sm" />
            {item.agent?.name.split(" ")[0] ?? "Mon prospect"}
          </span>
        ) : item.agent ? (
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
          <button
            className={"tk" + (notesOpen > 0 ? " on" : "")}
            title={
              notesOpen > 0
                ? `${notesOpen} ticket(s) en cours — ouvrir le fil`
                : notesTotal > 0
                  ? `${notesTotal} ticket(s) résolu(s) — ouvrir le fil`
                  : "Signaler un problème / voir les tickets"
            }
            onClick={(e) => {
              e.stopPropagation();
              onNotes(item);
            }}
          >
            <MessageSquare className="ico-xs" />
            {notesOpen > 0 ? notesOpen : notesTotal > 0 ? notesTotal : ""}
          </button>
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
  /** Nom du template sélectionné : rappelé dans les infobulles de création. */
  templateName: string | null;
  /** Mode agent : change la cible des liens qui ont un équivalent portail. */
  agentMode: boolean;
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
          <div className="prev">
            <span>{item.site ? item.site.template_name ?? "maquette" : "à créer"}</span>
          </div>
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
function StageActions({ item, stage, done, busy, templateId, templateName, agentMode, handlers }: { item: BoardItem; stage: StageDef; done: boolean; busy: boolean; templateId: string; templateName: string | null; agentMode: boolean; handlers: MatrixHandlers }) {
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
          <NoteButton item={item} subject="enrichment" handlers={handlers} />
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
          <NoteButton item={item} subject="enrichment" handlers={handlers} />
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
            <button
              className={"btn ghost sm icon" + (templateMismatch(item, templateId) ? " danger-h" : "")}
              disabled={busy || item.entreprise_id == null || !templateId}
              style={templateMismatch(item, templateId) ? { color: "var(--accent-2)" } : undefined}
              title={
                !templateName
                  ? "Choisis un template en haut de page"
                  : templateMismatch(item, templateId)
                    ? `Refaire ce site avec « ${templateName} » (il vient de « ${item.site?.template_name} »)`
                    : `Refaire ce site depuis « ${templateName} » et reprendre les infos à jour de la fiche`
              }
              onClick={() => handlers.onRegenerateSite(item)}
            >
              <RefreshCw className="ico-sm" />
            </button>
            <PartagerButton item={item} />
            <NoteButton item={item} subject="site" handlers={handlers} />
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
          <button
            className="btn sm"
            disabled={busy || item.entreprise_id == null || !templateId}
            title={templateName ? `Créer le site démo depuis « ${templateName} »` : "Choisis un template en haut de page"}
            onClick={() => handlers.onCreateSite(item)}
          >
            <Globe className="ico-sm" />
            Créer
          </button>
          <button className="btn ghost sm icon" disabled={busy} title="Voir / modifier la fiche" onClick={() => handlers.onDetails(item)}>
            <Pencil className="ico-sm" />
          </button>
          <NoteButton item={item} subject="site" handlers={handlers} />
        </div>
      );
    case "audit":
      if (item.audit) {
        return (
          <div className="c-foot">
            <Link className="btn ghost sm icon" href={auditEditHref(item, agentMode)} title="Éditer l'audit">
              <Pencil className="ico-sm" />
            </Link>
            {item.audit.pdf_url ? (
              <a className="btn ghost sm icon" href={item.audit.pdf_url} target="_blank" rel="noopener noreferrer" title="Voir le PDF">
                <Eye className="ico-sm" />
              </a>
            ) : null}
            <NoteButton item={item} subject="audit" handlers={handlers} />
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
          <NoteButton item={item} subject="audit" handlers={handlers} />
        </div>
      );
    default:
      return null;
  }
}

function StageCell({ item, stage, status, working, templateId, templateName, agentMode, handlers }: CellProps) {
  const seg = {
    "--seg": stage.color,
    "--seg-soft": rgba(stage.color, 0.22),
    "--seg-wash": rgba(stage.color, 0.05),
  } as React.CSSProperties;

  if (status === "locked") {
    // La validation s'ouvre d'elle-même dès que la fiche est complète : dire
    // CE QUI manque évite de chercher pourquoi la carte reste fermée.
    const blocking = stage.id === "validation" ? (item.missing_for_site ?? []) : [];
    return (
      <div className="mx-cell locked">
        <div className="locked-ph">
          <Lock className="ico-sm" />
          <span className="t">À débloquer</span>
          {stage.id === "validation" && blocking.length > 0 && (
            <span className="s" title={`Variables manquantes : ${blocking.join(", ")}`}>
              {blocking.length} variable{blocking.length > 1 ? "s" : ""} à remplir
            </span>
          )}
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
        <StageActions
          item={item}
          stage={stage}
          done={done}
          busy={busy}
          templateId={templateId}
          templateName={templateName}
          agentMode={agentMode}
          handlers={handlers}
        />
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
              <button key={a.id} className="agent-pick" title={"Attribuer à " + a.name} disabled={busy} onClick={() => handlers.onAssign?.(item, a.id)}>
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

/* ── Bulk action bar ──────────────────────────────────────────────────────
 * Une sélection peut mélanger des lignes à des étapes différentes : plutôt que
 * d'imposer une étape courante, chaque action n'agit que sur les lignes
 * éligibles et affiche ce compte. Rien d'éligible → bouton désactivé.
 */
function BulkBar({
  rows,
  agents,
  pipelines,
  canAssign,
  busy,
  overwrite,
  onOverwriteChange,
  onClear,
  bulk,
  templateId,
  templateName,
}: {
  rows: BoardItem[];
  agents: AgentRef[];
  pipelines: PipelineRef[];
  canAssign: boolean;
  busy: boolean;
  overwrite: boolean;
  onOverwriteChange: (v: boolean) => void;
  onClear: () => void;
  bulk: BulkHandlers;
  /** Le modèle choisi en haut de page : cible de « Refaire les sites ». */
  templateId: string;
  templateName: string | null;
}) {
  const toComplete = rows.filter((r) => missingCount(r) > 0);
  const toValidateEnrich = rows.filter((r) => r.project && !r.project.enrichment_validated);
  const toCreateSite = rows.filter((r) => r.entreprise_id != null && !r.site);
  // Symétrique de `toCreateSite` : les lignes qui ONT déjà un site. Sans elles,
  // rebasculer un parc entier sur un nouveau modèle se faisait ligne par ligne.
  const toRegenerateSite = rows.filter((r) => r.entreprise_id != null && r.site);
  // Combien changeraient réellement de modèle — le reste est un simple
  // rafraîchissement des infos de fiche. La distinction change le sens du
  // bouton, donc elle est dite avant de cliquer.
  const toSwapTemplate = toRegenerateSite.filter((r) => templateMismatch(r, templateId));
  const toValidateSite = rows.filter((r) => r.site && !siteValidated(r));
  // Analyser le site ACTUEL du prospect ne dépend d'aucune étape du pipeline :
  // il suffit d'une entreprise. C'est même l'inverse — les notes servent à
  // décider qui démarcher, donc avant que quoi que ce soit soit construit.
  const toAnalyse = rows.filter((r) => r.entreprise_id != null);
  // Toute ligne qui a un site peut voir sa vignette préparée — publiée ou non,
  // puisque c'est justement le lien d'aperçu qui part le plus souvent.
  const toVignette = rows.filter((r) => r.site);
  const toCreateAudit = rows.filter((r) => !r.audit);
  const toValidateAudit = rows.filter((r) => r.audit && r.audit.statut !== "ready");

  const ct = (n: number) => <span className="ct">{n}</span>;

  return (
    <div className="bulkbar" role="group" aria-label="Actions de masse">
      <span className="cnt">{rows.length} sélectionnée{rows.length > 1 ? "s" : ""}</span>
      <button className="btn ghost xs" onClick={onClear} title="Tout désélectionner">
        <X className="ico-sm" />
      </button>
      <div className="tb-div" />

      <label className="ow" title="Vide l'enrichissement précédent avant de relancer, pour repartir de zéro (les corrections manuelles seront perdues).">
        <input type="checkbox" checked={overwrite} onChange={(e) => onOverwriteChange(e.target.checked)} />
        Écraser
      </label>
      <button className="btn sm" disabled={busy || rows.length === 0} onClick={() => bulk.onEnrich(rows, overwrite)}>
        <Sparkles className="ico-sm" />
        {overwrite ? "Ré-enrichir" : "Enrichir"}
        {ct(rows.length)}
      </button>
      <button
        className="btn sm"
        disabled={toComplete.length === 0}
        title="Compléter les variables manquantes des lignes cochées, dans une grille"
        onClick={() => bulk.onComplete(toComplete)}
      >
        <ListChecks className="ico-sm" />
        Compléter
        {ct(toComplete.length)}
      </button>
      <button className="btn sm" disabled={busy || toValidateEnrich.length === 0} onClick={() => bulk.onValidateEnrich(toValidateEnrich)}>
        <ClipboardCheck className="ico-sm" />
        Valider données
        {ct(toValidateEnrich.length)}
      </button>
      <button className="btn sm" disabled={busy || toCreateSite.length === 0} onClick={() => bulk.onCreateSites(toCreateSite)}>
        <Globe className="ico-sm" />
        Créer les sites
        {ct(toCreateSite.length)}
      </button>
      <button
        className={"btn sm" + (toSwapTemplate.length > 0 ? " danger-h" : "")}
        disabled={busy || toRegenerateSite.length === 0 || !templateId}
        title={
          !templateId
            ? "Choisis d'abord un template en haut de page"
            : toSwapTemplate.length > 0
              ? `Refaire ${toRegenerateSite.length} site(s) avec « ${templateName} » — dont ${toSwapTemplate.length} qui changent de modèle. Les retouches faites dans l'éditeur seront perdues.`
              : `Refaire ${toRegenerateSite.length} site(s) depuis « ${templateName} » et reprendre les infos à jour des fiches. Les retouches faites dans l'éditeur seront perdues.`
        }
        onClick={() => bulk.onRegenerateSites(toRegenerateSite)}
      >
        <RefreshCw className="ico-sm" />
        Refaire les sites
        {ct(toRegenerateSite.length)}
      </button>
      <button className="btn sm" disabled={busy || toValidateSite.length === 0} onClick={() => bulk.onValidateSites(toValidateSite)}>
        <Check className="ico-sm" />
        Valider les sites
        {ct(toValidateSite.length)}
      </button>
      <button
        className="btn sm"
        disabled={busy || toVignette.length === 0}
        title="Fabriquer à l'avance la vignette WhatsApp de ces sites — indispensable avant une campagne automatique"
        onClick={() => bulk.onPreparerVignettes(toVignette)}
      >
        <Share2 className="ico-sm" />
        Préparer les vignettes
        {ct(toVignette.length)}
      </button>
      <button
        className="btn sm"
        disabled={busy || toAnalyse.length === 0}
        title="Mesurer le site ACTUEL de ces entreprises (vitesse, SEO, mobile, conversion) pour prioriser le démarchage"
        onClick={() => bulk.onAnalyserSites(toAnalyse)}
      >
        <Gauge className="ico-sm" />
        Analyser les sites
        {ct(toAnalyse.length)}
      </button>
      <button className="btn sm" disabled={busy || toCreateAudit.length === 0} onClick={() => bulk.onCreateAudits(toCreateAudit)}>
        <FileText className="ico-sm" />
        Créer les audits
        {ct(toCreateAudit.length)}
      </button>
      <button className="btn sm" disabled={busy || toValidateAudit.length === 0} onClick={() => bulk.onValidateAudits(toValidateAudit)}>
        <Check className="ico-sm" />
        Valider les audits
        {ct(toValidateAudit.length)}
      </button>

      {canAssign && agents.length > 0 && bulk.onAssign && (
        <select
          className="mp-select"
          value=""
          disabled={busy}
          title="Attribuer les lignes sélectionnées à un agent"
          onChange={(e) => {
            if (e.target.value) bulk.onAssign?.(rows, e.target.value);
            e.target.value = "";
          }}
        >
          <option value="">Attribuer à…</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      )}
      {pipelines.length > 0 && (
        <select
          className="mp-select"
          value=""
          disabled={busy}
          title="Déplacer les lignes sélectionnées vers un autre pipeline"
          onChange={(e) => {
            if (e.target.value) bulk.onMove(rows, e.target.value);
            e.target.value = "";
          }}
        >
          <option value="">Déplacer vers…</option>
          {pipelines.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nom}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

/* ── The matrix view ──────────────────────────────────────────────────── */
type MenuState = { kind: "row" | "assign"; item: BoardItem; x: number; y: number } | null;
type AttributionFilter = "all" | "assigned" | "unassigned";
/** Filtre d'étape : « toutes », l'index d'une étape en cours, ou « terminées ». */
type StageFilter = "all" | "done" | number;
/**
 * Tri des lignes. Au-delà de l'avancement, on trie sur ce qui décide vraiment
 * du travail à faire : les variables encore manquantes (une ligne à 6 trous ne
 * se traite pas comme une ligne à 1) et les tickets en attente.
 */
type SortMode =
  | "recent"
  | "stage-asc"
  | "stage-desc"
  | "missing-desc"
  | "missing-asc"
  | "notes"
  | "name";
/** Complétude des variables requises pour créer le site. */
type DataFilter = "all" | "incomplete" | "complete";
/** Présence de tickets (notes agent ↔ admin). */
type TicketFilter = "all" | "open" | "none";

const SORT_LABELS: Array<[SortMode, string]> = [
  ["recent", "Trier : récentes"],
  ["stage-asc", "Trier : moins avancées"],
  ["stage-desc", "Trier : plus avancées"],
  ["missing-desc", "Trier : plus de champs manquants"],
  ["missing-asc", "Trier : moins de champs manquants"],
  ["notes", "Trier : tickets en cours d'abord"],
  ["name", "Trier : nom (A→Z)"],
];

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
  /** Actions de masse sur les lignes cochées (barre de sélection). */
  bulk: BulkHandlers;
  /**
   * `false` quand la colonne `lead_magnet_projects.enrichment_validated` manque
   * en base : l'étape « Validation données » n'a alors nulle part où s'inscrire
   * et retombe sur `pret_pour_lm`, que la préparation de l'enrichissement met
   * déjà à `true` — la validation apparaît donc faite sans que personne ne l'ait
   * faite. On le dit au lieu de le subir en silence.
   */
  hasValidatedColumn?: boolean;
  /** Jeu d'étapes à afficher. `STAGES` (5) côté admin, `AGENT_STAGES` (4) côté agent. */
  stages?: StageDef[];
  /**
   * Affiche tout ce qui touche à l'attribution : colonne, filtres, bouton de
   * réattribution, menu « Attribuer à ». Faux côté agent, où l'attribution a
   * déjà eu lieu en amont.
   */
  canAssign?: boolean;
  /**
   * Board monté dans le portail agent : les liens qui ont un équivalent portail
   * (l'éditeur d'audit) pointent vers celui-ci plutôt que vers la route admin,
   * qui redirige un agent sur son dashboard.
   */
  agentMode?: boolean;
  /** Ouvre la boîte de réception des tickets (toutes lignes confondues). */
  onOpenTickets?: () => void;
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
  bulk,
  hasValidatedColumn = true,
  stages = STAGES,
  canAssign = true,
  agentMode = false,
  onOpenTickets,
}: PipelineMatrixProps) {
  const [q, setQ] = React.useState("");
  const [attribution, setAttribution] = React.useState<AttributionFilter>("all");
  const [owner, setOwner] = React.useState<string>("all");
  const [hideAttributed, setHideAttributed] = React.useState(false);
  const [pipelineFilter, setPipelineFilter] = React.useState("all");
  const [stageFilter, setStageFilter] = React.useState<StageFilter>("all");
  const [dataFilter, setDataFilter] = React.useState<DataFilter>("all");
  const [ticketFilter, setTicketFilter] = React.useState<TicketFilter>("all");
  const [sort, setSort] = React.useState<SortMode>("recent");
  const [hidden, setHidden] = React.useState<Set<string>>(new Set());
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [overwriteEnrich, setOverwriteEnrich] = React.useState(false);
  const [menu, setMenu] = React.useState<MenuState>(null);

  const toggleHidden = (id: string) =>
    setHidden((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const toggleSelected = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  // Lignes retenues par tout sauf le filtre d'étape : c'est sur elles que les
  // compteurs des en-têtes sont calculés, sinon filtrer sur une étape ferait
  // tomber à zéro les compteurs des autres colonnes — donc du filtre lui-même.
  const baseRows = React.useMemo(() => {
    const nq = q.trim().toLowerCase();
    return items.filter((it) => {
      if (hidden.has(it.id)) return false;
      if (hideAttributed && it.agent) return false;
      if (attribution === "assigned" && !it.agent) return false;
      if (attribution === "unassigned" && it.agent) return false;
      if (owner !== "all" && it.agent?.id !== owner) return false;
      if (pipelineFilter !== "all" && it.pipeline_id !== pipelineFilter) return false;
      if (dataFilter === "incomplete" && missingCount(it) === 0) return false;
      if (dataFilter === "complete" && missingCount(it) > 0) return false;
      if (ticketFilter === "open" && openNotes(it) === 0) return false;
      if (ticketFilter === "none" && openNotes(it) > 0) return false;
      if (nq) {
        const hay = [displayName(it), it.ville ?? "", it.company_url ?? "", it.tags ?? ""].join(" ").toLowerCase();
        if (!hay.includes(nq)) return false;
      }
      return true;
    });
  }, [items, q, attribution, owner, hideAttributed, pipelineFilter, dataFilter, ticketFilter, hidden]);

  const visibleRows = React.useMemo(() => {
    const rows =
      stageFilter === "all"
        ? baseRows
        : baseRows.filter((it) => {
            const a = activeStageIndex(it, stages);
            return stageFilter === "done" ? a >= stages.length : a === stageFilter;
          });
    if (sort === "recent") return rows;

    // Tri stable : `items` arrive déjà trié par `updated_at`, on ne réordonne
    // qu'à égalité sur le critère demandé — l'ordre récent reste le départage.
    const key = (it: BoardItem): number => {
      switch (sort) {
        case "stage-asc":
          return activeStageIndex(it, stages);
        case "stage-desc":
          return -activeStageIndex(it, stages);
        case "missing-desc":
          return -missingCount(it);
        case "missing-asc":
          return missingCount(it);
        case "notes":
          return -openNotes(it);
        default:
          return 0;
      }
    };
    if (sort === "name") {
      return [...rows].sort((a, b) => displayName(a).localeCompare(displayName(b), "fr"));
    }
    return [...rows].sort((a, b) => key(a) - key(b));
  }, [baseRows, stageFilter, sort, stages]);

  const counts = React.useMemo(() => {
    const m: Record<string, { active: number; done: number }> = {};
    stages.forEach((s) => (m[s.id] = { active: 0, done: 0 }));
    baseRows.forEach((it) =>
      stages.forEach((s, i) => {
        const st = cellStatus(it, i, stages);
        if (st === "active") m[s.id].active++;
        else if (st === "done") m[s.id].done++;
      }),
    );
    return m;
  }, [baseRows, stages]);

  // On n'agit jamais sur une ligne qu'on ne voit pas : la sélection est
  // intersectée avec les lignes affichées.
  const selectedRows = React.useMemo(
    () => visibleRows.filter((it) => selected.has(it.id)),
    [visibleRows, selected],
  );
  /** Lignes visibles auxquelles il manque encore une variable requise. */
  const incompleteRows = React.useMemo(() => visibleRows.filter((it) => missingCount(it) > 0), [visibleRows]);
  const allVisibleSelected = visibleRows.length > 0 && selectedRows.length === visibleRows.length;
  const toggleAllVisible = () =>
    setSelected((s) => {
      const n = new Set(s);
      if (allVisibleSelected) visibleRows.forEach((it) => n.delete(it.id));
      else visibleRows.forEach((it) => n.add(it.id));
      return n;
    });

  const selectedTemplate = React.useMemo(
    () => templates.find((t) => t.id === templateId) ?? null,
    [templates, templateId],
  );

  /**
   * Libellés du menu Template. Deux templates peuvent porter le même nom (un
   * ZIP multi-templates les nomme d'après leurs pages) : on suffixe alors le
   * début de l'id, sinon impossible de savoir lequel on a choisi. Les templates
   * classiques (hors Claude Design) sont marqués — ils ne produisent pas le
   * même site.
   */
  const templateOptions = React.useMemo(() => {
    const byName = new Map<string, number>();
    for (const t of templates) byName.set(t.name, (byName.get(t.name) ?? 0) + 1);
    return templates.map((t) => ({
      id: t.id,
      label:
        t.name +
        ((byName.get(t.name) ?? 0) > 1 ? ` (${t.id.slice(0, 4)})` : "") +
        (t.is_claude_design ? "" : " · classique"),
    }));
  }, [templates]);

  const stats = React.useMemo(() => {
    const total = items.length;
    const attribues = items.filter((it) => !!it.agent).length;
    const enCours = items.filter(
      (it) => activeStageIndex(it, stages) < stages.length && (!canAssign || !it.agent),
    ).length;
    const termines = items.filter((it) => activeStageIndex(it, stages) >= stages.length).length;
    const tickets = items.reduce((n, it) => n + openNotes(it), 0);
    return { total, attribues, enCours, termines, tickets };
  }, [items, stages, canAssign]);

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
            Chaque ligne est une <em>entreprise en préparation</em>. Validez une étape pour <em>débloquer la carte suivante</em> — les cartes précédentes restent accessibles sur la ligne
            {canAssign ? (
              <>
                {" "}; la dernière l&apos;<em>attribue à un agent</em>.
              </>
            ) : (
              <> ; ce sont vos <em>entreprises attribuées</em>.</>
            )}
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
          {onOpenTickets && (
            <button
              className="btn subtle sm"
              onClick={onOpenTickets}
              title="Tous les tickets signalés sur le pipeline"
            >
              <MessageSquare className="ico-sm" />
              Tickets
              {stats.tickets > 0 && <span className="ct">{stats.tickets}</span>}
            </button>
          )}
          <button className="btn ghost sm" onClick={onRefresh} disabled={loading}>
            <RefreshCw className={"ico-sm" + (loading ? " spin" : "")} />
            Rafraîchir
          </button>
        </div>
      </div>

      {!hasValidatedColumn && (
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
            border: "1px solid var(--danger)",
            background: "var(--danger-tint)",
            color: "var(--danger)",
            borderRadius: 8,
            padding: "10px 12px",
            fontSize: 12.5,
            marginBottom: 12,
          }}
        >
          <AlertTriangle className="ico-sm" style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            <strong>Étape « Validation données » inopérante :</strong> la colonne{" "}
            <code>lead_magnet_projects.enrichment_validated</code> manque en base. Les lignes
            enrichies sautent la validation. Applique la migration{" "}
            <code>sql/20260708_marketing_pipeline_enrichment_validated.sql</code>.
          </span>
        </div>
      )}

      {/* ── toolbar ── */}
      <div className="toolbar">
        <div className="search">
          <Search className="ico-sm" />
          <input placeholder="Rechercher une entreprise…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>

        <div className="tb-div" />
        <span className="tb-lb">Étape</span>
        <select
          className="mp-select"
          value={String(stageFilter)}
          onChange={(e) => {
            const v = e.target.value;
            setStageFilter(v === "all" || v === "done" ? v : Number(v));
          }}
          title="Ne garder que les lignes qui en sont à cette étape"
        >
          <option value="all">Toutes les étapes</option>
          {stages.map((s, i) => (
            <option key={s.id} value={i}>
              {String(i + 1).padStart(2, "0")} · À faire : {s.name}
            </option>
          ))}
          <option value="done">Terminées</option>
        </select>

        <select
          className="mp-select"
          value={sort}
          onChange={(e) => setSort(e.target.value as SortMode)}
          title="Ordre des lignes"
        >
          {SORT_LABELS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>

        <select
          className="mp-select"
          value={dataFilter}
          onChange={(e) => setDataFilter(e.target.value as DataFilter)}
          title="Complétude des variables requises pour créer le site"
        >
          <option value="all">Données : toutes</option>
          <option value="incomplete">Données : incomplètes</option>
          <option value="complete">Données : complètes</option>
        </select>

        {/* Compléter d'un coup toutes les lignes visibles encore incomplètes.
            Posé à côté du filtre parce que c'est là qu'on les a trouvées — et
            sans passer par la sélection, qui aurait demandé de cocher soixante
            cases avant de saisir le premier champ. */}
        {incompleteRows.length > 0 && (
          <button
            className="btn sm"
            title="Compléter les variables manquantes des lignes visibles, dans une grille"
            onClick={() => bulk.onComplete(incompleteRows)}
          >
            <ListChecks className="ico-sm" />
            Compléter
            <span className="ct">{incompleteRows.length}</span>
          </button>
        )}

        <select
          className="mp-select"
          value={ticketFilter}
          onChange={(e) => setTicketFilter(e.target.value as TicketFilter)}
          title="Tickets signalés sur la ligne"
        >
          <option value="all">Tickets : tous</option>
          <option value="open">Tickets : en cours</option>
          <option value="none">Tickets : aucun</option>
        </select>

        {canAssign && (
          <>
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
            <button
              className={"btn subtle sm" + (hideAttributed ? " on" : "")}
              onClick={() => setHideAttributed((v) => !v)}
            >
              {hideAttributed ? <EyeOff className="ico-sm" /> : <Check className="ico-sm" />}
              Masquer attribués
            </button>
          </>
        )}
        {hiddenCount > 0 && (
          <button className="btn ghost sm" onClick={() => setHidden(new Set())}>
            <Eye className="ico-sm" />
            {hiddenCount} masqué{hiddenCount > 1 ? "s" : ""}
          </button>
        )}

        <div className="tb-div" />
        <span className="tb-lb">Template</span>
        <select
          className="mp-select"
          value={selectedTemplate ? templateId : ""}
          onChange={(e) => onTemplateChange(e.target.value)}
          title={
            selectedTemplate
              ? `Les sites démo seront créés depuis « ${selectedTemplate.name} »`
              : "Template utilisé pour créer les sites démo"
          }
        >
          {templates.length === 0 ? (
            <option value="">Aucun template</option>
          ) : (
            <>
              {/* Sans template résolu, le menu afficherait la 1re entrée tout en
                  n'ayant rien de sélectionné — d'où cette option explicite. */}
              {!selectedTemplate && <option value="">Choisir un template…</option>}
              {templateOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </>
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
            <span className="v ok">{canAssign ? stats.attribues : stats.termines}</span>
            <span className="l">{canAssign ? "Attribués" : "Terminés"}</span>
          </div>
          {stats.tickets > 0 && (
            <button
              className="stat"
              title="N'afficher que les lignes avec un ticket en cours"
              style={{ border: 0, background: "transparent", padding: 0, textAlign: "left" }}
              onClick={() => setTicketFilter((f) => (f === "open" ? "all" : "open"))}
            >
              <span className="v" style={{ color: "var(--danger)" }}>{stats.tickets}</span>
              <span className="l">Tickets</span>
            </button>
          )}
        </div>
      </div>

      {selectedRows.length > 0 && (
        <BulkBar
          rows={selectedRows}
          agents={agents}
          pipelines={pipelines}
          canAssign={canAssign}
          busy={working !== null}
          overwrite={overwriteEnrich}
          onOverwriteChange={setOverwriteEnrich}
          onClear={() => setSelected(new Set())}
          bulk={bulk}
          templateId={templateId}
          templateName={selectedTemplate?.name ?? null}
        />
      )}

      {/* ── matrix ── */}
      <div className="mx-scroll">
        <div className="matrix" style={{ "--ncol": stages.length } as React.CSSProperties}>
          <div className="mx-corner">
            <label className="cnr-sel" title="Tout sélectionner / désélectionner">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={toggleAllVisible}
                disabled={visibleRows.length === 0}
                aria-label="Tout sélectionner"
              />
              <span className="t">Entreprise</span>
            </label>
            <div className="s">
              {visibleRows.length} lignes
              {selectedRows.length > 0 ? ` · ${selectedRows.length} sél.` : ""}
            </div>
          </div>
          {stages.map((s, i) => (
            <ColHead
              key={s.id}
              stage={s}
              i={i}
              counts={counts}
              filtered={stageFilter === i}
              onFilter={() => setStageFilter((f) => (f === i ? "all" : i))}
            />
          ))}
          <div
            className="mx-colhead"
            style={{ "--seg": "#2B7FB8" } as React.CSSProperties}
            title="Ce que verra le prospect quand il recevra le lien"
          >
            <div className="hd">
              <span className="sw" style={{ background: rgba("#2B7FB8", 0.12), color: "#2B7FB8" }}>
                <Share2 className="ico-sm" />
              </span>
              <span className="nm">Vignette</span>
            </div>
          </div>

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
                <RowHead
                  item={r}
                  stages={stages}
                  canAssign={canAssign}
                  selected={selected.has(r.id)}
                  onToggleSelect={(it) => toggleSelected(it.id)}
                  onMenu={(e, it) => openMenu(e, it, "row")}
                  onAssignClick={(e, it) => openMenu(e, it, "assign")}
                  onNotes={(it) => handlers.onNotes(it)}
                />
                {stages.map((s, i) => {
                  const status = cellStatus(r, i, stages);
                  if (s.id === "attribution") {
                    return <AttributionCell key={s.id} item={r} stage={s} status={status} agents={agents} working={working} handlers={handlers} />;
                  }
                  return (
                    <StageCell
                      key={s.id}
                      item={r}
                      stage={s}
                      status={status}
                      working={working}
                      templateId={templateId}
                      templateName={selectedTemplate?.name ?? null}
                      agentMode={agentMode}
                      handlers={handlers}
                    />
                  );
                })}
                <VignetteCell item={r} />
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
          {visibleRows.length} entreprises · {stages.length} étapes
        </span>
      </div>

      {/* ── row / assign menu ── */}
      {menu && (
        <>
          <div className="mp-scope-pop-scrim" onClick={() => setMenu(null)} />
          <div className="mp-scope-pop" style={{ top: menu.y, left: menu.x }}>
            {menu.kind === "assign" && canAssign ? (
              <>
                <div className="ph">Attribuer à</div>
                {agents.length === 0 && <div className="pop-item">Aucun agent</div>}
                {agents.map((a) => (
                  <button
                    key={a.id}
                    className="pop-item"
                    onClick={() => {
                      handlers.onAssign?.(menu.item, a.id);
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
                    handlers.onNotes(menu.item);
                    setMenu(null);
                  }}
                >
                  <MessageSquare className="ico-sm" />
                  Tickets / signaler un problème
                  {openNotes(menu.item) > 0 && (
                    <span className="pill danger" style={{ marginLeft: "auto" }}>
                      {openNotes(menu.item)}
                    </span>
                  )}
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
