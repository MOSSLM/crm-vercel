"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Phone, History } from "lucide-react";
import { CallJournal } from "@/components/telephony/CallJournal";
import { AgentExchangeHistory } from "@/components/agent-portal/AgentExchangeHistory";

/** Tout l'historique de l'entreprise — pas seulement aujourd'hui. */
export function HistoryFeed({ entrepriseId }: { entrepriseId: number }) {
  return (
    <div id="messages-history" className="space-y-3 scroll-mt-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4 text-muted-foreground" /> Messages &amp; échanges
          </CardTitle>
        </CardHeader>
        <CardContent>
          <AgentExchangeHistory entrepriseId={entrepriseId} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Phone className="h-4 w-4 text-muted-foreground" /> Historique d&apos;appels
          </CardTitle>
        </CardHeader>
        <CardContent>
          <CallJournal filters={{ entreprise_id: entrepriseId }} />
        </CardContent>
      </Card>
    </div>
  );
}
