"use client";

import { useEffect, useState, useCallback } from "react";
import { CheckCircle2, XCircle, Loader2, Save, Globe } from "lucide-react";
import { toast } from "sonner";
import {
  fetchTelephonyProfile,
  saveMyExtension,
  fetchWebrtcDomains,
  registerWebrtcDomain,
  testWebrtcKey,
  type TelephonyProfile,
} from "@/lib/telephony/client";

function Check({ ok, label, hint }: { ok: boolean | null; label: string; hint?: string }) {
  return (
    <div className="flex items-start gap-2 py-1.5">
      {ok === null ? (
        <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full border" />
      ) : ok ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
      ) : (
        <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
      )}
      <div className="min-w-0">
        <div className="text-sm">{label}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </div>
    </div>
  );
}

/**
 * Self-service softphone setup + live diagnostic. The signed-in user sets their
 * own SIP login (so the widget mounts for them), registers the CRM domain for
 * the WebRTC widget, and sees exactly what still blocks calls.
 */
export function SoftphoneSettings({ isAdmin = false }: { isAdmin?: boolean }) {
  const [profile, setProfile] = useState<TelephonyProfile | null>(null);
  const [domains, setDomains] = useState<string[]>([]);
  const [host, setHost] = useState("");
  const [sip, setSip] = useState("");
  const [callMode, setCallMode] = useState<"browser" | "callback">("browser");
  const [saving, setSaving] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [keyState, setKeyState] = useState<boolean | null>(null);
  const [scriptsLoaded, setScriptsLoaded] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    const [p, d] = await Promise.all([fetchTelephonyProfile(), fetchWebrtcDomains()]);
    setProfile(p);
    setDomains(d);
    if (p?.sip) setSip(p.sip);
    if (p?.call_mode) setCallMode(p.call_mode);
  }, []);

  useEffect(() => {
    setHost(window.location.hostname);
    void load();
    // detect widget scripts already present
    const w = window as unknown as { zadarmaWidgetFn?: unknown; __zadarmaWidgetInited?: boolean };
    setScriptsLoaded(typeof w.zadarmaWidgetFn === "function" || Boolean(w.__zadarmaWidgetInited));
  }, [load]);

  const save = async () => {
    if (!sip.trim()) return;
    setSaving(true);
    const res = await saveMyExtension({ sip: sip.trim(), call_mode: callMode });
    setSaving(false);
    if (res.ok) {
      toast.success("Softphone enregistré — recharge la page pour charger le widget.");
      await load();
    } else {
      toast.error("Enregistrement impossible", { description: res.error });
    }
  };

  const register = async () => {
    if (!host) return;
    setRegistering(true);
    // Register both the exact host and its www/apex variant to avoid the
    // www-vs-apex mismatch that silently blocks calls.
    const variants = host.startsWith("www.") ? [host, host.slice(4)] : [host, `www.${host}`];
    let anyOk = false;
    let lastErr: string | undefined;
    for (const d of variants) {
      const res = await registerWebrtcDomain(d);
      if (res.ok) anyOk = true;
      else lastErr = res.error;
    }
    setRegistering(false);
    if (anyOk) {
      toast.success(`Domaine(s) enregistré(s) : ${variants.join(", ")}`);
      await load();
    } else {
      toast.error("Enregistrement du domaine impossible", { description: lastErr });
    }
  };

  const testKey = async () => {
    setKeyState(null);
    const res = await testWebrtcKey();
    setKeyState(res.ok);
    if (!res.ok) toast.error("Clé WebRTC", { description: res.error });
  };

  const domainRegistered = host ? domains.includes(host) : null;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Self-service setup */}
      <div className="space-y-4 rounded-lg border p-4">
        <h2 className="text-lg font-semibold">Mon softphone</h2>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Login SIP / extension</label>
          <input
            value={sip}
            onChange={(e) => setSip(e.target.value)}
            placeholder="ex. 420031"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
          />
          <p className="text-xs text-muted-foreground">
            Le login SIP <strong>exactement</strong> comme il fonctionne sur le web-phone de Zadarma.
            Pour un <strong>numéro SIP direct</strong>, c’est le numéro seul (ex. <code>420031</code>) ;
            pour une <strong>extension PBX</strong>, c’est <code>PBXID-EXT</code>. Le message
            « integrationDisabled / wrong sip » signifie que ce login n’est pas valide pour le widget.
          </p>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Mode d’appel (click-to-call)</label>
          <select
            value={callMode}
            onChange={(e) => setCallMode(e.target.value as "browser" | "callback")}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          >
            <option value="browser">Navigateur (widget WebRTC)</option>
            <option value="callback">Callback (fait sonner mon téléphone)</option>
          </select>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={saving || !sip.trim()}
          className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Enregistrer
        </button>
      </div>

      {/* Diagnostic */}
      <div className="space-y-3 rounded-lg border p-4">
        <h2 className="text-lg font-semibold">Diagnostic</h2>
        <div className="divide-y">
          <Check ok={profile?.configured ?? null} label="Téléphonie configurée (clés Zadarma)" />
          <Check
            ok={profile?.hasExtension ?? null}
            label="Mon extension est reliée à mon compte"
            hint={profile?.sip ? `SIP : ${profile.sip}` : "Renseigne ton login SIP ci-contre"}
          />
          <div className="flex items-center justify-between gap-2 py-1.5">
            <Check ok={keyState} label="Clé WebRTC mintée par le serveur" />
            <button
              type="button"
              onClick={testKey}
              className="rounded-md border px-2 py-1 text-xs hover:bg-muted"
            >
              Tester
            </button>
          </div>
          <div className="flex items-center justify-between gap-2 py-1.5">
            <Check
              ok={domainRegistered}
              label="Domaine autorisé pour le widget"
              hint={host || undefined}
            />
            {isAdmin && (
              <button
                type="button"
                onClick={register}
                disabled={registering || !host}
                className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted disabled:opacity-60"
              >
                {registering ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Globe className="h-3.5 w-3.5" />}
                Activer
              </button>
            )}
          </div>
          <Check
            ok={scriptsLoaded}
            label="Scripts du widget chargés"
            hint="Recharge la page après avoir configuré l’extension"
          />
        </div>
        <div className="space-y-2 rounded-md border bg-[var(--surface-2)] p-3 text-xs text-muted-foreground">
          <p>
            <strong>« Connecté » mais l’appel ne part pas ?</strong> C’est que le domaine du site
            n’est pas autorisé côté Zadarma. Clique « Activer » ci-dessus, ou ajoute-le à la main :
            Zadarma → <em>Paramètres → Intégrations et API → widget WebRTC</em> → active l’intégration
            et ajoute <code>{host || "ton domaine"}</code> (avec et sans <code>www.</code>).
          </p>
          <p>
            Les appels <strong>externes</strong> présentent un numéro (CallerID) connecté au compte —
            si aucun numéro n’est encore actif, teste avec un appel <strong>interne / echo-test</strong>.
            Pense aussi à <strong>autoriser le micro</strong> du navigateur sur ce domaine.
          </p>
          {domainRegistered === false && !isAdmin && (
            <p>Demande à un admin d’activer le domaine {host}.</p>
          )}
        </div>
      </div>
    </div>
  );
}
