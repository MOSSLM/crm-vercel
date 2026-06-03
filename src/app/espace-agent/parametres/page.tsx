"use client";

import { useAuth } from "@/components/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { LogOut } from "lucide-react";

export default function AgentParametresPage() {
  const { user, logout } = useAuth();

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Paramètres</h1>
        <p className="text-sm text-muted-foreground">Ton compte agent SAMA.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Profil</CardTitle>
          <CardDescription>Informations de ton compte.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label>Nom</Label>
            <div className="text-sm">{user?.name || "—"}</div>
          </div>
          <div className="space-y-1">
            <Label>Email</Label>
            <div className="text-sm">{user?.email || "—"}</div>
          </div>
          <div className="space-y-1">
            <Label>Rôle</Label>
            <div className="text-sm capitalize">{user?.role}</div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex items-center justify-between py-4">
          <div className="text-sm text-muted-foreground">Se déconnecter de l'espace agent</div>
          <Button variant="outline" onClick={logout} className="text-destructive">
            <LogOut className="mr-2 h-4 w-4" />
            Déconnexion
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
