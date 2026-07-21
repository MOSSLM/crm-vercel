"use client";

/**
 * Admin: manage number portability requests. Surfaces the real-world constraint
 * that FR mobile port-ins are currently paused by Twilio.
 */
import { useCallback, useEffect, useState } from "react";
import { ArrowRightLeft, Plus, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { authedFetch } from "@/utils/authedFetch";

type NumberType = "local" | "mobile" | "tollfree";
type Status =
  | "draft"
  | "submitted"
  | "pending_carrier"
  | "blocked_mobile"
  | "completed"
  | "rejected";

interface PortingRequest {
  id: string;
  e164: string;
  number_type: NumberType;
  status: Status;
  current_carrier: string | null;
  account_holder: string | null;
  notes: string | null;
  created_at: string;
}

const STATUS_LABEL: Record<Status, string> = {
  draft: "Brouillon",
  submitted: "Soumise",
  pending_carrier: "Attente opérateur",
  blocked_mobile: "Mobile — en attente Twilio",
  completed: "Terminée",
  rejected: "Refusée",
};

const STATUS_VARIANT: Record<Status, "default" | "secondary" | "outline" | "destructive"> = {
  draft: "outline",
  submitted: "secondary",
  pending_carrier: "secondary",
  blocked_mobile: "destructive",
  completed: "default",
  rejected: "destructive",
};

const NEXT_STATUSES: Status[] = [
  "draft",
  "submitted",
  "pending_carrier",
  "blocked_mobile",
  "completed",
  "rejected",
];

export function PortingAdmin() {
  const [requests, setRequests] = useState<PortingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [e164, setE164] = useState("");
  const [type, setType] = useState<NumberType>("local");
  const [carrier, setCarrier] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authedFetch("/api/twilio/porting");
      if (res.ok) {
        const data = (await res.json()) as { requests: PortingRequest[] };
        setRequests(data.requests);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    if (!e164.trim()) {
      toast.error("Indiquez le numéro à porter.");
      return;
    }
    setCreating(true);
    try {
      const res = await authedFetch("/api/twilio/porting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          e164: e164.trim(),
          numberType: type,
          currentCarrier: carrier || undefined,
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { request: PortingRequest };
      if (data.request.status === "blocked_mobile") {
        toast.warning("Numéro mobile : le portage vers Twilio est actuellement suspendu.");
      } else {
        toast.success("Demande de portabilité créée.");
      }
      setE164("");
      setCarrier("");
      void load();
    } catch {
      toast.error("Création impossible.");
    } finally {
      setCreating(false);
    }
  };

  const setStatus = async (id: string, status: Status) => {
    const res = await authedFetch(`/api/twilio/porting/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      toast.success("Statut mis à jour.");
      void load();
    } else {
      toast.error("Mise à jour impossible.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Le portage des numéros <strong>mobiles français</strong> (+33 6/7) est actuellement
          suspendu par Twilio. Les numéros <strong>fixes/géographiques</strong> restent portables
          (~1 semaine avec justificatifs). En attendant, gardez votre mobile joignable via un renvoi
          d&apos;appel vers un numéro Twilio.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nouvelle demande de portabilité</CardTitle>
          <CardDescription>Portez un numéro existant vers votre centrale.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-2">
          <div className="w-44">
            <label className="mb-1 block text-xs text-muted-foreground">Numéro (E.164)</label>
            <Input value={e164} onChange={(e) => setE164(e.target.value)} placeholder="+331..." />
          </div>
          <div className="w-48">
            <label className="mb-1 block text-xs text-muted-foreground">Type</label>
            <Select value={type} onValueChange={(v) => setType(v as NumberType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="local">Fixe / géographique</SelectItem>
                <SelectItem value="mobile">Mobile</SelectItem>
                <SelectItem value="tollfree">Numéro vert</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="mb-1 block text-xs text-muted-foreground">Opérateur actuel</label>
            <Input value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="Orange, SFR…" />
          </div>
          <Button onClick={create} disabled={creating} className="gap-1">
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Créer
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Demandes</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Chargement…</p>
          ) : requests.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Aucune demande.</p>
          ) : (
            <ul className="divide-y divide-border">
              {requests.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-medium">
                      <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
                      {r.e164}
                      <Badge variant={STATUS_VARIANT[r.status]} className="text-[10px]">
                        {STATUS_LABEL[r.status]}
                      </Badge>
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {r.current_carrier ? `${r.current_carrier} · ` : ""}
                      {new Date(r.created_at).toLocaleDateString("fr-FR")}
                    </div>
                  </div>
                  <Select value={r.status} onValueChange={(v) => setStatus(r.id, v as Status)}>
                    <SelectTrigger className="w-56">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {NEXT_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {STATUS_LABEL[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default PortingAdmin;
