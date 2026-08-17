"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  CircleDot,
  Clock,
  Cloud,
  Cpu,
  ExternalLink,
  FileCode,
  Globe,
  PenLine,
  Server,
  Sparkles,
  Terminal,
} from "lucide-react";
import {
  BOTS,
  EXECUTIONS,
  PHASES,
  SOURCES_SANS_BOT,
  type Bot,
  type ExecutionBot,
  type PhaseBot,
} from "@/lib/architecture/bots";

/**
 * L'usine à données, telle qu'elle tourne — la page qui rend
 * src/lib/architecture/bots.ts. Rien n'est écrit en dur ici : ajouter un bot au
 * registre suffit à le faire apparaître, filtres et compteurs compris.
 *
 * La page est ordonnée par PHASE, parce que la question qu'on se pose est
 * toujours « qui fait cette étape ? » — jamais « où est ce fichier ? ».
 */

const ICONE_EXECUTION: Record<ExecutionBot, typeof Terminal> = {
  "script-local": Terminal,
  "edge-function": Cloud,
  "route-api": Server,
  cron: Clock,
  "service-externe": Globe,
  "skill-claude": Sparkles,
};

export function BotsPage() {
  const [phase, setPhase] = useState<PhaseBot | "toutes">("toutes");
  const [execution, setExecution] = useState<ExecutionBot | "toutes">("toutes");
  const [ecritSeul, setEcritSeul] = useState(false);

  const visibles = useMemo(
    () =>
      BOTS.filter(
        (b) =>
          (phase === "toutes" || b.phase === phase) &&
          (execution === "toutes" || b.execution === execution) &&
          (!ecritSeul || b.ecrit),
      ),
    [phase, execution, ecritSeul],
  );

  const phasesAffichees = PHASES.filter((p) => visibles.some((b) => b.phase === p.cle));

  return (
    <div className="mx-auto w-full max-w-6xl px-6 pb-24 pt-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Les bots</h1>
        <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Tout ce qui collecte, cherche, enrichit, mesure et fabrique&nbsp;: {BOTS.length} outils,
          rangés par étape du parcours. Chaque fiche dit où lire le détail, ce que ça coûte, et les
          pièges déjà payés. Le registre est versionné dans le dépôt&nbsp;:{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[12px]">
            src/lib/architecture/bots.ts
          </code>
          .
        </p>
      </header>

      {/* ── Filtres ─────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 -mx-6 mb-8 space-y-2.5 border-b border-border bg-background/85 px-6 py-3 backdrop-blur">
        <Ligne label="Étape">
          <Chip actif={phase === "toutes"} onClick={() => setPhase("toutes")}>
            Toutes <Compte n={BOTS.length} />
          </Chip>
          {PHASES.map((p) => (
            <Chip key={p.cle} actif={phase === p.cle} onClick={() => setPhase(p.cle)} titre={p.resume}>
              {p.titre} <Compte n={BOTS.filter((b) => b.phase === p.cle).length} />
            </Chip>
          ))}
        </Ligne>

        <Ligne label="Où ça tourne">
          <Chip actif={execution === "toutes"} onClick={() => setExecution("toutes")}>
            Partout
          </Chip>
          {(Object.keys(EXECUTIONS) as ExecutionBot[]).map((cle) => {
            const Icone = ICONE_EXECUTION[cle];
            return (
              <Chip
                key={cle}
                actif={execution === cle}
                onClick={() => setExecution(cle)}
                titre={EXECUTIONS[cle].resume}
              >
                <Icone className="h-3 w-3" />
                {EXECUTIONS[cle].titre} <Compte n={BOTS.filter((b) => b.execution === cle).length} />
              </Chip>
            );
          })}
          <Chip
            actif={ecritSeul}
            onClick={() => setEcritSeul((v) => !v)}
            titre="Ceux devant lesquels il faut archiver avant de lancer."
          >
            <PenLine className="h-3 w-3" />
            Écrit en base <Compte n={BOTS.filter((b) => b.ecrit).length} />
          </Chip>
        </Ligne>
      </div>

      {/* ── Le registre, par étape ──────────────────────────────────────── */}
      <div className="space-y-10">
        {phasesAffichees.map((p) => (
          <section key={p.cle} id={p.cle} className="scroll-mt-28">
            <div className="mb-3.5 border-l-2 border-primary/40 pl-3">
              <h2 className="text-lg font-semibold tracking-tight">{p.titre}</h2>
              <p className="mt-0.5 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                {p.resume}
              </p>
            </div>
            <div className="space-y-2.5">
              {visibles
                .filter((b) => b.phase === p.cle)
                .map((b) => (
                  <FicheBot key={b.id} bot={b} />
                ))}
            </div>
          </section>
        ))}

        {visibles.length === 0 && (
          <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            Aucun bot ne correspond à ces filtres.
          </p>
        )}
      </div>

      {/* ── Ce qui manque ───────────────────────────────────────────────── */}
      {SOURCES_SANS_BOT.length > 0 && (
        <section className="mt-12">
          <div className="mb-3.5 border-l-2 border-amber-500/50 pl-3">
            <h2 className="text-lg font-semibold tracking-tight">Sources sans bot</h2>
            <p className="mt-0.5 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              Citées dans les schémas, mais rien ne les interroge aujourd&apos;hui. Listées pour que
              le manque soit visible plutôt que supposé.
            </p>
          </div>
          <div className="space-y-2.5">
            {SOURCES_SANS_BOT.map((s) => (
              <div
                key={s.nom}
                className="rounded-lg border border-amber-500/25 bg-amber-500/[0.04] px-4 py-3"
              >
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-500" />
                  <h3 className="text-sm font-medium">{s.nom}</h3>
                </div>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{s.note}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* La fiche d'un bot                                                   */
/* ------------------------------------------------------------------ */

function FicheBot({ bot }: { bot: Bot }) {
  const [ouvert, setOuvert] = useState(false);
  const Icone = ICONE_EXECUTION[bot.execution];

  return (
    <article className="overflow-hidden rounded-lg border border-border bg-card">
      <button
        type="button"
        onClick={() => setOuvert((v) => !v)}
        aria-expanded={ouvert}
        className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50"
      >
        <Icone className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="text-sm font-semibold">{bot.nom}</h3>
            {bot.ecrit ? (
              <Badge ton="ecrit" titre="Écrit en base — archiver avant de lancer.">
                <PenLine className="h-2.5 w-2.5" />
                écrit
              </Badge>
            ) : (
              <Badge ton="lecture" titre="N'écrit rien — relançable sans conséquence.">
                lecture seule
              </Badge>
            )}
            {bot.statut !== "actif" && (
              <Badge ton={bot.statut === "a-verifier" ? "alerte" : "neutre"}>
                {bot.statut === "ponctuel" ? "ponctuel" : "à vérifier"}
              </Badge>
            )}
            {bot.regles.length > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <CircleDot className="h-2.5 w-2.5" />
                {bot.regles.length} règle{bot.regles.length > 1 ? "s" : ""}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{bot.resume}</p>
        </div>

        <ChevronDown
          className={`mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
            ouvert ? "rotate-180" : ""
          }`}
        />
      </button>

      {ouvert && (
        <div className="space-y-4 border-t border-border px-4 py-3.5">
          <dl className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
            <Champ label="Où c'est écrit" mono>
              <span className="inline-flex items-start gap-1.5">
                <FileCode className="mt-0.5 h-3 w-3 shrink-0 opacity-60" />
                {bot.chemin}
              </span>
            </Champ>
            <Champ label="Où ça tourne">{EXECUTIONS[bot.execution].titre}</Champ>
            <Champ label="Entrée">{bot.entree}</Champ>
            <Champ label="Sortie">{bot.sortie}</Champ>
            <Champ label="Coût">{bot.cout}</Champ>
            {bot.externes.length > 0 && (
              <Champ label="Services appelés">
                <span className="inline-flex flex-wrap items-center gap-1">
                  <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
                  {bot.externes.join(" · ")}
                </span>
              </Champ>
            )}
            {bot.declencheur && <Champ label="Déclenché par">{bot.declencheur}</Champ>}
            {bot.commande && (
              <Champ label="Commande" mono>
                {bot.commande}
              </Champ>
            )}
          </dl>

          {bot.regles.length > 0 && (
            <div>
              <h4 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Cpu className="h-3 w-3" />
                Ce qu&apos;il ne faut pas réapprendre
              </h4>
              <ul className="space-y-1.5">
                {bot.regles.map((r, i) => (
                  <li
                    key={i}
                    className="border-l-2 border-border pl-2.5 text-sm leading-relaxed text-muted-foreground"
                  >
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* Petits éléments                                                     */
/* ------------------------------------------------------------------ */

function Ligne({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-0.5 w-[86px] shrink-0 text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  );
}

function Chip({
  actif,
  onClick,
  titre,
  children,
}: {
  actif: boolean;
  onClick: () => void;
  titre?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={titre}
      aria-pressed={actif}
      className={[
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
        actif
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function Compte({ n }: { n: number }) {
  return <span className="font-mono text-[10px] tabular-nums opacity-55">{n}</span>;
}

function Badge({
  ton,
  titre,
  children,
}: {
  ton: "ecrit" | "lecture" | "alerte" | "neutre";
  titre?: string;
  children: React.ReactNode;
}) {
  const tons = {
    ecrit: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400",
    lecture: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    alerte: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-500",
    neutre: "border-border bg-muted text-muted-foreground",
  } as const;
  return (
    <span
      title={titre}
      className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${tons[ton]}`}
    >
      {children}
    </span>
  );
}

function Champ({
  label,
  mono,
  children,
}: {
  label: string;
  mono?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={`mt-0.5 text-sm leading-relaxed ${mono ? "font-mono text-[12px]" : ""}`}>
        {children}
      </dd>
    </div>
  );
}
