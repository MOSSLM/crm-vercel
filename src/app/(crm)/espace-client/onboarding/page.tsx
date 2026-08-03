"use client";

import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ProfileForm } from "@/components/client-portal/ProfileForm";
import { useAuth } from "@/components/AuthContext";

export default function OnboardingPage() {
  const router = useRouter();
  const { user, refreshProfile } = useAuth();

  return (
    <div className="min-h-screen bg-background py-12 px-4">
      <div className="mx-auto w-full max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Bienvenue sur SAMA</CardTitle>
            <CardDescription>
              Pour finaliser votre compte, parlez-nous un peu de vous et de votre entreprise.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ProfileForm
              finalizeOnboarding
              submitLabel="Continuer vers mon espace"
              onComplete={async () => {
                await refreshProfile();
                router.replace("/espace-client/dashboard");
              }}
            />
          </CardContent>
        </Card>
        {user?.email && (
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Connecté en tant que {user.email}
          </p>
        )}
      </div>
    </div>
  );
}
