import Link from "next/link";
import { CheckCircle2, Mail } from "lucide-react";

export const metadata = {
  title: "Merci pour votre achat — SAMA",
  robots: { index: false, follow: false },
};

/**
 * Public post-payment confirmation. Stripe redirects here after a demo-site
 * purchase. The account is created asynchronously by the webhook, which emails a
 * login link — so we tell the buyer to check their inbox rather than trying to
 * sign them in here (they have no session yet).
 */
export default function BienvenuePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-6 px-6 py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
        <CheckCircle2 className="h-9 w-9" />
      </div>
      <h1 className="text-2xl font-semibold">Merci, votre paiement est confirmé&nbsp;!</h1>
      <p className="text-muted-foreground">
        Ce site est désormais le vôtre. Nous venons de vous envoyer un email avec un lien de
        connexion à votre espace personnel.
      </p>
      <div className="flex items-start gap-3 rounded-lg border bg-muted/40 p-4 text-left text-sm">
        <Mail className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
        <div>
          <p className="font-medium">Prochaine étape</p>
          <p className="text-muted-foreground">
            Ouvrez le lien reçu par email pour accéder à votre compte, puis remplissez le
            formulaire d’adaptation : vous pourrez y téléverser votre logo, vos images et toutes
            les informations pour que nous personnalisions le site à votre image.
          </p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Vous n’avez rien reçu&nbsp;? Vérifiez vos spams, ou{" "}
        <Link href="/login" className="text-primary underline">
          connectez-vous ici
        </Link>
        .
      </p>
    </main>
  );
}
