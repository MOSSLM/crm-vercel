"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ManageBillingButton } from "./ManageBillingButton";

export type SubscriptionRow = {
  id: string;
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  offre: {
    nom: string;
    description: string | null;
    billing_period: string | null;
  } | null;
};

const STATUS_LABEL: Record<string, { label: string; tone: "default" | "secondary" | "destructive" | "outline" }> = {
  active: { label: "Actif", tone: "default" },
  trialing: { label: "Essai", tone: "default" },
  pending: { label: "En attente de paiement", tone: "outline" },
  incomplete: { label: "Incomplet", tone: "outline" },
  past_due: { label: "Paiement en retard", tone: "destructive" },
  canceled: { label: "Annulé", tone: "secondary" },
  paused: { label: "En pause", tone: "secondary" },
};

const BILLING_LABEL: Record<string, string> = {
  one_shot: "Paiement unique",
  monthly: "Mensuel",
  yearly: "Annuel",
  quarterly: "Trimestriel",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("fr-FR", { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return "—";
  }
}

export function SubscriptionCard({ sub }: { sub: SubscriptionRow }) {
  const statusInfo = STATUS_LABEL[sub.status] ?? { label: sub.status, tone: "outline" as const };
  const billing = sub.offre?.billing_period ? BILLING_LABEL[sub.offre.billing_period] : null;
  const showBilling = sub.status === "active" || sub.status === "trialing";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">{sub.offre?.nom ?? "Service"}</CardTitle>
            {sub.offre?.description && (
              <CardDescription className="line-clamp-2 mt-1">{sub.offre.description}</CardDescription>
            )}
          </div>
          <Badge variant={statusInfo.tone}>{statusInfo.label}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {billing && <div className="text-muted-foreground">Facturation : {billing}</div>}
        {showBilling && sub.current_period_end && (
          <div className="text-muted-foreground">
            {sub.cancel_at_period_end ? "Se termine le " : "Prochain renouvellement le "}
            <span className="text-foreground">{formatDate(sub.current_period_end)}</span>
          </div>
        )}
        {(sub.status === "active" || sub.status === "past_due" || sub.status === "trialing") && (
          <div className="pt-2">
            <ManageBillingButton />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
