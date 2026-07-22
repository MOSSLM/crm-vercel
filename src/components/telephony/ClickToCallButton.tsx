"use client";

import { useState } from "react";
import { Phone, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { placeCallback } from "@/lib/telephony/client";

type ButtonVariant = "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
type ButtonSize = "default" | "sm" | "lg" | "icon";

/**
 * Click-to-call trigger for any record with a phone number. Uses the provider
 * callback (rings the agent's phone, then the customer) so it needs no WebRTC.
 * The resulting call is linked to the passed contact/company/deal.
 */
export function ClickToCallButton({
  to,
  contactId,
  entrepriseId,
  opportuniteId,
  label = "Appeler",
  size = "sm",
  variant = "default",
  className,
}: {
  to: string | null | undefined;
  contactId?: string | null;
  entrepriseId?: number | null;
  opportuniteId?: string | null;
  label?: string | null;
  size?: ButtonSize;
  variant?: ButtonVariant;
  className?: string;
}) {
  const [loading, setLoading] = useState(false);
  if (!to) return null;

  const onClick = async () => {
    setLoading(true);
    const res = await placeCallback({
      to,
      contact_id: contactId ?? null,
      entreprise_id: entrepriseId ?? null,
      opportunite_id: opportuniteId ?? null,
    });
    setLoading(false);
    if (res.ok) {
      toast.success("Appel lancé", {
        description: "Votre téléphone va sonner, puis le correspondant sera appelé.",
      });
    } else {
      toast.error("Appel impossible", { description: res.error });
    }
  };

  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      onClick={onClick}
      disabled={loading}
      className={className}
      aria-label={`Appeler ${to}`}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Phone className="h-4 w-4" />
      )}
      {label ? <span className={size === "icon" ? "sr-only" : "ml-1"}>{label}</span> : null}
    </Button>
  );
}
