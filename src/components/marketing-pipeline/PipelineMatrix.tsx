"use client";

import React from "react";
import Link from "next/link";
import {
  Archive,
  ArchiveRestore,
  Sparkles,
  ClipboardCheck,
  Globe,
  Search,
  Flame,
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
  ChevronLeft,
  ScanSearch,
  CalendarClock,
  SlidersHorizontal,
  RotateCcw,
  MessageSquare,
  ListChecks,
  BookOpen,
  Copy,
  Printer,
  Gauge,
  Rocket,
  Share2,
  Shuffle,
  X,
  type LucideIcon,
} from "lucide-react";
import { MAX_PSI_PAR_LOT } from "@/utils/constants";
import { toast } from "sonner";
import { archiveReasonLabel } from "@/lib/archive/reasons";
import { getCompanyDisplayName } from "@/utils/displayHelpers";
import { PartagerDemoDialog } from "@/components/site-builder/PartagerDemoDialog";
import { authedFetch } from "@/utils/authedFetch";
import { CANAL_LABEL, sequenceSuggeree } from "@/lib/prospects/canal";
import { aUneFicheGoogle, lienGoogle, lienMaps } from "@/lib/prospects/lien-google";
import { AUTO_SEQUENCE, aDemarcher, inscriptionFinLabel, inscriptionVivante, sequenceEtatLabel, sequenceOptionLabel } from "./types";
import type {
  BoardItem,
  AgentRef,
  SequenceRef,
  TemplateRef,
  PipelineRef,
  MatrixHandlers,
  BulkHandlers,
  NoteSubject,
} from "./types";
import { GROUPES, compter, passeLesFiltres, type CleFiltre } from "./filtres";
import "./mp-skin.css";

/* ── Stage model ──────────────────────────────────────────────────────────
 * The five production stages, mapped onto the board's milestone data. A row
 * (company) has, per stage, a status: done (passed), active (current, holds
 * the action) or locked (not yet reached). Validating the active stage's
 * action advances the milestone on the server, which — after refresh — turns
 * the next stage's cell active. Earlier "done" cells stay accessible (e.g. the
 * site card is still reachable while the row is on Audit).
 */
type StageId = "enrich" | "validation" | "site" | "audit" | "sequence";

interface StageDef {
  id: StageId;
  name: string;
  short: string;
  color: string;
  icon: LucideIcon;
}

/** Les 5 étapes du board admin. */
export const STAGES: StageDef[] = [
  { id: "enrich", name: "Enrichissement", short: "Enrichi", color: "#0E93A6", icon: Sparkles },
  { id: "validation", name: "Validation données", short: "Validées", color: "#7A5AE0", icon: ClipboardCheck },
  { id: "site", name: "Site démo", short: "Site", color: "#2F7AE0", icon: Globe },
  { id: "audit", name: "Audit", short: "Audit", color: "#C8881F", icon: Search },
  { id: "sequence", name: "Séquence", short: "Séquence", color: "#1F8A5B", icon: Flame },
];

/**
 * Les 4 étapes du board agent. L'inscription en séquence est décidée par
 * l'admin — l'agent ne voit que ses propres entreprises et exécute les étapes
 * manuelles depuis sa file — donc la dernière colonne n'a pas de sens ici, avec
 * tout ce qui l'accompagne (filtres d'attribution, menu « Attribuer à »).
 */
export const AGENT_STAGES: StageDef[] = STAGES.filter((s) => s.id !== "sequence");

/**
 * Combien de lignes par page, au choix.
 *
 * Le tableau rendait TOUTES les lignes retenues par les filtres — 882 au
 * 20/08, chacune avec ses cinq cartes d'étape, sa vignette et sa plaquette.
 * Autant de DOM que la page mettait plusieurs secondes à poser, pour un écran
 * qui n'en montre qu'une vingtaine à la fois.
 *
 * La liste va jusqu'à 1000 parce qu'une page EST l'unité de sélection : cocher
 * la case d'en-tête coche la page, donc lisser cinq cents fiches d'un coup se
 * fait en réglant la page sur cinq cents. Un plafond plus bas aurait obligé à
 * cocher page après page — ce qui marche, mais qu'on ne devrait pas avoir à
 * faire pour un geste que Matteo a demandé explicitement.
 */
export const TAILLES_DE_PAGE = [10, 20, 30, 50, 100, 200, 500, 1000] as const;


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
  if (!stages.some((s) => s.id === "sequence")) return 4;
  // La ligne est « faite » quand elle est en séquence. L'agent qui la suit n'est
  // pas une étape du pipeline : c'est une propriété de la ligne, réglée sous son
  // nom dans l'en-tête.
  //
  // Une sortie pour canal mort ne compte PAS comme faite : l'inscription a
  // existé, mais rien n'est parti. L'étape reste à faire, autrement.
  if (aDemarcher(item)) return 4;
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

/**
 * Sept teintes d'identité, tirées au hasard du nom : n'importe quelles deux
 * peuvent se retrouver côte à côte, donc aucune ne doit ressembler à une autre.
 * L'azur de marque n'en fait pas partie — le bleu acier occupe déjà sa teinte,
 * et un avatar ne se déguise pas en bouton.
 */
const AGENT_COLORS = ["#A24E86", "#0E93A6", "#7A5AE0", "#1F8A5B", "#C8881F", "#B5322F", "#0A1B33"];
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

/**
 * La cellule « Plaquette » — le lien nominatif du prospect, et ce qu'il en a fait.
 *
 * POURQUOI UNE COLONNE, ET PAS UNE CASE DE PLUS DANS LA BARRE DE SÉLECTION. Le
 * geste de masse existait déjà (« Créer les plaquettes ») et fabriquait trois
 * cents jetons que RIEN n'affichait ensuite : ni le lien, ni le fait qu'il
 * existe, ni le nombre d'ouvertures. Le compteur d'ouvertures est pourtant la
 * raison d'être du jeton — « il l'a ouverte trois fois » vaut une relance, et
 * c'est la seule mesure dont dispose la cohorte sans site, invisible de GA4.
 * Une colonne est le seul endroit d'où l'on voit cet état ligne par ligne.
 *
 * DEUX LIENS, PARCE QU'ILS NE SERVENT PAS AU MÊME MOMENT. Celui qu'on copie part
 * par WhatsApp et s'ouvre au pouce ; celui qu'on imprime ajoute `?a4&imprimer`
 * et ouvre la boîte d'impression du navigateur — d'où l'on enregistre le PDF à
 * joindre à un mail. C'est exactement la mécanique du document d'audit.
 *
 * ELLE NE DÉPEND D'AUCUNE ÉTAPE. La plaquette s'envoie à qui n'a pas de site,
 * donc précisément aux lignes qui n'atteindront jamais la colonne « Audit ». La
 * conditionner à une étape reviendrait à la cacher à sa propre cohorte. La seule
 * exigence est d'avoir une entreprise : sans elle, il n'y a personne à nommer.
 */
