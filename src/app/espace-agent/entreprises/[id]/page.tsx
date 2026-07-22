"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { authedFetch } from "@/utils/authedFetch";
import { useAuth } from "@/components/AuthContext";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  ArrowLeft,
  Building2,
  MapPin,
  Phone,
  Mail,
  Globe,
  User,
  Plus,
  Copy,
  Check,
  Monitor,
  History,
} from "lucide-react";
import { formatPrice } from "@/components/agent-portal/format";
import { AgentExchangeHistory } from "@/components/agent-portal/AgentExchangeHistory";
import { ClickToCallButton } from "@/components/telephony/ClickToCallButton";
import { CallJournal } from "@/components/telephony/CallJournal";

const SITE_DOMAIN = "samadigitalstudio.fr";

type SiteRow = {
  id: string;
  name: string | null;
  published_subdomain: string | null;
  paywall_enabled: boolean | null;
};

function demoShareUrl(site: SiteRow): string {
  return site.published_subdomain
    ? `https://${site.published_subdomain}.${SITE_DOMAIN}`
    : `https://${site.id}.${SITE_DOMAIN}`;
}

type Entreprise = {
  id: number;
  name: string | null;
  ville: string | null;
  code_postal: string | null;
  adresse: string | null;
  telephone: string | null;
  email: string | null;
  site_web_canonique: string | null;
  note_moyenne: number | null;
  nombre_avis: number | null;
  owner_id: string | null;
};
type Contact = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  tel: string | null;
  role_title: string | null;
  is_decision_maker: boolean | null;
};
type Opp = { id: string; name: string | null; montant: number | null; stage_id: number | null };

