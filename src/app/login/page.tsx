// app/login/page.tsx
import { Suspense } from "react";
import { LoginPage } from "@/components/LoginPage";

// Évite le pré-rendu statique qui déclenche l'avertissement
export const dynamic = "force-dynamic";

export default function Login() {
  return (
    <Suspense fallback={<div className="p-6 text-center">Chargement…</div>}>
      <LoginPage />
    </Suspense>
  );
}