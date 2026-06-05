"use client";

import React from "react";
import Link from "next/link";
import {
  Search,
  Target,
  Phone,
  Users,
  Globe,
  TrendingUp,
  ClipboardList,
  Workflow,
  MessageSquare,
  CalendarDays,
  User,
  Building2,
  GitBranch,
  FolderOpen,
  LayoutDashboard,
  type LucideIcon,
} from "lucide-react";
import { useAppData } from "@/components/AppDataContext";
import { useAuth } from "@/components/AuthContext";
import { openStudioCommand } from "@/components/layout/studio/StudioShell";

function formatDate(d: Date) {
  const text = new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
  // ISO week number
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${text} · sem. ${week}`;
}

function compactNumber(n: number) {
  return new Intl.NumberFormat("fr-FR").format(n);
}

function firstName(name?: string) {
  return name?.trim().split(" ")[0] ?? "";
}

type Tool = { title: string; href: string; icon: LucideIcon; meta?: string };
type WorkflowStep = { step: string; title: string; subtitle: string; tools: Tool[] };

export function StudioHub() {
  const { contacts, companies, opportunities } = useAppData();
  const { user } = useAuth();

  const today = React.useMemo(() => new Date(), []);

  const pipelineValue = React.useMemo(
    () =>
      opportunities.reduce((sum, o) => sum + (Number(o.montant) || Number(o.value) || 0), 0),
    [opportunities],
  );

  const steps: WorkflowStep[] = [
    {
      step: "Étape 1",
      title: "Acquérir",
      subtitle: "attirer & capter les leads",
      tools: [
        { title: "Site builder", href: "/site-builder", icon: Globe },
        { title: "Form builder", href: "/forms", icon: ClipboardList },
        { title: "Nouvelle recherche", href: "/search/new", icon: Search },
        { title: "Réseaux", href: "/networks", icon: Users },
      ],
    },
    {
      step: "Étape 2",
      title: "Convertir",
      subtitle: "prospecter, qualifier, relancer",
      tools: [
        { title: "Démarchage", href: "/qualification", icon: Target },
        { title: "Séquences", href: "/automations/sequences", icon: Workflow },
        { title: "Messagerie", href: "/messagerie", icon: MessageSquare },
        { title: "Calendrier", href: "/calendar", icon: CalendarDays },
      ],
    },
    {
      step: "Étape 3",
      title: "Relation",
      subtitle: "votre base de connaissance client",
      tools: [
        { title: "Contacts", href: "/contacts", icon: User, meta: compactNumber(contacts.length) },
        { title: "Entreprises", href: "/companies", icon: Building2, meta: compactNumber(companies.length) },
        { title: "Pipeline", href: "/pipeline", icon: GitBranch, meta: compactNumber(opportunities.length) },
        { title: "Clients", href: "/clients", icon: Users },
      ],
    },
    {
      step: "Étape 4",
      title: "Produire",
      subtitle: "devis, offres, chantiers",
      tools: [
        { title: "Opportunités", href: "/opportunities", icon: Target },
        { title: "Offres", href: "/offres", icon: ClipboardList },
        { title: "Projets", href: "/production/projets", icon: FolderOpen },
        { title: "Templates", href: "/production/templates", icon: ClipboardList },
      ],
    },
    {
      step: "Étape 5",
      title: "Piloter",
      subtitle: "mesure, objectifs, équipe",
      tools: [
        { title: "Dashboard", href: "/dashboard-2", icon: LayoutDashboard, meta: "live" },
        { title: "Sales", href: "/prospection/dashboard", icon: Phone },
        { title: "Objectifs", href: "/objectifs", icon: Target },
        { title: "Agents", href: "/agents", icon: Users },
      ],
    },
  ];

  const kpis = [
    {
      icon: Target,
      label: "pipeline",
      value: compactNumber(Math.round(pipelineValue / 1000)),
      unit: "k€",
    },
    { icon: GitBranch, label: "opportunités", value: compactNumber(opportunities.length), unit: "" },
    { icon: User, label: "contacts", value: compactNumber(contacts.length), unit: "" },
    { icon: Building2, label: "entreprises", value: compactNumber(companies.length), unit: "" },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-10">
      {/* Greeting */}
      <div className="mb-8">
        <div className="text-xs lowercase tracking-wide text-[var(--text-3)]">{formatDate(today)}</div>
        <h1 className="mt-1 font-serif text-3xl tracking-tight md:text-4xl">
          Bonjour {firstName(user?.name) || "👋"}
          {firstName(user?.name) ? "," : ""}{" "}
          <span className="text-primary">bienvenue dans Studio.</span>
        </h1>
        <p className="mt-2 text-sm text-[var(--text-2)]">
          {compactNumber(contacts.length)} contacts · {compactNumber(companies.length)} entreprises ·{" "}
          {compactNumber(opportunities.length)} opportunités en cours.
        </p>
      </div>

      {/* Universal search hero */}
      <button
        type="button"
        onClick={openStudioCommand}
        className="mb-10 flex w-full items-center gap-3 rounded-2xl border border-border/60 bg-[var(--surface)] px-5 py-4 text-left shadow-[var(--shadow-card)] transition-colors hover:border-border hover:bg-[var(--surface-2)]"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-tint)] text-primary">
          <Search className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm text-[var(--text-3)]">
          Rechercher un contact, une entreprise, un outil — ou taper une action…
        </span>
        <span className="hidden shrink-0 items-center gap-1 sm:flex">
          <kbd className="rounded border border-border bg-[var(--bg-2)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-3)]">
            ⌘
          </kbd>
          <kbd className="rounded border border-border bg-[var(--bg-2)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-3)]">
            K
          </kbd>
        </span>
      </button>

      {/* Tools grouped by commercial step */}
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-serif text-xl tracking-tight">Vos outils</h2>
        <span className="text-xs text-[var(--text-3)]">groupés par étape commerciale</span>
      </div>
      <div className="mb-10 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {steps.map((step) => (
          <div
            key={step.title}
            className="rounded-xl border border-border/60 bg-[var(--surface)] p-3 shadow-[var(--shadow-card)]"
          >
            <div className="mb-2 border-b border-border/50 pb-2">
              <div className="text-[10px] font-medium uppercase tracking-wide text-[var(--text-3)]">{step.step}</div>
              <div className="font-serif text-lg tracking-tight text-primary">{step.title}</div>
              <div className="text-[11px] text-[var(--text-3)]">{step.subtitle}</div>
            </div>
            <div className="flex flex-col gap-0.5">
              {step.tools.map((tool) => {
                const Icon = tool.icon;
                return (
                  <Link
                    key={tool.href + tool.title}
                    href={tool.href}
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-[var(--bg-3)]"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--bg-2)] text-[var(--text-2)]">
                      <Icon className="h-3.5 w-3.5" strokeWidth={1.8} />
                    </span>
                    <span className="truncate">{tool.title}</span>
                    {tool.meta && (
                      <span className="ml-auto shrink-0 text-xs text-[var(--text-3)]">{tool.meta}</span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div
              key={kpi.label}
              className="rounded-xl border border-border/60 bg-[var(--surface)] p-4 shadow-[var(--shadow-card)]"
            >
              <div className="flex items-center gap-1.5 text-xs lowercase text-[var(--text-3)]">
                <Icon className="h-3.5 w-3.5" />
                {kpi.label}
              </div>
              <div className="mt-1 font-serif text-3xl tracking-tight">
                {kpi.value}
                {kpi.unit && <span className="ml-0.5 text-base text-[var(--text-3)]">{kpi.unit}</span>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-8 flex items-center gap-1.5 text-xs text-[var(--text-3)]">
        <TrendingUp className="h-3.5 w-3.5" />
        <span>Astuce : appuyez sur ⌘K depuis n'importe où pour tout retrouver.</span>
      </div>
    </div>
  );
}

export default StudioHub;
