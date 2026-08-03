"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ProfileForm } from "@/components/client-portal/ProfileForm";
import { useAuth } from "@/components/AuthContext";

export default function ClientSettingsPage() {
  const { user, refreshProfile } = useAuth();

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Paramètres</h1>
        <p className="text-sm text-muted-foreground">Gérez les informations de votre compte.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Mes informations</CardTitle>
          <CardDescription>Email : {user?.email}</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm
            submitLabel="Enregistrer les modifications"
            onComplete={async () => {
              await refreshProfile();
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
