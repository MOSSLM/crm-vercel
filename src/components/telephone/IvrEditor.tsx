"use client";

/**
 * SVI / IVR editor (admin). Per number: a greeting + a keypad menu mapping each
 * digit to an action (ring an agent, forward to a number, or voicemail).
 */
import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Save, Loader2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { authedFetch } from "@/utils/authedFetch";

type MenuAction = "agent" | "voicemail" | "forward";
interface MenuItem {
  digit: string;
  action: MenuAction;
  target?: string;
}
interface NumberOpt {
  id: string;
  e164: string;
  friendly_name: string | null;
  status: string;
}
interface Agent {
  id: string;
  full_name: string | null;
  email: string | null;
}

export function IvrEditor() {
  const [numbers, setNumbers] = useState<NumberOpt[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [enabled, setEnabled] = useState(false);
  const [greeting, setGreeting] = useState("");
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await authedFetch("/api/twilio/numbers");
      if (res.ok) {
        const data = (await res.json()) as { numbers: NumberOpt[]; agents: Agent[] };
        const active = data.numbers.filter((n) => n.status === "active");
        setNumbers(active);
        setAgents(data.agents);
        if (active[0]) setSelected(active[0].id);
      }
      setLoading(false);
    })();
  }, []);

  const loadFlow = useCallback(async (numberId: string) => {
    const res = await authedFetch(`/api/twilio/ivr?numberId=${numberId}`);
    if (res.ok) {
      const { flow } = (await res.json()) as {
        flow: { enabled: boolean; config: { greeting?: string; menu?: MenuItem[] } };
      };
      setEnabled(flow.enabled);
      setGreeting(flow.config.greeting ?? "");
      setMenu(flow.config.menu ?? []);
    }
  }, []);

  useEffect(() => {
    if (selected) void loadFlow(selected);
  }, [selected, loadFlow]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await authedFetch("/api/twilio/ivr", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          numberId: selected,
          enabled,
          config: { greeting: greeting || undefined, menu },
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      toast.success("SVI enregistré.");
    } catch {
      toast.error("Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  };

  const updateItem = (i: number, patch: Partial<MenuItem>) =>
    setMenu((m) => m.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));

  if (loading) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Chargement…</p>;
  }
  if (numbers.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Aucun numéro actif. Achetez un numéro pour configurer un standard.
      </p>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Standard téléphonique (SVI)</CardTitle>
        <CardDescription>
          Message d&apos;accueil et menu à touches diffusés aux appels entrants.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="w-64">
            <label className="mb-1 block text-xs text-muted-foreground">Numéro</label>
            <Select value={selected} onValueChange={setSelected}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {numbers.map((n) => (
                  <SelectItem key={n.id} value={n.id}>
                    {n.friendly_name ? `${n.friendly_name} — ${n.e164}` : n.e164}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">SVI actif</span>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Message d&apos;accueil</label>
          <Textarea
            value={greeting}
            onChange={(e) => setGreeting(e.target.value)}
            placeholder="Bonjour, bienvenue chez… Tapez 1 pour les ventes, 2 pour le support."
            rows={2}
          />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-medium">Menu à touches</label>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMenu((m) => [...m, { digit: String(m.length + 1), action: "voicemail" }])}
              className="gap-1"
            >
              <Plus className="h-4 w-4" /> Ajouter
            </Button>
          </div>
          {menu.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Aucune entrée. Sans menu, l&apos;appel suit le routage On/Off standard.
            </p>
          ) : (
            <ul className="space-y-2">
              {menu.map((item, i) => (
                <li key={i} className="flex flex-wrap items-center gap-2">
                  <Input
                    value={item.digit}
                    onChange={(e) => updateItem(i, { digit: e.target.value.slice(0, 1) })}
                    className="w-14 text-center"
                    aria-label="Touche"
                  />
                  <Select
                    value={item.action}
                    onValueChange={(v) => updateItem(i, { action: v as MenuAction })}
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="agent">Agent</SelectItem>
                      <SelectItem value="forward">Renvoi (numéro)</SelectItem>
                      <SelectItem value="voicemail">Messagerie</SelectItem>
                    </SelectContent>
                  </Select>
                  {item.action === "agent" && (
                    <Select
                      value={item.target ?? ""}
                      onValueChange={(v) => updateItem(i, { target: v })}
                    >
                      <SelectTrigger className="w-52">
                        <SelectValue placeholder="Choisir un agent" />
                      </SelectTrigger>
                      <SelectContent>
                        {agents.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.full_name || a.email || a.id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {item.action === "forward" && (
                    <Input
                      value={item.target ?? ""}
                      onChange={(e) => updateItem(i, { target: e.target.value })}
                      placeholder="+33…"
                      className="w-44"
                    />
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive"
                    onClick={() => setMenu((m) => m.filter((_, idx) => idx !== i))}
                    aria-label="Supprimer"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex justify-end">
          <Button onClick={save} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Enregistrer
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default IvrEditor;
