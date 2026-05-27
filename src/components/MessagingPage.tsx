"use client";

import React, { Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Mail, MessageCircle, LayoutTemplate, Settings } from "lucide-react";
import { EmailTab } from "@/components/messaging/EmailTab";
import { WhatsAppTab } from "@/components/messaging/WhatsAppTab";
import { EmailTemplatesTab } from "@/components/messaging/EmailTemplatesTab";
import { SignatureSettings } from "@/components/messaging/SignatureSettings";
import "@/components/automations/automations-skin.css";

type TabKey = "email" | "whatsapp" | "templates" | "parametres";

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: "email",      label: "Email",      icon: Mail },
  { key: "whatsapp",   label: "WhatsApp",   icon: MessageCircle },
  { key: "templates",  label: "Templates",  icon: LayoutTemplate },
  { key: "parametres", label: "Paramètres", icon: Settings },
];

function MessagingInner() {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const activeTab    = (searchParams.get("tab") as TabKey) ?? "email";

  const setTab = (tab: TabKey) => {
    const params = new URLSearchParams(searchParams.toString());
    if (tab === "email") {
      params.delete("tab");
    } else {
      params.set("tab", tab);
    }
    const qs = params.toString();
    router.push(`/messagerie${qs ? `?${qs}` : ""}`);
  };

  return (
    <div
      className="au-skin"
      style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", background: "var(--bg)" }}
    >
      {/* ── Tab bar ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
          flexShrink: 0,
          padding: "0 4px",
          gap: 2,
        }}
      >
        {TABS.map((tab) => {
          const Icon     = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setTab(tab.key)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                height: 38,
                padding: "0 14px",
                background: "transparent",
                border: "none",
                borderBottom: isActive ? "2px solid var(--accent)" : "2px solid transparent",
                color: isActive ? "var(--text)" : "var(--text-3)",
                fontFamily: "var(--font-ui)",
                fontSize: 12.5,
                fontWeight: isActive ? 600 : 500,
                cursor: "pointer",
                transition: "color 0.15s, border-color 0.15s",
                borderRadius: 0,
                marginBottom: -1,
              }}
              onMouseEnter={(e) => {
                if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = "var(--text)";
              }}
              onMouseLeave={(e) => {
                if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = "var(--text-3)";
              }}
            >
              <Icon style={{ width: 13, height: 13 }} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── Tab content ── */}
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        {activeTab === "email"      && <EmailTab />}
        {activeTab === "whatsapp"   && <WhatsAppTab />}
        {activeTab === "templates"  && <EmailTemplatesTab />}
        {activeTab === "parametres" && <SignatureSettings />}
      </div>
    </div>
  );
}

export function MessagingPage() {
  return (
    <Suspense fallback={
      <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", color: "var(--text-3)", fontSize: 13 }}>
        Chargement…
      </div>
    }>
      <MessagingInner />
    </Suspense>
  );
}
