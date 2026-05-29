"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { useAuth } from "@/components/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Package } from "lucide-react";
import { SubscriptionCard, type SubscriptionRow } from "@/components/client-portal/SubscriptionCard";
import { SiteCard, type SiteRow } from "@/components/client-portal/SiteCard";

export default function ClientDashboardPage() {
  const { user } = useAuth();
  const [subscriptions, setSubscriptions] = useState<SubscriptionRow[]>([]);
  const [site, setSite] = useState<SiteRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    const load = async () => {
      const [subsRes, siteRes] = await Promise.all([
        supabase
          .from("client_subscriptions")
          .select(
            "id, status, current_period_end, cancel_at_period_end, offre:offres(nom, description, billing_period)",
          )
          .order("created_at", { ascending: false }),
        supabase
          .from("sites")
          .select("id, name, published_domain, published_subdomain, is_published")
          .limit(1)
          .maybeSingle(),
      ]);
      if (subsRes.data) {
        type RawSub = Omit<SubscriptionRow, "offre"> & { offre: SubscriptionRow["offre"] | SubscriptionRow["offre"][] };
        const normalized = (subsRes.data as RawSub[]).map((row) => ({
          ...row,
          offre: Array.isArray(row.offre) ? (row.offre[0] ?? null) : row.offre,
        }));
        setSubscriptions(normalized as SubscriptionRow[]);
      }
      if (siteRes.data) setSite(siteRes.data as SiteRow);
      setLoading(false);
    };
    load();
  }, []);

  const displayName = user?.name?.trim() || "client";
  const activeSubs = subscriptions.filter((s) => s.status === "active" || s.status === "trialing");
  const pendingSubs = subscriptions.filter((s) => s.status === "pending" || s.status === "incomplete");

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Bienvenue, {displayName}</h1>
        <p className="text-sm text-muted-foreground">
          Votre espace SAMA. Retrouvez ici votre site et vos services.
        </p>
      </div>

      <SiteCard site={site} />

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Mes abonnements</h2>
          <Button asChild variant="ghost" size="sm">
            <Link href="/espace-client/services">Découvrir nos services</Link>
          </Button>
        </div>

        {loading ? (
          <div className="text-sm text-muted-foreground">Chargement…</div>
        ) : subscriptions.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Aucun service actif</CardTitle>
              <CardDescription>
                Découvrez nos services et choisissez ceux qui correspondent à votre activité.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed py-10 text-center">
                <Package className="h-8 w-8 text-muted-foreground" />
                <Button asChild>
                  <Link href="/espace-client/services">Voir le catalogue</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            {activeSubs.length > 0 && (
              <div className="grid gap-4 sm:grid-cols-2">
                {activeSubs.map((s) => <SubscriptionCard key={s.id} sub={s} />)}
              </div>
            )}
            {pendingSubs.length > 0 && (
              <div className="space-y-2">
                <div className="text-sm font-medium text-muted-foreground">En attente</div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {pendingSubs.map((s) => <SubscriptionCard key={s.id} sub={s} />)}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
