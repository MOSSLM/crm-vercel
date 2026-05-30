"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { ArrowLeft, Building2, ExternalLink } from "lucide-react";

type ClientRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  prenom: string | null;
  nom: string | null;
  entreprise: string | null;
  role_in_company: string | null;
  team_size: string | null;
  website: string | null;
  entreprise_id: number | null;
  stripe_customer_id: string | null;
  onboarded_at: string | null;
  created_at: string;
};

type EntrepriseLite = { id: number; name: string | null; ville: string | null };
type Offer = { id: string; nom: string; billing_period: string | null; prix_ht: number | null; devise: string | null; actif: boolean; visible_in_qualification: boolean };
type Subscription = { id: string; status: string; current_period_end: string | null; created_at: string; offre: { nom: string | null } | null };
type Recommendation = { id: string; offre_id: string; note: string | null; created_at: string };

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("fr-FR", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "—";
  }
}

function formatPrice(amount: number | null, devise: string | null): string {
  if (amount == null) return "Sur devis";
  const cur = devise || "EUR";
  try {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${amount} ${cur}`;
  }
}

export function ClientDetailPage({ clientId }: { clientId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [client, setClient] = useState<ClientRow | null>(null);
  const [linkedEntreprise, setLinkedEntreprise] = useState<EntrepriseLite | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [entSearch, setEntSearch] = useState("");
  const [entResults, setEntResults] = useState<EntrepriseLite[]>([]);

  const reload = useCallback(async () => {
    setLoading(true);
    const [clientRes, offersRes, subsRes, recsRes] = await Promise.all([
      supabase
        .from("user_profiles")
        .select(
          "id, email, full_name, prenom, nom, entreprise, role_in_company, team_size, website, entreprise_id, stripe_customer_id, onboarded_at, created_at",
        )
        .eq("id", clientId)
        .maybeSingle(),
      supabase
        .from("offres")
        .select("id, nom, billing_period, prix_ht, devise, actif, visible_in_qualification")
        .order("qualification_order", { ascending: true })
        .order("nom", { ascending: true }),
      supabase
        .from("client_subscriptions")
        .select("id, status, current_period_end, created_at, offre:offres(nom)")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false }),
      supabase
        .from("client_recommendations")
        .select("id, offre_id, note, created_at")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false }),
    ]);
    if (clientRes.data) {
      setClient(clientRes.data as ClientRow);
      if (clientRes.data.entreprise_id) {
        const { data: ent } = await supabase
          .from("entreprises")
          .select("id, name, ville")
          .eq("id", clientRes.data.entreprise_id)
          .maybeSingle();
        setLinkedEntreprise(ent as EntrepriseLite | null);
      } else {
        setLinkedEntreprise(null);
      }
    }
    if (offersRes.data) setOffers(offersRes.data as Offer[]);
    if (subsRes.data) {
      type RawSub = Omit<Subscription, "offre"> & { offre: Subscription["offre"] | Subscription["offre"][] };
      const normalized = (subsRes.data as RawSub[]).map((row) => ({
        ...row,
        offre: Array.isArray(row.offre) ? (row.offre[0] ?? null) : row.offre,
      }));
      setSubs(normalized as Subscription[]);
    }
    if (recsRes.data) setRecs(recsRes.data as Recommendation[]);
    setLoading(false);
  }, [supabase, clientId]);

  useEffect(() => { void reload(); }, [reload]);

  // Entreprise search
  useEffect(() => {
    if (!entSearch.trim()) { setEntResults([]); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("entreprises")
        .select("id, name, ville")
        .ilike("name", `%${entSearch}%`)
        .limit(8);
      setEntResults((data ?? []) as EntrepriseLite[]);
    }, 250);
    return () => clearTimeout(t);
  }, [entSearch, supabase]);

  const linkEntreprise = async (id: number | null) => {
    const { error } = await supabase.from("user_profiles").update({ entreprise_id: id }).eq("id", clientId);
    if (error) {
      toast.error("Impossible de mettre à jour l'entreprise.");
      return;
    }
    toast.success(id ? "Entreprise liée" : "Entreprise dissociée");
    setEntSearch("");
    setEntResults([]);
    await reload();
  };

  const toggleRecommendation = async (offreId: string, checked: boolean) => {
    if (checked) {
      const { error } = await supabase.from("client_recommendations").insert({ client_id: clientId, offre_id: offreId });
      if (error) {
        toast.error("Impossible d'ajouter la recommandation.");
        return;
      }
    } else {
      const rec = recs.find((r) => r.offre_id === offreId);
      if (!rec) return;
      const { error } = await supabase.from("client_recommendations").delete().eq("id", rec.id);
      if (error) {
        toast.error("Impossible de retirer la recommandation.");
        return;
      }
    }
    await reload();
  };

  if (loading && !client) return <div className="p-6 text-sm text-muted-foreground">Chargement…</div>;
  if (!client) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertDescription>Client introuvable.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const recommendedIds = new Set(recs.map((r) => r.offre_id));
  const subscribedIds = new Set(subs.filter((s) => s.status === "active" || s.status === "trialing").map((s) => s.id));
  const displayName = client.full_name || `${client.prenom ?? ""} ${client.nom ?? ""}`.trim() || client.email || "Client";

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-6">
      <div>
        <Link href="/clients" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          Tous les clients
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{displayName}</h1>
        <p className="text-sm text-muted-foreground">{client.email}</p>
      </div>

      {/* Profil */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Profil</CardTitle>
          <CardDescription>Informations saisies pendant l'onboarding.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-muted-foreground">Prénom</dt><dd>{client.prenom ?? "—"}</dd></div>
            <div><dt className="text-muted-foreground">Nom</dt><dd>{client.nom ?? "—"}</dd></div>
            <div><dt className="text-muted-foreground">Entreprise (déclarée)</dt><dd>{client.entreprise ?? "—"}</dd></div>
            <div><dt className="text-muted-foreground">Rôle</dt><dd>{client.role_in_company ?? "—"}</dd></div>
            <div><dt className="text-muted-foreground">Taille équipe</dt><dd>{client.team_size ?? "—"}</dd></div>
            <div>
              <dt className="text-muted-foreground">Site web</dt>
              <dd>
                {client.website ? (
                  <a href={client.website} target="_blank" rel="noopener noreferrer" className="underline">
                    {client.website}
                  </a>
                ) : "—"}
              </dd>
            </div>
            <div><dt className="text-muted-foreground">Onboardé le</dt><dd>{fmtDate(client.onboarded_at)}</dd></div>
            <div><dt className="text-muted-foreground">Compte créé</dt><dd>{fmtDate(client.created_at)}</dd></div>
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">Stripe Customer</dt>
              <dd className="font-mono text-xs">{client.stripe_customer_id ?? "—"}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Entreprise liée */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                Entreprise liée (CRM)
              </CardTitle>
              <CardDescription>Lien vers la fiche entreprise du CRM (pour afficher le site, etc.).</CardDescription>
            </div>
            {linkedEntreprise && (
              <Button variant="outline" size="sm" onClick={() => linkEntreprise(null)}>
                Dissocier
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {linkedEntreprise ? (
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <div className="font-medium">{linkedEntreprise.name ?? "Sans nom"}</div>
                <div className="text-xs text-muted-foreground">{linkedEntreprise.ville ?? "—"}</div>
              </div>
              <Button asChild variant="ghost" size="sm">
                <Link href={`/companies?id=${linkedEntreprise.id}`}>
                  Voir fiche <ExternalLink className="ml-1 h-3 w-3" />
                </Link>
              </Button>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">Aucune entreprise liée.</div>
          )}

          <div className="space-y-2">
            <Label htmlFor="ent-search">Lier à une entreprise du CRM</Label>
            <Input
              id="ent-search"
              placeholder="Rechercher par nom…"
              value={entSearch}
              onChange={(e) => setEntSearch(e.target.value)}
            />
            {entResults.length > 0 && (
              <div className="overflow-hidden rounded-md border">
                {entResults.map((e) => (
                  <button
                    type="button"
                    key={e.id}
                    onClick={() => linkEntreprise(e.id)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent/50"
                  >
                    <span>{e.name ?? "Sans nom"}</span>
                    <span className="text-xs text-muted-foreground">{e.ville ?? ""}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Abonnements */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Abonnements</CardTitle>
          <CardDescription>Souscriptions Stripe enregistrées pour ce compte.</CardDescription>
        </CardHeader>
        <CardContent>
          {subs.length === 0 ? (
            <div className="text-sm text-muted-foreground">Aucun abonnement.</div>
          ) : (
            <ul className="divide-y">
              {subs.map((s) => (
                <li key={s.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <div className="font-medium">{s.offre?.nom ?? "Service"}</div>
                    <div className="text-xs text-muted-foreground">
                      Créé le {fmtDate(s.created_at)}
                      {s.current_period_end && <> · Échéance {fmtDate(s.current_period_end)}</>}
                    </div>
                  </div>
                  <Badge variant={s.status === "active" || s.status === "trialing" ? "default" : "secondary"}>
                    {s.status}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Services conseillés */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Services conseillés</CardTitle>
          <CardDescription>
            Coche les services à mettre en avant pour ce client. Il les verra en haut de son catalogue.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {offers.map((o) => {
              const isRec = recommendedIds.has(o.id);
              const isSub = subscribedIds.has(o.id);
              const visible = o.actif && o.visible_in_qualification;
              return (
                <li key={o.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <Checkbox
                    id={`rec-${o.id}`}
                    checked={isRec}
                    onCheckedChange={(c) => toggleRecommendation(o.id, !!c)}
                    disabled={!visible}
                  />
                  <Label htmlFor={`rec-${o.id}`} className="flex-1 cursor-pointer font-normal">
                    <span className="font-medium">{o.nom}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {formatPrice(o.prix_ht, o.devise)}
                      {o.billing_period && o.billing_period !== "one_shot" ? ` / ${o.billing_period}` : ""}
                    </span>
                  </Label>
                  {!visible && <Badge variant="outline" className="text-xs">Masqué</Badge>}
                  {isSub && <Badge variant="secondary" className="text-xs">Abonné</Badge>}
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
