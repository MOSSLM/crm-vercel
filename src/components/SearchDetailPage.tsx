"use client";

import React, { useState } from "react";
import { useAppData, SearchResult, Company } from "./AppDataContext";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { ArrowLeft, ArrowUpDown, Merge, Phone, Mail, Globe, MapPin } from "lucide-react";

interface SearchDetailPageProps {
  searchResult: SearchResult;
  onBack: () => void;
}

type SortBy = "name";

export const SearchDetailPage: React.FC<SearchDetailPageProps> = ({
  searchResult,
  onBack,
}) => {
  const { getMapCompanies, getGoogleCompanies, getCompaniesBySearchId } =
    useAppData();

  const getDefaultTab = () => {
    if (searchResult.useMaps && !searchResult.useGoogle) return "maps";
    if (!searchResult.useMaps && searchResult.useGoogle) return "google";
    if (searchResult.useMaps && searchResult.useGoogle) return "maps";
    return "maps";
  };

  const [activeTab, setActiveTab] = useState(getDefaultTab());
  const [sortBy, setSortBy] = useState<SortBy>("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [showMerged, setShowMerged] = useState(false);

  const mapCompanies = getMapCompanies(searchResult.id);
  const googleCompanies = getGoogleCompanies(searchResult.id);
  const allCompanies = getCompaniesBySearchId(searchResult.id);

  const sortCompanies = (companies: Company[]) => {
    return [...companies].sort((a, b) => {
      let aValue: string, bValue: string;
      switch (sortBy) {
        case "name":
        default:
          aValue = (a.name || "").toLowerCase();
          bValue = (b.name || "").toLowerCase();
          break;
      }
      if (sortOrder === "asc") {
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      } else {
        return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
      }
    });
  };

  const formatDate = (dateString?: string) =>
    dateString ? new Date(dateString).toLocaleDateString("fr-FR") : "—";

  const percent = (part?: number, total?: number) => {
    const p = part ?? 0;
    const t = total ?? 0;
    return t > 0 ? Math.round((p / t) * 100) : 0;
  };

  const CompanyTable: React.FC<{ companies: Company[]; title: string }> = ({
    companies,
    title,
  }) => {
    const sortedCompanies = sortCompanies(companies);

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3>
            {title} ({companies.length} entreprises)
          </h3>
          <div className="flex gap-2">
            <Select
              value={sortBy}
              onValueChange={(value) => setSortBy(value as SortBy)}
            >
              <SelectTrigger className="w-40">
                <ArrowUpDown className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name">Nom</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
            >
              {sortOrder === "asc" ? "↑" : "↓"}
            </Button>
          </div>
        </div>

        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nom</TableHead>
                <TableHead>Adresse</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Tags</TableHead>
                <TableHead>Sources</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedCompanies.map((company) => {
                const tags =
                  company.premiers_tags
                    ?.split(",")
                    .map((t) => t.trim())
                    .filter(Boolean) ?? [];
                const sources = company.sources ?? [];
                const tel = company.tel ?? company.telephone;
                const email = company.email;

                return (
                  <TableRow key={company.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{company.name}</div>
                        {company.canonical_url && (
                          <a
                            href={company.canonical_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline text-sm inline-flex items-center gap-1"
                          >
                            <Globe className="h-3 w-3" />
                            Site web
                          </a>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-start gap-1">
                        <MapPin className="h-3 w-3 mt-1 text-muted-foreground" />
                        <span className="text-sm">{company.adresse}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {tel && (
                          <div className="flex items-center gap-1 text-sm">
                            <Phone className="h-3 w-3" />
                            {tel}
                          </div>
                        )}
                        {email && (
                          <div className="flex items-center gap-1 text-sm">
                            <Mail className="h-3 w-3" />
                            {email}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {tags.slice(0, 2).map((tag, index) => (
                          <Badge
                            key={`${tag}-${index}`}
                            variant="secondary"
                            className="text-xs"
                          >
                            {tag}
                          </Badge>
                        ))}
                        {tags.length > 2 && (
                          <Badge variant="outline" className="text-xs">
                            +{tags.length - 2}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {sources.includes("maps") && (
                          <Badge variant="default">Maps</Badge>
                        )}
                        {sources.includes("google") && (
                          <Badge variant="secondary">Google</Badge>
                        )}
                        {sources
                          .filter((s) => s !== "maps" && s !== "google")
                          .map((s, i) => (
                            <Badge key={`${s}-${i}`} variant="outline">
                              {s}
                            </Badge>
                          ))}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  };

  const total = searchResult.totalCompanies ?? allCompanies.length ?? 0;
  const qualified = searchResult.qualifiedCompanies ?? 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={onBack} className="p-2">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1>Détail de la recherche : {searchResult.keyword}</h1>
          <p className="text-muted-foreground">
            {searchResult.location} • {formatDate(searchResult.date)}
          </p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{total}</div>
            <p className="text-xs text-muted-foreground">Entreprises trouvées</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Qualifiées</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{qualified}</div>
            <p className="text-xs text-muted-foreground">
              {percent(qualified, total)}% du total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Sources</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              {searchResult.useMaps && (
                <Badge variant="default">Maps ({mapCompanies.length})</Badge>
              )}
              {searchResult.useGoogle && (
                <Badge variant="secondary">
                  Google ({googleCompanies.length})
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Résultats détaillés</CardTitle>
              <CardDescription>Entreprises trouvées par source</CardDescription>
            </div>
            <Button
              onClick={() => setShowMerged(!showMerged)}
              variant={showMerged ? "default" : "outline"}
              className="flex items-center gap-2"
            >
              <Merge className="h-4 w-4" />
              {showMerged ? "Séparer" : "Fusionner"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {showMerged ? (
            <CompanyTable companies={allCompanies} title="Toutes les entreprises" />
          ) : (
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="maps" disabled={!searchResult.useMaps}>
                  Google Maps ({mapCompanies.length})
                </TabsTrigger>
                <TabsTrigger value="google" disabled={!searchResult.useGoogle}>
                  Google Search ({googleCompanies.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="maps" className="mt-6">
                <CompanyTable companies={mapCompanies} title="Google Maps" />
              </TabsContent>

              <TabsContent value="google" className="mt-6">
                <CompanyTable companies={googleCompanies} title="Google Search" />
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
