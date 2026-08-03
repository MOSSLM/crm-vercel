import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Mentions légales — SAMA",
  robots: { index: false, follow: true },
};

/**
 * Page à compléter par SAMA — contenu réglementaire (raison sociale, SIRET,
 * directeur de publication, hébergeur, RGPD, cookies).
 */
export default function MentionsLegalesPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
        ← Retour à l&apos;accueil
      </Link>

      <h1 className="mt-6 text-3xl font-light">Mentions légales</h1>

      <section className="mt-10 space-y-6 text-sm leading-relaxed text-muted-foreground">
        <div>
          <h2 className="text-foreground font-medium">Éditeur du site</h2>
          <p>SAMA — Agence digitale. Coordonnées complètes à compléter.</p>
        </div>

        <div>
          <h2 className="text-foreground font-medium">Hébergement</h2>
          <p>Vercel Inc. — 440 N Barranca Avenue #4133, Covina, CA 91723, USA.</p>
        </div>

        <div>
          <h2 className="text-foreground font-medium">Propriété intellectuelle</h2>
          <p>
            L&apos;ensemble du contenu de ce site (textes, illustrations, logos, marques) est la propriété
            exclusive de SAMA ou de ses partenaires. Toute reproduction est interdite sans accord préalable.
          </p>
        </div>

        <div>
          <h2 className="text-foreground font-medium">Contact</h2>
          <p>
            Pour toute question relative à ce site :{" "}
            <a href="mailto:contact@samadigitalstudio.fr" className="underline">
              contact@samadigitalstudio.fr
            </a>
            .
          </p>
        </div>

        <p className="pt-6 text-xs italic">
          Page provisoire — le contenu réglementaire complet sera publié prochainement.
        </p>
      </section>
    </main>
  );
}