export default function AgentEntrepriseDetailPage() {
  const params = useParams();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { user } = useAuth();
  const [ent, setEnt] = useState<Entreprise | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [opps, setOpps] = useState<Opp[]>([]);
  const [site, setSite] = useState<SiteRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [copied, setCopied] = useState(false);
  const [savingPaywall, setSavingPaywall] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const supabase = createClient();
    const [entRes, contactsRes, oppsRes, siteRes] = await Promise.all([
      supabase
        .from("entreprises")
        .select(
          "id, name, ville, code_postal, adresse, telephone, email, site_web_canonique, note_moyenne, nombre_avis, owner_id",
        )
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("contacts")
        .select("id, first_name, last_name, email, tel, role_title, is_decision_maker")
        .eq("entreprise_id", id)
        .order("is_decision_maker", { ascending: false }),
      supabase
        .from("opportunites")
        .select("id, name, montant, stage_id")
        .eq("entreprise_id", id)
        .eq("owner_id", user?.id ?? ""),
      supabase
        .from("sites")
        .select("id, name, published_subdomain, paywall_enabled")
        .eq("enterprise_id", id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (entRes.data) setEnt(entRes.data as Entreprise);
    if (contactsRes.data) setContacts(contactsRes.data as Contact[]);
    if (oppsRes.data) setOpps(oppsRes.data as Opp[]);
    setSite((siteRes.data as SiteRow | null) ?? null);
    setLoading(false);
  }, [id, user?.id]);

  const copyDemoLink = async () => {
    if (!site) return;
    try {
      await navigator.clipboard.writeText(demoShareUrl(site));
      setCopied(true);
      toast.success("Lien du site démo copié.");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Copie impossible.");
    }
  };

  const togglePaywall = async (value: boolean) => {
    if (!site) return;
    setSavingPaywall(true);
    setSite({ ...site, paywall_enabled: value });
    try {
      const res = await authedFetch(`/api/site-builder/sites/${site.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paywall_enabled: value }),
      });
      if (!res.ok) throw new Error();
      toast.success(value ? "Paywall activé pour ce client." : "Paywall désactivé.");
    } catch {
      setSite({ ...site, paywall_enabled: !value });
      toast.error("Impossible de mettre à jour le paywall.");
    } finally {
      setSavingPaywall(false);
    }
  };

  useEffect(() => {
    void load();
  }, [load]);

  const claim = async () => {
    if (!ent) return;
    setClaiming(true);
    try {
      const res = await authedFetch("/api/agent/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entreprise_id: ent.id }),
      });
      if (res.status === 409) toast.error("Déjà réclamé par un autre agent.");
      else if (!res.ok) toast.error("Impossible de réclamer ce prospect.");
      else toast.success("Prospect ajouté à ton pipeline.");
    } finally {
      setClaiming(false);
      await load();
    }
  };

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Chargement…</div>;
  if (!ent)
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Entreprise introuvable ou non accessible.</p>
        <Button asChild variant="ghost" size="sm" className="mt-2">
          <Link href="/espace-agent/entreprises">
            <ArrowLeft className="mr-1 h-4 w-4" /> Retour
          </Link>
        </Button>
      </div>
    );

  const isMine = ent.owner_id === user?.id;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/espace-agent/entreprises">
          <ArrowLeft className="mr-1 h-4 w-4" /> Entreprises
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-xl">
              <Building2 className="h-5 w-5 text-muted-foreground" />
              {ent.name || "Sans nom"}
            </CardTitle>
            {isMine ? (
              <Badge>Mon prospect</Badge>
            ) : ent.owner_id == null ? (
              <Button size="sm" onClick={claim} disabled={claiming}>
                <Plus className="mr-1 h-4 w-4" /> {claiming ? "…" : "Réclamer"}
              </Button>
            ) : (
              <Badge variant="outline">Pris</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
          {(ent.adresse || ent.ville) && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="h-4 w-4" />
              {[ent.adresse, ent.code_postal, ent.ville].filter(Boolean).join(", ")}
            </div>
          )}
          {ent.telephone && (
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-muted-foreground">
                <Phone className="h-4 w-4" /> {ent.telephone}
              </span>
              <ClickToCallButton to={ent.telephone} entrepriseId={ent.id} variant="outline" />
            </div>
          )}
          {ent.email && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Mail className="h-4 w-4" /> {ent.email}
            </div>
          )}
          {ent.site_web_canonique && (
            <a
              href={ent.site_web_canonique}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 text-primary hover:underline"
            >
              <Globe className="h-4 w-4" /> Site web
            </a>
          )}
        </CardContent>
      </Card>

      {site && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Monitor className="h-4 w-4 text-muted-foreground" /> Site démo
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <a
                href={demoShareUrl(site)}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 flex-1 truncate text-sm text-primary hover:underline"
              >
                {demoShareUrl(site)}
              </a>
              <Button size="sm" variant="outline" className="gap-1" onClick={copyDemoLink}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                Copier le lien
              </Button>
            </div>
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <div>
                <div className="text-sm font-medium">Paywall d’achat</div>
                <div className="text-xs text-muted-foreground">
                  Affiche la barre « Acheter ce site » sur le site démo de ce client.
                </div>
              </div>
              <Switch
                checked={!!site.paywall_enabled}
                disabled={savingPaywall}
                onCheckedChange={togglePaywall}
              />
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Contacts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {contacts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun contact enregistré.</p>
          ) : (
            contacts.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                    {`${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "Contact"}
                    {c.is_decision_maker && (
                      <Badge variant="secondary" className="text-[10px]">
                        Décideur
                      </Badge>
                    )}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {[c.role_title, c.tel, c.email].filter(Boolean).join(" · ")}
                  </div>
                </div>
                {c.tel && (
                  <ClickToCallButton
                    to={c.tel}
                    contactId={c.id}
                    entrepriseId={ent.id}
                    size="icon"
                    variant="ghost"
                    label="Appeler"
                  />
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {opps.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Mes opportunités</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {opps.map((o) => (
              <div key={o.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                <span>{o.name || "Opportunité"}</span>
                <span className="font-semibold">{formatPrice(o.montant)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Phone className="h-4 w-4 text-muted-foreground" /> Historique d’appels
          </CardTitle>
        </CardHeader>
        <CardContent>
          <CallJournal filters={{ entreprise_id: ent.id }} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4 text-muted-foreground" /> Historique des échanges
          </CardTitle>
        </CardHeader>
        <CardContent>
          <AgentExchangeHistory entrepriseId={ent.id} />
        </CardContent>
      </Card>
    </div>
  );
}
