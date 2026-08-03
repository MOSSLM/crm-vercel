import { Suspense } from "react";
import { SignupPage } from "@/components/SignupPage";

export const dynamic = "force-dynamic";

export default function Signup() {
  return (
    <Suspense fallback={<div className="p-6 text-center">Chargement…</div>}>
      <SignupPage />
    </Suspense>
  );
}
