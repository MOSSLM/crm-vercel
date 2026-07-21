"use client";

/**
 * Admin: search & buy Twilio numbers, assign them to agents, release them.
 * Works in mock mode (search returns sample FR numbers, buy is simulated).
 */
import { useCallback, useEffect, useState } from "react";
import { Phone, Search, Trash2, Loader2, Plus } from "lucide-react";
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

interface Available {
  phoneNumber: string;
  friendlyName: string;
  locality: string | null;
  region: string | null;
  isoCountry: string;
  capabilities: { voice: boolean; sms: boolean; mms: boolean };
}

interface Owned {
  id: string;
  e164: string;
  friendly_name: string | null;
  number_type: NumberType;
  capabilities: { voice: boolean; sms: boolean; mms: boolean };
  assigned_agent_id: string | null;
  assigned_agent_name: string | null;
  status: string;
}

interface Agent {
  id: string;
  full_name: string | null;
  email: string | null;
}

const TYPE_LABEL: Record<NumberType, string> = {
  local: "Fixe / géographique",
  mobile: "Mobile",
  tollfree: "Numéro vert",
};

const Caps = ({ c }: { c: Available["capabilities"] }) => (
  <span className="flex gap-1">
    {c.voice && <Badge variant="secondary" className="text-[10px]">Voix</Badge>}
    {c.sms && <Badge variant="secondary" className="text-[10px]">SMS</Badge>}
    {c.mms && <Badge variant="secondary" className="text-[10px]">MMS</Badge>}
  </span>
);

export function NumbersAdmin() {
  const [type, setType] = useState<NumberType>("local");
  const [contains, setContains] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<Available[]>([]);
  const [buying, setBuying] = useState<string | null>(null);

  const [owned, setOwned] = useState<Owned[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  const loadOwned = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authedFetch("/api/twilio/numbers");
      if (res.ok) {
        const data = (await res.json()) as { numbers: Owned[]; agents: Agent[] };
        setOwned(data.numbers);
        setAgents(data.agents);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOwned();
  }, [loadOwned]);

  const search = async () => {
    setSearching(true);
    try {
      const res = await authedFetch("/api/twilio/numbers/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, contains: contains || undefined, country: "FR" }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { numbers: Available[] };
      setResults(data.numbers);
      if (data.numbers.length === 0) toast.info("Aucun numéro trouvé pour ces critères.");
    } catch {
      toast.error("Recherche impossible.");
    } finally {
      setSearching(false);
    }
  };

  const buy = async (n: Available) => {
    setBuying(n.phoneNumber);
    try {
      const res = await authedFetch("/api/twilio/numbers/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumber: n.phoneNumber,
          friendlyName: n.friendlyName,
          country: n.isoCountry,
          type,
        }),
      });
      if (res.status === 409) {
        toast.error("Ce numéro est déjà provisionné.");
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      toast.success(`Numéro ${n.phoneNumber} acquis.`);
      setResults((r) => r.filter((x) => x.phoneNumber !== n.phoneNumber));
      void loadOwned();
    } catch {
      toast.error("Achat impossible.");
    } finally {
      setBuying(null);
    }
  };

  const assign = async (id: string, agentId: string | null) => {
    const res = await authedFetch(`/api/twilio/numbers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignedAgentId: agentId }),
    });
    if (res.ok) {
      toast.success("Attribution mise à jour.");
      void loadOwned();
    } else {
      toast.error("Attribution impossible.");
    }
  };

  const release = async (id: string, e164: string) => {
    if (!confirm(`Libérer le numéro ${e164} ? Cette action le retire de votre compte.`)) return;
    const res = await authedFetch(`/api/twilio/numbers/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Numéro libéré.");
      void loadOwned();
    } else {
      toast.error("Libération impossible.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Search & buy */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Acquérir un numéro</CardTitle>
          <CardDescription>Recherchez un numéro français disponible et achetez-le.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-48">
              <label className="mb-1 block text-xs text-muted-foreground">Type</label>
              <Select value={type} onValueChange={(v) => setType(v as NumberType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="local">{TYPE_LABEL.local}</SelectItem>
                  <SelectItem value="mobile">{TYPE_LABEL.mobile}</SelectItem>
                  <SelectItem value="tollfree">{TYPE_LABEL.tollfree}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[160px]">
              <label className="mb-1 block text-xs text-muted-foreground">Contient (optionnel)</label>
              <Input
                value={contains}
                onChange={(e) => setContains(e.target.value)}
                placeholder="ex: 75, 06…"
                onKeyDown={(e) => e.key === "Enter" && search()}
              />
            </div>
            <Button onClick={search} disabled={searching} className="gap-2">
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Rechercher
            </Button>
          </div>

          {results.length > 0 && (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {results.map((n) => (
                <li key={n.phoneNumber} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-medium">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      {n.phoneNumber}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                      {[n.locality, n.region].filter(Boolean).join(", ") || n.isoCountry}
                      <Caps c={n.capabilities} />
                    </div>
                  </div>
                  <Button size="sm" onClick={() => buy(n)} disabled={buying === n.phoneNumber} className="gap-1">
                    {buying === n.phoneNumber ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    Acheter
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Owned numbers */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mes numéros</CardTitle>
          <CardDescription>Attribuez chaque numéro à un agent ou libérez-le.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Chargement…</p>
          ) : owned.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Aucun numéro. Recherchez-en un ci-dessus.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {owned.map((n) => (
                <li key={n.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-medium">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      {n.e164}
                      {n.status !== "active" && (
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {n.status}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                      {TYPE_LABEL[n.number_type]}
                      <Caps c={n.capabilities} />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select
                      value={n.assigned_agent_id ?? "none"}
                      onValueChange={(v) => assign(n.id, v === "none" ? null : v)}
                      disabled={n.status !== "active"}
                    >
                      <SelectTrigger className="w-52">
                        <SelectValue placeholder="Non attribué" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Non attribué</SelectItem>
                        {agents.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.full_name || a.email || a.id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive"
                      onClick={() => release(n.id, n.e164)}
                      disabled={n.status !== "active"}
                      aria-label="Libérer"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default NumbersAdmin;
