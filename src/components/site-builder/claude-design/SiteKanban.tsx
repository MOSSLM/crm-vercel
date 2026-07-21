"use client";

import React from "react";
import Link from "next/link";
import { DndProvider, useDrag, useDrop } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { toast } from "sonner";
import { Pencil, Rocket, GripVertical, Copy, Check, Lock, LockOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { authedFetch } from "@/utils/authedFetch";

interface Demo {
  id: string;
  name: string;
  build_stage: string;
  published_subdomain: string | null;
  enterprise_id: number | null;
  company_name: string | null;
  paywall_enabled: boolean;
}
interface ReadyCompany { id: number; name: string }
interface TemplateRef { id: string; name: string }

interface BoardData {
  templates: TemplateRef[];
  demos: Demo[];
  readyCompanies: ReadyCompany[];
}

const STAGES: Array<{ key: string; label: string; hint: string }> = [
  { key: "a_faire", label: "À faire", hint: "Prêt à créer" },
  { key: "en_cours", label: "En cours", hint: "À contrôler" },
  { key: "a_verifier", label: "À vérifier", hint: "Quelques retouches" },
  { key: "pret", label: "Prêt", hint: "Prêt à envoyer" },
];

const SITE_DOMAIN = "samadigitalstudio.fr";

/** Shareable URL for a demo: its deployed subdomain, else the id-based preview. */
function demoShareUrl(demo: Demo): string {
  return demo.published_subdomain
    ? `https://${demo.published_subdomain}.${SITE_DOMAIN}`
    : `https://${demo.id}.${SITE_DOMAIN}`;
}

type DragItem = { kind: "demo"; id: string } | { kind: "company"; id: number };

function CompanyCard({ company }: { company: ReadyCompany }) {
  const [{ isDragging }, drag] = useDrag(() => ({
    type: "CARD",
    item: { kind: "company", id: company.id } as DragItem,
    collect: (m) => ({ isDragging: m.isDragging() }),
  }), [company.id]);
  return (
    <div
      ref={drag as unknown as React.Ref<HTMLDivElement>}
      className={`flex items-center gap-2 rounded-lg border bg-card p-2 text-sm cursor-grab ${isDragging ? "opacity-40" : ""}`}
    >
      <GripVertical className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <span className="truncate">{company.name}</span>
    </div>
  );
}

function DemoCard({
  demo, onDeploy, onTogglePaywall, selected, onToggleSelect,
}: {
  demo: Demo;
  onDeploy: (id: string) => void;
  onTogglePaywall: (id: string, value: boolean) => void;
  selected: boolean;
  onToggleSelect: (id: string) => void;
}) {
  const [{ isDragging }, drag] = useDrag(() => ({
    type: "CARD",
    item: { kind: "demo", id: demo.id } as DragItem,
    collect: (m) => ({ isDragging: m.isDragging() }),
  }), [demo.id]);
  const [copied, setCopied] = React.useState(false);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(demoShareUrl(demo));
      setCopied(true);
      toast.success("Lien du site copié.");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Copie impossible.");
    }
  };

  return (
    <div
      ref={drag as unknown as React.Ref<HTMLDivElement>}
      className={`rounded-lg border bg-card p-3 text-sm shadow-sm cursor-grab ${isDragging ? "opacity-40" : ""} ${selected ? "ring-2 ring-primary" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="font-medium truncate">{demo.company_name || demo.name}</div>
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(demo.id)}
          onClick={(e) => e.stopPropagation()}
          title="Sélectionner pour une action groupée"
          className="mt-0.5 shrink-0 cursor-pointer"
        />
      </div>
      {demo.published_subdomain ? (
        <a
          href={`https://${demo.published_subdomain}.${SITE_DOMAIN}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-600 hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {demo.published_subdomain}.{SITE_DOMAIN} ↗
        </a>
      ) : (
        <div className="text-xs text-muted-foreground">Non déployé</div>
      )}

      <button
        type="button"
        onClick={() => onTogglePaywall(demo.id, !demo.paywall_enabled)}
        className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors ${
          demo.paywall_enabled
            ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
            : "bg-muted text-muted-foreground hover:bg-muted/70"
        }`}
        title={demo.paywall_enabled ? "Paywall actif — cliquer pour désactiver" : "Paywall inactif — cliquer pour activer"}
      >
        {demo.paywall_enabled ? <Lock className="h-3 w-3" /> : <LockOpen className="h-3 w-3" />}
        Paywall {demo.paywall_enabled ? "ON" : "OFF"}
      </button>

      <div className="mt-2 flex gap-1.5">
        <Link href={`/site-builder/claude/${demo.id}`} className="flex-1">
          <Button variant="outline" size="sm" className="w-full gap-1 text-xs h-7">
            <Pencil className="h-3 w-3" /> Éditer
          </Button>
        </Link>
        <Button variant="ghost" size="sm" className="text-xs h-7 gap-1" onClick={copyLink} title="Copier le lien à envoyer au client">
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />} Lien
        </Button>
        <Button variant="ghost" size="sm" className="text-xs h-7 gap-1" onClick={() => onDeploy(demo.id)}>
          <Rocket className="h-3 w-3" /> Déployer
        </Button>
      </div>
    </div>
  );
}

function KanbanColumn({
  stage, demos, onDropCard, onDeploy, onTogglePaywall, selectedIds, onToggleSelect,
}: {
  stage: { key: string; label: string; hint: string };
  demos: Demo[];
  onDropCard: (item: DragItem, stage: string) => void;
  onDeploy: (id: string) => void;
  onTogglePaywall: (id: string, value: boolean) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
}) {
  const [{ isOver, canDrop }, drop] = useDrop(() => ({
    accept: "CARD",
    canDrop: (item: DragItem) => item.kind === "demo" || stage.key === "a_faire",
    drop: (item: DragItem) => onDropCard(item, stage.key),
    collect: (m) => ({ isOver: m.isOver(), canDrop: m.canDrop() }),
  }), [stage.key]);

  return (
    <div
      ref={drop as unknown as React.Ref<HTMLDivElement>}
      className={`flex flex-col rounded-xl border bg-muted/30 p-3 min-h-[60vh] transition-colors ${isOver && canDrop ? "ring-2 ring-primary bg-primary/5" : ""}`}
    >
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="font-semibold text-sm">{stage.label}</h3>
        <span className="text-xs text-muted-foreground">{demos.length}</span>
      </div>
      <p className="text-[11px] text-muted-foreground mb-3">{stage.hint}</p>
      <div className="flex flex-col gap-2">
        {demos.map((d) => (
          <DemoCard
            key={d.id}
            demo={d}
            onDeploy={onDeploy}
            onTogglePaywall={onTogglePaywall}
            selected={selectedIds.has(d.id)}
            onToggleSelect={onToggleSelect}
          />
        ))}
      </div>
    </div>
  );
}

function Board() {
  const [data, setData] = React.useState<BoardData>({ templates: [], demos: [], readyCompanies: [] });
  const [templateId, setTemplateId] = React.useState<string>("");
  const [loading, setLoading] = React.useState(true);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const setPaywall = async (ids: string[], value: boolean) => {
    if (ids.length === 0) return;
    // Optimistic.
    setData((prev) => ({
      ...prev,
      demos: prev.demos.map((d) => (ids.includes(d.id) ? { ...d, paywall_enabled: value } : d)),
    }));
    const results = await Promise.all(
      ids.map((id) =>
        authedFetch(`/api/site-builder/sites/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paywall_enabled: value }),
        }).catch(() => null),
      ),
    );
    if (results.some((r) => !r || !r.ok)) {
      toast.error("Certaines mises à jour du paywall ont échoué.");
      load();
    } else {
      toast.success(value ? "Paywall activé." : "Paywall désactivé.");
    }
  };

  const load = React.useCallback(async () => {
    try {
      const res = await authedFetch("/api/site-builder/claude/board");
      if (!res.ok) throw new Error();
      const d = (await res.json()) as BoardData;
      setData(d);
      setTemplateId((prev) => prev || d.templates[0]?.id || "");
    } catch {
      toast.error("Erreur lors du chargement du board");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const handleDrop = async (item: DragItem, stage: string) => {
    if (item.kind === "demo") {
      const demo = data.demos.find((d) => d.id === item.id);
      if (!demo || demo.build_stage === stage) return;
      // Optimistic stage move.
      setData((prev) => ({ ...prev, demos: prev.demos.map((d) => d.id === item.id ? { ...d, build_stage: stage } : d) }));
      try {
        const res = await authedFetch(`/api/site-builder/sites/${item.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ build_stage: stage }),
        });
        if (!res.ok) throw new Error();
      } catch {
        toast.error("Déplacement impossible");
        load();
      }
      return;
    }
    // Company dropped into "À faire" → create the demo from the selected template.
    if (stage !== "a_faire") return;
    if (!templateId) { toast.error("Choisis d'abord un template"); return; }
    const t = toast.loading("Création du site démo…");
    try {
      const res = await authedFetch(`/api/site-builder/claude/${templateId}/create-demo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: item.id }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Échec");
      toast.success("Site démo créé", { id: t });
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Création impossible", { id: t });
    }
  };

  const handleDeploy = async (id: string) => {
    const t = toast.loading("Déploiement…");
    try {
      const res = await authedFetch(`/api/site-builder/sites/${id}/deploy`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Échec");
      toast.success(`Déployé : ${body.subdomain}`, { id: t });
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Déploiement impossible", { id: t });
    }
  };

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Chargement…</div>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <label className="text-sm text-muted-foreground">Template :</label>
        <select
          className="rounded-md border bg-background px-2 py-1 text-sm"
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
        >
          {data.templates.length === 0 && <option value="">Aucun template</option>}
          {data.templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <span className="text-xs text-muted-foreground">Glisse une société « Prêt pour LM » dans « À faire » pour générer son site.</span>
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-primary/5 px-3 py-2 text-sm">
          <span className="font-medium">{selected.size} site{selected.size > 1 ? "s" : ""} sélectionné{selected.size > 1 ? "s" : ""}</span>
          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => setPaywall([...selected], true)}>
            <Lock className="h-3 w-3" /> Activer le paywall
          </Button>
          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => setPaywall([...selected], false)}>
            <LockOpen className="h-3 w-3" /> Désactiver
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSelected(new Set())}>
            Effacer la sélection
          </Button>
        </div>
      )}

      <div className="grid grid-cols-[220px_1fr] gap-4">
        {/* Pool of ready companies */}
        <div className="rounded-xl border bg-muted/30 p-3">
          <div className="mb-3 flex items-baseline justify-between">
            <h3 className="font-semibold text-sm">Prêt pour LM</h3>
            <span className="text-xs text-muted-foreground">{data.readyCompanies.length}</span>
          </div>
          <div className="flex flex-col gap-2">
            {data.readyCompanies.length === 0 ? (
              <p className="text-xs text-muted-foreground">Aucune société en attente.</p>
            ) : data.readyCompanies.map((c) => <CompanyCard key={c.id} company={c} />)}
          </div>
        </div>

        {/* Stage columns */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {STAGES.map((stage) => (
            <KanbanColumn
              key={stage.key}
              stage={stage}
              demos={data.demos.filter((d) => d.build_stage === stage.key)}
              onDropCard={handleDrop}
              onDeploy={handleDeploy}
              onTogglePaywall={(id, value) => setPaywall([id], value)}
              selectedIds={selected}
              onToggleSelect={toggleSelect}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function SiteKanban() {
  return (
    <DndProvider backend={HTML5Backend}>
      <Board />
    </DndProvider>
  );
}

export default SiteKanban;
