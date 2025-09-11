"use client";

import React from "react";
import Link from "next/link";
import { useAppData } from "./AppDataContext";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";

const NetworksPage: React.FC = () => {
  const { networks } = useAppData();

  return (
    <div className="p-6 space-y-6">
      <h1>Réseaux</h1>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Label</TableHead>
            <TableHead>Membres</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {networks.map((network) => (
            <TableRow key={network.id}>
              <TableCell>
                <Link href={`/networks/${network.id}`} className="hover:underline">
                  {network.label}
                </Link>
              </TableCell>
              <TableCell>{network.members_count}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default NetworksPage;
