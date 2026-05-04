"use client";

import React, { Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Mail, MessageCircle, LayoutTemplate, Settings } from "lucide-react";
import { EmailTab } from "@/components/messaging/EmailTab";
import { WhatsAppTab } from "@/components/messaging/WhatsAppTab";
import { EmailTemplatesTab } from "@/components/messaging/EmailTemplatesTab";
import { SignatureSettings } from "@/components/messaging/SignatureSettings";
import { cn } from "@/lib/utils";

type TabKey = "email" | "whatsapp" | "templates" | "parametres";

const TABS: { key: TabKey; label: string; icon: React.ElementType; color?: string; accent?: string }[] = [
  { key: "email", label: "Email", icon: Mail, accent: "text-blue-500" },
  { key: "whatsapp", label: "WhatsApp", icon: MessageCircle, color: "#25D366", accent: "text-[#25D366]" },
  { key: "templates", label: "Templates", icon: LayoutTemplate, accent: "text-violet-500" },
  { key: "parametres", label: "Paramètres", icon: Settings, accent: "text-muted-foreground" },
];

function MessagingInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const activeTab = (searchParams.get("tab") as TabKey) ?? "email";

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
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* Channel tab bar — compact, no duplicate with TopSubNav */}
      <div className="flex shrink-0 items-center gap-0.5 border-b bg-background/95 px-3 pt-0">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setTab(tab.key)}
              className={cn(
                "flex items-center gap-1.5 border-b-2 px-3.5 py-2.5 text-sm font-medium transition-all",
                isActive
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border/60"
              )}
            >
              <Icon
                className={cn("h-3.5 w-3.5", isActive ? tab.accent : "")}
                style={isActive && tab.color ? { color: tab.color } : undefined}
              />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab content — full remaining height */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {activeTab === "email" && <EmailTab />}
        {activeTab === "whatsapp" && <WhatsAppTab />}
        {activeTab === "templates" && <EmailTemplatesTab />}
        {activeTab === "parametres" && <SignatureSettings />}
      </div>
    </div>
  );
}

export function MessagingPage() {
  return (
    <Suspense fallback={
      <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
        Chargement…
      </div>
    }>
      <MessagingInner />
    </Suspense>
  );
}