function PlaquetteCell({ item }: { item: BoardItem }) {
  const [url, setUrl] = React.useState<string | null>(item.plaquette?.url ?? null);
  const [busy, setBusy] = React.useState(false);
  const [copie, setCopie] = React.useState(false);

  // La ligne peut être remplacée par un rafraîchissement du board : on suit la
  // valeur venue du serveur tant qu'on n'a pas frappé le jeton nous-mêmes.
  React.useEffect(() => {
    setUrl((prev) => prev ?? item.plaquette?.url ?? null);
  }, [item.plaquette?.url]);

  const vues = item.plaquette?.vues ?? 0;

  const preparer = async () => {
    if (item.entreprise_id == null) return;
    setBusy(true);
    try {
      // La MÊME route que le geste de masse, avec un seul identifiant : c'est
      // elle qui garantit qu'un jeton déjà posé n'est jamais remplacé — un lien
      // parti par WhatsApp doit continuer d'ouvrir.
      const res = await authedFetch("/api/agent/marketing-pipeline/plaquette", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entreprise_ids: [item.entreprise_id] }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        liens?: Array<{ url: string }>;
        echecs?: Array<{ motif: string }>;
        error?: string;
      };
      if (!res.ok) throw new Error(body.error || `Erreur ${res.status}`);
      const lien = body.liens?.[0]?.url;
      if (!lien) throw new Error(body.echecs?.[0]?.motif ?? "aucun lien rendu");
      setUrl(lien);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Plaquette impossible à préparer");
    } finally {
      setBusy(false);
    }
  };

  const copier = () => {
    if (!url) return;
    navigator.clipboard?.writeText(url).catch(() => {});
    setCopie(true);
    setTimeout(() => setCopie(false), 1600);
  };

  if (item.entreprise_id == null) {
    return (
      <div className="plaq-cell">
        <div className="plaq-vide">Aucune entreprise rattachée</div>
      </div>
    );
  }

  if (!url) {
    return (
      <div className="plaq-cell">
        <div className="plaq-vide">
          {busy ? "Préparation…" : "Lien collectif — l'ouverture ne sera attribuée à personne"}
        </div>
        <div className="plaq-actions">
          <button className="btn ghost sm" disabled={busy} onClick={preparer}>
            {busy ? <Loader2 className="ico-sm spin" /> : <BookOpen className="ico-sm" />}
            Préparer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="plaq-cell">
      {/* Le compteur d'abord : c'est lui qu'on vient chercher en balayant la
          colonne, pas l'URL — qu'on ne lit jamais, on la copie. */}
      <div className={`plaq-vues${vues > 0 ? " on" : ""}`}>
        {vues > 0
          ? `Ouverte ${vues} fois${item.plaquette?.vu_le ? ` · ${dateCourte(item.plaquette.vu_le)}` : ""}`
          : "Pas encore ouverte"}
      </div>
      <div className="plaq-url" title={url}>
        {url.replace(/^https?:\/\//, "")}
      </div>
      <div className="plaq-actions">
        <button className="btn ghost sm" onClick={copier} title="Copier le lien à envoyer">
          {copie ? <Check className="ico-sm" /> : <Copy className="ico-sm" />}
          {copie ? "Copié" : "Copier"}
        </button>
        <a
          className="btn ghost sm"
          href={`${url}?a4&imprimer`}
          target="_blank"
          rel="noopener noreferrer"
          title="Ouvrir en A4 et lancer l'impression — « Enregistrer en PDF » dans la boîte du navigateur"
        >
          <Printer className="ico-sm" />
          PDF
        </a>
      </div>
    </div>
  );
}

/** `17 août` — le compteur d'ouvertures n'a que faire de l'heure ni de l'année. */
function dateCourte(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
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
  const site = normalizeUrl(item.company_url);
  // Sa fiche Google plutôt qu'une recherche à son nom : cf. `lien-google.ts`.
  const prospect = { name, ville: item.ville, google_url: item.google_url, google_maps_url: item.google_maps_url };
  const surFiche = aUneFicheGoogle(prospect);
  const links = [
    {
      k: "google",
      label: surFiche ? "Fiche Google" : "Rechercher sur Google",
      href: lienGoogle(prospect),
      icon: Search,
    },
    { k: "maps", label: surFiche ? "Fiche Maps" : "Rechercher sur Maps", href: lienMaps(prospect), icon: MapPin },
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
  agents,
  handlers,
  selected,
  onToggleSelect,
  onMenu,
  onNotes,
}: {
  item: BoardItem;
  stages: StageDef[];
  canAssign: boolean;
  /** Le menu d'attribution vit ici : l'agent est une propriété de la ligne. */
  agents: AgentRef[];
  handlers: MatrixHandlers;
  selected: boolean;
  onToggleSelect: (item: BoardItem) => void;
  onMenu: (e: React.MouseEvent, item: BoardItem) => void;
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
            {/* La note du site actuel, là où l'on décide qui démarcher.
                Absente quand l'entreprise n'a jamais été analysée, ou quand la
                migration n'est pas appliquée : une fonctionnalité qui n'existe
                pas ne doit pas ressembler à une donnée manquante. */}
            {item.note_site && (
              <span
                className={
                  "pill " +
                  (item.note_site.globale >= 70 ? "ok" : item.note_site.globale >= 45 ? "warn" : "danger")
                }
                title={
                  [
                    `Site actuel : ${item.note_site.globale}/100${item.note_site.libelle ? ` · ${item.note_site.libelle}` : ""}`,
                    [
                      item.note_site.vitesse != null ? `vitesse ${item.note_site.vitesse}` : null,
                      item.note_site.seo != null ? `SEO ${item.note_site.seo}` : null,
                      item.note_site.mobile != null ? `mobile ${item.note_site.mobile}` : null,
                      item.note_site.conversion != null ? `conversion ${item.note_site.conversion}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · "),
                    item.note_site.partielle ? "Analyse partielle — un axe au moins n'est pas concluant." : null,
                  ]
                    .filter(Boolean)
                    .join("\n")
                }
              >
                {item.note_site.globale}
                {item.note_site.partielle ? "*" : ""}
              </span>
            )}
            {item.archived_at && (
              <span
                className="pill danger"
                title={[archiveReasonLabel(item.archive_reason), item.archive_note]
                  .filter(Boolean)
                  .join(" — ")}
              >
                Archivé
              </span>
            )}
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
        {/* L'agent est une PROPRIÉTÉ de la ligne, pas une étape du pipeline :
            il se règle ici, sous le nom de l'entreprise, là où son prénom était
            déjà écrit. La dernière colonne sert désormais à la séquence, qui
            est le vrai geste terminal du parcours. */}
        {!canAssign ? (
          <span className="assign" style={{ pointerEvents: "none" }}>
            <User className="ico-sm" />
            {item.agent?.name.split(" ")[0] ?? "Mon prospect"}
          </span>
        ) : (
          <label className="assign-pick" title="Agent qui suit ce prospect — il recevra ses tâches manuelles">
            {item.agent ? (
              <Avatar initials={initialsOf(item.agent.name)} color={colorForId(item.agent.id)} size={20} />
            ) : (
              <User className="ico-sm" />
            )}
            <select
              value={item.agent?.id ?? ""}
              aria-label="Agent qui suit ce prospect"
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => {
                e.stopPropagation();
                if (e.target.value) handlers.onAssign?.(item, e.target.value);
              }}
            >
              <option value="">Non attribué</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
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
              <button
                className="btn ok sm icon"
                disabled={busy || !item.audit.prepare}
                title={
                  item.audit.prepare
                    ? "Valider l'audit"
                    : "Aucun constat rédigé — préparez l'audit avant de le valider"
                }
                onClick={() => handlers.onValidateAudit(item)}
              >
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

/* Sequence cell — la dernière colonne du board.
 *
 * Elle a remplacé « Attribution » : mettre en séquence est le vrai geste
 * terminal du pipeline marketing, et l'agent — qui n'est pas une étape mais une
 * propriété de la ligne — a rejoint le pied de l'en-tête, sous son nom.
 *
 * La séquence proposée est CALCULÉE à partir des canaux de la ligne et du
 * public que chaque séquence déclare (`sequenceSuggeree`). Rien n'est codé en
 * dur : le déroulant reste ouvert, la suggestion n'est qu'un favori. */
function SequenceCell({
  item,
  stage,
  stages,
  status,
  sequences,
  working,
  handlers,
}: {
  item: BoardItem;
  stage: StageDef;
  stages: StageDef[];
  status: CellStatus;
  sequences: SequenceRef[];
  working: string | null;
  handlers: MatrixHandlers;
}) {
  const seg = {
    "--seg": stage.color,
    "--seg-soft": rgba(stage.color, 0.22),
    "--seg-wash": rgba(stage.color, 0.05),
  } as React.CSSProperties;

  // Cette cellule ne se verrouille JAMAIS. Lancer un prospect dans une séquence
  // est une décision commerciale, pas une étape de production : l'audit peut
  // très bien se terminer pendant que les premiers messages partent. Le cadenas
  // ne protégeait rien — la même inscription restait faisable depuis la page
  // Séquences — il obligeait juste à sortir du board.
  //
  // Ce qui reste vrai est dit, pas masqué : quand on inscrit en avance, la carte
  // nomme les étapes encore en attente, et le rail d'avancement de la ligne
  // continue de compter cette étape comme non franchie.
  const early = status === "locked";
  const sequenceIndex = stages.findIndex((s) => s.id === "sequence");
  const pending = early
    ? stages.slice(activeStageIndex(item, stages), sequenceIndex).map((s) => s.name)
    : [];

  // La cellule dit la vérité sur la séquence elle-même : une ligne inscrite en
  // avance affiche sa séquence, quel que soit l'état de l'audit.
  //
  // Une inscription TERMINÉE compte aussi comme faite — l'étape « mettre en
  // séquence » a bien eu lieu. Elle est nommée pour ce qu'elle est plutôt que
  // rendue en « À inscrire », qui invitait à relancer un prospect déjà démarché.
  //
  // Mais une sortie pour canal mort n'est pas faite pour autant : rien n'est
  // parti. Elle revient en « À inscrire », avec la raison sous les yeux — sans
  // quoi on la remettrait sur le canal qui vient d'échouer.
  const enCours = inscriptionVivante(item.sequence);
  const aReprendre = aDemarcher(item);
  const done = !!item.sequence && !aReprendre;
  const finLabel =
    item.sequence && !enCours ? inscriptionFinLabel(item.sequence.status, item.sequence.exitReason) : null;
  const busy = working !== null;
  const canaux = new Set(item.canaux ?? []);
  // Un brouillon reste proposé — il correspond au canal de la ligne aussi bien
  // qu'une séquence déjà activée, et c'est souvent celui qu'on vient d'écrire.
  // Mais son état est ANNONCÉ, ici et dans le déroulant : une séquence qui n'est
  // pas `on` ne démarre pas, et l'inscription passe d'abord par son activation.
  const activables = sequences.filter((s) => s.status === "on" || s.status === "draft");
  // LA SÉQUENCE QUI VIENT D'ÉCHOUER N'EST PLUS SUGGÉRÉE.
  // La suggestion se calcule sur les canaux, et les canaux se lisent dans le
  // numéro : un mobile sans compte WhatsApp reste un mobile. Reproposer d'un
  // clic la séquence WhatsApp dont ce prospect vient de sortir refermait la
  // boucle que la sortie « hors canal » était censée ouvrir. Elle reste dans le
  // déroulant — c'est un choix qu'on peut vouloir refaire, pas un défaut.
  const echouee = item.sequence?.exitReason === "hors_canal" ? item.sequence.automationId : null;
  const brut = sequenceSuggeree(canaux, activables);
  const suggeree = brut && brut.id === echouee ? null : brut;
  const etatSuggeree = suggeree ? sequenceEtatLabel(suggeree.status) : null;

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
            {enCours ? (
              <span className="pill ok">En séquence</span>
            ) : done ? (
              <span className="pill">Terminée</span>
            ) : (
              <span className="pill accent">À inscrire</span>
            )}
          </span>
        </div>

        {early && pending.length > 0 && (
          <div
            className="c-body muted"
            style={{ fontSize: 10.5, display: "flex", alignItems: "center", gap: 4 }}
          >
            <Lock className="ico-xs" />
            <span title={`Étapes encore en attente : ${pending.join(", ")}`}>
              En avance · {pending.join(", ")}
            </span>
          </div>
        )}

        {done && item.sequence ? (
          <div className="c-body">
            <div className="done-line">
              <Flame className="ico-sm" />
              {item.sequence.name}
            </div>
            {enCours && item.sequence.holdReason === "awaiting_reply" && (
              <div className="muted" style={{ fontSize: 10.5, marginTop: 3 }}>
                en attente de réponse
              </div>
            )}
            {/* Une séquence finie ne se réinscrit pas toute seule, mais elle
                doit rester réinscriptible d'ici : sans ce déroulant, reprendre
                un prospect démarché il y a trois mois obligeait à sortir du
                board. C'est un choix, pas une case à cocher — d'où le silence
                du bouton conseillé, réservé au stock jamais démarché. */}
            {!enCours && (
              <>
                {finLabel && (
                  <div className="muted" style={{ fontSize: 10.5, marginTop: 3 }}>
                    {finLabel}
                  </div>
                )}
                {activables.length > 0 && (
                  <select
                    className="seq-pick"
                    style={{ marginTop: 4 }}
                    value=""
                    disabled={busy}
                    aria-label="Réinscrire dans une séquence"
                    onChange={(e) => {
                      if (e.target.value) handlers.onEnroll?.(item, e.target.value);
                    }}
                  >
                    <option value="">Réinscrire…</option>
                    {activables.map((s) => (
                      <option key={s.id} value={s.id}>
                        {sequenceOptionLabel(s)}
                      </option>
                    ))}
                  </select>
                )}
              </>
            )}
          </div>
        ) : (
          <>
            {/* Pourquoi cette ligne est revenue à « À inscrire » alors qu'elle
                a déjà porté une inscription. Sans ça, elle ressemble à du stock
                neuf, et on la renvoie sur le canal qui vient d'échouer. */}
            {aReprendre && finLabel && (
              <div className="c-body" style={{ fontSize: 10.5, color: "var(--warn, #C8881F)" }}>
                {item.sequence?.name} — {finLabel}
              </div>
            )}
            <div className="c-body muted" style={{ fontSize: 11 }}>
              {canaux.size === 0 ? (
                // Ni adresse ni téléphone : aucune séquence ne peut rien en
                // faire. Le dire ici évite une inscription qui gèlerait aussitôt.
                <span style={{ color: "var(--danger)" }}>Injoignable — ni e-mail ni téléphone</span>
              ) : (
                <>
                  Joignable par{" "}
                  {[...canaux].map((c) => CANAL_LABEL[c].toLowerCase()).join(" + ")}
                </>
              )}
            </div>
            {activables.length === 0 ? (
              <div className="muted" style={{ fontSize: 11 }}>Aucune séquence</div>
            ) : (
              <div className="agents">
                {suggeree && (
                  <button
                    className="agent-pick suggested"
                    title={
                      etatSuggeree
                        ? `Séquence conseillée pour ce canal — ${suggeree.name} (${etatSuggeree}, à activer avant de partir)`
                        : `Séquence conseillée pour ce canal — ${suggeree.name}`
                    }
                    disabled={busy || canaux.size === 0}
                    onClick={() => handlers.onEnroll?.(item, suggeree.id)}
                  >
                    <Flame className="ico-xs" />
                    {suggeree.name}
                    {etatSuggeree && <span className="pill warn">{etatSuggeree}</span>}
                  </button>
                )}
                <select
                  className="seq-pick"
                  value=""
                  disabled={busy}
                  aria-label="Inscrire dans une séquence"
                  onChange={(e) => {
                    if (e.target.value) handlers.onEnroll?.(item, e.target.value);
                  }}
                >
                  <option value="">{suggeree ? "Une autre séquence…" : "Choisir une séquence…"}</option>
                  {activables
                    .filter((s) => s.id !== suggeree?.id)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {sequenceOptionLabel(s)}
                      </option>
                    ))}
                </select>
              </div>
            )}
          </>
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
  sequences,
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
  sequences: SequenceRef[];
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
  // Une ligne déjà inscrite ne doit pas l'être deux fois : le prospect
  // recevrait tout en double. On la retire du lot AVANT de proposer l'action,
  // pour que le compte annoncé soit celui qui partira.
  //
  // « Déjà inscrite » veut dire inscription VIVANTE — même condition que
  // `enrollInSequence`, sinon le compte annoncé ne serait pas celui qui part.
  // Une séquence terminée reste réinscriptible en lot : c'est ce qu'on vient
  // chercher en filtrant sur « Séquence terminée ».
  const toEnroll = rows.filter((r) => !inscriptionVivante(r.sequence));
  const toValidateEnrich = rows.filter((r) => r.project && !r.project.enrichment_validated);
  const toCreateSite = rows.filter((r) => r.entreprise_id != null && !r.site);
  // Symétrique de `toCreateSite` : les lignes qui ONT déjà un site. Sans elles,
  // rebasculer un parc entier sur un nouveau modèle se faisait ligne par ligne.
  const toRegenerateSite = rows.filter((r) => r.entreprise_id != null && r.site);
  // Combien changeraient réellement de modèle — le reste est un simple
  // rafraîchissement des infos de fiche. La distinction change le sens du
  // bouton, donc elle est dite avant de cliquer.
  const toSwapTemplate = toRegenerateSite.filter((r) => templateMismatch(r, templateId));
  // Seul un design Claude porte des zones photo à remplir — la route refuse les
  // autres — et le tirage se fait à partir des services de l'entreprise, donc
  // sans entreprise il n'y a rien pour choisir.
  const toTirerImages = rows.filter((r) => r.site?.is_claude_design && r.entreprise_id != null);
  const toValidateSite = rows.filter((r) => r.site && !siteValidated(r));
  // Tout site peut être mis en ligne, y compris un site déjà publié : la page
  // publique sert l'instantané de sa dernière publication, donc republier est
  // le seul moyen d'y faire apparaître ce qui a été refait depuis.
  const toPublier = rows.filter((r) => r.site);
  const toRepublier = toPublier.filter((r) => r.site!.is_published);
  // Publier sous le nom de l'entreprise un site qu'on n'a pas encore regardé,
  // c'est mettre en ligne une page à moitié faite : le compte est dit avant.
  const toPublierNonValides = toPublier.filter((r) => !siteValidated(r));
  // Analyser le site ACTUEL du prospect ne dépend d'aucune étape du pipeline :
  // il suffit d'une entreprise. C'est même l'inverse — les notes servent à
  // décider qui démarcher, donc avant que quoi que ce soit soit construit.
  const toAnalyse = rows.filter((r) => r.entreprise_id != null);
  // `note_site` est le signal qu'une analyse maison existe : sans elle, la route
  // PageSpeed répond 409. Compter les autres afficherait un nombre que le clic
  // ne tiendrait pas.
  const toPsi = rows.filter((r) => r.entreprise_id != null && r.note_site);
  // Toute ligne qui a un site peut voir sa vignette préparée — publiée ou non,
  // puisque c'est justement le lien d'aperçu qui part le plus souvent.
  const toVignette = rows.filter((r) => r.site);
  const toCreateAudit = rows.filter((r) => !r.audit);
  // Le lot ne vise que les audits RÉDIGÉS. Le compteur du bouton devient donc le
  // nombre d'audits réellement prêts à partir, et non le nombre de lignes qui
  // portent un audit — c'est cette confusion qui a fait valider 67 documents vides.
  const toValidateAudit = rows.filter((r) => r.audit && r.audit.statut !== "ready" && r.audit.prepare);
  // Il suffit d'une entreprise : la plaquette ne mesure rien, ne montre rien du
  // prospect et ne dépend d'aucune étape du pipeline. Le compte n'exclut pas
  // celles qui ont déjà un jeton — le board ne le sait pas, et la route est
  // rejouable : elle dit elle-même combien existaient déjà.
  const toPlaquette = rows.filter((r) => r.entreprise_id != null);
  // Le lissage travaille sur des ENTREPRISES, pas sur des opportunités : une
  // ligne sans fiche n'a rien à mettre en file, et la route la refuserait.
  const toLisser = rows.filter((r) => r.entreprise_id != null);
  // Les chiffres clés vivent sur le dossier lead magnet : sans dossier, il n'y a
  // nulle part où les écrire.
  //
  // L'ÉLIGIBILITÉ NE SE LIMITE PAS AUX CASES VIDES, et c'est une correction :
  // 146 dossiers portent des installations INFÉRIEURES au barème sans qu'il leur
  // manque rien — une estimation antérieure les tirait des seuls avis Google.
  // `missing_for_site` ne peut pas le voir, puisque la case est remplie. Et le
  // board ne connaît pas les dates du registre : seule la route peut trancher,
  // et elle rend le compte exact de ce qu'elle a changé.
  const toChiffres = rows.filter((r) => r.project);

  const ct = (n: number) => <span className="ct">{n}</span>;

  return (
    <div className="bulkbar" role="group" aria-label="Actions de masse">
      <span className="cnt">{rows.length} sélectionnée{rows.length > 1 ? "s" : ""}</span>
      <button className="btn ghost xs" onClick={onClear} title="Tout désélectionner">
        <X className="ico-sm" />
      </button>
      <div className="tb-div" />

      {/*
        AVANT « Enrichir », et l'ordre est le fond du bouton : enrichir travaille
        sur ce que la fiche PORTE, lisser va chercher ce qu'elle n'a pas. Une
        fiche sans SIRET n'a rien à donner à l'annuaire ni à l'ADEME — l'enrichir
        d'abord revient à enrichir du vide, et c'est ce qui laissait des lignes
        sans ancienneté après un enrichissement qui avait pourtant « marché ».
      */}
      {bulk.onLisser && (
        <>
          <button
            className="btn sm"
            disabled={busy || toLisser.length === 0}
            title={
              toLisser.length === 0
                ? "Aucune entreprise dans la sélection"
                : `Mettre ${toLisser.length} fiche(s) dans la file de lissage : SIRET, fiche Google, site, RGE. Rien ne part maintenant — la passe apparaît dans Prospection → Lissage, où elle s'avance.`
            }
            onClick={() => bulk.onLisser!(toLisser)}
          >
            <ScanSearch className="ico-sm" />
            Lisser
            {ct(toLisser.length)}
          </button>
          <div className="tb-div" />
        </>
      )}

      {/*
        L'autre moitié du même geste : lisser va CHERCHER la date de création,
        celui-ci en DÉDUIT les chiffres. Rien ne sort, rien n'est facturé — la
        date est déjà en base pour 352 des 564 dossiers auxquels il manque une
        ancienneté, et l'enrichissement la faisait pourtant deviner par un LLM.
      */}
      {bulk.onCompleterChiffres && (
        <>
          <button
            className="btn sm"
            disabled={busy || toChiffres.length === 0}
            title={
              toChiffres.length === 0
                ? "Aucun dossier lead magnet dans la sélection"
                : `Recaler les chiffres clés de ${toChiffres.length} ligne(s) sur la date de création au registre — sans appel ni crédit d'IA. Remplit ce qui est vide et remonte ce qui est sous le barème ; ne baisse jamais un chiffre et ne touche jamais à ceux confirmés par le client.`
            }
            onClick={() => bulk.onCompleterChiffres!(toChiffres)}
          >
            <CalendarClock className="ico-sm" />
            Chiffres clés
            {ct(toChiffres.length)}
          </button>
          <div className="tb-div" />
        </>
      )}

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
      {/*
        Placé juste après « Refaire les sites », parce que c'est son ordre réel :
        une refonte repart du modèle et jette les retouches d'instance — donc le
        tirage précédent avec elles. Les photos se retirent APRÈS, jamais avant.
      */}
      <button
        className="btn sm"
        disabled={busy || toTirerImages.length === 0}
        title={
          toTirerImages.length === 0
            ? "Aucun design Claude dans la sélection : seules ces maquettes ont des zones photo à remplir"
            : `Retirer au sort les photos de ${toTirerImages.length} site(s) dans la médiathèque, selon les services de chaque entreprise. À refaire après une refonte, qui repart du modèle.`
        }
        onClick={() => bulk.onTirerImages(toTirerImages)}
      >
        <Shuffle className="ico-sm" />
        Tirer les images
        {ct(toTirerImages.length)}
      </button>
      <button className="btn sm" disabled={busy || toValidateSite.length === 0} onClick={() => bulk.onValidateSites(toValidateSite)}>
        <Check className="ico-sm" />
        Valider les sites
        {ct(toValidateSite.length)}
      </button>
      {/*
        Avant « Préparer les vignettes », et pas après : publier remet la carte
        de partage à zéro (elle montrerait l'état d'avant la mise en ligne).
        Fabriquer les vignettes d'abord, c'est les refaire pour rien.
      */}
      <button
        className="btn sm"
        disabled={busy || toPublier.length === 0}
        title={
          toPublier.length === 0
            ? "Aucun site dans la sélection"
            : `Mettre ${toPublier.length} site(s) en ligne sur un sous-domaine tiré du nom de l'entreprise` +
              (toRepublier.length > 0
                ? ` — dont ${toRepublier.length} déjà publié(s), republié(s) pour reprendre ce qui a changé depuis`
                : "") +
              (toPublierNonValides.length > 0
                ? `. Attention : ${toPublierNonValides.length} pas encore validé(s).`
                : "")
        }
        onClick={() => bulk.onPublierSites(toPublier)}
      >
        <Rocket className="ico-sm" />
        Publier les sites
        {ct(toPublier.length)}
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
      {/*
        Placé juste après « Analyser les sites » parce que c'est son ordre réel :
        la mesure Google exige une analyse maison préalable — c'est elle qui
        détermine l'URL réellement atteinte après redirections — et la route
        répond 409 sans elle. D'où l'éligibilité sur `note_site` : une entreprise
        jamais analysée n'est pas comptée.
      */}
      <button
        className="btn sm"
        disabled={busy || toPsi.length === 0}
        title={`Faire mesurer le site par Google dans un vrai navigateur : notes officielles et liste de ce qu'il relève. Environ 40 s par site, ${MAX_PSI_PAR_LOT} au maximum par lot.`}
        onClick={() => bulk.onMesurerPsi(toPsi)}
      >
        <Gauge className="ico-sm" />
        Mesurer avec Google
        {ct(toPsi.length)}
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
      {/*
        Juste après les audits, parce que c'est l'autre document du même choix :
        l'audit pour la cohorte qui a un site à mesurer, la plaquette pour celle
        qui n'en a pas. Rien à valider ici — la plaquette n'est pas rédigée, elle
        est la même pour tout le monde ; ce qui se prépare, c'est l'URL par
        laquelle on saura qui l'a ouverte.
      */}
      <button
        className="btn sm"
        disabled={busy || toPlaquette.length === 0}
        title="Préparer un lien de plaquette par entreprise — même document pour tous, une URL chacun, pour savoir qui l'ouvre. Sans effet sur celles qui en ont déjà un."
        onClick={() => bulk.onCreerPlaquettes(toPlaquette)}
      >
        <BookOpen className="ico-sm" />
        Créer les plaquettes
        {ct(toPlaquette.length)}
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
      {canAssign && sequences.length > 0 && bulk.onEnroll && (
        <select
          className="mp-select"
          value=""
          disabled={busy || toEnroll.length === 0}
          title={
            toEnroll.length === 0
              ? "Toutes les lignes sélectionnées sont déjà en séquence"
              : "Inscrire les lignes sélectionnées dans une séquence"
          }
          onChange={(e) => {
            if (e.target.value) bulk.onEnroll?.(toEnroll, e.target.value);
            e.target.value = "";
          }}
        >
          <option value="">Inscrire à…{toEnroll.length > 0 ? ` (${toEnroll.length})` : ""}</option>
          {/* Un lot mélangé n'a pas à être trié d'abord : chaque ligne part
              vers la séquence que son canal appelle, et la répartition est
              annoncée avant de partir. */}
          <option value={AUTO_SEQUENCE}>Séquence suggérée par canal</option>
          {sequences.map((s) => (
            <option key={s.id} value={s.id}>
              {sequenceOptionLabel(s)}
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
      {/* Le motif est demandé une seule fois pour tout le lot : archiver
          quarante pistes mortes une par une, personne ne le fera. */}
      <button
        className="btn sm danger-h"
        disabled={busy || rows.length === 0}
        title="Archiver les entreprises sélectionnées, avec leurs opportunités"
        onClick={() => bulk.onArchive(rows, "entreprise")}
      >
        <Archive className="ico-sm" />
        Archiver
        {ct(rows.length)}
      </button>
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
/**
 * Par quoi le prospect est joignable. Les trois derniers sont les segments
 * réels des séquences multicanal — les filtres qu'on veut vraiment, plutôt que
 * de croiser « avec e-mail » et « avec téléphone » à la main.
 */
type CanalFilter =
  | "all"
  | "email"
  | "mobile"
  | "fixe"
  | "mobile-sans-email"
  | "email-fixe"
  | "email-mobile"
  | "injoignable";
/** Présence de tickets (notes agent ↔ admin). */
type TicketFilter = "all" | "open" | "none";

/**
 * Cette ligne entre-t-elle dans le filtre de canal ?
 *
 * Les trois croisements (« mobile sans e-mail », « e-mail + fixe », « e-mail +
 * mobile ») sont exactement les publics des trois séquences multicanal : c'est
 * le tri qu'on veut réellement, et le croiser à la main depuis deux filtres
 * séparés était impossible.
 */
function matchesCanal(item: BoardItem, filter: CanalFilter): boolean {
  const c = new Set(item.canaux ?? []);
  switch (filter) {
    case "email":
      return c.has("email");
    case "mobile":
      return c.has("mobile");
    case "fixe":
      return c.has("fixe");
    case "mobile-sans-email":
      return c.has("mobile") && !c.has("email");
    case "email-fixe":
      return c.has("email") && c.has("fixe") && !c.has("mobile");
    case "email-mobile":
      return c.has("email") && c.has("mobile");
    case "injoignable":
      return c.size === 0;
    default:
      return true;
  }
}

const CANAL_FILTER_LABELS: Array<[CanalFilter, string]> = [
  ["all", "Canal : tous"],
  ["mobile-sans-email", "Sans e-mail + mobile"],
  ["email-fixe", "E-mail + fixe"],
  ["email-mobile", "E-mail + mobile"],
  ["email", "Avec e-mail"],
  ["mobile", "Avec mobile"],
  ["fixe", "Avec fixe"],
  ["injoignable", "Injoignable"],
];

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
  /** Séquences proposables, avec le public que chacune déclare viser. */
  sequences?: SequenceRef[];
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
  /**
   * `false` quand `sql/20260816_plaquettes_par_prospect.sql` n'est pas jouée :
   * la colonne « Plaquette » disparaît alors entièrement. Une colonne qui
   * annoncerait « aucune plaquette » sur toutes les lignes ferait cliquer pour
   * rien, et ressemblerait à une donnée manquante plutôt qu'à une migration
   * absente.
   */
  hasPlaquette?: boolean;
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
  /**
   * Le board montre les fiches archivées au lieu des actives. Le filtre est
   * fait côté serveur (`buildBoard({ archived })`) : la bascule ne fait que
   * recharger.
   */
  showArchived?: boolean;
  /** Bascule « Archivés ». Absent = pas de bouton (board sans archivage). */
  onToggleArchived?: () => void;
}

export function PipelineMatrix({
  items,
  agents,
  sequences = [],
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
  hasPlaquette = false,
  stages = STAGES,
  canAssign = true,
  agentMode = false,
  onOpenTickets,
  showArchived = false,
  onToggleArchived,
}: PipelineMatrixProps) {
  const [q, setQ] = React.useState("");
  const [attribution, setAttribution] = React.useState<AttributionFilter>("all");
  const [owner, setOwner] = React.useState<string>("all");
  const [hideAttributed, setHideAttributed] = React.useState(false);
  const [pipelineFilter, setPipelineFilter] = React.useState("all");
  const [stageFilter, setStageFilter] = React.useState<StageFilter>("all");
  const [dataFilter, setDataFilter] = React.useState<DataFilter>("all");
  const [canalFilter, setCanalFilter] = React.useState<CanalFilter>("all");
  const [sequenceFilter, setSequenceFilter] = React.useState<string>("all");
  const [ticketFilter, setTicketFilter] = React.useState<TicketFilter>("all");
  const [sort, setSort] = React.useState<SortMode>("recent");
  const [hidden, setHidden] = React.useState<Set<string>>(new Set());
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  // LA SÉLECTION SURVIT AU CHANGEMENT DE PAGE, la pagination non : on garde des
  // identifiants, pas des lignes. C'est ce qui permet de cocher trois pages de
  // cent puis de lancer un lissage sur les trois cents d'un coup.
  const [parPage, setParPage] = React.useState<number>(TAILLES_DE_PAGE[4]);
  const [page, setPage] = React.useState(1);
  /** Les cases cochées du panneau de filtres — « OU dans un groupe, ET entre eux ». */
  const [coches, setCoches] = React.useState<Set<CleFiltre>>(new Set());
  const [panneauFiltres, setPanneauFiltres] = React.useState(false);
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
      if (canalFilter !== "all" && !matchesCanal(it, canalFilter)) return false;
      // Trois états, pas deux — et la ligne de partage n'est pas « a une
      // inscription » mais « a reçu quelque chose ». Une sortie pour canal mort
      // (pas de compte WhatsApp) n'a rien envoyé : elle appartient au stock.
      // Une séquence terminée, si : elle est démarchée.
      if (sequenceFilter === "none" && !aDemarcher(it)) return false;
      if (sequenceFilter === "any" && !inscriptionVivante(it.sequence)) return false;
      if (sequenceFilter === "done" && (aDemarcher(it) || inscriptionVivante(it.sequence))) return false;
      if (!["all", "none", "any", "done"].includes(sequenceFilter)) {
        if (it.sequence?.automationId !== sequenceFilter) return false;
      }
      if (ticketFilter === "open" && openNotes(it) === 0) return false;
      if (ticketFilter === "none" && openNotes(it) > 0) return false;
      if (!passeLesFiltres(it, coches)) return false;
      if (nq) {
        const hay = [displayName(it), it.ville ?? "", it.company_url ?? "", it.tags ?? ""].join(" ").toLowerCase();
        if (!hay.includes(nq)) return false;
      }
      return true;
    });
  }, [items, q, attribution, owner, hideAttributed, pipelineFilter, dataFilter, canalFilter, sequenceFilter, ticketFilter, hidden, coches]);

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

  /**
   * Les effectifs de chaque case, comptés sur TOUT ce que l'API a rendu et non
   * sur ce que les filtres laissent passer. Sinon cocher une case ferait tomber
   * à zéro le compteur de toutes les autres — et on ne saurait plus ce qu'on
   * s'apprête à ajouter.
   */
  const effectifs = React.useMemo(() => compter(items), [items]);
  const nbCoches = coches.size;

  const basculer = (cle: CleFiltre) =>
    setCoches((s) => {
      const n = new Set(s);
      if (n.has(cle)) n.delete(cle);
      else n.add(cle);
      return n;
    });

  /**
   * Tout remettre à zéro — les cases ET les menus.
   *
   * Un bouton qui ne viderait que le panneau laisserait un tableau encore
   * filtré par l'étape, le canal ou la recherche, et donnerait à croire que la
   * remise à zéro ne marche pas. `hidden` part aussi : une ligne masquée est un
   * filtre, même si elle ne s'affiche pas comme tel.
   */
  const toutReinitialiser = () => {
    setCoches(new Set());
    setQ("");
    setStageFilter("all");
    setDataFilter("all");
    setCanalFilter("all");
    setSequenceFilter("all");
    setTicketFilter("all");
    setAttribution("all");
    setOwner("all");
    setPipelineFilter("all");
    setHideAttributed(false);
    setHidden(new Set());
    setPage(1);
  };

  /** Y a-t-il quoi que ce soit à réinitialiser ? Sinon le bouton ne sert à rien. */
  const filtreActif =
    nbCoches > 0 ||
    q.trim() !== "" ||
    stageFilter !== "all" ||
    dataFilter !== "all" ||
    canalFilter !== "all" ||
    sequenceFilter !== "all" ||
    ticketFilter !== "all" ||
    attribution !== "all" ||
    owner !== "all" ||
    pipelineFilter !== "all" ||
    hideAttributed ||
    hidden.size > 0;

  /* ── La page ─────────────────────────────────────────────────────────────
   *
   * `visibleRows` reste ce que les filtres retiennent ; `pageRows` est ce que
   * le tableau POSE. La distinction porte tout le reste : la sélection et les
   * actions de masse travaillent sur `visibleRows`, l'affichage et la case
   * d'en-tête sur `pageRows`.
   */
  const nbPages = Math.max(1, Math.ceil(visibleRows.length / parPage));
  // Borner au rendu plutôt qu'attendre l'effet : un filtre qui réduit la liste
  // afficherait sinon une page vide le temps d'un tour de boucle.
  const pageSure = Math.min(Math.max(1, page), nbPages);
  const pageRows = React.useMemo(
    () => visibleRows.slice((pageSure - 1) * parPage, pageSure * parPage),
    [visibleRows, pageSure, parPage],
  );

  // Changer un filtre revient à la première page. Sans ça, chercher un nom
  // depuis la page 7 ne montrerait rien alors que le résultat existe.
  React.useEffect(() => {
    setPage(1);
  }, [q, attribution, owner, hideAttributed, pipelineFilter, dataFilter, canalFilter, sequenceFilter, ticketFilter, stageFilter, sort, parPage, coches]);

  // On n'agit jamais sur une ligne que les filtres excluent — mais on agit
  // volontiers sur une ligne d'une AUTRE PAGE. C'est la sélection qui traverse
  // la pagination, pas l'inverse : cocher trois pages de cent puis lancer sur
  // les trois cents est justement le geste que la pagination doit permettre.
  const selectedRows = React.useMemo(
    () => visibleRows.filter((it) => selected.has(it.id)),
    [visibleRows, selected],
  );
  /** Lignes retenues par les filtres auxquelles il manque une variable requise. */
  const incompleteRows = React.useMemo(() => visibleRows.filter((it) => missingCount(it) > 0), [visibleRows]);
  // LA CASE D'EN-TÊTE COCHE LA PAGE, pas les 882 lignes retenues par les
  // filtres : c'est ce que Matteo a demandé, et c'est le seul comportement où
  // le nombre coché est le nombre qu'on a sous les yeux.
  const allPageSelected = pageRows.length > 0 && pageRows.every((it) => selected.has(it.id));
  const toggleAllPage = () =>
    setSelected((s) => {
      const n = new Set(s);
      if (allPageSelected) pageRows.forEach((it) => n.delete(it.id));
      else pageRows.forEach((it) => n.add(it.id));
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

        {/* Par quoi le prospect est joignable — le tri qui décide de la
            séquence. Les trois premiers croisements sont les publics réels des
            séquences multicanal, impossibles à obtenir en croisant à la main
            « avec e-mail » et « avec téléphone ». */}
        <select
          className="mp-select"
          value={canalFilter}
          onChange={(e) => setCanalFilter(e.target.value as CanalFilter)}
          title="Par quoi ce prospect est joignable (entreprise et contacts confondus)"
        >
          {CANAL_FILTER_LABELS.map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>

        {sequences.length > 0 && (
          <select
            className="mp-select"
            value={sequenceFilter}
            onChange={(e) => setSequenceFilter(e.target.value)}
            title="Séquence dans laquelle la ligne est inscrite"
          >
            <option value="all">Séquence : toutes</option>
            <option value="none">À démarcher</option>
            <option value="any">En séquence</option>
            <option value="done">Déjà démarchée</option>
            {sequences.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}

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
        {onToggleArchived && (
          <button
            className={"btn subtle sm" + (showArchived ? " on" : "")}
            onClick={onToggleArchived}
            title={
              showArchived
                ? "Revenir aux fiches actives"
                : "Voir les fiches archivées, et les désarchiver"
            }
          >
            <Archive className="ico-sm" />
            {showArchived ? "Fiches actives" : "Archivés"}
          </button>
        )}

        <div className="tb-div" />
        {/* ── Le panneau de filtres à cocher ──────────────────────────────
            Un seul bouton plutôt qu'une rangée de menus supplémentaires : la
            barre était déjà le grief n° 1 (« trop chargée, trop rigide »).
            Ce qui est coché se lit sur la pastille, sans ouvrir. */}
        <div className="filtres-pop-hote">
          <button
            className={"btn subtle sm" + (nbCoches > 0 ? " on" : "")}
            onClick={() => setPanneauFiltres((v) => !v)}
            title="Filtrer sur le site du prospect, sa note, notre démo et l'audit"
          >
            <SlidersHorizontal className="ico-sm" />
            Filtres
            {nbCoches > 0 && <span className="ct">{nbCoches}</span>}
          </button>

          {panneauFiltres && (
            <>
              <div className="mp-scope-pop-scrim" onClick={() => setPanneauFiltres(false)} />
              <div className="filtres-pop" role="group" aria-label="Filtres">
                <div className="fp-tete">
                  <strong>Filtres</strong>
                  <span className="fp-regle">
                    Plusieurs cases d’un même bloc = <b>ou</b> ; entre les blocs = <b>et</b>
                  </span>
                </div>
                {GROUPES.map((g) => (
                  <div className="fp-groupe" key={g.id}>
                    <div className="fp-titre" title={g.aide}>
                      {g.titre}
                    </div>
                    {g.options.map((o) => (
                      <label className="fp-case" key={o.cle} title={o.aide}>
                        <input
                          type="checkbox"
                          checked={coches.has(o.cle)}
                          onChange={() => basculer(o.cle)}
                        />
                        <span className="fp-label">{o.label}</span>
                        {/* L'effectif est compté sur TOUT le tableau : c'est ce
                            qui permet de savoir ce qu'une case ajouterait. */}
                        <span className="fp-ct">{effectifs[o.cle] ?? 0}</span>
                      </label>
                    ))}
                  </div>
                ))}
                <div className="fp-pied">
                  <button
                    className="btn ghost sm"
                    disabled={nbCoches === 0}
                    onClick={() => setCoches(new Set())}
                  >
                    Décocher tout
                  </button>
                  <span className="fp-reste">
                    {visibleRows.length} ligne{visibleRows.length > 1 ? "s" : ""} retenue
                    {visibleRows.length > 1 ? "s" : ""}
                  </span>
                </div>
              </div>
            </>
          )}
        </div>

        <button
          className="btn ghost sm"
          disabled={!filtreActif}
          onClick={toutReinitialiser}
          title="Vider les cases, les menus, la recherche et les lignes masquées"
        >
          <RotateCcw className="ico-sm" />
          Réinitialiser
        </button>

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
          sequences={sequences.filter((s) => s.status === "on" || s.status === "draft")}
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
        {/* `avec-plaquette` ajoute une piste à la grille. Les colonnes de fin ne
            sont pas des étapes : `--ncol` ne compte que celles-ci, et chaque
            colonne d'appoint a sa propre largeur en CSS. */}
        <div
          className={`matrix${hasPlaquette ? " avec-plaquette" : ""}`}
          style={{ "--ncol": stages.length } as React.CSSProperties}
        >
          <div className="mx-corner">
            <label
              className="cnr-sel"
              title={`Cocher les ${pageRows.length} lignes de cette page — les autres pages gardent ce qui y est déjà coché`}
            >
              <input
                type="checkbox"
                checked={allPageSelected}
                onChange={toggleAllPage}
                disabled={pageRows.length === 0}
                aria-label="Cocher la page"
              />
              <span className="t">Entreprise</span>
            </label>
            {/* Le compte de la PAGE et celui des filtres sont dits séparément :
                « 100 lignes » sur un tableau qui en retient 882 laisserait
                croire que les filtres ont tout écarté. */}
            <div className="s">
              {nbPages > 1
                ? `${pageRows.length} sur ${visibleRows.length}`
                : `${visibleRows.length} lignes`}
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
          {hasPlaquette && (
            <div
              className="mx-colhead"
              style={{ "--seg": "#8A5A2B" } as React.CSSProperties}
              title="Le dépliant nominatif : son lien, son PDF, et combien de fois il a été ouvert"
            >
              <div className="hd">
                <span className="sw" style={{ background: rgba("#8A5A2B", 0.12), color: "#8A5A2B" }}>
                  <BookOpen className="ico-sm" />
                </span>
                <span className="nm">Plaquette</span>
              </div>
            </div>
          )}

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
            pageRows.map((r) => (
              <React.Fragment key={r.id}>
                <RowHead
                  item={r}
                  stages={stages}
                  canAssign={canAssign}
                  agents={agents}
                  handlers={handlers}
                  selected={selected.has(r.id)}
                  onToggleSelect={(it) => toggleSelected(it.id)}
                  onMenu={(e, it) => openMenu(e, it, "row")}
                  onNotes={(it) => handlers.onNotes(it)}
                />
                {stages.map((s, i) => {
                  const status = cellStatus(r, i, stages);
                  if (s.id === "sequence") {
                    return (
                      <SequenceCell
                        key={s.id}
                        item={r}
                        stage={s}
                        stages={stages}
                        status={status}
                        sequences={sequences}
                        working={working}
                        handlers={handlers}
                      />
                    );
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
                {hasPlaquette && <PlaquetteCell item={r} />}
              </React.Fragment>
            ))
          )}
        </div>
      </div>

      {/* ── pagination ──────────────────────────────────────────────────────
          Les deux réglages sont côte à côte parce qu'ils se répondent : la
          taille de page est aussi l'unité de sélection, donc « 500 par page »
          et « cocher la page » sont le même geste en deux clics. */}
      <div className="pager">
        <span className="pg-lb">Par page</span>
        <select
          className="mp-select"
          value={parPage}
          onChange={(e) => setParPage(Number(e.target.value))}
          title="Combien de lignes afficher — et donc combien la case d’en-tête coche d’un coup"
        >
          {TAILLES_DE_PAGE.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <span className="pg-info">
          {visibleRows.length === 0
            ? "Aucune ligne"
            : `${(pageSure - 1) * parPage + 1}–${(pageSure - 1) * parPage + pageRows.length} sur ${visibleRows.length}`}
          {/* Le nombre coché est déjà dit par la barre de sélection : on ne le
              répète QUE lorsqu'il déborde de la page qu'on regarde — sinon
              « Enrichir 240 » sur une page de cent passe pour un bug. */}
          {selectedRows.length > pageRows.length && (
            <>
              {" · "}
              <strong>{selectedRows.length} cochées, toutes pages confondues</strong>
            </>
          )}
        </span>

        <div className="pg-nav">
          <button
            className="btn ghost sm"
            disabled={pageSure <= 1}
            onClick={() => setPage(1)}
            title="Première page"
          >
            «
          </button>
          <button className="btn ghost sm" disabled={pageSure <= 1} onClick={() => setPage(pageSure - 1)}>
            <ChevronLeft className="ico-sm" />
            Précédent
          </button>
          <span className="pg-num">
            Page {pageSure} / {nbPages}
          </span>
          <button
            className="btn ghost sm"
            disabled={pageSure >= nbPages}
            onClick={() => setPage(pageSure + 1)}
          >
            Suivant
            <ChevronRight className="ico-sm" />
          </button>
          <button
            className="btn ghost sm"
            disabled={pageSure >= nbPages}
            onClick={() => setPage(nbPages)}
            title="Dernière page"
          >
            »
          </button>
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
                {/* « Masquer » est un confort de session, « Archiver » une
                    décision : le séparateur les distingue. */}
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
                <div className="pop-sep" />
                {menu.item.archived_at ? (
                  <button
                    className="pop-item"
                    onClick={() => {
                      handlers.onUnarchive(menu.item);
                      setMenu(null);
                    }}
                  >
                    <ArchiveRestore className="ico-sm" />
                    Désarchiver
                  </button>
                ) : (
                  <>
                    <button
                      className="pop-item danger"
                      onClick={() => {
                        handlers.onArchive(menu.item, "opportunite");
                        setMenu(null);
                      }}
                    >
                      <Archive className="ico-sm" />
                      Archiver l’opportunité…
                    </button>
                    <button
                      className="pop-item danger"
                      onClick={() => {
                        handlers.onArchive(menu.item, "entreprise");
                        setMenu(null);
                      }}
                    >
                      <Archive className="ico-sm" />
                      Archiver l’entreprise…
                    </button>
                  </>
                )}
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
