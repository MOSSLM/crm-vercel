"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { authedFetch } from "@/utils/authedFetch";
import { useAuth } from "@/components/AuthContext";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Building2, MapPin, Phone, Star, Plus, ArrowRight } from "lucide-react";

type Entreprise = {
  id: number;
  name: string | null;
  ville: string | null;
  code_postal: string | null;
  telephone: string | null;
  email: string | null;
  site_web_canonique: string | null;
  note_moyenne: number | null;
  nombre_avis: number | null;
  owner_id: string | null;
};

const SELECT =
  "id, name, ville, code_postal, telephone, email, site_web_canonique, note_moyenne, nombre_avis, owner_id";

function CompanyRow({
  e,
  action,
}: {
  e: Entreprise;
  action: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 font-medium">
          <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{e.name || "Sans nom"}</span>
          {e.note_moyenne != null && (
            <span className="ml-1 flex items-center gap-0.5 text-xs text-muted-foreground">
              <Star className="h-3 w-3 fill-current text-[var(--warn)]" />
              {e.note_moyenne}
              {e.nombre_avis ? ` (${e.nombre_avis})` : ""}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          {(e.ville || e.code_postal) && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" /> {[e.code_postal, e.ville].filter(Boolean).join(" ")}
            </span>
          )}
          {e.telephone && (
            <span className="flex items-center gap-1">
              <Phone className="h-3 w-3" /> {e.telephone}
            </span>
          )}
        </div>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}

export default function AgentEntreprisesPage() {
  const { user } = useAuth();
  const [owned, setOwned] = useState<Entreprise[]>([]);
  const [pool, setPool] = useState<Entreprise[]>([]);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const supabase = createClient();
    const [ownedRes, poolRes] = await Promise.all([
      supabase.from("entreprises").select(SELECT).eq("owner_id", user.id).order("name"),
      supabase
        .from("entreprises")
        .select(SELECT)
        .is("owner_id", null)
        .eq("qualifie", true)
        .order("note_moyenne", { ascending: false, nullsFirst: false })
        .limit(60),
    ]);
    if (ownedRes.data) setOwned(ownedRes.data as Entreprise[]);
    if (poolRes.data) setPool(poolRes.data as Entreprise[]);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const claim = async (id: number) => {
    setClaiming(id);
    try {
      const res = await authedFetch("/api/agent/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entreprise_id: id }),
      });
      if (res.status === 409) {
        toast.error("Ce prospect vient d'être réclamé par un autre agent.");
      } else if (!res.ok) {
        toast.error("Impossible de réclamer ce prospect.");
      } else {
        toast.success("Prospect ajouté à ton pipeline.");
      }
    } catch {
      toast.error("Impossible de réclamer ce prospect.");
    } finally {
      setClaiming(null);
      await load();
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Entreprises CVC</h1>
        <p className="text-sm text-muted-foreground">
          Tes prospects et le pool commun à démarcher pour SAMA.
        </p>
      </div>

      {loading && <div className="text-sm text-muted-foreground">Chargement…</div>}

      {!loading && (
        <>
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">
              Mes prospects <span className="text-muted-foreground">({owned.length})</span>
            </h2>
            {owned.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  Aucun prospect pour l&apos;instant. Réclame une entreprise du pool ci-dessous.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {owned.map((e) => (
                  <CompanyRow
                    key={e.id}
                    e={e}
                    action={
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/espace-agent/entreprises/${e.id}`}>
                          Ouvrir <ArrowRight className="ml-1 h-4 w-4" />
                        </Link>
                      </Button>
                    }
                  />
                ))}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">
              Pool à réclamer <span className="text-muted-foreground">({pool.length})</span>
            </h2>
            {pool.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  Le pool est vide pour le moment.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {pool.map((e) => (
                  <CompanyRow
                    key={e.id}
                    e={e}
                    action={
                      <Button
                        size="sm"
                        onClick={() => claim(e.id)}
                        disabled={claiming === e.id}
                      >
                        <Plus className="mr-1 h-4 w-4" />
                        {claiming === e.id ? "…" : "Réclamer"}
                      </Button>
                    }
                  />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
