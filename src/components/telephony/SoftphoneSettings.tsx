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
    <div style={{ display: "flex", alignItems: "flex-start", gap: 9, padding: "9px 0" }}>
      {ok === null ? (
        <span
          style={{
            marginTop: 2,
            width: 16,
            height: 16,
            flexShrink: 0,
            borderRadius: "50%",
            border: "1px solid var(--border-2)",
          }}
        />
      ) : ok ? (
        <CheckCircle2 className="ico-sm" style={{ marginTop: 2, flexShrink: 0, color: "var(--ok)" }} />
      ) : (
        <XCircle className="ico-sm" style={{ marginTop: 2, flexShrink: 0, color: "var(--danger)" }} />
      )}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12.5, color: "var(--text)" }}>{label}</div>
        {hint && <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 1 }}>{hint}</div>}
      </div>
    </div>
  );
}

/**
 * Self-service softphone setup + live diagnostic (skin prototype cards). The
 * signed-in user sets their own SIP login, registers the CRM domain for the
 * WebRTC widget, and sees exactly what still blocks calls.
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
    <div className="tel-skin">
      <div className="po-grid">
        {/* Self-service setup */}
        <div className="card">
          <div className="card-hd">
            <h3>Mon softphone</h3>
          </div>
          <div className="card-bd" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="fld">
              <span className="fld-lb">Login SIP / extension</span>
              <input value={sip} onChange={(e) => setSip(e.target.value)} placeholder="ex. 420031" />
              <p style={{ fontSize: 11, color: "var(--text-3)", lineHeight: 1.5, margin: 0 }}>
                Le login SIP <strong>exactement</strong> comme il fonctionne sur le web-phone Zadarma.
                Numéro SIP direct → le numéro seul (ex. <code>420031</code>) ; extension PBX →{" "}
                <code>PBXID-EXT</code>. « integrationDisabled / wrong sip » = login non valide pour le
                widget.
              </p>
            </div>
            <div className="fld">
              <span className="fld-lb">Mode d&apos;appel (click-to-call)</span>
              <select
                value={callMode}
                onChange={(e) => setCallMode(e.target.value as "browser" | "callback")}
              >
                <option value="browser">Navigateur (widget WebRTC)</option>
                <option value="callback">Callback (fait sonner mon téléphone)</option>
              </select>
            </div>
            <div>
              <button
                type="button"
                className="btn accent sm"
                onClick={save}
                disabled={saving || !sip.trim()}
              >
                {saving ? (
                  <Loader2 className="ico-sm" style={{ animation: "spin 1s linear infinite" }} />
                ) : (
                  <Save className="ico-sm" />
                )}
                Enregistrer
              </button>
            </div>
          </div>
        </div>

        {/* Diagnostic */}
        <div className="card">
          <div className="card-hd">
            <h3>Diagnostic</h3>
          </div>
          <div className="card-bd">
            <div style={{ display: "flex", flexDirection: "column" }}>
              <Check ok={profile?.configured ?? null} label="Téléphonie configurée (clés Zadarma)" />
              <div style={{ borderTop: "1px solid var(--border)" }}>
                <Check
                  ok={profile?.hasExtension ?? null}
                  label="Mon extension est reliée à mon compte"
                  hint={profile?.sip ? `SIP : ${profile.sip}` : "Renseigne ton login SIP ci-contre"}
                />
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  borderTop: "1px solid var(--border)",
                }}
              >
                <Check ok={keyState} label="Clé WebRTC mintée par le serveur" />
                <button type="button" className="btn outline sm" onClick={testKey}>
                  Tester
                </button>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  borderTop: "1px solid var(--border)",
                }}
              >
                <Check ok={domainRegistered} label="Domaine autorisé pour le widget" hint={host || undefined} />
                {isAdmin && (
                  <button
                    type="button"
                    className="btn outline sm"
                    onClick={register}
                    disabled={registering || !host}
                  >
                    {registering ? (
                      <Loader2 className="ico-sm" style={{ animation: "spin 1s linear infinite" }} />
                    ) : (
                      <Globe className="ico-sm" />
                    )}
                    Activer
                  </button>
                )}
              </div>
              <div style={{ borderTop: "1px solid var(--border)" }}>
                <Check
                  ok={scriptsLoaded}
                  label="Scripts du widget chargés"
                  hint="Recharge la page après avoir configuré l'extension"
                />
              </div>
            </div>

            <div className="po-note-box" style={{ flexDirection: "column", gap: 8, marginLeft: 0, marginRight: 0 }}>
              <p style={{ margin: 0 }}>
                <strong>« Connecté » mais l&apos;appel ne part pas ?</strong> Le domaine du site
                n&apos;est pas autorisé côté Zadarma. Clique « Activer », ou ajoute-le à la main :
                Zadarma → <em>Paramètres → Intégrations et API → widget WebRTC</em> → active
                l&apos;intégration et ajoute <code>{host || "ton domaine"}</code> (avec et sans{" "}
                <code>www.</code>).
              </p>
              <p style={{ margin: 0 }}>
                Les appels <strong>externes</strong> présentent un numéro (CallerID) connecté au compte —
                si aucun numéro n&apos;est actif, teste avec un appel <strong>interne</strong>. Pense
                aussi à <strong>autoriser le micro</strong> du navigateur sur ce domaine.
              </p>
              <p style={{ margin: 0 }}>
                Zadarma ne route que les numéros au <strong>format international</strong>. Depuis le
                CRM, les numéros nationaux (ex. <code>06&nbsp;46&nbsp;04&nbsp;28&nbsp;76</code>) sont
                convertis automatiquement en <code>+33…</code>. Si tu composes directement dans le
                widget, saisis le numéro en international (<code>+33…</code>) et non en <code>0…</code>.
              </p>
              {domainRegistered === false && !isAdmin && (
                <p style={{ margin: 0 }}>Demande à un admin d&apos;activer le domaine {host}.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
