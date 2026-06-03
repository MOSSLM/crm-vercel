"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/AuthContext";
import { roleHome } from "@/lib/roleHome";
import { createClient } from "@/utils/supabase/client";
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
  const nextParam = searchParams.get("next");

  const { login, isAuthenticated, loading, user, logout } = useAuth();

  // Default-deny: each role lands on its own portal (see roleHome). An admin or
  // freelance may honor a `next` param toward their own space; a client always
  // goes to the client portal. An 'unknown' role means a stale/invalid session
  // — never redirect it (that loops with the portal guard); we sign it out.
  const targetForUser = (): string => {
    const home = roleHome(user?.role);
    if (user?.role === "admin" || user?.role === "freelance") return nextParam ?? home;
    return home;
  };

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [resending, setResending] = useState(false);

  // Si déjà connecté avec un rôle résolu, on redirige directement.
  useEffect(() => {
    if (loading || !isAuthenticated) return;
    const role = user?.role;
    if (role === "admin" || role === "freelance") {
      router.replace(nextParam ?? roleHome(role));
    } else if (role === "client") {
      router.replace(roleHome(role));
    } else {
      // Unknown role on a live session → clear it so the user can log in fresh.
      void logout();
    }
  }, [loading, isAuthenticated, user?.role, nextParam, router, logout]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErr("");
    setNeedsConfirm(false);

    const result = await login(email, password);
    setSubmitting(false);

    if (!result.ok) {
      if (result.reason === "email_not_confirmed") {
        setNeedsConfirm(true);
        setErr("Votre email n'est pas encore confirmé. Vérifiez votre boîte mail.");
      } else if (result.reason === "invalid_credentials") {
        setErr("Email ou mot de passe incorrect.");
      } else {
        setErr("Connexion impossible. Réessayez dans un instant.");
      }
      return;
    }

    toast.success("Connecté !");
    router.replace(targetForUser());
  };

  const handleResendConfirmation = async () => {
    if (!email) {
      setErr("Renseignez votre email d'abord.");
      return;
    }
    setResending(true);
    const supabase = createClient();
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/espace-client/onboarding` },
    });
    setResending(false);
    if (error) {
      toast.error("Impossible de renvoyer l'email pour le moment.");
    } else {
      toast.success("Email de confirmation renvoyé !");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative">
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
                <AlertDescription>
                  {err}
                  {needsConfirm && (
                    <button
                      type="button"
                      onClick={handleResendConfirmation}
                      disabled={resending}
                      className="mt-2 block underline underline-offset-2"
                    >
                      {resending ? "Envoi…" : "Renvoyer l'email de confirmation"}
                    </button>
                  )}
                </AlertDescription>
              </Alert>
            )}

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Connexion..." : "Se connecter"}
            </Button>
          </form>

          <div className="mt-6 p-4 bg-muted rounded-lg">
            <div className="text-center text-sm text-muted-foreground">
              Pas encore de compte client ?
            </div>
            <div className="text-center text-sm mt-1">
              <Link href="/signup" className="underline text-foreground font-medium">
                Créer un compte
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
