"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

export const AuthCallback: React.FC = () => {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const next = params.get("next") || "/espace-client/dashboard";
    const code = params.get("code");
    const errParam = params.get("error_description") || params.get("error");

    if (errParam) {
      setError(errParam);
      return;
    }

    const supabase = createClient();

    const finish = (target: string) => {
      router.replace(target);
    };

    if (code) {
      supabase.auth
        .exchangeCodeForSession(code)
        .then(({ error: exErr }) => {
          if (exErr) {
            setError(exErr.message ?? "Impossible de confirmer la session.");
            return;
          }
          finish(next);
        })
        .catch((e: unknown) => {
          setError(e instanceof Error ? e.message : "Erreur inattendue.");
        });
      return;
    }

    // No code: maybe a token_hash flow or already-confirmed link — try reading the session.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        finish(next);
      } else {
        finish("/login");
      }
    });
  }, [params, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="text-center space-y-3">
        {error ? (
          <>
            <h1 className="text-xl font-semibold text-destructive">Erreur de confirmation</h1>
            <p className="text-sm text-muted-foreground max-w-sm">{error}</p>
            <a href="/login" className="underline text-sm">
              Retour à la connexion
            </a>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold">Confirmation en cours…</h1>
            <p className="text-sm text-muted-foreground">Vous allez être redirigé.</p>
          </>
        )}
      </div>
    </div>
  );
};
