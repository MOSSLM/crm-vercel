"use client";

import Link from "next/link";
import { useAuth } from "@/components/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Package } from "lucide-react";

export default function ClientDashboardPage() {
  const { user } = useAuth();
  const displayName = user?.name?.trim() || "client";

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Bienvenue, {displayName}</CardTitle>
          <CardDescription>
            Votre espace client SAMA. Retrouvez ici vos services et les informations de votre compte.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Mes services</CardTitle>
          <CardDescription>Les services actuellement souscrits.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed py-12 text-center">
            <Package className="h-8 w-8 text-muted-foreground" />
            <div className="text-sm text-muted-foreground">Aucun service actif pour le moment.</div>
            <Button asChild variant="outline" size="sm">
              <Link href="/espace-client/services">Découvrir nos services</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
