"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, User, Mail, Phone, Building2, Linkedin } from "lucide-react";
import { one } from "@/components/agent-portal/format";
import { ClickToCallButton } from "@/components/telephony/ClickToCallButton";
import { CallJournal } from "@/components/telephony/CallJournal";
import { SmsThread } from "@/components/telephony/SmsThread";
import { MessageSquare } from "lucide-react";

type Entreprise = { id: number; name: string | null; ville: string | null };
type Contact = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  tel: string | null;
  role_title: string | null;
  linkedin_url: string | null;
  is_decision_maker: boolean | null;
  preferred_channel: string | null;
  notes: string | null;
  entreprise_id: number | null;
  entreprise: Entreprise | Entreprise[] | null;
};

export default function AgentContactDetailPage() {
  const params = useParams();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const [contact, setContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const supabase = createClient();
    const load = async () => {
      const { data } = await supabase
        .from("contacts")
        .select(
          "id, first_name, last_name, email, tel, role_title, linkedin_url, is_decision_maker, preferred_channel, notes, entreprise_id, entreprise:entreprises(id, name, ville)",
        )
        .eq("id", id)
        .maybeSingle();
      if (data) setContact(data as Contact);
      setLoading(false);
    };
    void load();
  }, [id]);

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Chargement…</div>;
  if (!contact)
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Contact introuvable ou non accessible.</p>
        <Button asChild variant="ghost" size="sm" className="mt-2">
          <Link href="/espace-agent/contacts">
            <ArrowLeft className="mr-1 h-4 w-4" /> Retour
          </Link>
        </Button>
      </div>
    );

  const ent = one(contact.entreprise);
  const fullName = `${contact.first_name ?? ""} ${contact.last_name ?? ""}`.trim() || "Contact";

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 p-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/espace-agent/contacts">
          <ArrowLeft className="mr-1 h-4 w-4" /> Contacts
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <User className="h-5 w-5 text-muted-foreground" />
            {fullName}
            {contact.is_decision_maker && <Badge variant="secondary">Décideur</Badge>}
          </CardTitle>
          {contact.role_title && (
            <p className="text-sm text-muted-foreground">{contact.role_title}</p>
          )}
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
          {ent && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Building2 className="h-4 w-4" />
              {ent.id ? (
                <Link href={`/espace-agent/entreprises/${ent.id}`} className="text-primary hover:underline">
                  {ent.name || "Entreprise"}
                </Link>
              ) : (
                <span>{ent.name}</span>
              )}
            </div>
          )}
          {contact.tel && (
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-muted-foreground">
                <Phone className="h-4 w-4" /> {contact.tel}
              </span>
              <ClickToCallButton
                to={contact.tel}
                contactId={contact.id}
                entrepriseId={contact.entreprise_id}
              />
            </div>
          )}
          {contact.email && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Mail className="h-4 w-4" /> {contact.email}
            </div>
          )}
          {contact.linkedin_url && (
            <a
              href={contact.linkedin_url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 text-primary hover:underline"
            >
              <Linkedin className="h-4 w-4" /> LinkedIn
            </a>
          )}
          {contact.notes && (
            <div className="mt-2 rounded-md border bg-[var(--surface-2)] p-3 text-muted-foreground">
              {contact.notes}
            </div>
          )}
        </CardContent>
      </Card>

      {contact.tel && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquare className="h-4 w-4 text-muted-foreground" /> SMS
            </CardTitle>
          </CardHeader>
          <CardContent>
            <SmsThread to={contact.tel} contactId={contact.id} entrepriseId={contact.entreprise_id} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Phone className="h-4 w-4 text-muted-foreground" /> Historique d’appels
          </CardTitle>
        </CardHeader>
        <CardContent>
          <CallJournal filters={{ contact_id: contact.id }} />
        </CardContent>
      </Card>
    </div>
  );
}
