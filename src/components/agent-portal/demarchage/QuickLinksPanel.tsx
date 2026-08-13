"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Monitor, Copy, Check, Share2, CalendarClock } from "lucide-react";
import { demoShareUrl } from "@/lib/site-builder/demo-share-url";
import { PartagerDemoDialog } from "@/components/site-builder/PartagerDemoDialog";
import { CarteAnalyseSite } from "@/components/audit-site/CarteAnalyseSite";
import BookingLinkPanel from "@/components/scheduling/BookingLinkPanel";
import type { CompanyBundle } from "./types";

function formatBookingDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(
      new Date(iso),
    );
  } catch {
    return iso;
  }
}

/**
 * Colonne de droite — "ce qu'on a à disposition pour cette entreprise" :
 * site démo, rapport d'audit, RDV. Blocs empilés séparés par un simple filet
 * (façon cockpit d'appel), pas de carte encadrée par section — sauf
 * `CarteAnalyseSite`, déjà auto-contenue, réutilisée telle quelle.
 */
export function QuickLinksPanel({
  company,
  opportuniteId,
}: {
  company: CompanyBundle;
  opportuniteId: string | null;
}) {
  const { entreprise, site, contacts, upcomingBooking } = company;
  const [copied, setCopied] = useState(false);
  const [sharing, setSharing] = useState(false);

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

  const primaryContact = contacts[0] ?? null;

  return (
    <div className="space-y-4">
      <div className="space-y-2 border-b pb-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Monitor className="h-4 w-4 text-muted-foreground" /> Site démo
        </div>
        {site ? (
          <div className="flex flex-wrap items-center gap-2">
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
              Copier
            </Button>
            <Button size="sm" className="gap-1" onClick={() => setSharing(true)}>
              <Share2 className="h-4 w-4" />
              Partager
            </Button>
            <PartagerDemoDialog
              open={sharing}
              onOpenChange={setSharing}
              demo={site}
              companyName={entreprise.name}
              phone={primaryContact?.tel ?? entreprise.telephone}
              entrepriseId={entreprise.id}
              opportuniteId={opportuniteId}
            />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Aucun site démo publié pour le moment.</p>
        )}
      </div>

      <CarteAnalyseSite entrepriseId={entreprise.id} />

      {upcomingBooking && (
        <div className="flex items-center gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
          <CalendarClock className="h-4 w-4 shrink-0" />
          <span>
            Prochain RDV : {formatBookingDate(upcomingBooking.start_at)}
            {upcomingBooking.invitee_name ? ` · ${upcomingBooking.invitee_name}` : ""}
          </span>
        </div>
      )}

      <BookingLinkPanel
        prospectName={primaryContact ? `${primaryContact.first_name ?? ""} ${primaryContact.last_name ?? ""}`.trim() : entreprise.name}
        prospectEmail={primaryContact?.email ?? entreprise.email}
        prospectPhone={primaryContact?.tel ?? entreprise.telephone}
        entrepriseId={entreprise.id}
        opportuniteId={opportuniteId}
        contactId={primaryContact?.id ?? null}
        contextLabel={entreprise.name}
      />
    </div>
  );
}
