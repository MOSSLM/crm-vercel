"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Users } from "lucide-react";

type ClientRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  prenom: string | null;
  entreprise: string | null;
  entreprise_id: number | null;
  onboarded_at: string | null;
  created_at: string;
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("fr-FR", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "—";
  }
}

export function ClientsListPage() {
  const [rows, setRows] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("user_profiles")
      .select("id, email, full_name, prenom, entreprise, entreprise_id, onboarded_at, created_at")
      .eq("role", "client")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (data) setRows(data as ClientRow[]);
        setLoading(false);
      });
  }, []);

  const filtered = rows.filter((r) => {
    if (!q) return true;
    const t = q.toLowerCase();
    return (
      (r.email ?? "").toLowerCase().includes(t) ||
      (r.full_name ?? "").toLowerCase().includes(t) ||
      (r.entreprise ?? "").toLowerCase().includes(t)
    );
  });

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Users className="h-5 w-5 text-muted-foreground" />
            Comptes clients
          </h1>
          <p className="text-sm text-muted-foreground">Tous les comptes avec rôle « client ».</p>
        </div>
        <Input
          placeholder="Rechercher (email, nom, entreprise)…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-sm"
        />
      </div>

      {loading && <div className="text-sm text-muted-foreground">Chargement…</div>}

      {!loading && filtered.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Aucun compte client pour le moment.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3">
        {filtered.map((r) => {
          const display = r.full_name || r.prenom || r.email || "Client";
          return (
            <Link key={r.id} href={`/clients/${r.id}`} className="block">
              <Card className="transition-colors hover:bg-accent/40">
                <CardHeader className="space-y-1 pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">{display}</CardTitle>
                      <CardDescription>{r.email ?? "—"}</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      {r.entreprise && <Badge variant="outline">{r.entreprise}</Badge>}
                      {r.entreprise_id && <Badge variant="secondary">Entreprise liée</Badge>}
                      {!r.onboarded_at && <Badge variant="outline">À onboarder</Badge>}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground">
                  Créé le {fmtDate(r.created_at)}
                  {r.onboarded_at && <> · Onboardé le {fmtDate(r.onboarded_at)}</>}
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
