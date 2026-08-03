import { Suspense } from "react";
import { AuthCallback } from "@/components/AuthCallback";

export const dynamic = "force-dynamic";

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<div className="p-6 text-center">Connexion en cours…</div>}>
      <AuthCallback />
    </Suspense>
  );
}
