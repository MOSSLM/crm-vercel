"use client";

import React from "react";
import Link from "next/link";
import { useAppData } from "./AppDataContext";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { getCompanyDisplayName } from "../utils/displayHelpers";

interface Props {
  id: string;
}

const NetworkDetailPage: React.FC<Props> = ({ id }) => {
  const { networks, getNetworkMembers } = useAppData();
  const network = networks.find((n) => n.id === id);
  const members = getNetworkMembers(id);

  if (!network) {
    return (
      <div className="p-6">
        <h1>Réseau introuvable</h1>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <h1>{network.label}</h1>
      {network.note && <p className="text-muted-foreground">{network.note}</p>}
      <Card>
        <CardHeader>
          <CardTitle>Entreprises membres</CardTitle>
        </CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <p className="text-muted-foreground">Aucune entreprise</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {members.map((c) => (
                <Badge key={c.id} variant="secondary">
                  <Link href={`/companies/${c.id}`}>{getCompanyDisplayName(c.name, c.canonical_url)}</Link>
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default NetworkDetailPage;
