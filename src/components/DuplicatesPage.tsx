"use client";

import React from "react";
import { useAppData } from "./AppDataContext";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "./ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "./ui/pagination";
import {
  LayoutGrid,
  List,
  Search,
  Eye,
  Share2,
  Ban,
  Link2,
} from "lucide-react";
import { toast } from "sonner";
import { ensureHttpsUrl, getCompanyDisplayName } from "../utils/displayHelpers";

const DuplicatesPage: React.FC = () => {
  const {
    duplicateGroups,
    createNetworkFromCompanies,
    blacklistDomain,
    markAsUniqueSite,
  } = useAppData();
  const [selected, setSelected] = React.useState<Record<string, string>>({});
  const [searchTerm, setSearchTerm] = React.useState("");
  const [sourceFilter, setSourceFilter] = React.useState("all");
  const [qualificationFilter, setQualificationFilter] = React.useState("all");
  const [currentPage, setCurrentPage] = React.useState(1);
  const [viewMode, setViewMode] = React.useState<"cards" | "list">("list");
  const itemsPerPage = 10;

  const totalGroups = duplicateGroups.length;
  const totalCompanies = duplicateGroups.reduce(
    (sum, g) => sum + g.companies.length,
    0
  );
  const averageGroupSize = totalGroups
    ? Math.round(totalCompanies / totalGroups)
    : 0;
  const largestGroup = duplicateGroups.reduce(
    (max, g) => Math.max(max, g.companies.length),
    0
  );

  const filteredGroups = React.useMemo(() => {
    return duplicateGroups.filter((group) => {
      const matchesSearch =
        group.domain.toLowerCase().includes(searchTerm.toLowerCase()) ||
        group.companies.some((c) =>
          getCompanyDisplayName(c.name, c.canonical_url)
            .toLowerCase()
            .includes(searchTerm.toLowerCase())
        );

      const matchesSource =
        sourceFilter === "all" ||
        group.companies.some(
          (c) =>
            (sourceFilter === "google_search" &&
              c.sources.includes("google_search")) ||
            (sourceFilter === "google_maps" &&
              c.sources.includes("google_maps"))
        );

      const matchesQualification =
        qualificationFilter === "all" ||
        group.companies.some(
          (c) =>
            (qualificationFilter === "qualified" && c.qualifie) ||
            (qualificationFilter === "not_qualified" && !c.qualifie)
        );

      return matchesSearch && matchesSource && matchesQualification;
    });
  }, [duplicateGroups, searchTerm, sourceFilter, qualificationFilter]);

  const totalPages = Math.ceil(filteredGroups.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedGroups = filteredGroups.slice(
    startIndex,
    startIndex + itemsPerPage
  );

  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, sourceFilter, qualificationFilter]);

  const handleVisit = (url?: string) => {
    if (!url) return;
    const safeUrl = ensureHttpsUrl(url);
    window.open(safeUrl, "_blank", "noopener,noreferrer");
  };

  const handleMarkNetwork = async (ids: number[]) => {
    await createNetworkFromCompanies(ids);
    toast.success("Entreprises ajoutées au réseau");
  };

  const handleBlacklist = async (groupDomain: string, fallbackUrl?: string) => {
    const url = selected[groupDomain] || fallbackUrl;
    if (!url) return;
    try {
      await blacklistDomain(url);
      toast.success("Domaine black-listé");
    } catch (error) {
      toast.error("Erreur lors du blacklist");
    }
  };

  const handleUnique = async (
    groupDomain: string,
    ids: number[],
    fallbackUrl?: string
  ) => {
    const url = selected[groupDomain] || fallbackUrl;
    if (!url) return;
    await markAsUniqueSite(ids, url);
    toast.success("URL unifiée");
  };

  const DuplicateCard: React.FC<{ group: typeof duplicateGroups[number] }> = ({
    group,
  }) => (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm break-words">{group.domain}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex flex-wrap gap-1">
          {group.companies.map((c) => (
            <Badge key={c.id} variant="secondary">
              {getCompanyDisplayName(c.name, c.canonical_url)}
            </Badge>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <Select
            value={
              selected[group.domain] || group.companies[0].canonical_url || ""
            }
            onValueChange={(val) =>
              setSelected((prev) => ({ ...prev, [group.domain]: val }))
            }
          >
            <SelectTrigger size="sm" className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {group.companies.map((c) => (
                <SelectItem key={c.id} value={c.canonical_url || ""}>
                  {c.canonical_url}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              handleVisit(
                selected[group.domain] || group.companies[0].canonical_url
              )
            }
          >
            <Eye className="h-4 w-4 mr-1" /> Visiter
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleMarkNetwork(group.companies.map((c) => c.id))}
          >
            <Share2 className="h-4 w-4 mr-1" /> Réseau
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() =>
              handleBlacklist(group.domain, group.companies[0].canonical_url)
            }
          >
            <Ban className="h-4 w-4 mr-1" /> Blacklist
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              handleUnique(
                group.domain,
                group.companies.map((c) => c.id),
                group.companies[0].canonical_url
              )
            }
          >
            <Link2 className="h-4 w-4 mr-1" /> Site unique
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6">
      <div>
        <h1>Duplicats</h1>
        <p className="text-muted-foreground">
          Gérez les groupes d'entreprises dupliquées
        </p>
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-4 md:gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Groupes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl md:text-2xl font-bold">{totalGroups}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Sociétés</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl md:text-2xl font-bold text-green-600">
              {totalCompanies}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Taille moyenne</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl md:text-2xl font-bold text-blue-600">
              {averageGroupSize}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Groupe max</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl md:text-2xl font-bold text-purple-600">
              {largestGroup}
            </div>
          </CardContent>
        </Card>
      </div>

      {duplicateGroups.length === 0 ? (
        <p className="text-muted-foreground">Aucun duplicat détecté.</p>
      ) : (
        <>
          <div className="space-y-3 md:space-y-0 md:flex md:items-center md:gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-2 items-center">
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                className="px-3 py-2 border border-border rounded-md bg-card text-card-foreground text-sm"
              >
                <option value="all">Toutes les sources</option>
                <option value="google_search">Google Search</option>
                <option value="google_maps">Google Maps</option>
              </select>
              <select
                value={qualificationFilter}
                onChange={(e) => setQualificationFilter(e.target.value)}
                className="px-3 py-2 border border-border rounded-md bg-card text-card-foreground text-sm"
              >
                <option value="all">Toutes</option>
                <option value="qualified">Qualifiées</option>
                <option value="not_qualified">Non qualifiées</option>
              </select>
              <div className="flex border rounded-lg">
                <Button
                  variant={viewMode === "cards" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("cards")}
                  className="rounded-r-none"
                >
                  <LayoutGrid className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === "list" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("list")}
                  className="rounded-l-none"
                >
                  <List className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {viewMode === "cards" ? (
            <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
              {paginatedGroups.map((group, index) => (
                <DuplicateCard key={index} group={group} />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Domaine</TableHead>
                  <TableHead>Entreprises</TableHead>
                  <TableHead className="w-1/3">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedGroups.map((group, index) => (
                  <TableRow key={index}>
                    <TableCell>{group.domain}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {group.companies.map((c) => (
                          <Badge key={c.id} variant="secondary">
                            {getCompanyDisplayName(c.name, c.canonical_url)}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="flex flex-wrap gap-2 items-center">
                      <Select
                        value={
                          selected[group.domain] ||
                          group.companies[0].canonical_url ||
                          ""
                        }
                        onValueChange={(val) =>
                          setSelected((prev) => ({
                            ...prev,
                            [group.domain]: val,
                          }))
                        }
                      >
                        <SelectTrigger size="sm" className="w-[180px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {group.companies.map((c) => (
                            <SelectItem
                              key={c.id}
                              value={c.canonical_url || ""}
                            >
                              {c.canonical_url}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          handleVisit(
                            selected[group.domain] ||
                              group.companies[0].canonical_url
                          )
                        }
                      >
                        <Eye className="h-4 w-4 mr-1" /> Visiter
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          handleMarkNetwork(group.companies.map((c) => c.id))
                        }
                      >
                        <Share2 className="h-4 w-4 mr-1" /> Réseau
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() =>
                          handleBlacklist(
                            group.domain,
                            group.companies[0].canonical_url
                          )
                        }
                      >
                        <Ban className="h-4 w-4 mr-1" /> Blacklist
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          handleUnique(
                            group.domain,
                            group.companies.map((c) => c.id),
                            group.companies[0].canonical_url
                          )
                        }
                      >
                        <Link2 className="h-4 w-4 mr-1" /> Site unique
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {totalPages > 1 && (
            <div className="flex flex-col items-center gap-4">
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={() =>
                        setCurrentPage(Math.max(1, currentPage - 1))
                      }
                      className={
                        currentPage === 1
                          ? "pointer-events-none opacity-50"
                          : "cursor-pointer"
                      }
                    />
                  </PaginationItem>

                  {currentPage > 2 && (
                    <>
                      <PaginationItem>
                        <PaginationLink
                          onClick={() => setCurrentPage(1)}
                          className="cursor-pointer"
                        >
                          1
                        </PaginationLink>
                      </PaginationItem>
                      {currentPage > 3 && (
                        <PaginationItem>
                          <PaginationEllipsis />
                        </PaginationItem>
                      )}
                    </>
                  )}

                  {Array.from({ length: Math.min(3, totalPages) }, (_, i) => {
                    let pageNum;
                    if (totalPages <= 3) pageNum = i + 1;
                    else if (currentPage <= 2) pageNum = i + 1;
                    else if (currentPage >= totalPages - 1)
                      pageNum = totalPages - 2 + i;
                    else pageNum = currentPage - 1 + i;

                    if (pageNum < 1 || pageNum > totalPages) return null;

                    return (
                      <PaginationItem key={pageNum}>
                        <PaginationLink
                          onClick={() => setCurrentPage(pageNum)}
                          isActive={currentPage === pageNum}
                          className="cursor-pointer"
                        >
                          {pageNum}
                        </PaginationLink>
                      </PaginationItem>
                    );
                  })}

                  {currentPage < totalPages - 1 && (
                    <>
                      {currentPage < totalPages - 2 && (
                        <PaginationItem>
                          <PaginationEllipsis />
                        </PaginationItem>
                      )}
                      <PaginationItem>
                        <PaginationLink
                          onClick={() => setCurrentPage(totalPages)}
                          className="cursor-pointer"
                        >
                          {totalPages}
                        </PaginationLink>
                      </PaginationItem>
                    </>
                  )}

                  <PaginationItem>
                    <PaginationNext
                      onClick={() =>
                        setCurrentPage(Math.min(totalPages, currentPage + 1))
                      }
                      className={
                        currentPage === totalPages
                          ? "pointer-events-none opacity-50"
                          : "cursor-pointer"
                      }
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>

              <div className="text-sm text-muted-foreground">
                Page {currentPage} sur {totalPages} ({filteredGroups.length}
                groupe{filteredGroups.length > 1 ? "s" : ""} au total)
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default DuplicatesPage;
