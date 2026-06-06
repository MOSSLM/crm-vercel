"use client";

import React from "react";
import { toast } from "sonner";
import { Rocket, Loader2, ExternalLink, Check, X } from "lucide-react";
import { ModalBody, ModalFt, ModalHd, ModalShell, Btn, AlertSoft } from "./skin-primitives";
import { authedFetch } from "@/utils/authedFetch";

interface Candidate {
  id: number;
  nom: string;
  service_tags: string[];
  matched_tags: string[];
  canonical_url: string | null;
  site_web_canonique: string | null;
  lead_magnet_project_id: string;
  opportunite_id: string | null;
}

interface DeployResult {
  entreprise_id: number;
  ok: boolean;
  site_id?: string;
  subdomain?: string;
  url?: string;
  error?: string;
}

/**
 * Bulk-deploys company demo sites from a template. Lists LM-ready companies
 * whose service tags match the template's (simulated) tags, lets the user pick
 * them, creates+publishes a site per company, then offers a per-site "Valider"
 * action that moves the linked opportunity to the "LM Déployé" stage.
 */
export function TemplateDeployPanel({
  open, onClose, templateSiteId, tagsCsv,
}: {
  open: boolean;
  onClose: () => void;
  templateSiteId: string;
  /** Comma-joined template tag set (the simulated tags it was prepared for). */
  tagsCsv: string;
}) {
  const [candidates, setCandidates] = React.useState<Candidate[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [selected, setSelected] = React.useState<Set<number>>(new Set());
  const [deploying, setDeploying] = React.useState(false);
  const [results, setResults] = React.useState<Record<number, DeployResult>>({});
  const [validated, setValidated] = React.useState<Set<string>>(new Set());
  const [validatingId, setValidatingId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setLoading(true);
    setResults({});
    setSelected(new Set());
    const qs = tagsCsv ? `?tags=${encodeURIComponent(tagsCsv)}` : "";
    authedFetch(`/api/site-builder/template-candidates${qs}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setCandidates(Array.isArray(data) ? (data as Candidate[]) : []))
      .catch(() => toast.error("Erreur lors du chargement des entreprises"))
      .finally(() => setLoading(false));
  }, [open, tagsCsv]);

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  const allSelected = candidates.length > 0 && selected.size === candidates.length;
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(candidates.map((c) => c.id)));

  const deploy = async () => {
    const companyIds = Array.from(selected);
    if (companyIds.length === 0) return;
    setDeploying(true);
    try {
      const res = await authedFetch(`/api/site-builder/sites/${templateSiteId}/deploy-batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error((data as { error?: string })?.error ?? "Erreur");
      const map: Record<number, DeployResult> = {};
      for (const r of ((data as { results?: DeployResult[] }).results ?? [])) map[r.entreprise_id] = r;
      setResults(map);
      const okCount = Object.values(map).filter((r) => r.ok).length;
      toast.success(`${okCount} site(s) créé(s) et publié(s)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de la création");
    } finally {
      setDeploying(false);
    }
  };

  const validate = async (siteId: string) => {
    setValidatingId(siteId);
    try {
      const res = await authedFetch(`/api/site-builder/sites/${siteId}/validate-lm`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error((data as { error?: string })?.error ?? "Erreur");
      setValidated((prev) => new Set(prev).add(siteId));
      toast.success("Opportunité passée en « LM Déployé »");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur de validation");
    } finally {
      setValidatingId(null);
    }
  };

  return (
    <ModalShell open={open} onClose={onClose} size="lg">
      <ModalHd
        icon={<Rocket size={15} />}
        title="Déployer le template sur des entreprises"
        subtitle="Entreprises prêtes pour LM dont les services correspondent à ce template"
        right={<button onClick={onClose} className="modal-x" aria-label="Fermer"><X size={14} /></button>}
      />
      <ModalBody>
        {loading ? (
          <p style={{ fontSize: 12, color: "var(--text-3)", display: "flex", alignItems: "center", gap: 6 }}>
            <Loader2 size={13} className="animate-spin" /> Chargement…
          </p>
        ) : candidates.length === 0 ? (
          <AlertSoft tone="warn">
            Aucune entreprise prête pour LM ne correspond aux tags de ce template.
            Vérifie les tags simulés et que des projets lead-magnet sont marqués « prêt ».
          </AlertSoft>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-2)", cursor: "default" }}>
                <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                Tout sélectionner ({candidates.length})
              </label>
              <span style={{ fontSize: 11, color: "var(--text-3)" }}>{selected.size} sélectionnée(s)</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 380, overflowY: "auto" }}>
              {candidates.map((c) => {
                const result = results[c.id];
                const isValidated = result?.site_id ? validated.has(result.site_id) : false;
                return (
                  <div
                    key={c.id}
                    style={{
                      display: "flex", alignItems: "center", gap: 8, padding: "8px 10px",
                      border: "1px solid var(--border-2, #e5e2da)", borderRadius: 8,
                      background: result ? (result.ok ? "var(--success-bg, #f0fdf4)" : "var(--danger-bg, #fef2f2)") : "var(--surface, #fff)",
                    }}
                  >
                    {!result && (
                      <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.nom}</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 3 }}>
                        {c.matched_tags.slice(0, 6).map((t) => (
                          <span key={t} style={{ fontSize: 9, padding: "1px 6px", borderRadius: 999, background: "var(--accent-soft, #eef2ff)", color: "var(--accent, #4f46e5)" }}>{t}</span>
                        ))}
                      </div>
                    </div>
                    {result?.ok && result.url && (
                      <a href={result.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10.5, color: "var(--info, #2563eb)", display: "inline-flex", alignItems: "center", gap: 3 }} onClick={(e) => e.stopPropagation()}>
                        {result.subdomain} <ExternalLink size={10} />
                      </a>
                    )}
                    {result?.ok && (
                      isValidated ? (
                        <span style={{ fontSize: 10.5, color: "var(--success, #15803d)", display: "inline-flex", alignItems: "center", gap: 3, fontWeight: 600 }}>
                          <Check size={11} /> LM Déployé
                        </span>
                      ) : (
                        <Btn variant="outline" size="sm" onClick={() => result.site_id && validate(result.site_id)} disabled={validatingId === result.site_id}>
                          {validatingId === result.site_id ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                          Valider
                        </Btn>
                      )
                    )}
                    {result && !result.ok && (
                      <span style={{ fontSize: 10.5, color: "var(--danger, #b91c1c)" }} title={result.error}>Échec</span>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </ModalBody>
      <ModalFt>
        <span style={{ flex: 1, fontSize: 11, color: "var(--text-3)" }}>
          La démo est publiée immédiatement. « Valider » passe l&apos;opportunité en « LM Déployé ».
        </span>
        <Btn variant="ghost" onClick={onClose}>Fermer</Btn>
        <Btn variant="primary" onClick={deploy} disabled={deploying || selected.size === 0}>
          {deploying ? <Loader2 size={12} className="animate-spin" /> : <Rocket size={12} />}
          Créer site web ({selected.size})
        </Btn>
      </ModalFt>
    </ModalShell>
  );
}
