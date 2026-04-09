import { createClient } from "@supabase/supabase-js";
import type { SitePage } from "@/types";

// Server-side Supabase client — uses env vars, never imports from "use client" modules.
function getServerClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key);
}

export async function fetchSitePageById(id: string): Promise<SitePage | null> {
  const supabase = getServerClient();
  const { data, error } = await supabase
    .from("site_pages")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return null;
  return data as SitePage | null;
}
