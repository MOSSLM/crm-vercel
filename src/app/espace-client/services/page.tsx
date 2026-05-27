"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Package } from "lucide-react";
import { SubscribeButton } from "@/components/client-portal/SubscribeButton";

type Offer = {
  id: string;
  nom: string;
  description: string | null;
  prix_ht: number | null;
  devise: string | null;
  billing_period: string | null;
  type: string | null;
  tags: string[] | null;
  stripe_price_id: string | null;
};

const BILLING_LABEL: Record<string, string> = {
  one_shot: "Paiement unique",
  monthly: "/ mois",
  yearly: "/ an",
  quarterly: "/ trimestre",
};

function formatPrice(amount: number | null, devise: string | null): string {
  if (amount == null) return "Sur devis";
  const cur = devise || "EUR";
  try {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(
      amount,
    );
  } catch {
    return `${amount} ${cur}`;
  }
}

export default function ClientServicesPage() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [subscribedOfferIds, setSubscribedOfferIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const load = async () => {
      const [offersRes, subsRes] = await Promise.all([
        supabase
          .from("offres")
          .select("id, nom, description, prix_ht, devise, billing_period, type, tags, stripe_price_id")
          .eq("actif", true)
          .order("qualification_order", { ascending: true })
          .order("nom", { ascending: true }),
        supabase
          .from("client_subscriptions")
          .select("offre_id, status")
          .in("status", ["active", "trialing", "pending", "incomplete"]),
      ]);
      if (offersRes.error) {
        setError(offersRes.error.message);
      } else {
        setOffers((offersRes.data ?? []) as Offer[]);
      }
      if (subsRes.data) {
        setSubscribedOfferIds(new Set(subsRes.data.map((s) => s.offre_id as string)));
      }
      setLoading(false);
    };
    load();
  }, []);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Nos services</h1>
        <p className="text-sm text-muted-foreground">
          Choisissez les services qui correspondent à votre activité.
        </p>
      </div>

      {loading && <div className="text-sm text-muted-foreground">Chargement…</div>}
      {error && <div className="text-sm text-destructive">Erreur : {error}</div>}

      {!loading && offers.length === 0 && !error && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Aucun service disponible pour le moment.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {offers.map((offer) => {
          const isSubscribed = subscribedOfferIds.has(offer.id);
          const billingSuffix = offer.billing_period ? BILLING_LABEL[offer.billing_period] : null;
          const stripeMissing = !offer.stripe_price_id;

          return (
            <Card key={offer.id} className="flex flex-col">
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-muted-foreground" />
                    <CardTitle className="text-base">{offer.nom}</CardTitle>
                  </div>
                  {offer.type && (
                    <Badge variant="outline" className="capitalize">
                      {offer.type}
                    </Badge>
                  )}
                </div>
                {offer.description && (
                  <CardDescription className="line-clamp-3">{offer.description}</CardDescription>
                )}
              </CardHeader>
              <CardContent className="mt-auto space-y-3">
                <div className="flex items-baseline gap-1">
                  <span className="text-xl font-semibold">{formatPrice(offer.prix_ht, offer.devise)}</span>
                  {billingSuffix && (
                    <span className="text-xs text-muted-foreground">{billingSuffix}</span>
                  )}
                </div>
                {offer.tags && offer.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {offer.tags.slice(0, 4).map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
                <div className="pt-1">
                  {isSubscribed ? (
                    <Badge>Déjà abonné</Badge>
                  ) : stripeMissing ? (
                    <div className="text-xs text-muted-foreground">
                      Contactez-nous pour souscrire à cette offre.
                    </div>
                  ) : (
                    <SubscribeButton offreId={offer.id} />
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
