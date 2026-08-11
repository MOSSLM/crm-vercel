"use client";

import React from "react";
import Link from "next/link";
import {
  CalendarClock,
  ExternalLink,
  FileText,
  Globe,
  MapPin,
  Phone,
  PhoneCall,
  Star,
  StickyNote,
} from "lucide-react";
import type { ContexteEntreprise, IssueCompteRendu } from "@/lib/rdv/types";

const ISSUE_LABEL: Record<IssueCompteRendu, string> = {
  interesse: "Intéressé",
  a_relancer: "À relancer",
  reflexion: "Réflexion",
  pas_interesse: "Pas intéressé",
  injoignable: "Injoignable",
  vendu: "Vendu",
};

const dateCourte = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "2-digit" })
    : "—";

const dateHeure = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

const duree = (secondes: number | null) => {
  if (!secondes) return "—";
  const m = Math.floor(secondes / 60);
  const s = secondes % 60;
  return m > 0 ? `${m} min ${String(s).padStart(2, "0")}` : `${s} s`;
};

interface Props {
  contexte: ContexteEntreprise;
  /** Ouvre un compte rendu existant dans l'onglet formulaire. */
  onOuvrirCompteRendu: (id: string) => void;
}

export function ContexteEntrepriseVue({ contexte, onOuvrirCompteRendu }: Props) {
  const { entreprise, liens, rdvAVenir, rdvPasses, comptesRendus, appels, notes, opportunites } =
    contexte;

  const numeros = React.useMemo(() => {
    const tous = [entreprise.telephone, ...entreprise.telephones].filter(
      (t): t is string => Boolean(t && t.trim()),
    );
    return Array.from(new Set(tous));
  }, [entreprise.telephone, entreprise.telephones]);

  return (
    <div className="space-y-5">
      {/* Joindre. */}
      <Bloc titre="Joindre">
        {numeros.length === 0 ? (
          <p className="text-sm text-[var(--text-3)]">Aucun numéro connu.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {numeros.map((tel) => (
              <a
                key={tel}
                href={`tel:${tel.replace(/\s/g, "")}`}
                className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-[var(--surface)] px-2.5 py-1.5 text-sm transition-colors hover:bg-[var(--bg-2)]"
              >
                <Phone className="h-3.5 w-3.5 text-[var(--text-3)]" />
                {tel}
              </a>
            ))}
          </div>
        )}
        {entreprise.email && (
          <a href={`mailto:${entreprise.email}`} className="block text-sm underline">
            {entreprise.email}
          </a>
        )}
        {(entreprise.adresse || entreprise.ville) && (
          <p className="flex items-start gap-1.5 text-sm text-[var(--text-3)]">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {[entreprise.adresse, entreprise.code_postal, entreprise.ville]
              .filter(Boolean)
              .join(", ")}
          </p>
        )}
        {entreprise.note_moyenne != null && (
          <p className="flex items-center gap-1.5 text-sm text-[var(--text-3)]">
            <Star className="h-3.5 w-3.5 text-amber-500" />
            {entreprise.note_moyenne} / 5 · {entreprise.nombre_avis ?? 0} avis
          </p>
        )}
      </Bloc>

      {/* Les liens à ouvrir pendant l'appel. */}
      <Bloc titre="Liens">
        <div className="flex flex-wrap gap-1.5">
          <LienExterne href={liens.google} label="Fiche Google" icon={Star} />
          <LienExterne href={liens.siteActuel} label="Site actuel" icon={Globe} />
          <LienExterne
            href={liens.siteDemo}
            label={liens.noteAuditDemo != null ? `Site démo · ${liens.noteAuditDemo}/100` : "Site démo"}
            icon={Globe}
          />
          <LienExterne
            href={liens.audit}
            label={liens.noteAudit != null ? `Audit · ${liens.noteAudit}/100` : "Audit"}
            icon={FileText}
          />
          <Link
            href={`/companies/${entreprise.id}`}
            className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-[var(--surface)] px-2.5 py-1.5 text-sm transition-colors hover:bg-[var(--bg-2)]"
          >
            <ExternalLink className="h-3.5 w-3.5 text-[var(--text-3)]" />
            Fiche CRM
          </Link>
        </div>

        {liens.leadMagnets.length > 0 && (
          <div className="space-y-1 pt-1">
            <p className="text-xs font-medium text-[var(--text-4)]">Lead magnets</p>
            <div className="flex flex-wrap gap-1.5">
              {liens.leadMagnets.map((lm) =>
                lm.url ? (
                  <a
                    key={lm.id}
                    href={lm.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-md border border-border/60 bg-[var(--surface)] px-2 py-1 text-xs transition-colors hover:bg-[var(--bg-2)]"
                  >
                    {lm.titre}
                  </a>
                ) : (
                  <span
                    key={lm.id}
                    title="Aucun site publié pour ouvrir cette page"
                    className="rounded-md border border-dashed border-border/60 px-2 py-1 text-xs text-[var(--text-4)]"
                  >
                    {lm.titre}
                  </span>
                ),
              )}
            </div>
          </div>
        )}

        {liens.captureDemo && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={liens.captureDemo}
            alt="Capture du site démo"
            className="mt-2 w-full rounded-lg border border-border/60"
            loading="lazy"
          />
        )}
      </Bloc>

      {/* Rendez-vous. */}
      {(rdvAVenir.length > 0 || rdvPasses.length > 0) && (
        <Bloc titre="Rendez-vous">
          {rdvAVenir.map((r) => (
            <div key={r.id} className="flex items-start gap-2 text-sm">
              <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
              <span className="min-w-0">
                <span className="block truncate font-medium">{r.event_title}</span>
                <span className="block text-xs text-[var(--text-3)]">{dateHeure(r.start_at)}</span>
              </span>
            </div>
          ))}
          {rdvPasses.slice(0, 5).map((r) => (
            <div key={r.id} className="flex items-start gap-2 text-sm">
              <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--text-4)]" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[var(--text-2)]">{r.event_title}</span>
                <span className="block text-xs text-[var(--text-3)]">{dateHeure(r.start_at)}</span>
              </span>
              {!r.a_un_compte_rendu && (
                <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                  sans CR
                </span>
              )}
            </div>
          ))}
        </Bloc>
      )}

      {/* Historique des échanges. */}
      <Bloc titre={`Comptes rendus (${comptesRendus.length})`}>
        {comptesRendus.length === 0 ? (
          <p className="text-sm text-[var(--text-3)]">Aucun échange consigné pour l&apos;instant.</p>
        ) : (
          <ul className="space-y-1">
            {comptesRendus.map((cr) => (
              <li key={cr.id}>
                <button
                  type="button"
                  onClick={() => onOuvrirCompteRendu(cr.id)}
                  className="w-full rounded-md px-2 py-1.5 text-left transition-colors hover:bg-[var(--bg-2)]"
                >
                  <span className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {cr.titre || dateCourte(cr.demarre_le)}
                    </span>
                    {cr.statut === "brouillon" && (
                      <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                        brouillon
                      </span>
                    )}
                    {cr.issue && (
                      <span className="shrink-0 text-[10px] text-[var(--text-3)]">
                        {ISSUE_LABEL[cr.issue]}
                      </span>
                    )}
                  </span>
                  {cr.resume && (
                    <span className="mt-0.5 block line-clamp-2 text-xs text-[var(--text-3)]">
                      {cr.resume}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Bloc>

      {/* Ce qu'on sait de leurs soucis, écrit ailleurs dans le CRM. */}
      {(notes.length > 0 || opportunites.some((o) => o.note_base)) && (
        <Bloc titre="Notes">
          {opportunites
            .filter((o) => o.note_base)
            .map((o) => (
              <p key={o.id} className="flex items-start gap-1.5 text-sm">
                <StickyNote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--text-4)]" />
                <span className="whitespace-pre-wrap">{o.note_base}</span>
              </p>
            ))}
          {notes.map((n) => (
            <p key={n.id} className="flex items-start gap-1.5 text-sm">
              <StickyNote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--text-4)]" />
              <span>
                {n.theme && <span className="font-medium">{n.theme} — </span>}
                <span className="whitespace-pre-wrap">{n.contenu}</span>
                <span className="ml-1 text-xs text-[var(--text-4)]">{dateCourte(n.created_at)}</span>
              </span>
            </p>
          ))}
        </Bloc>
      )}

      {/* Appels du standard. */}
      {appels.length > 0 && (
        <Bloc titre="Appels">
          {appels.slice(0, 8).map((a) => (
            <p key={a.id} className="flex items-center gap-2 text-sm text-[var(--text-3)]">
              <PhoneCall className="h-3.5 w-3.5 shrink-0" />
              <span>{dateCourte(a.started_at)}</span>
              <span className="text-xs">{a.direction === "inbound" ? "entrant" : "sortant"}</span>
              <span className="ml-auto text-xs tabular-nums">{duree(a.duration_sec)}</span>
            </p>
          ))}
        </Bloc>
      )}
    </div>
  );
}

function Bloc({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-4)]">{titre}</h3>
      {children}
    </section>
  );
}

function LienExterne({
  href,
  label,
  icon: Icon,
}: {
  href: string | null;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-[var(--surface)] px-2.5 py-1.5 text-sm transition-colors hover:bg-[var(--bg-2)]"
    >
      <Icon className="h-3.5 w-3.5 text-[var(--text-3)]" />
      {label}
    </a>
  );
}

export default ContexteEntrepriseVue;
