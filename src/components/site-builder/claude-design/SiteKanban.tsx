"use client";

import React from "react";
import Link from "next/link";
import { DndProvider, useDrag, useDrop } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { toast } from "sonner";
import { Pencil, Globe, Rocket, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { authedFetch } from "@/utils/authedFetch";

interface Demo {
  id: string;
  name: string;
  build_stage: string;
  published_subdomain: string | null;
  enterprise_id: number | null;
  company_name: string | null;
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

function DemoCard({ demo, onDeploy }: { demo: Demo; onDeploy: (id: string) => void }) {
  const [{ isDragging }, drag] = useDrag(() => ({
    type: "CARD",
    item: { kind: "demo", id: demo.id } as DragItem,
    collect: (m) => ({ isDragging: m.isDragging() }),
  }), [demo.id]);
  return (
    <div
      ref={drag as unknown as React.Ref<HTMLDivElement>}
      className={`rounded-lg border bg-card p-3 text-sm shadow-sm cursor-grab ${isDragging ? "opacity-40" : ""}`}
    >
      <div className="font-medium truncate">{demo.company_name || demo.name}</div>
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
      <div className="mt-2 flex gap-1.5">
        <Link href={`/site-builder/claude/${demo.id}`} className="flex-1">
          <Button variant="outline" size="sm" className="w-full gap-1 text-xs h-7">
            <Pencil className="h-3 w-3" /> Éditer
          </Button>
        </Link>
        <Button variant="ghost" size="sm" className="text-xs h-7 gap-1" onClick={() => onDeploy(demo.id)}>
          <Rocket className="h-3 w-3" /> Déployer
        </Button>
      </div>
    </div>
  );
}

function KanbanColumn({
  stage, demos, onDropCard, onDeploy,
}: {
  stage: { key: string; label: string; hint: string };
  demos: Demo[];
  onDropCard: (item: DragItem, stage: string) => void;
  onDeploy: (id: string) => void;
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
        {demos.map((d) => <DemoCard key={d.id} demo={d} onDeploy={onDeploy} />)}
      </div>
    </div>
  );
}

function Board() {
  const [data, setData] = React.useState<BoardData>({ templates: [], demos: [], readyCompanies: [] });
  const [templateId, setTemplateId] = React.useState<string>("");
  const [loading, setLoading] = React.useState(true);

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
