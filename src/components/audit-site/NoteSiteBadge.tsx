"use client";
import React from "react";
import { toast } from "sonner";
import { authedFetch } from "@/utils/authedFetch";
import type { AuditLu } from "@/lib/audit-site/lecture";

/**
 * La note du site actuel du prospect, dans le CRM.
 *
 * TROIS COMPORTEMENTS QUI COMPTENT PLUS QUE L'APPARENCE :
 *
 * 1. **Se cache si la table n'existe pas.** Migration non appliquée ⇒ rien à
 *    l'écran, pas un badge en erreur. Même posture que le vérificateur d'emails
 *    avec `available=false` : une fonctionnalité absente ne doit pas ressembler
 *    à une panne.
 *
 * 2. **Dit « analyse partielle » plutôt que d'afficher une note trompeuse.**
 *    Quand des axes ont été écartés pour confiance faible (site en SPA, page
 *    bloquée), l'opérateur DOIT le savoir avant d'envoyer un rapport accablant
 *    à un prospect dont le site va très bien.
 *
 * 3. **Montre la décomposition en infobulle.** C'est ce qui permet de répondre
 *    au téléphone quand le prospect conteste — sans ouvrir le rapport.
 */

export interface NoteSiteBadgeProps {
  entrepriseId: number;
  /** Analyse déjà chargée par l'écran parent (évite un aller-retour par ligne). */
  audit?: AuditLu | null;
  /** Faux quand la table manque : le badge ne rend rien. */
  disponible?: boolean;
  /** Charge lui-même l'analyse quand le parent ne la fournit pas. */
  autoCharger?: boolean;
  compact?: boolean;
  onAnalyse?: (audit: AuditLu | null) => void;
}

const LABELS: Record<string, string> = {
  vitesse: "vitesse",
  seo: "SEO",
  mobile: "mobile",
  conversion: "conversion",
};

export function NoteSiteBadge({
  entrepriseId,
  audit: auditProp,
  disponible = true,
  autoCharger = false,
  compact = false,
  onAnalyse,
}: NoteSiteBadgeProps) {
  const [audit, setAudit] = React.useState<AuditLu | null>(auditProp ?? null);
  const [absent, setAbsent] = React.useState(!disponible);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (auditProp !== undefined) setAudit(auditProp);
  }, [auditProp]);

  React.useEffect(() => {
    if (!autoCharger || auditProp !== undefined) return;
    let vivant = true;
    void (async () => {
      try {
        const res = await authedFetch(`/api/audit-site/${entrepriseId}`);
        const body = (await res.json()) as { disponible?: boolean; audit?: AuditLu | null };
        if (!vivant) return;
        if (body.disponible === false) setAbsent(true);
        else setAudit(body.audit ?? null);
      } catch {
        // Silence délibéré : c'est un badge d'appoint, pas un écran.
      }
    })();
    return () => {
      vivant = false;
    };
  }, [autoCharger, auditProp, entrepriseId]);

  const analyser = async () => {
    setBusy(true);
    try {
      const res = await authedFetch(`/api/audit-site/${entrepriseId}`, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { audit?: AuditLu | null; error?: string };
      if (!res.ok) throw new Error(body.error || `Erreur ${res.status}`);
      setAudit(body.audit ?? null);
      onAnalyse?.(body.audit ?? null);
      toast.success("Site analysé.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Analyse impossible.");
    } finally {
      setBusy(false);
    }
  };

  if (absent) return null;

  if (!audit) {
    return (
      <button className="pill outline" disabled={busy} onClick={analyser} title="Analyser le site actuel">
        {busy ? "Analyse…" : "Analyser le site"}
      </button>
    );
  }

  if (audit.injoignable || audit.note_globale == null) {
    return (
      <span
        className="pill danger"
        title={
          audit.url_analysee
            ? `Site injoignable : ${audit.url_analysee}`
            : "Aucune adresse de site renseignée"
        }
      >
        {audit.url_analysee ? "Site injoignable" : "Pas de site"}
      </span>
    );
  }

  const note = audit.note_globale;
  const ton = note >= 70 ? "ok" : note >= 45 ? "warn" : "danger";
  const partielle = audit.axes_masques.length > 0;

  const decomposition = audit.axes
    .map((a) => `${LABELS[a.id] ?? a.id} ${a.note}`)
    .join(" · ");
  const masques = partielle
    ? `\nNon concluant : ${audit.axes_masques.map((a) => LABELS[a] ?? a).join(", ")}`
    : "";
  const mesures = [
    audit.chargement_ms != null ? `chargement ${(audit.chargement_ms / 1000).toFixed(1)} s` : null,
    audit.poids_octets != null ? `${Math.round(audit.poids_octets / 1000)} Ko` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span
        className={`pill ${ton}`}
        title={`${decomposition}${mesures ? `\n${mesures}` : ""}${masques}`}
      >
        {note}/100
        {partielle && <span style={{ opacity: 0.75 }}> · partielle</span>}
      </span>
      {audit.note_globale_demo != null && (
        // La comparaison, quand elle existe : c'est l'argument de vente, et
        // l'opérateur doit l'avoir sous les yeux avant d'appeler.
        <span className="pill ok" title="Note du site démo que nous avons construit">
          démo {audit.note_globale_demo}/100
        </span>
      )}
      {!compact && (
        <button className="btn ghost sm" disabled={busy} onClick={analyser} title="Relancer l'analyse">
          {busy ? "…" : "Ré-analyser"}
        </button>
      )}
    </span>
  );
}
