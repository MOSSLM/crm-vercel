"use client";

import React, { Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Mail, MessageCircle, LayoutTemplate, Settings } from "lucide-react";
import { EmailTab } from "@/components/messaging/EmailTab";
import { WhatsAppTab } from "@/components/messaging/WhatsAppTab";
import { EmailTemplatesTab } from "@/components/messaging/EmailTemplatesTab";
import { SignatureSettings } from "@/components/messaging/SignatureSettings";

type TabKey = "email" | "whatsapp" | "templates" | "parametres";

const TABS: { key: TabKey; label: string; icon: React.ElementType; color?: string }[] = [
  { key: "email",      label: "Email",      icon: Mail },
  { key: "whatsapp",   label: "WhatsApp",   icon: MessageCircle, color: "#25D366" },
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
    <div className="flex h-full flex-col overflow-hidden">
      {/* Tab bar */}
      <div className="flex shrink-0 items-center gap-1 border-b px-4 pt-3">
        {TABS.map((tab) => {
          const Icon     = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setTab(tab.key)}
              className={`flex items-center gap-2 rounded-t-md border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon
                className="h-4 w-4"
                style={isActive && tab.color ? { color: tab.color } : undefined}
              />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
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
    <Suspense fallback={<div className="flex h-full items-center justify-center text-muted-foreground text-sm">Chargement…</div>}>
      <MessagingInner />
    </Suspense>
  );
}
