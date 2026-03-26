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
import { LayoutGrid, List, Search } from "lucide-react";
import { toast } from "sonner";
import logger from "@/utils/logger";

export const CompanyServicesPage: React.FC = () => {
  const { companies, opportunities, updateCompany } = useAppData();
  const [viewMode, setViewMode] = React.useState<"cards" | "list">("cards");
  const [searchTerm, setSearchTerm] = React.useState("");
  const [serviceFilter, setServiceFilter] = React.useState("");
  const [selectedOpportunityTags, setSelectedOpportunityTags] = React.useState<string[]>([]);
  const [savingCompanyIds, setSavingCompanyIds] = React.useState<Set<number>>(new Set());

  const parseOpportunityTags = React.useCallback((tags?: string) => {
    if (!tags) return [];
    return tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
  }, []);

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

  const companyOpportunityTags = React.useMemo(() => {
    const byCompany = new Map<number, string[]>();
    for (const opportunity of opportunities) {
      if (!opportunity.entreprise_id) continue;
      const current = byCompany.get(opportunity.entreprise_id) ?? [];
      const merged = new Set([...current, ...parseOpportunityTags(opportunity.tags)]);
      byCompany.set(opportunity.entreprise_id, Array.from(merged).sort((a, b) => a.localeCompare(b, "fr")));
    }
    return byCompany;
  }, [opportunities, parseOpportunityTags]);

  const allOpportunityTags = React.useMemo(
    () =>
      Array.from(
        new Set(
          opportunities.flatMap((opportunity) => parseOpportunityTags(opportunity.tags))
        )
      ).sort((a, b) => a.localeCompare(b, "fr")),
    [opportunities, parseOpportunityTags]
  );

  const filteredCompanies = React.useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    const normalizedServiceFilter = serviceFilter.trim().toLowerCase();

    return qualifiedCompanies.filter((company) => {
      const companyName = getCompanyDisplayName(company.name, company.canonical_url).toLowerCase();
      const tags = normalizeServiceTags(company.service_tags, company.premiers_tags);
      const opportunityTags = companyOpportunityTags.get(company.id) ?? [];

      const matchesSearch =
        !normalizedSearch ||
        companyName.includes(normalizedSearch) ||
        (company.ville || "").toLowerCase().includes(normalizedSearch);

      const matchesService =
        !normalizedServiceFilter ||
        tags.some((tag) => tag.toLowerCase().includes(normalizedServiceFilter));

      const matchesOpportunityTags =
        selectedOpportunityTags.length === 0 ||
        selectedOpportunityTags.some((tag) => opportunityTags.includes(tag));

      return matchesSearch && matchesService && matchesOpportunityTags;
    });
  }, [companyOpportunityTags, qualifiedCompanies, searchTerm, selectedOpportunityTags, serviceFilter]);

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
          <Button variant={viewMode === "list" ? "default" : "ghost"} size="sm" onClick={() => setViewMode("list")} className="rounded-l-none">
            <List className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">Filtrer par tags d&apos;opportunités</p>
        <div className="flex flex-wrap gap-2">
          {allOpportunityTags.length === 0 ? (
            <Badge variant="outline">Aucun tag d&apos;opportunité</Badge>
          ) : (
            allOpportunityTags.map((tag) => {
              const isSelected = selectedOpportunityTags.includes(tag);
              return (
                <Button
                  key={tag}
                  variant={isSelected ? "default" : "outline"}
                  size="sm"
                  onClick={() =>
                    setSelectedOpportunityTags((prev) =>
                      prev.includes(tag) ? prev.filter((value) => value !== tag) : [...prev, tag]
                    )
                  }
                >
                  {tag}
                </Button>
              );
            })
          )}
          {selectedOpportunityTags.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setSelectedOpportunityTags([])}>
              Réinitialiser
            </Button>
          )}
        </div>
      </div>

      <div className="text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
        <span>{filteredCompanies.length} entreprise{filteredCompanies.length > 1 ? "s" : ""}</span>
        <Badge variant="outline">{allServiceTags.length} service{allServiceTags.length > 1 ? "s" : ""} existant{allServiceTags.length > 1 ? "s" : ""}</Badge>
      </div>

      {viewMode === "cards" ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredCompanies.map((company) => {
            const services = normalizeServiceTags(company.service_tags, company.premiers_tags);
            const websiteUrl = normalizeWebsiteUrl(company.site_web_canonique ?? company.canonical_url);
            const opportunityTags = companyOpportunityTags.get(company.id) ?? [];
            return (
              <Card key={company.id}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{getCompanyDisplayName(company.name, company.canonical_url)}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {opportunityTags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {opportunityTags.map((tag) => (
                        <Badge key={tag} variant="outline">
                          {tag}
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
        <div className="space-y-3">
          {filteredCompanies.map((company) => {
            const services = normalizeServiceTags(company.service_tags, company.premiers_tags);
            const websiteUrl = normalizeWebsiteUrl(company.site_web_canonique ?? company.canonical_url);
            const opportunityTags = companyOpportunityTags.get(company.id) ?? [];
            return (
              <Card key={company.id}>
                <CardContent className="pt-4 space-y-3">
                  <h3 className="font-medium">{getCompanyDisplayName(company.name, company.canonical_url)}</h3>
                  {opportunityTags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {opportunityTags.map((tag) => (
                        <Badge key={tag} variant="outline">
                          {tag}
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
      )}
    </div>
  );
};
