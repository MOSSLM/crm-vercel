"use client";

import { useState } from "react";
import { authedFetch } from "@/utils/authedFetch";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Props = {
  offreId: string;
  disabled?: boolean;
  label?: string;
  size?: "sm" | "default" | "lg";
};

export function SubscribeButton({ offreId, disabled, label, size = "default" }: Props) {
  const [loading, setLoading] = useState(false);

  const onClick = async () => {
    setLoading(true);
    try {
      const res = await authedFetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offre_id: offreId }),
      });
      const data = (await res.json().catch(() => null)) as
        | { url?: string; error?: string; message?: string; code?: string }
        | null;
      if (!res.ok || !data?.url) {
        const friendly =
          data?.error === "offer_missing_stripe_price"
            ? "Cette offre n'est pas encore configurée pour le paiement."
            : data?.error === "STRIPE_SECRET_KEY non configuré"
              ? "Paiements indisponibles pour le moment."
              : data?.error === "stripe_error" && data.message
                ? `Paiement refusé : ${data.message}`
                : "Impossible de démarrer le paiement.";
        toast.error(friendly);
        setLoading(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      toast.error("Impossible de démarrer le paiement.");
      setLoading(false);
    }
  };

  return (
    <Button onClick={onClick} disabled={disabled || loading} size={size} className="w-full">
      {loading ? "Redirection…" : (label ?? "S'abonner")}
    </Button>
  );
}
