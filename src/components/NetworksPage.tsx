"use client";

import React from "react";
import Link from "next/link";
import { useAppData } from "./AppDataContext";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "./ui/pagination";
import { LayoutGrid, List, Search } from "lucide-react";

const NetworksPage: React.FC = () => {
  const { networks } = useAppData();
  const [searchTerm, setSearchTerm] = React.useState("");
  const [sizeFilter, setSizeFilter] = React.useState("all");
  const [currentPage, setCurrentPage] = React.useState(1);
  const [viewMode, setViewMode] = React.useState<'cards' | 'list'>('list');
  const itemsPerPage = 10;

  const totalNetworks = networks.length;
  const totalMembers = networks.reduce((sum, n) => sum + n.members_count, 0);
  const averageSize = totalNetworks ? Math.round(totalMembers / totalNetworks) : 0;
  const largestNetwork = networks.reduce((max, n) => (n.members_count > max ? n.members_count : max), 0);

  const filteredNetworks = React.useMemo(() => {
    return networks.filter((n) => {
      const matchesSearch = n.label
        .toLowerCase()
        .includes(searchTerm.toLowerCase());
      const matchesSize =
        sizeFilter === "all" ||
        (sizeFilter === "small" && n.members_count <= 10) ||
        (sizeFilter === "medium" && n.members_count > 10 && n.members_count <= 50) ||
        (sizeFilter === "large" && n.members_count > 50);
      return matchesSearch && matchesSize;
    });
  }, [networks, searchTerm, sizeFilter]);

  const totalPages = Math.ceil(filteredNetworks.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedNetworks = filteredNetworks.slice(
    startIndex,
    startIndex + itemsPerPage
  );

  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, sizeFilter]);

  const NetworkCard: React.FC<{ network: typeof networks[number] }> = ({ network }) => (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm truncate">{network.label}</CardTitle>
      </CardHeader>
      <CardContent className="flex items-center justify-between">
        <div className="text-xl font-bold">{network.members_count}</div>
        <Button size="sm" variant="outline" asChild>
          <Link href={`/networks/${network.id}`}>Voir</Link>
        </Button>
      </CardContent>
    </Card>
  );

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6">
      <div>
        <h1>Réseaux</h1>
        <p className="text-muted-foreground">Gérez vos réseaux de sites</p>
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-4 md:gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Total réseaux</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl md:text-2xl font-bold">{totalNetworks}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Total membres</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl md:text-2xl font-bold text-green-600">{totalMembers}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Taille moyenne</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl md:text-2xl font-bold text-blue-600">{averageSize}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Plus grand réseau</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl md:text-2xl font-bold text-purple-600">{largestNetwork}</div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3 md:space-y-0 md:flex md:items-center md:gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher un réseau..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2 items-center">
          <select
            value={sizeFilter}
            onChange={(e) => setSizeFilter(e.target.value)}
            className="px-3 py-2 border border-border rounded-md bg-card text-card-foreground text-sm"
          >
            <option value="all">Toutes tailles</option>
            <option value="small">1-10 membres</option>
            <option value="medium">11-50 membres</option>
            <option value="large">51+ membres</option>
          </select>
          <div className="flex border rounded-lg">
            <Button
              variant={viewMode === 'cards' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('cards')}
              className="rounded-r-none"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('list')}
              className="rounded-l-none"
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {viewMode === 'cards' ? (
        <div className="grid gap-3 grid-cols-2 md:gap-6 md:grid-cols-2 lg:grid-cols-3">
          {paginatedNetworks.map((network) => (
            <NetworkCard key={network.id} network={network} />
          ))}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Label</TableHead>
              <TableHead>Membres</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedNetworks.map((network) => (
              <TableRow key={network.id}>
                <TableCell>{network.label}</TableCell>
                <TableCell>{network.members_count}</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="outline" asChild>
                    <Link href={`/networks/${network.id}`}>Voir</Link>
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
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  className={
                    currentPage === 1
                      ? 'pointer-events-none opacity-50'
                      : 'cursor-pointer'
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
                else if (currentPage >= totalPages - 1) pageNum = totalPages - 2 + i;
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
                  onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                  className={
                    currentPage === totalPages
                      ? 'pointer-events-none opacity-50'
                      : 'cursor-pointer'
                  }
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>

          <div className="text-sm text-muted-foreground">
            Page {currentPage} sur {totalPages} ({filteredNetworks.length} réseau{filteredNetworks.length > 1 ? 'x' : ''} au total)
          </div>
        </div>
      )}
    </div>
  );
};

export default NetworksPage;
