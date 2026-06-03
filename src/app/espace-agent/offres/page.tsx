"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Package, Layers, Coins } from "lucide-react";
import { formatPrice } from "@/components/agent-portal/format";

type Offer = {
  id: string;
  nom: string;
  description: string | null;
  prix_ht: number | null;
  devise: string | null;
  billing_period: string | null;
  type: string | null;
  tags: string[] | null;
};

const BILLING_SUFFIX: Record<string, string> = {
  one_shot: "",
  monthly: "/ mois",
  yearly: "/ an",
  quarterly: "/ trimestre",
};

// Indicative commission paid to the agent on signature. Recurring offers earn a
// slightly higher rate on the monthly amount. The detailed Commissions module
// (with real per-contract amounts) is a follow-up screen.
function estimateCommission(o: Offer): { amount: number; recurrent: boolean } | null {
  if (o.prix_ht == null || o.prix_ht <= 0) return null;
  const recurrent =
    o.billing_period === "monthly" || o.billing_period === "yearly" || o.billing_period === "quarterly";
  const rate = recurrent ? 0.15 : 0.1;
  return { amount: Math.round(o.prix_ht * rate), recurrent };
}

function OfferCard({ offer }: { offer: Offer }) {
  const suffix = offer.billing_period ? BILLING_SUFFIX[offer.billing_period] : "";
  const commission = estimateCommission(offer);
  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">{offer.nom}</CardTitle>
          </div>
          {offer.type && (
            <Badge variant="outline" className="shrink-0 capitalize">
              {offer.type}
            </Badge>
          )}
        </div>
        {offer.description && (
          <CardDescription className="line-clamp-2">{offer.description}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="mt-auto space-y-3">
        <div className="flex items-baseline gap-1">
          <span className="text-xl font-semibold">{formatPrice(offer.prix_ht, offer.devise ?? "EUR")}</span>
          {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
        </div>
        {commission && (
          <div
            className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-[var(--ok)]"
            style={{ background: "var(--ok-tint)" }}
          >
            <Coins className="h-4 w-4" />
            Commission ~{formatPrice(commission.amount, offer.devise ?? "EUR")}
            {commission.recurrent ? " /mois" : ""}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function AgentOffresPage() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    const load = async () => {
      const { data } = await supabase
        .from("offres")
        .select("id, nom, description, prix_ht, devise, billing_period, type, tags")
        .eq("actif", true)
        .gt("prix_ht", 0)
        .order("prix_ht", { ascending: false });
      if (data) setOffers(data as Offer[]);
      setLoading(false);
    };
    void load();
  }, []);

  const { packages, services } = useMemo(() => {
    const packages: Offer[] = [];
    const services: Offer[] = [];
    for (const o of offers) {
      if (o.type === "package") packages.push(o);
      else services.push(o);
    }
    return { packages, services };
  }, [offers]);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Offres SAMA</h1>
        <p className="text-sm text-muted-foreground">
          Ce que tu vends aux entreprises CVC pour le compte de SAMA. La commission indicative
          est versée à la signature.
        </p>
      </div>

      {loading && <div className="text-sm text-muted-foreground">Chargement…</div>}

      {!loading && packages.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary" />
            <h2 className="text-lg font-semibold">Packs</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {packages.map((o) => (
              <OfferCard key={o.id} offer={o} />
            ))}
          </div>
        </section>
      )}

      {!loading && services.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Services</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {services.map((o) => (
              <OfferCard key={o.id} offer={o} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
