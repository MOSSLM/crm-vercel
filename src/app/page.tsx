import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "@/env";

export default async function Home() {
  const cookieStore = cookies();
  const token = cookieStore.get(
    "sb-llzrpcbwnqvbrcjjwysm-auth-token"
  );
  if (token) {
    try {
      const session = JSON.parse(token.value);
      const accessToken =
        session?.access_token || session?.currentSession?.access_token;
      if (accessToken) {
        const supabase = createClient(
          SUPABASE_URL,
          SUPABASE_SERVICE_ROLE_KEY
        );
        const { data } = await supabase.auth.getUser(accessToken);
        if (data.user) {
          redirect("/dashboard");
        }
      }
    } catch {
      // ignore parse errors and fall through to login
    }
  }
  redirect("/login");
}
