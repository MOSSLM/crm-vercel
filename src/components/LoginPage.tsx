"use client";

import React, { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ThemeToggle } from "@/components/ThemeToggle";
import { toast } from "sonner";

export const LoginPage: React.FC = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/dashboard";

  const { login, isAuthenticated, loading } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Si déjà connecté, on redirige directement
  useEffect(() => {
    if (!loading && isAuthenticated) {
      router.replace(next);
    }
  }, [loading, isAuthenticated, router, next]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErr("");

    const success = await login(email, password);
    setSubmitting(false);

    if (!success) {
      setErr("Identifiants incorrects. Vérifiez votre email et mot de passe.");
      return;
    }

    toast.success("Connecté !");
    router.replace(next);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-slate-900/90 dark:via-slate-800/95 dark:to-blue-900/90 p-4 relative">
      {/* Theme toggle en haut à droite */}
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Sama CRM</CardTitle>
          <CardDescription>
            Connectez-vous à votre espace CRM
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="votre@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Mot de passe</Label>
              <Input
                id="password"
                type="password"
                placeholder="Votre mot de passe"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>

            {err && (
              <Alert variant="destructive">
                <AlertDescription>{err}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" className="w-full" disabled={submitting || loading}>
              {submitting ? "Connexion..." : "Se connecter"}
            </Button>
          </form>

          <div className="mt-6 p-4 bg-muted rounded-lg">
            <div className="text-center text-sm text-muted-foreground">
              <strong>Besoin d'un compte ?</strong>
            </div>
            <div className="text-center text-sm mt-1">
              Contactez votre administrateur pour obtenir vos identifiants d'accès.
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
