"use client";

import { useState } from "react";
import { authedFetch } from "@/utils/authedFetch";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Props = {
  label?: string;
  variant?: "default" | "outline" | "secondary";
  size?: "sm" | "default" | "lg";
};

export function ManageBillingButton({ label, variant = "outline", size = "sm" }: Props) {
  const [loading, setLoading] = useState(false);

  const onClick = async () => {
    setLoading(true);
    try {
      const res = await authedFetch("/api/stripe/portal", { method: "POST" });
      const data = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (!res.ok || !data?.url) {
        toast.error(
          data?.error === "no_stripe_customer"
            ? "Aucun moyen de paiement enregistré."
            : "Impossible d'accéder à la facturation.",
        );
        setLoading(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      toast.error("Impossible d'accéder à la facturation.");
      setLoading(false);
    }
  };

  return (
    <Button onClick={onClick} disabled={loading} variant={variant} size={size}>
      {loading ? "Redirection…" : (label ?? "Gérer mon abonnement")}
    </Button>
  );
}
