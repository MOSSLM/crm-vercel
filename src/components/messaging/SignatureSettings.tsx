"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Save, User, Briefcase, Phone, Globe, Linkedin, Mail, Palette, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { authedFetch } from "@/utils/authedFetch";

export interface SignatureData {
  first_name:   string;
  last_name:    string;
  job_title:    string;
  company:      string;
  email:        string;
  phone:        string;
  website:      string;
  linkedin_url: string;
  accent_color: string;
}

const EMPTY: SignatureData = {
  first_name:   "",
  last_name:    "",
  job_title:    "",
  company:      "",
  email:        "",
  phone:        "",
  website:      "",
  linkedin_url: "",
  accent_color: "#6366f1",
};

const ACCENT_COLORS = [
  { label: "Indigo",  value: "#6366f1" },
  { label: "Bleu",   value: "#3b82f6" },
  { label: "Violet", value: "#8b5cf6" },
  { label: "Emerald",value: "#10b981" },
  { label: "Amber",  value: "#f59e0b" },
  { label: "Rose",   value: "#f43f5e" },
  { label: "Gris",   value: "#64748b" },
  { label: "Noir",   value: "#111827" },
];

export function generateSignatureHtml(sig: SignatureData): string {
  const fullName = [sig.first_name, sig.last_name].filter(Boolean).join(" ");
  if (!fullName && !sig.job_title && !sig.email && !sig.phone) return "";

  const color = sig.accent_color || "#6366f1";

  const lines: string[] = [];
  if (sig.email)        lines.push(`<span>📧&nbsp;<a href="mailto:${sig.email}" style="color:${color};text-decoration:none;">${sig.email}</a></span>`);
  if (sig.phone)        lines.push(`<span>📞&nbsp;${sig.phone}</span>`);
  if (sig.website)      lines.push(`<span>🌐&nbsp;<a href="${sig.website}" style="color:${color};text-decoration:none;">${sig.website.replace(/^https?:\/\//, "")}</a></span>`);
  if (sig.linkedin_url) lines.push(`<span>🔗&nbsp;<a href="${sig.linkedin_url}" style="color:${color};text-decoration:none;">LinkedIn</a></span>`);

  return `<div style="margin-top:24px;padding-top:16px;border-top:3px solid ${color};font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#374151;line-height:1.5;">
  ${fullName ? `<div style="font-weight:700;font-size:15px;color:#111827;margin-bottom:2px;">${fullName}</div>` : ""}
  ${(sig.job_title || sig.company) ? `<div style="color:#6b7280;margin-bottom:10px;">${[sig.job_title, sig.company].filter(Boolean).join(" · ")}</div>` : ""}
  ${lines.length ? `<div style="display:flex;flex-direction:column;gap:3px;">${lines.join("")}</div>` : ""}
</div>`;
}

