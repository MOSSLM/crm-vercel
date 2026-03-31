"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BadgeCheck, Building2, Landmark, MapPin, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listLeadMagnetCards, type LeadMagnetListItem } from "@/utils/leadMagnetV2Api";

const normalizeStatus = (item: LeadMagnetListItem) => String(item.project.statut ?? item.project.status ?? "draft");

export function LeadMagnetV2ListPage() {
  const router = useRouter();
  const [rows, setRows] = useState<LeadMagnetListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [pipelineFilter, setPipelineFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [flagFilter, setFlagFilter] = useState("all");
  const [readyFilter, setReadyFilter] = useState<"all" | "ready" | "not_ready">("all");
  const [sortBy, setSortBy] = useState<"updated_desc" | "pipeline" | "name" | "updated_asc">("updated_desc");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const data = await listLeadMagnetCards();
        if (!cancelled) setRows(data);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const pipelines = useMemo(
    () => Array.from(new Set(rows.map((item) => item.pipeline?.nom).filter((value): value is string => Boolean(value)))).sort((a, b) => a.localeCompare(b, "fr")),
    [rows]
  );

  const statuses = useMemo(
    () => Array.from(new Set(rows.map((item) => normalizeStatus(item)))).sort((a, b) => a.localeCompare(b, "fr")),
    [rows]
  );

  const allFlags = useMemo(() => {
    return Array.from(
      new Set(
        rows.flatMap((item) => {
          const fromFlags = item.opportunity?.flags ?? [];
          const fromTags = item.opportunity?.tags ? item.opportunity.tags.split(",").map((tag) => tag.trim()) : [];
          return [...fromFlags, ...fromTags].filter(Boolean);
        })
      )
    ).sort((a, b) => a.localeCompare(b, "fr"));
  }, [rows]);

  const filteredRows = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    const filtered = rows.filter((item) => {
      const companyName = item.project.override_entreprise_name ?? item.company?.name ?? item.opportunity?.name ?? "";
      const city = item.project.override_city ?? item.company?.ville ?? "";
      const tags = item.opportunity?.tags ? item.opportunity.tags.split(",").map((tag) => tag.trim()) : [];
      const flags = item.opportunity?.flags ?? [];
      const status = normalizeStatus(item);
      const isReady = item.project.pret_pour_lm === true;

      const matchesSearch =
        !normalizedSearch || companyName.toLowerCase().includes(normalizedSearch) || city.toLowerCase().includes(normalizedSearch);
      const matchesPipeline = pipelineFilter === "all" || item.pipeline?.nom === pipelineFilter;
      const matchesStatus = statusFilter === "all" || status === statusFilter;
      const matchesFlag = flagFilter === "all" || [...tags, ...flags].includes(flagFilter);
      const matchesReady = readyFilter === "all" || (readyFilter === "ready" ? isReady : !isReady);

      return matchesSearch && matchesPipeline && matchesStatus && matchesFlag && matchesReady;
    });

    return filtered.sort((a, b) => {
      const updatedA = new Date(String(a.project.updated_at ?? "1970-01-01")).getTime();
      const updatedB = new Date(String(b.project.updated_at ?? "1970-01-01")).getTime();
      const nameA = (a.project.override_entreprise_name ?? a.company?.name ?? a.opportunity?.name ?? "").toLowerCase();
      const nameB = (b.project.override_entreprise_name ?? b.company?.name ?? b.opportunity?.name ?? "").toLowerCase();
      const pipelineA = (a.pipeline?.nom ?? "").toLowerCase();
      const pipelineB = (b.pipeline?.nom ?? "").toLowerCase();

      if (sortBy === "updated_asc") return updatedA - updatedB;
      if (sortBy === "pipeline") return pipelineA.localeCompare(pipelineB, "fr");
      if (sortBy === "name") return nameA.localeCompare(nameB, "fr");
      return updatedB - updatedA;
    });
  }, [rows, search, pipelineFilter, statusFilter, flagFilter, readyFilter, sortBy]);

  return (
    <div className="space-y-4 p-4 md:p-6">
      <Card>
        <CardHeader>
          <CardTitle>Lead Magnet CRM V2</CardTitle>
          <CardDescription>
            Source de vérité 100% V2: <code>lead_magnet_projects</code>, <code>lead_magnet_pages</code>, <code>lead_magnet_reviews</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <div className="xl:col-span-2 space-y-1">
            <Label>Recherche entreprise / ville</Label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-8" placeholder="Nom ou ville" />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Pipeline</Label>
            <Select value={pipelineFilter} onValueChange={setPipelineFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                {pipelines.map((pipeline) => (
                  <SelectItem key={pipeline} value={pipeline}>{pipeline}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Statut LM</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                {statuses.map((status) => (
                  <SelectItem key={status} value={status}>{status}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Tags / Flags</Label>
            <Select value={flagFilter} onValueChange={setFlagFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                {allFlags.map((flag) => (
                  <SelectItem key={flag} value={flag}>{flag}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Prêt pour LM</Label>
            <Select value={readyFilter} onValueChange={(value) => setReadyFilter(value as "all" | "ready" | "not_ready") }>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                <SelectItem value="ready">Oui</SelectItem>
                <SelectItem value="not_ready">Non</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1 xl:col-span-2">
            <Label>Tri</Label>
            <Select value={sortBy} onValueChange={(value) => setSortBy(value as typeof sortBy)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="updated_desc">Updated ↓</SelectItem>
                <SelectItem value="updated_asc">Updated ↑</SelectItem>
                <SelectItem value="pipeline">Pipeline</SelectItem>
                <SelectItem value="name">Nom entreprise</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <p className="text-sm text-muted-foreground">Chargement des lead magnets…</p>
      ) : filteredRows.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <p className="text-sm text-muted-foreground">
              Aucun projet ne correspond aux filtres. Modifiez la recherche pour afficher les rows de <code>lead_magnet_projects</code>.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {filteredRows.map((item) => {
            const companyName = item.project.override_entreprise_name ?? item.company?.name ?? item.opportunity?.name ?? "Entreprise inconnue";
            const opportunityName = item.opportunity?.name ?? "Opportunité inconnue";
            const city = item.project.override_city ?? item.company?.ville ?? "Ville inconnue";
            const flags = item.opportunity?.flags ?? [];
            const tags = item.opportunity?.tags ? item.opportunity.tags.split(",").map((tag) => tag.trim()) : [];
            const status = normalizeStatus(item);

            return (
              <Card
                key={item.project.id}
                className="cursor-pointer transition hover:border-primary/50 hover:shadow-md"
                onClick={() => router.push(`/production/lead-magnet/${item.project.id}`)}
              >
                <CardHeader className="space-y-2">
                  <CardTitle className="flex items-center justify-between text-base">
                    <span className="line-clamp-1">{companyName}</span>
                    <Badge variant={item.project.pret_pour_lm ? "default" : "secondary"}>
                      {item.project.pret_pour_lm ? "Prêt LM" : "Pas prêt"}
                    </Badge>
                  </CardTitle>
                  <CardDescription className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" /> {city}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="grid gap-2 rounded-md border p-2 text-xs text-muted-foreground">
                    <div className="inline-flex items-center gap-1">
                      <Landmark className="h-3.5 w-3.5" />
                      <span>Row ID: <span className="font-mono text-foreground">{item.project.id}</span></span>
                    </div>
                    <div>opportunite_id: <span className="font-mono text-foreground">{item.project.opportunite_id ?? "n/a"}</span></div>
                    <div>entreprise_id: <span className="font-mono text-foreground">{item.project.entreprise_id ?? "n/a"}</span></div>
                  </div>

                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Building2 className="h-4 w-4" />
                    <span>{item.pipeline?.nom ?? "Pipeline n/a"}</span>
                    {item.stage?.nom ? <Badge variant="outline">{item.stage.nom}</Badge> : null}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Opportunité: <span className="font-medium text-foreground">{opportunityName}</span>
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {tags.slice(0, 3).map((tag) => (
                      <Badge key={`tag-${tag}`} variant="outline">{tag}</Badge>
                    ))}
                    {flags.slice(0, 3).map((flag) => (
                      <Badge key={`flag-${flag}`} variant="secondary">{flag}</Badge>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <div>Statut: <span className="font-medium text-foreground">{status}</span></div>
                    <div>Pages: <span className="font-medium text-foreground">{item.pageCount}</span></div>
                    <div>Reviews actives: <span className="font-medium text-foreground">{item.activeReviewCount}</span></div>
                    <div className="inline-flex items-center gap-1">
                      <BadgeCheck className="h-3.5 w-3.5" />
                      {item.project.updated_at ? new Date(item.project.updated_at).toLocaleDateString("fr-FR") : "n/a"}
                    </div>
                  </div>

                  {item.project.logo_url ? (
                    <img src={item.project.logo_url} alt={companyName} className="h-10 w-10 rounded-md border object-cover" />
                  ) : item.company?.logo_url ? (
                    <img src={item.company.logo_url} alt={companyName} className="h-10 w-10 rounded-md border object-cover" />
                  ) : null}

                  <Link href={`/production/lead-magnet/${item.project.id}`} className="text-xs text-primary underline" onClick={(event) => event.stopPropagation()}>
                    Ouvrir l'éditeur
                  </Link>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
