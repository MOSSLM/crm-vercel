"use client";

import React from "react";
import { useAppData } from "@/components/AppDataContext";
import { getCompanyDisplayName } from "@/utils/displayHelpers";
import { normalizeServiceTags } from "@/utils/serviceTags";
import { ServiceTagPicker } from "@/components/ServiceTagPicker";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LayoutGrid, List, Search, Table2 } from "lucide-react";
import { toast } from "sonner";
import logger from "@/utils/logger";

export const CompanyServicesPage: React.FC = () => {
  const { companies, opportunities, pipelines, pipelineStages, updateCompany, updateOpportunity } = useAppData();
  const [viewMode, setViewMode] = React.useState<"cards" | "list" | "table">("cards");
  const [searchTerm, setSearchTerm] = React.useState("");
  const [serviceFilter, setServiceFilter] = React.useState("");
  const [selectedOpportunityFlags, setSelectedOpportunityFlags] = React.useState<string[]>([]);
  const [savingCompanyIds, setSavingCompanyIds] = React.useState<Set<number>>(new Set());
  const [selectedCompanyIds, setSelectedCompanyIds] = React.useState<number[]>([]);
  const [lastSelectedCompanyId, setLastSelectedCompanyId] = React.useState<number | null>(null);
  const [bulkPipelineTarget, setBulkPipelineTarget] = React.useState<string>("none");
  const [isBulkMoving, setIsBulkMoving] = React.useState(false);

  const parseOpportunityTags = React.useCallback((tags?: string) => {
    if (!tags) return [];
    return tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
  }, []);

  const extractOpportunityFlags = React.useCallback(
    (opportunityFlags?: string[] | null, legacyTags?: string) => {
      if (Array.isArray(opportunityFlags)) {
        return opportunityFlags
          .map((flag) => flag.trim())
          .filter(Boolean);
      }
      return parseOpportunityTags(legacyTags);
    },
    [parseOpportunityTags]
  );

  const normalizeWebsiteUrl = React.useCallback((url?: string | null) => {
    if (!url) return undefined;
    const trimmed = url.trim();
    if (!trimmed) return undefined;
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `https://${trimmed.replace(/^\/+/, "")}`;
  }, []);

  const qualifiedCompanies = React.useMemo(
    () => companies.filter((company) => company.qualifie),
    [companies]
  );

  const allServiceTags = React.useMemo(
    () =>
      Array.from(
        new Set(
          qualifiedCompanies.flatMap((company) => normalizeServiceTags(company.service_tags, company.premiers_tags))
        )
      ).sort((a, b) => a.localeCompare(b, "fr")),
    [qualifiedCompanies]
  );

  const companyOpportunityFlags = React.useMemo(() => {
    const byCompany = new Map<number, string[]>();
    for (const opportunity of opportunities) {
      if (!opportunity.entreprise_id) continue;
      const current = byCompany.get(opportunity.entreprise_id) ?? [];
      const merged = new Set([...current, ...extractOpportunityFlags(opportunity.flags, opportunity.tags)]);
      byCompany.set(opportunity.entreprise_id, Array.from(merged).sort((a, b) => a.localeCompare(b, "fr")));
    }
    return byCompany;
  }, [extractOpportunityFlags, opportunities]);

  const allOpportunityFlags = React.useMemo(
    () =>
      Array.from(
        new Set(
          opportunities.flatMap((opportunity) => extractOpportunityFlags(opportunity.flags, opportunity.tags))
        )
      ).sort((a, b) => a.localeCompare(b, "fr")),
    [extractOpportunityFlags, opportunities]
  );

  const filteredCompanies = React.useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    const normalizedServiceFilter = serviceFilter.trim().toLowerCase();

    return qualifiedCompanies.filter((company) => {
      const companyName = getCompanyDisplayName(company.name, company.canonical_url).toLowerCase();
      const tags = normalizeServiceTags(company.service_tags, company.premiers_tags);
      const opportunityFlags = companyOpportunityFlags.get(company.id) ?? [];

      const matchesSearch =
        !normalizedSearch ||
        companyName.includes(normalizedSearch) ||
        (company.ville || "").toLowerCase().includes(normalizedSearch);

      const matchesService =
        !normalizedServiceFilter ||
        tags.some((tag) => tag.toLowerCase().includes(normalizedServiceFilter));

      const matchesOpportunityFlags =
        selectedOpportunityFlags.length === 0 ||
        selectedOpportunityFlags.some((flag) => opportunityFlags.includes(flag));

      return matchesSearch && matchesService && matchesOpportunityFlags;
    });
  }, [companyOpportunityFlags, qualifiedCompanies, searchTerm, selectedOpportunityFlags, serviceFilter]);

  const visibleCompanyIds = React.useMemo(() => filteredCompanies.map((company) => company.id), [filteredCompanies]);

  const companyOpportunitiesCount = React.useMemo(() => {
    const byCompany = new Map<number, number>();
    for (const opportunity of opportunities) {
      if (!opportunity.entreprise_id) continue;
      byCompany.set(opportunity.entreprise_id, (byCompany.get(opportunity.entreprise_id) ?? 0) + 1);
    }
    return byCompany;
  }, [opportunities]);

  const toggleCompanySelection = React.useCallback(
    (companyId: number, checked: boolean, shiftKey = false) => {
      setSelectedCompanyIds((previous) => {
        if (shiftKey && lastSelectedCompanyId !== null) {
          const startIndex = visibleCompanyIds.indexOf(lastSelectedCompanyId);
          const endIndex = visibleCompanyIds.indexOf(companyId);
          if (startIndex !== -1 && endIndex !== -1) {
            const [from, to] = startIndex < endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
            const rangeIds = visibleCompanyIds.slice(from, to + 1);
            if (checked) return Array.from(new Set([...previous, ...rangeIds]));
            return previous.filter((id) => !rangeIds.includes(id));
          }
        }
        if (checked) return Array.from(new Set([...previous, companyId]));
        return previous.filter((id) => id !== companyId);
      });
      setLastSelectedCompanyId(companyId);
    },
    [lastSelectedCompanyId, visibleCompanyIds]
  );

  const selectedVisibleCount = React.useMemo(
    () => visibleCompanyIds.filter((companyId) => selectedCompanyIds.includes(companyId)).length,
    [selectedCompanyIds, visibleCompanyIds]
  );

  const handleToggleAllVisibleCompanies = React.useCallback((checked: boolean) => {
    setSelectedCompanyIds((previous) => {
      if (!checked) return previous.filter((companyId) => !visibleCompanyIds.includes(companyId));
      return Array.from(new Set([...previous, ...visibleCompanyIds]));
    });
  }, [visibleCompanyIds]);

  const handleServicesChange = async (companyId: number, nextServices: string[]) => {
    setSavingCompanyIds((prev) => new Set(prev).add(companyId));
    try {
      await updateCompany(companyId, { service_tags: nextServices });
    } catch (error) {
      logger.error("Erreur de sauvegarde des services entreprise", error);
      toast.error("Impossible de sauvegarder les services");
    } finally {
      setSavingCompanyIds((prev) => {
        const next = new Set(prev);
        next.delete(companyId);
        return next;
      });
    }
  };

  const handleBulkMoveToPipeline = async () => {
    if (bulkPipelineTarget === "none" || selectedCompanyIds.length === 0) return;

    const targetStage =
      pipelineStages.find((stage) => stage.pipeline_id === bulkPipelineTarget && stage.ordre === 1) ||
      pipelineStages.find((stage) => stage.pipeline_id === bulkPipelineTarget);

    if (!targetStage) {
      toast.error("Aucune étape trouvée pour ce pipeline");
      return;
    }

    const targetCompanyIds = new Set(selectedCompanyIds);
    const opportunitiesToMove = opportunities.filter((opportunity) => opportunity.entreprise_id && targetCompanyIds.has(opportunity.entreprise_id));

    if (opportunitiesToMove.length === 0) {
      toast.error("Aucune opportunité trouvée pour la sélection");
      return;
    }

    setIsBulkMoving(true);
    try {
      await Promise.all(
        opportunitiesToMove.map((opportunity) =>
          updateOpportunity(opportunity.id, {
            pipeline_id: bulkPipelineTarget,
            stage_id: targetStage.id,
          })
        )
      );
      toast.success(`${opportunitiesToMove.length} opportunité(s) déplacée(s) pour ${selectedCompanyIds.length} entreprise(s)`);
      setBulkPipelineTarget("none");
      setSelectedCompanyIds([]);
      setLastSelectedCompanyId(null);
    } catch (error) {
      logger.error("Erreur de déplacement groupé des opportunités", error);
      toast.error("Impossible de déplacer les opportunités sélectionnées");
    } finally {
      setIsBulkMoving(false);
    }
  };

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6">
      <div>
        <h1>Services entreprises</h1>
        <p className="text-muted-foreground">Définissez les services proposés par chaque entreprise qualifiée.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-center">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Rechercher une entreprise..." className="pl-10" />
        </div>
        <Input
          value={serviceFilter}
          onChange={(e) => setServiceFilter(e.target.value)}
          placeholder="Filtrer par service (ex: SEO, plomberie...)"
        />
        <div className="flex border rounded-lg w-fit">
          <Button variant={viewMode === "cards" ? "default" : "ghost"} size="sm" onClick={() => setViewMode("cards")} className="rounded-r-none">
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button variant={viewMode === "list" ? "default" : "ghost"} size="sm" onClick={() => setViewMode("list")} className="rounded-none">
            <List className="h-4 w-4" />
          </Button>
          <Button variant={viewMode === "table" ? "default" : "ghost"} size="sm" onClick={() => setViewMode("table")} className="rounded-l-none">
            <Table2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">Filtrer par flags d&apos;opportunités</p>
        <div className="flex flex-wrap gap-2">
          {allOpportunityFlags.length === 0 ? (
            <Badge variant="outline">Aucun flag d&apos;opportunité</Badge>
          ) : (
            allOpportunityFlags.map((flag) => {
              const isSelected = selectedOpportunityFlags.includes(flag);
              return (
                <Button
                  key={flag}
                  variant={isSelected ? "default" : "outline"}
                  size="sm"
                  onClick={() =>
                    setSelectedOpportunityFlags((prev) =>
                      prev.includes(flag) ? prev.filter((value) => value !== flag) : [...prev, flag]
                    )
                  }
                >
                  {flag}
                </Button>
              );
            })
          )}
          {selectedOpportunityFlags.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setSelectedOpportunityFlags([])}>
              Réinitialiser
            </Button>
          )}
        </div>
      </div>

      <div className="text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
        <span>{filteredCompanies.length} entreprise{filteredCompanies.length > 1 ? "s" : ""}</span>
        <Badge variant="outline">{allServiceTags.length} service{allServiceTags.length > 1 ? "s" : ""} existant{allServiceTags.length > 1 ? "s" : ""}</Badge>
        <Badge variant="secondary">{selectedCompanyIds.length} sélectionnée{selectedCompanyIds.length > 1 ? "s" : ""}</Badge>
      </div>

      <div className="border rounded-lg p-3 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
        <div className="text-sm text-muted-foreground">
          Déplacement pipeline multi-entreprises (toutes les opportunités associées).
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Select value={bulkPipelineTarget} onValueChange={setBulkPipelineTarget}>
            <SelectTrigger className="w-full sm:w-64">
              <SelectValue placeholder="Choisir un pipeline cible" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Choisir un pipeline</SelectItem>
              {pipelines
                .filter((pipeline) => pipeline.visible)
                .sort((a, b) => a.ordre - b.ordre)
                .map((pipeline) => (
                  <SelectItem key={pipeline.id} value={pipeline.id}>
                    {pipeline.nom}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Button onClick={() => void handleBulkMoveToPipeline()} disabled={isBulkMoving || bulkPipelineTarget === "none" || selectedCompanyIds.length === 0}>
            {isBulkMoving ? "Déplacement..." : "Déplacer les opportunités"}
          </Button>
        </div>
      </div>

      {viewMode === "cards" ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredCompanies.map((company) => {
            const services = normalizeServiceTags(company.service_tags, company.premiers_tags);
            const websiteUrl = normalizeWebsiteUrl(company.site_web_canonique ?? company.canonical_url);
            const opportunityFlags = companyOpportunityFlags.get(company.id) ?? [];
            return (
              <Card key={company.id}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-start justify-between gap-3">
                    <span>{getCompanyDisplayName(company.name, company.canonical_url)}</span>
                    <Checkbox
                      checked={selectedCompanyIds.includes(company.id)}
                      onCheckedChange={(checked) => toggleCompanySelection(company.id, checked === true)}
                      aria-label={`Sélectionner ${getCompanyDisplayName(company.name, company.canonical_url)}`}
                    />
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {opportunityFlags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {opportunityFlags.map((flag) => (
                        <Badge key={flag} variant="outline">
                          {flag}
                        </Badge>
                      ))}
                    </div>
                  )}
                  <ServiceTagPicker
                    value={services}
                    allOptions={allServiceTags}
                    onChange={(nextServices) => void handleServicesChange(company.id, nextServices)}
                    placeholder="Rechercher ou créer un service"
                    emptyLabel={savingCompanyIds.has(company.id) ? "Sauvegarde..." : "Aucun service"}
                  />
                  {websiteUrl && (
                    <Button asChild variant="outline" size="sm">
                      <a href={websiteUrl} target="_blank" rel="noreferrer noopener">
                        Ouvrir le site web
                      </a>
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        viewMode === "list" ? (
        <div className="space-y-3">
          {filteredCompanies.map((company) => {
            const services = normalizeServiceTags(company.service_tags, company.premiers_tags);
            const websiteUrl = normalizeWebsiteUrl(company.site_web_canonique ?? company.canonical_url);
            const opportunityFlags = companyOpportunityFlags.get(company.id) ?? [];
            return (
              <Card key={company.id}>
                <CardContent className="pt-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-medium">{getCompanyDisplayName(company.name, company.canonical_url)}</h3>
                    <Checkbox
                      checked={selectedCompanyIds.includes(company.id)}
                      onCheckedChange={(checked) => toggleCompanySelection(company.id, checked === true)}
                      aria-label={`Sélectionner ${getCompanyDisplayName(company.name, company.canonical_url)}`}
                    />
                  </div>
                  {opportunityFlags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {opportunityFlags.map((flag) => (
                        <Badge key={flag} variant="outline">
                          {flag}
                        </Badge>
                      ))}
                    </div>
                  )}
                  <ServiceTagPicker
                    value={services}
                    allOptions={allServiceTags}
                    onChange={(nextServices) => void handleServicesChange(company.id, nextServices)}
                    placeholder="Rechercher ou créer un service"
                    emptyLabel={savingCompanyIds.has(company.id) ? "Sauvegarde..." : "Aucun service"}
                  />
                  {websiteUrl && (
                    <Button asChild variant="outline" size="sm">
                      <a href={websiteUrl} target="_blank" rel="noreferrer noopener">
                        Ouvrir le site web
                      </a>
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
        ) : (
          <Card>
            <CardContent className="pt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-14">
                      <Checkbox
                        checked={selectedVisibleCount > 0 && selectedVisibleCount === visibleCompanyIds.length}
                        indeterminate={
                          selectedVisibleCount > 0 && selectedVisibleCount < visibleCompanyIds.length
                        }
                        onCheckedChange={(checked) => handleToggleAllVisibleCompanies(checked === true)}
                        aria-label="Tout sélectionner"
                      />
                    </TableHead>
                    <TableHead>Entreprise</TableHead>
                    <TableHead>Ville</TableHead>
                    <TableHead>Flags opportunités</TableHead>
                    <TableHead className="text-right">Opportunités</TableHead>
                    <TableHead>Services</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCompanies.map((company) => {
                    const services = normalizeServiceTags(company.service_tags, company.premiers_tags);
                    const opportunityFlags = companyOpportunityFlags.get(company.id) ?? [];
                    const companyDisplayName = getCompanyDisplayName(company.name, company.canonical_url);
                    const isSelected = selectedCompanyIds.includes(company.id);
                    return (
                      <TableRow key={company.id}>
                        <TableCell>
                          <Checkbox
                            checked={isSelected}
                            onClick={(event) => {
                              toggleCompanySelection(company.id, !isSelected, event.shiftKey);
                            }}
                            onCheckedChange={(checked) => {
                              if (checked !== "indeterminate") {
                                toggleCompanySelection(company.id, checked === true);
                              }
                            }}
                            aria-label={`Sélectionner ${companyDisplayName}`}
                          />
                        </TableCell>
                        <TableCell className="font-medium">{companyDisplayName}</TableCell>
                        <TableCell>{company.ville || "—"}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1.5">
                            {opportunityFlags.length === 0 ? (
                              <Badge variant="outline">Aucun flag</Badge>
                            ) : (
                              opportunityFlags.map((flag) => (
                                <Badge key={flag} variant="outline">
                                  {flag}
                                </Badge>
                              ))
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">{companyOpportunitiesCount.get(company.id) ?? 0}</TableCell>
                        <TableCell className="min-w-[260px]">
                          <ServiceTagPicker
                            value={services}
                            allOptions={allServiceTags}
                            onChange={(nextServices) => void handleServicesChange(company.id, nextServices)}
                            placeholder="Rechercher ou créer un service"
                            emptyLabel={savingCompanyIds.has(company.id) ? "Sauvegarde..." : "Aucun service"}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <p className="mt-3 text-xs text-muted-foreground">
                Astuce: en vue tableau, utilisez Shift + clic entre deux cases pour sélectionner une plage d&apos;entreprises.
              </p>
            </CardContent>
          </Card>
        )
      )}
    </div>
  );
};
