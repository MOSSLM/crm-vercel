"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { authedFetch } from "@/utils/authedFetch";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { User, Mail, Phone, Building2, ArrowRight } from "lucide-react";

type Contact = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  tel: string | null;
  role_title: string | null;
  is_decision_maker: boolean | null;
  entreprise_id: number | null;
  entreprise_nom: string | null;
};

export default function AgentContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await authedFetch("/api/agent/contacts");
        if (res.ok) setContacts((await res.json()) as Contact[]);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Contacts</h1>
        <p className="text-sm text-muted-foreground">
          Les interlocuteurs des entreprises que tu démarches.
        </p>
      </div>

      {loading && <div className="text-sm text-muted-foreground">Chargement…</div>}

      {!loading && contacts.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Aucun contact. Réclame des entreprises pour voir leurs interlocuteurs.
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {contacts.map((c) => (
          <div
            key={c.id}
            className="flex items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 font-medium">
                <User className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">
                  {`${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "Contact"}
                </span>
                {c.is_decision_maker && (
                  <Badge variant="secondary" className="text-[10px]">
                    Décideur
                  </Badge>
                )}
              </div>
              <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                {c.entreprise_nom && (
                  <span className="flex items-center gap-1">
                    <Building2 className="h-3 w-3" /> {c.entreprise_nom}
                  </span>
                )}
                {c.tel && (
                  <span className="flex items-center gap-1">
                    <Phone className="h-3 w-3" /> {c.tel}
                  </span>
                )}
                {c.email && (
                  <span className="flex items-center gap-1">
                    <Mail className="h-3 w-3" /> {c.email}
                  </span>
                )}
              </div>
            </div>
            <Button asChild variant="ghost" size="sm" className="shrink-0">
              <Link href={`/espace-agent/contacts/${c.id}`}>
                Ouvrir <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
