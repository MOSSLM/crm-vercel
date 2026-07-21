"use client";

/**
 * Per-agent phone settings panel. Reads/writes /api/twilio/settings for the
 * current user (or, for an admin, a target user via `userId`).
 */
import { useCallback, useEffect, useState } from "react";
import { Power, PhoneForwarded, Mic, Loader2, CalendarClock } from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { authedFetch } from "@/utils/authedFetch";

interface ScheduleWindow {
  days: number[];
  start: string;
  end: string;
}
interface PhoneSchedule {
  autoMode?: boolean;
  tz?: string;
  windows?: ScheduleWindow[];
}
interface Settings {
  user_id: string;
  mode: "on" | "off";
  default_number_id: string | null;
  forward_to_e164: string | null;
  recording_enabled: boolean;
  schedule?: PhoneSchedule | null;
}

const DAYS = [
  { n: 1, label: "L" },
  { n: 2, label: "M" },
  { n: 3, label: "M" },
  { n: 4, label: "J" },
  { n: 5, label: "V" },
  { n: 6, label: "S" },
  { n: 7, label: "D" },
];

interface NumberOpt {
  id: string;
  e164: string;
  friendly_name: string | null;
}

export function PhoneSettings({ userId }: { userId?: string }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [numbers, setNumbers] = useState<NumberOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [forward, setForward] = useState("");
  const [autoMode, setAutoMode] = useState(false);
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("18:00");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = userId ? `?userId=${userId}` : "";
      const res = await authedFetch(`/api/twilio/settings${qs}`);
      if (res.ok) {
        const data = (await res.json()) as { settings: Settings; numbers: NumberOpt[] };
        setSettings(data.settings);
        setNumbers(data.numbers);
        setForward(data.settings.forward_to_e164 ?? "");
        const sched = data.settings.schedule ?? {};
        setAutoMode(!!sched.autoMode);
        const w = sched.windows?.[0];
        if (w) {
          setDays(w.days);
          setStart(w.start);
          setEnd(w.end);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (patch: Record<string, unknown>, successMsg?: string) => {
    const res = await authedFetch("/api/twilio/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...(userId ? { userId } : {}), ...patch }),
    });
    if (res.ok) {
      const data = (await res.json()) as { settings: Settings };
      setSettings(data.settings);
      if (successMsg) toast.success(successMsg);
    } else {
      toast.error("Enregistrement impossible.");
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }
  if (!settings) return null;

  const isOn = settings.mode === "on";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Réglages téléphone</CardTitle>
        <CardDescription>Disponibilité, numéro d&apos;appel et renvoi.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* On/Off mode */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Power className={`h-4 w-4 ${isOn ? "text-emerald-600" : "text-muted-foreground"}`} />
            <div>
              <div className="text-sm font-medium">Mode {isOn ? "On" : "Off"}</div>
              <div className="text-xs text-muted-foreground">
                {isOn
                  ? "Vous recevez les appels entrants."
                  : "Les appels partent en messagerie vocale."}
              </div>
            </div>
          </div>
          <Switch
            checked={isOn}
            onCheckedChange={(v) => save({ mode: v ? "on" : "off" }, `Mode ${v ? "On" : "Off"}.`)}
          />
        </div>

        {/* Default number */}
        <div>
          <label className="mb-1 block text-sm font-medium">Numéro d&apos;appel par défaut</label>
          <Select
            value={settings.default_number_id ?? "none"}
            onValueChange={(v) =>
              save({ defaultNumberId: v === "none" ? null : v }, "Numéro par défaut mis à jour.")
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Aucun numéro attribué" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Aucun</SelectItem>
              {numbers.map((n) => (
                <SelectItem key={n.id} value={n.id}>
                  {n.friendly_name ? `${n.friendly_name} — ${n.e164}` : n.e164}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {numbers.length === 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              Aucun numéro attribué. Demandez à un administrateur de vous en attribuer un.
            </p>
          )}
        </div>

        {/* Forwarding */}
        <div>
          <label className="mb-1 flex items-center gap-2 text-sm font-medium">
            <PhoneForwarded className="h-4 w-4" /> Renvoi d&apos;appel
          </label>
          <div className="flex gap-2">
            <Input
              value={forward}
              onChange={(e) => setForward(e.target.value)}
              placeholder="+33 6 12 34 56 78 (ex: votre mobile)"
            />
            <Button
              variant="outline"
              onClick={() => save({ forwardToE164: forward.trim() || null }, "Renvoi enregistré.")}
            >
              Enregistrer
            </Button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Les appels non pris peuvent être renvoyés vers ce numéro (ex. votre portable).
          </p>
        </div>

        {/* Recording */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Mic className="h-4 w-4 text-muted-foreground" />
            <div>
              <div className="text-sm font-medium">Enregistrement des appels</div>
              <div className="text-xs text-muted-foreground">
                Un message de consentement est diffusé aux correspondants.
              </div>
            </div>
          </div>
          <Switch
            checked={settings.recording_enabled}
            onCheckedChange={(v) =>
              save({ recordingEnabled: v }, v ? "Enregistrement activé." : "Enregistrement désactivé.")
            }
          />
        </div>

        {/* On/Off schedule */}
        <div className="rounded-lg border border-border p-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-muted-foreground" />
              <div>
                <div className="text-sm font-medium">Programmation On / Off</div>
                <div className="text-xs text-muted-foreground">
                  Bascule automatique selon vos horaires (fuseau Europe/Paris).
                </div>
              </div>
            </div>
            <Switch
              checked={autoMode}
              onCheckedChange={(v) => {
                setAutoMode(v);
                save(
                  {
                    schedule: {
                      autoMode: v,
                      tz: "Europe/Paris",
                      windows: [{ days, start, end }],
                    },
                  },
                  v ? "Programmation activée." : "Programmation désactivée.",
                );
              }}
            />
          </div>

          {autoMode && (
            <div className="mt-3 space-y-3">
              <div className="flex flex-wrap gap-1">
                {DAYS.map((d) => {
                  const on = days.includes(d.n);
                  return (
                    <button
                      key={d.n}
                      type="button"
                      onClick={() =>
                        setDays((prev) =>
                          prev.includes(d.n)
                            ? prev.filter((x) => x !== d.n)
                            : [...prev, d.n].sort(),
                        )
                      }
                      className={`h-8 w-8 rounded-full text-xs font-medium transition ${
                        on
                          ? "bg-primary text-primary-foreground"
                          : "border border-border text-muted-foreground"
                      }`}
                    >
                      {d.label}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="time"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  className="w-32"
                />
                <span className="text-sm text-muted-foreground">à</span>
                <Input
                  type="time"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  className="w-32"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    save(
                      {
                        schedule: {
                          autoMode: true,
                          tz: "Europe/Paris",
                          windows: [{ days, start, end }],
                        },
                      },
                      "Programmation enregistrée.",
                    )
                  }
                >
                  Enregistrer
                </Button>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default PhoneSettings;