function SignaturePreview({ sig }: { sig: SignatureData }) {
  const fullName = [sig.first_name, sig.last_name].filter(Boolean).join(" ");
  const color = sig.accent_color || "#6366f1";
  const hasContent = fullName || sig.job_title || sig.company || sig.email || sig.phone || sig.website || sig.linkedin_url;

  return (
    <div className="rounded-xl border bg-white shadow-sm overflow-hidden dark:bg-zinc-900">
      {/* Fake email header */}
      <div className="border-b px-5 py-4 bg-gray-50 dark:bg-zinc-800">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex gap-1.5">
            <div className="h-3 w-3 rounded-full bg-red-400" />
            <div className="h-3 w-3 rounded-full bg-amber-400" />
            <div className="h-3 w-3 rounded-full bg-green-400" />
          </div>
          <div className="flex-1 h-5 rounded bg-gray-200 dark:bg-zinc-700 max-w-xs" />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="w-12 shrink-0 font-medium">De :</span>
            <span className="text-foreground font-medium">
              {[sig.first_name, sig.last_name].filter(Boolean).join(" ") || "Votre Nom"}{sig.email ? ` <${sig.email}>` : ""}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="w-12 shrink-0 font-medium">À :</span>
            <span>contact@exemple.com</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="w-12 shrink-0 font-medium">Objet :</span>
            <span className="font-medium text-foreground">Suite à notre conversation</span>
          </div>
        </div>
      </div>

      {/* Email body */}
      <div className="px-5 py-5 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
        <p>Bonjour,</p>
        <p className="mt-3 text-gray-400 italic">[ Votre message s&apos;affiche ici... ]</p>

        {/* Signature */}
        {hasContent ? (
          <div
            className="mt-6"
            style={{ borderTop: `3px solid ${color}`, paddingTop: "16px", fontFamily: "Arial, sans-serif" }}
          >
            {(sig.first_name || sig.last_name) && (
              <p style={{ fontWeight: 700, fontSize: "15px", color: "#111827", marginBottom: "2px" }}>
                {fullName}
              </p>
            )}
            {(sig.job_title || sig.company) && (
              <p style={{ color: "#6b7280", fontSize: "13px", marginBottom: "10px" }}>
                {[sig.job_title, sig.company].filter(Boolean).join(" · ")}
              </p>
            )}
            <div className="flex flex-col gap-1" style={{ fontSize: "12px", color: "#374151" }}>
              {sig.email && (
                <span>📧&nbsp;
                  <a href={`mailto:${sig.email}`} style={{ color, textDecoration: "none" }}>{sig.email}</a>
                </span>
              )}
              {sig.phone && <span>📞&nbsp;{sig.phone}</span>}
              {sig.website && (
                <span>🌐&nbsp;
                  <a href={sig.website} style={{ color, textDecoration: "none" }}>
                    {sig.website.replace(/^https?:\/\//, "")}
                  </a>
                </span>
              )}
              {sig.linkedin_url && (
                <span>🔗&nbsp;
                  <a href={sig.linkedin_url} style={{ color, textDecoration: "none" }}>LinkedIn</a>
                </span>
              )}
            </div>
          </div>
        ) : (
          <div
            className="mt-6 flex flex-col items-center justify-center py-6 rounded-lg border-2 border-dashed border-gray-200 dark:border-zinc-700 text-muted-foreground text-xs gap-1"
          >
            <User className="h-5 w-5 opacity-40" />
            <span>Votre signature apparaîtra ici</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function SignatureSettings() {
  const [sig, setSig]       = useState<SignatureData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);

  useEffect(() => {
    authedFetch("/api/email/signature")
      .then((r) => r.json())
      .then((data) => {
        if (data) setSig({ ...EMPTY, ...data });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const set = useCallback((field: keyof SignatureData) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setSig((prev) => ({ ...prev, [field]: e.target.value }));
    setSaved(false);
  }, []);

  const setColor = useCallback((color: string) => {
    setSig((prev) => ({ ...prev, accent_color: color }));
    setSaved(false);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await authedFetch("/api/email/signature", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sig),
      });
      if (!res.ok) throw new Error("Échec de l'enregistrement");
      setSaved(true);
      toast.success("Signature enregistrée !");
    } catch {
      toast.error("Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground text-sm gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Chargement…
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Left panel: form ── */}
      <div className="flex w-[420px] shrink-0 flex-col border-r">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold">Pied d&apos;email</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Affiché automatiquement sous vos emails</p>
          </div>
          <Button onClick={handleSave} disabled={saving} size="sm" className="gap-2">
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : saved ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {saved ? "Enregistré" : "Enregistrer"}
          </Button>
        </div>

        <ScrollArea className="flex-1">
          <div className="space-y-6 p-5">
            {/* Identité */}
            <section className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <User className="h-3.5 w-3.5" />
                Identité
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Prénom</Label>
                  <Input value={sig.first_name} onChange={set("first_name")} placeholder="Jean" className="h-8 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Nom</Label>
                  <Input value={sig.last_name} onChange={set("last_name")} placeholder="Dupont" className="h-8 text-sm" />
                </div>
              </div>
            </section>

            <Separator />

            {/* Professionnel */}
            <section className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <Briefcase className="h-3.5 w-3.5" />
                Poste
              </div>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Titre / Poste</Label>
                  <Input value={sig.job_title} onChange={set("job_title")} placeholder="Directeur commercial" className="h-8 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Entreprise</Label>
                  <Input value={sig.company} onChange={set("company")} placeholder="Mon Entreprise" className="h-8 text-sm" />
                </div>
              </div>
            </section>

            <Separator />

            {/* Coordonnées */}
            <section className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <Phone className="h-3.5 w-3.5" />
                Coordonnées
              </div>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input value={sig.email} onChange={set("email")} placeholder="jean@exemple.com" type="email" className="h-8 text-sm pl-8" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Téléphone</Label>
                  <div className="relative">
                    <Phone className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input value={sig.phone} onChange={set("phone")} placeholder="+33 6 12 34 56 78" className="h-8 text-sm pl-8" />
                  </div>
                </div>
              </div>
            </section>

            <Separator />

            {/* Liens */}
            <section className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <Globe className="h-3.5 w-3.5" />
                Liens
              </div>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Site web</Label>
                  <div className="relative">
                    <Globe className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input value={sig.website} onChange={set("website")} placeholder="https://monsite.fr" className="h-8 text-sm pl-8" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">LinkedIn</Label>
                  <div className="relative">
                    <Linkedin className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input value={sig.linkedin_url} onChange={set("linkedin_url")} placeholder="https://linkedin.com/in/jean-dupont" className="h-8 text-sm pl-8" />
                  </div>
                </div>
              </div>
            </section>

            <Separator />

            {/* Couleur d'accent */}
            <section className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <Palette className="h-3.5 w-3.5" />
                Couleur d&apos;accent
              </div>
              <div className="flex flex-wrap gap-2">
                {ACCENT_COLORS.map((c) => (
                  <button
                    key={c.value}
                    onClick={() => setColor(c.value)}
                    title={c.label}
                    className="relative h-8 w-8 rounded-full border-2 transition-transform hover:scale-110 focus:outline-none"
                    style={{
                      backgroundColor: c.value,
                      borderColor: sig.accent_color === c.value ? "#111827" : "transparent",
                      boxShadow: sig.accent_color === c.value ? `0 0 0 2px white, 0 0 0 4px ${c.value}` : undefined,
                    }}
                    aria-label={c.label}
                  />
                ))}
                <div className="flex items-center gap-2 ml-1">
                  <input
                    type="color"
                    value={sig.accent_color}
                    onChange={(e) => setColor(e.target.value)}
                    className="h-8 w-8 rounded-full cursor-pointer border border-input bg-transparent"
                    title="Couleur personnalisée"
                  />
                  <span className="text-xs text-muted-foreground">Personnalisée</span>
                </div>
              </div>
            </section>
          </div>
        </ScrollArea>
      </div>

      {/* ── Right panel: live preview ── */}
      <div className="flex flex-1 flex-col overflow-hidden bg-muted/30">
        <div className="border-b px-6 py-4">
          <h2 className="text-sm font-semibold">Aperçu</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Mise à jour en temps réel</p>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-6 max-w-2xl mx-auto">
            <SignaturePreview sig={sig} />
            <p className="text-xs text-muted-foreground text-center mt-4">
              Ce pied d&apos;email sera automatiquement ajouté à vos emails sortants.
            </p>
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
