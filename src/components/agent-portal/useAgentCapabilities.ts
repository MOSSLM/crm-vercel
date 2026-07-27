"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { useAuth } from "@/components/AuthContext";

/**
 * Capacités déléguées à l'agent connecté (table `agent_settings`, policy
 * « agent read own »). Sert uniquement à masquer les entrées de nav et les
 * écrans : la vérité est côté serveur, dans `withAuth({ capability })`.
 *
 * Défaut = refus, y compris quand la migration 20260727 n'est pas encore
 * appliquée (la requête échoue alors silencieusement).
 */
export type AgentCapabilities = {
  canQualify: boolean;
  canUseMarketingPipeline: boolean;
  loading: boolean;
};

const DENIED: Omit<AgentCapabilities, "loading"> = {
  canQualify: false,
  canUseMarketingPipeline: false,
};

export function useAgentCapabilities(): AgentCapabilities {
  const { user, isAuthenticated } = useAuth();
  const [caps, setCaps] = useState(DENIED);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!isAuthenticated || !user?.id) {
      setCaps(DENIED);
      setLoading(false);
      return;
    }

    // Un admin qui traverse le portail agent garde tous les droits.
    if (user.role === "admin") {
      setCaps({ canQualify: true, canUseMarketingPipeline: true });
      setLoading(false);
      return;
    }

    const { data } = await createClient()
      .from("agent_settings")
      .select("can_qualify, can_use_marketing_pipeline")
      .eq("agent_id", user.id)
      .maybeSingle();

    setCaps({
      canQualify: data?.can_qualify === true,
      canUseMarketingPipeline: data?.can_use_marketing_pipeline === true,
    });
    setLoading(false);
  }, [isAuthenticated, user?.id, user?.role]);

  useEffect(() => {
    void load();
  }, [load]);

  return { ...caps, loading };
}
