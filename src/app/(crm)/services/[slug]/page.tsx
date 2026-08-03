import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getServiceClient } from "@/app/api/_lib/service-client";

export const revalidate = 60;

type Offer = {
  id: string;
  nom: string;
  description: string | null;
  prix_ht: number | null;
  devise: string | null;
  billing_period: string | null;
  tags: string[] | null;
  type: string | null;
  slug: string | null;
  actif: boolean;
  visible_in_qualification: boolean;
};

const BILLING_LABEL: Record<string, string> = {
  one_shot: "Paiement unique",
  monthly: "Mensuel",
  yearly: "Annuel",
  quarterly: "Trimestriel",
};

function formatPrice(amount: number | null, devise: string | null): string {
  if (amount == null) return "Sur devis";
  const cur = devise || "EUR";
  try {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${amount} ${cur}`;
  }
}

async function fetchOffer(slug: string): Promise<Offer | null> {
  // Service-role: server-only, public page (visible_in_qualification gate
  // below ensures we don't expose hidden/internal offers).
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("offres")
    .select("id, nom, description, prix_ht, devise, billing_period, tags, type, slug, actif, visible_in_qualification")
    .eq("slug", slug)
    .eq("actif", true)
    .eq("visible_in_qualification", true)
    .maybeSingle();
  return (data as Offer | null) ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const offer = await fetchOffer(slug);
  if (!offer) return { title: "Service — SAMA" };
  return {
    title: `${offer.nom} — SAMA`,
    description: offer.description ?? "Service proposé par SAMA Digital Studio.",
    openGraph: {
      title: `${offer.nom} — SAMA`,
      description: offer.description ?? undefined,
      type: "website",
    },
  };
}

export default async function ServiceDescriptionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const offer = await fetchOffer(slug);
  if (!offer) notFound();

  const billing = offer.billing_period ? BILLING_LABEL[offer.billing_period] ?? offer.billing_period : null;

  return (
    <main className="min-h-screen bg-[#FBF7EF] text-[#0A1A40]">
      <header className="border-b border-[#0A1A40]/8 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
          <Link href="/" className="font-serif text-sm tracking-[0.42em]">SAMA</Link>
          <Link href="/#contact" className="text-xs font-medium uppercase tracking-[0.16em] text-[#0A1A40]/70 hover:text-[#0A1A40]">
            Discutons →
          </Link>
        </div>
      </header>

      <article className="mx-auto max-w-3xl px-6 py-16">
        <Link href="/#services" className="text-xs uppercase tracking-[0.16em] text-[#5AA9E6]">
          ← Tous nos services
        </Link>

        <h1 className="mt-4 font-serif text-4xl font-light leading-tight md:text-5xl">{offer.nom}</h1>

        <div className="mt-6 flex flex-wrap items-baseline gap-3">
          <span className="font-serif text-3xl font-light">{formatPrice(offer.prix_ht, offer.devise)}</span>
          {billing && <span className="text-sm text-[#0A1A40]/60">· {billing}</span>}
          {offer.type && (
            <span className="rounded-sm border border-[#0A1A40]/15 px-2 py-0.5 text-xs uppercase tracking-wider text-[#0A1A40]/60">
              {offer.type}
            </span>
          )}
        </div>

        {offer.description && (
          <p className="mt-8 whitespace-pre-line text-base leading-relaxed text-[#0A1A40]/75">
            {offer.description}
          </p>
        )}

        {offer.tags && offer.tags.length > 0 && (
          <div className="mt-8 flex flex-wrap gap-2">
            {offer.tags.map((tag) => (
              <span key={tag} className="rounded-sm bg-[#D6E4F0]/60 px-2 py-1 text-xs text-[#0A1A40]/70">
                {tag}
              </span>
            ))}
          </div>
        )}

        <div className="mt-12 flex flex-wrap gap-3">
          <Link
            href="/#contact"
            className="inline-flex items-center gap-2 rounded-sm bg-[#5AA9E6] px-6 py-3 text-xs font-medium uppercase tracking-[0.14em] text-white transition hover:bg-[#3d8fcd]"
          >
            Discuter de ce service
          </Link>
          <Link
            href="/espace-client/services"
            className="inline-flex items-center gap-2 rounded-sm border border-[#0A1A40]/15 px-6 py-3 text-xs font-medium uppercase tracking-[0.14em] text-[#0A1A40]/70 transition hover:border-[#5AA9E6] hover:text-[#0A1A40]"
          >
            S'abonner depuis mon espace
          </Link>
        </div>
      </article>

      <footer className="border-t border-[#0A1A40]/8 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-8 text-center text-xs text-[#0A1A40]/40">
          © {new Date().getFullYear()} SAMA · Agence digitale française
        </div>
      </footer>
    </main>
  );
}
