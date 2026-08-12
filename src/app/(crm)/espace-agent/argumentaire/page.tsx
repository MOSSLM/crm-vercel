"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  Gauge,
  MessageSquareQuote,
  Monitor,
  Package,
  PhoneCall,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { formatPrice } from "@/components/agent-portal/format";
import { AUDIT_ISSUE_CATALOG } from "@/data/auditIssues";

/**
 * Brief commercial de l'agent : ce que SAMA vend, pourquoi le site démo est
 * l'argument central, et quoi dire au téléphone.
 *
 * La route s'appelle `argumentaire`, pas `brief` : `/espace-agent/brief/[siteId]`
 * est déjà le « Brief de reprise » d'un site, ouvert pendant un rendez-vous. Deux
 * pages sous le même préfixe auraient fait surligner la section SAMA à chaque
 * ouverture d'un brief de reprise (`getAgentSpaceFromPath` compare des préfixes),
 * et « brief » aurait désigné deux choses différentes dans le même portail.
 *
 * Deux blocs seulement sont dynamiques, et c'est volontaire :
 *   — le catalogue vient de `offres` (même filtre que /espace-agent/offres), donc
 *     aucun prix n'est écrit en dur ici et rien ne peut diverger ;
 *   — les défauts viennent de `AUDIT_ISSUE_CATALOG`, la source unique déjà
 *     utilisée par l'audit vendu au client et par l'enrichissement automatique.
 *
 * Tout le reste est éditorial : c'est le discours, il se relit et se corrige ici.
 */

type Offer = {
  id: string;
  nom: string;
  description: string | null;
  prix_ht: number | null;
  devise: string | null;
  billing_period: string | null;
  metadata: Record<string, unknown> | null;
};

const BILLING_SUFFIX: Record<string, string> = {
  one_shot: "",
  monthly: "/ mois",
  yearly: "/ an",
  quarterly: "/ trimestre",
};

const SOMMAIRE = [
  { href: "#sama", label: "Ce que fait SAMA" },
  { href: "#offres", label: "Ce qu'on vend" },
  { href: "#demo", label: "Le site démo" },
  { href: "#defauts", label: "Les défauts qu'on mesure" },
  { href: "#appel", label: "L'appel" },
  { href: "#objections", label: "Objections" },
  { href: "#regles", label: "Ce qu'on ne promet jamais" },
];

/** Pourquoi le démo décroche le rendez-vous là où un devis échoue. */
const POURQUOI_DEMO = [
  {
    title: "Il n'a rien à imaginer",
    text: "Un artisan ne sait pas se projeter sur un devis de site web. Là, il n'y a rien à se représenter : il voit son entreprise, en mieux, sur son propre téléphone.",
  },
  {
    title: "La question change",
    text: "Ce n'est plus « est-ce que j'ai besoin d'un site ? » mais « est-ce que je prends celui-là ? ». La deuxième question se répond en une minute.",
  },
  {
    title: "Ça prouve qu'on a travaillé pour lui",
    text: "On est allé chercher ses avis, ses qualifications, son ancienneté, sa zone. Ça se voit en dix secondes et ça sort l'appel du démarchage anonyme.",
  },
  {
    title: "L'urgence est vraie",
    text: "Le site existe déjà : il reste à l'adapter et à le mettre en ligne. Le délai est court parce que le gros du travail est fait — pas parce qu'on presse le client.",
  },
];

/** Les qualités du démo, dans l'ordre où elles servent au téléphone. */
const CE_QUIL_Y_A_DEDANS: Array<{ icon: typeof Gauge; title: string; text: string }> = [
  {
    icon: Gauge,
    title: "Rapide, et démontrable en direct",
    text: "Le site s'affiche en moins de deux secondes, mobile compris : pas de WordPress, pas d'extensions empilées. C'est le point le plus facile à prouver — fais-lui ouvrir son site actuel à côté et demande-lui de compter.",
  },
  {
    icon: Monitor,
    title: "Pensé pour le téléphone d'abord",
    text: "Ses clients cherchent « chauffagiste + ville » sur un mobile, souvent dans l'urgence. Le démo est conçu pour cet écran-là en priorité, pas pour un grand écran de bureau.",
  },
  {
    icon: PhoneCall,
    title: "Appeler en un seul geste",
    text: "Numéro cliquable, bouton d'appel visible en permanence, bouton WhatsApp ou SMS. Chaque manipulation en moins, c'est un appel entrant de plus.",
  },
  {
    icon: CheckCircle2,
    title: "Un formulaire court, en haut de page",
    text: "Les demandes de devis arrivent par e-mail, et peuvent être branchées directement sur le CRM. Pas un formulaire de dix champs planqué en bas de page.",
  },
  {
    icon: ShieldCheck,
    title: "De la preuve, pas des slogans",
    text: "Ses vrais avis Google avec la note, ses années d'expérience, son nombre de chantiers, ses qualifications RGE issues de l'annuaire officiel ADEME. Tout ce qui est affiché est vérifiable.",
  },
  {
    icon: Building2,
    title: "Le référencement local, fait correctement",
    text: "Le site est écrit sur la grande ville qu'il vise, pas forcément sur sa commune : une entreprise de Quetigny se vend sur Dijon. Une page par service, les zones desservies, les balises et les données structurées.",
  },
  {
    icon: Package,
    title: "Le site lui appartient",
    text: "Livraison, mise en ligne, transfert de propriété. Ce n'est pas une location déguisée — dis-le, la question arrive souvent.",
  },
];

const A_SAVOIR = [
  {
    title: "Le démo n'est pas public",
    text: "Il vit sur une adresse privée que lui seul reçoit : ni ses clients, ni ses concurrents ne peuvent tomber dessus, et rien n'est mis en ligne à son nom sans son accord. Le dire lève une vraie inquiétude.",
  },
  {
    title: "Les chiffres affichés sont des estimations",
    text: "Années d'expérience, chantiers, clients : ils sont déduits de sources publiques. Présente-les comme un point de départ — « on a mis des chiffres, vous les corrigerez » — et ne les défends jamais comme une vérité.",
  },
  {
    title: "Une qualification RGE expirée n'est pas un bug",
    text: "Elle vient de l'annuaire ADEME et elle est laissée telle quelle. Si le prospect le relève, c'est une bonne accroche : elle se renouvelle, et son site actuel n'en parle probablement nulle part.",
  },
];

const OBJECTIONS = [
  {
    q: "« J'ai déjà un site. »",
    reponse:
      "Je sais, je l'ai regardé — c'est même pour ça que je vous appelle. [le défaut mesuré de la note d'audit]. La vraie question n'est pas s'il existe, c'est ce qu'il vous rapporte : vous recevez combien d'appels par mois grâce à lui ?",
    hint: "La réponse est très souvent « aucun ». C'est là que la conversation commence vraiment — laisse le silence faire le travail.",
  },
  {
    q: "« C'est trop cher. »",
    reponse:
      "C'est le prix d'un petit chantier chez vous. Si le site vous ramène un seul client dans l'année, il est remboursé. Vous facturez combien, une installation ?",
    hint: "Ne baisse jamais le prix dans la foulée : tu confirmes que le premier était gonflé. Ramène-le à son propre barème.",
  },
  {
    q: "« Je n'ai pas le temps, je suis en chantier. »",
    reponse:
      "Justement, je ne vous prends pas de temps : le site est déjà fait. Je vous envoie le lien, vous le regardez ce soir, et je vous rappelle demain à 8 h avant que vous partiez.",
    hint: "Propose un horaire qui colle à sa journée, pas à la tienne. Tôt le matin ou en fin de journée.",
  },
  {
    q: "« Envoyez-moi un mail. »",
    reponse:
      "Je vous l'envoie tout de suite. Mais un lien dans une boîte mail, on ne l'ouvre jamais — alors on dit jeudi 9 h, je vous rappelle et on le regarde ensemble, cinq minutes.",
    hint: "Envoie vraiment le lien, et repars toujours avec une date précise. « Je vous recontacte » ne vaut rien.",
  },
  {
    q: "« J'ai déjà assez de travail. »",
    reponse:
      "Tant mieux, c'est le bon moment pour le faire. Un site ne sert pas qu'à avoir plus d'appels : il sert à avoir les bons — les chantiers que vous choisissez plutôt que ceux que vous acceptez. Et le jour où le carnet se vide, il est déjà en place.",
    hint: "Objection très fréquente chez les artisans. Ne la combats pas : déplace-la de la quantité vers la qualité.",
  },
  {
    q: "« Qui vous a donné mon numéro ? »",
    reponse:
      "Il est public, sur votre fiche Google. J'ai repéré votre entreprise en regardant les [métier] du secteur, et c'est comme ça que j'ai préparé votre site.",
    hint: "Réponds franchement et enchaîne. Une hésitation ici et l'appel est mort.",
  },
  {
    q: "« C'est mon neveu / ma femme qui s'en occupe. »",
    reponse:
      "Très bien, on peut l'avoir en ligne aussi. Regardez déjà le lien de votre côté, et si ça vous parle on cale vingt minutes à deux ou à trois.",
    hint: "Ne mets jamais la personne en cause : c'est un proche. Fais-en un allié du rendez-vous.",
  },
  {
    q: "« Je vais réfléchir. »",
    reponse:
      "Bien sûr. Sur quoi précisément — le prix, le design, ou le moment ?",
    hint: "Une seule question, puis tu te tais. « Je vais réfléchir » sans motif nommé ne se relance pas ; avec un motif, si.",
  },
];

const REGLES = [
  {
    title: "Aucune promesse de position Google",
    text: "Personne ne peut garantir une première place. On parle d'un site rapide, clair et bien construit — jamais de classement.",
  },
  {
    title: "Aucun chiffre de résultat inventé",
    text: "Pas de « +30 % de clients ». On n'a pas cette donnée, et elle se retourne contre nous au premier bilan.",
  },
  {
    title: "Pas de technique",
    text: "Le prospect se moque de l'outil, de l'hébergeur et du référencement technique. Parle en appels, en clients, en temps gagné.",
  },
  {
    title: "Ne dénigre pas son site frontalement",
    text: "Pars d'un fait mesuré, jamais d'un jugement. Il l'a souvent fait faire par un proche — l'attaquer, c'est l'attaquer lui.",
  },
  {
    title: "Ne promets pas un délai que tu ne tiens pas",
    text: "La mise en ligne dépend aussi de lui : ses photos, ses textes validés, ses chiffres corrigés. Dis-le au moment de caler le rendez-vous.",
  },
  {
    title: "Rien n'est publié sans son accord",
    text: "Ni le site, ni son nom, ni ses informations. C'est vrai, et ça se dit sans détour.",
  },
];

function SectionTitle({
  id,
  eyebrow,
  title,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div id={id} className="scroll-mt-6">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {eyebrow}
      </div>
      <h2 className="mt-1 text-xl font-semibold">{title}</h2>
      {children && <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{children}</p>}
    </div>
  );
}

/** Réplique à dire telle quelle. */
function Replique({ children }: { children: React.ReactNode }) {
  return (
    <blockquote className="rounded-lg border border-l-2 border-l-primary bg-muted/40 p-4 text-sm leading-6">
      {children}
    </blockquote>
  );
}

function OfferLine({ offer }: { offer: Offer }) {
  const meta = offer.metadata ?? {};
  const aPartirDe = meta.from === true;
  const prixMax = typeof meta.prix_max === "number" ? meta.prix_max : null;
  const hosting =
    typeof meta.hosting_price_monthly === "number" ? meta.hosting_price_monthly : null;
  const devise = offer.devise ?? "EUR";
  const suffix = offer.billing_period ? BILLING_SUFFIX[offer.billing_period] : "";

  return (
    <div className="rounded-lg border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="font-medium">{offer.nom}</div>
        <div className="flex items-baseline gap-1 whitespace-nowrap">
          {aPartirDe && <span className="text-xs text-muted-foreground">à partir de</span>}
          <span className="text-lg font-semibold">{formatPrice(offer.prix_ht, devise)}</span>
          {prixMax != null && (
            <span className="text-sm text-muted-foreground">
              – {formatPrice(prixMax, devise)}
            </span>
          )}
          {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
        </div>
      </div>
      {offer.description && (
        <p className="mt-1 text-sm text-muted-foreground">{offer.description}</p>
      )}
      {hosting != null && (
        <p className="mt-2 text-xs text-muted-foreground">
          + {formatPrice(hosting, devise)} / mois d&apos;hébergement et de maintenance, une fois le
          site en ligne.
        </p>
      )}
    </div>
  );
}

export default function AgentBriefPage() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    const load = async () => {
      // Même filtre que /espace-agent/offres : les deux écrans doivent montrer
      // exactement le même catalogue.
      const { data } = await supabase
        .from("offres")
        .select("id, nom, description, prix_ht, devise, billing_period, metadata")
        .eq("actif", true)
        .eq("visible_in_qualification", true)
        .gt("prix_ht", 0)
        .order("prix_ht", { ascending: true });
      if (data) setOffers(data as Offer[]);
      setLoading(false);
    };
    void load();
  }, []);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-10 p-6">
      <header className="space-y-3">
        <h1 className="text-2xl font-semibold">Brief commercial</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Ce que SAMA vend, pourquoi le site démo est notre meilleur argument, et ce qu&apos;il faut
          dire au téléphone. À lire une fois en entier, puis à rouvrir avant les blocs d&apos;appels.
        </p>
        <nav className="flex flex-wrap gap-2">
          {SOMMAIRE.map((s) => (
            <a
              key={s.href}
              href={s.href}
              className="rounded-full border px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
            >
              {s.label}
            </a>
          ))}
        </nav>
      </header>

      {/* ─── SAMA ─────────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <SectionTitle id="sama" eyebrow="Le contexte" title="Ce que fait SAMA" />
        <Card>
          <CardContent className="space-y-3 py-5 text-sm leading-6">
            <p>
              SAMA est une agence digitale française. On regroupe toute la présence en ligne
              d&apos;une entreprise au même endroit : <strong>site internet</strong>, publicité
              Google et Meta, <strong>fiche et avis Google</strong>, vidéo, campagnes SMS et
              e-mail — le tout piloté depuis un seul espace.
            </p>
            <p>
              Nos clients sont des <strong>artisans et des PME du bâtiment</strong> — chauffage,
              climatisation, pompe à chaleur, plomberie, solaire — et des commerces locaux. Des
              entreprises sérieuses sur leur métier, rarement outillées sur leur visibilité.
            </p>
            <p>
              Ils ont tous le même point commun :{" "}
              <strong>leur activité se joue sur le téléphone qui sonne</strong>. Personne ne leur
              achète une pompe à chaleur en ligne. Notre travail, c&apos;est de faire sonner ce
              téléphone.
            </p>
          </CardContent>
        </Card>
      </section>

      {/* ─── OFFRES ───────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <SectionTitle id="offres" eyebrow="Le produit" title="Ce qu'on vend">
          Le catalogue ci-dessous est celui de la page Offres — mêmes lignes, mêmes prix, toujours
          à jour.
        </SectionTitle>

        <Card className="border-l-2 border-l-primary">
          <CardContent className="py-5 text-sm leading-6">
            <p className="font-medium">On ne vend pas un site web. On vend des appels entrants.</p>
            <p className="mt-1 text-muted-foreground">
              Le site est simplement le chemin le plus court pour y arriver : c&apos;est là
              qu&apos;atterrit le client qui cherche « chauffagiste + sa ville » sur son téléphone à
              huit heures du matin, chaudière en panne. Tout le discours part de là — pas du design,
              pas de la technique.
            </p>
          </CardContent>
        </Card>

        {loading && <p className="text-sm text-muted-foreground">Chargement du catalogue…</p>}

        {!loading && offers.length > 0 && (
          <div className="space-y-3">
            {offers.map((o) => (
              <OfferLine key={o.id} offer={o} />
            ))}
          </div>
        )}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">La logique du catalogue</CardTitle>
            <CardDescription>Pourquoi ces offres-là, dans cet ordre-là.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-6">
            <p>
              <strong>Le site est la porte d&apos;entrée.</strong> C&apos;est ce qui se vend au
              premier appel, parce que c&apos;est la seule chose qu&apos;on peut montrer
              immédiatement.
            </p>
            <p>
              <strong>Le pack « clé en main » part du site démo déjà construit</strong> : on recadre
              les services, on réécrit les textes, on met ses photos. La direction artistique ne
              change pas — c&apos;est exactement ce qui permet ce prix et ce délai. Si le client veut
              sa propre identité, il bascule sur le sur-mesure.
            </p>
            <p>
              <strong>Le reste vient après.</strong> Référencement, Google Ads, Meta Ads, fiche
              Google, relance d&apos;avis, maintenance : le catalogue complet est sur la page
              Offres. Ne charge pas le premier appel avec ça — un artisan qui entend cinq lignes de
              facture raccroche.
            </p>
            <Button asChild variant="ghost" size="sm" className="px-0">
              <Link href="/espace-agent/offres">
                Voir le catalogue complet <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </section>

      {/* ─── LE SITE DÉMO ─────────────────────────────────────────────── */}
      <section className="space-y-4">
        <SectionTitle id="demo" eyebrow="L'argument central" title="Le site démo">
          Avant même de décrocher le téléphone, son site existe déjà. C&apos;est toute la
          différence entre notre appel et celui d&apos;un commercial ordinaire.
        </SectionTitle>

        <Card>
          <CardContent className="space-y-3 py-5 text-sm leading-6">
            <p>
              Ce n&apos;est ni une maquette, ni un PDF, ni une capture d&apos;écran :{" "}
              <strong>c&apos;est un vrai site, en ligne, avec ses vraies informations</strong> — son
              nom, son numéro, son adresse, ses services, ses avis Google, ses qualifications RGE,
              ses chiffres. Il ouvre le lien sur son téléphone pendant que tu es encore en ligne
              avec lui.
            </p>
            <p className="text-muted-foreground">
              Tu retrouves le lien à copier sur la fiche de l&apos;entreprise, dans{" "}
              <Link href="/espace-agent/entreprises" className="text-primary hover:underline">
                Relation › Entreprises
              </Link>
              .
            </p>
          </CardContent>
        </Card>

        <div className="grid gap-3 sm:grid-cols-2">
          {POURQUOI_DEMO.map((p, i) => (
            <Card key={p.title}>
              <CardContent className="flex gap-3 py-4">
                <Badge
                  variant="secondary"
                  className="mt-0.5 h-6 min-w-6 shrink-0 justify-center rounded-full px-2"
                >
                  {i + 1}
                </Badge>
                <div>
                  <p className="text-sm font-medium">{p.title}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{p.text}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" />
              Ce qu&apos;il y a dedans
            </CardTitle>
            <CardDescription>
              À connaître avant de le présenter : chaque point est un argument à sortir au bon
              moment, pas une liste à réciter.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {CE_QUIL_Y_A_DEDANS.map(({ icon: Icon, title, text }) => (
              <div key={title} className="flex gap-3">
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-primary"
                  style={{ background: "var(--accent-tint)" }}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-medium">{title}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{text}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card style={{ background: "var(--warn-tint)" }} className="border-transparent">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4" style={{ color: "var(--warn)" }} />
              Trois choses à savoir avant d&apos;en parler
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {A_SAVOIR.map((a) => (
              <div key={a.title}>
                <p className="text-sm font-medium">{a.title}</p>
                <p className="text-sm text-muted-foreground">{a.text}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      {/* ─── DÉFAUTS ──────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <SectionTitle id="defauts" eyebrow="La matière" title="Les défauts qu'on sait mesurer">
          La note d&apos;audit attachée à chaque opportunité liste les défauts relevés sur son site
          actuel, <strong>avec la mesure</strong>. Ne dis jamais « votre site est lent » : dis le
          chiffre. Voici les six défauts qu&apos;on documente et la réponse qu&apos;on y apporte.
        </SectionTitle>

        <div className="space-y-3">
          {AUDIT_ISSUE_CATALOG.map((issue) => (
            <Card key={issue.key}>
              <CardContent className="grid gap-4 py-4 sm:grid-cols-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: "var(--danger)" }}
                    />
                    <p className="text-sm font-medium">{issue.problem.title}</p>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{issue.problem.desc}</p>
                </div>
                <div className="sm:border-l sm:pl-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: "var(--ok)" }}
                    />
                    <p className="text-sm font-medium">{issue.solution.name}</p>
                    <Badge variant="outline" className="text-[10px]">
                      {issue.solution.tag}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{issue.solution.desc}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* ─── L'APPEL ──────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <SectionTitle id="appel" eyebrow="Au téléphone" title="L'appel de présentation du démo">
          Le but du premier appel n&apos;est pas de vendre : c&apos;est de faire ouvrir le lien.
          Tout le reste en découle.
        </SectionTitle>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Ouverture — appel à froid</CardTitle>
            <CardDescription>Vingt secondes, pas une de plus.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Replique>
              « Bonjour, [Prénom] de SAMA. Je vous appelle parce que{" "}
              <strong>j&apos;ai refait votre site</strong> — il est déjà en ligne, à une adresse
              privée, personne d&apos;autre ne l&apos;a. Je peux vous envoyer le lien tout de suite,
              vous regardez trente secondes ? »
            </Replique>
            <p className="text-xs text-muted-foreground">
              → Termine sur une question fermée. « Je peux vous envoyer le lien ? » appelle oui ou
              non, pas une réflexion. Et envoie-le pendant l&apos;appel, jamais après.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Ouverture — relance après WhatsApp ou e-mail</CardTitle>
            <CardDescription>Le lien est déjà parti : on vérifie qu&apos;il a été ouvert.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Replique>
              « Bonjour [Prénom], c&apos;est [Prénom] de SAMA — je vous ai envoyé hier le site
              qu&apos;on a préparé pour [Entreprise]. Vous avez eu deux minutes pour l&apos;ouvrir ? »
            </Replique>
            <p className="text-xs text-muted-foreground">
              → S&apos;il ne l&apos;a pas ouvert, ne rappelle pas plus tard : «{" "}
              <strong>Prenez trente secondes, je reste en ligne</strong>. » C&apos;est le moment le
              plus rentable de tout l&apos;appel.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquareQuote className="h-4 w-4 text-primary" />
              Le tour guidé — soixante secondes, dans cet ordre
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              [
                "Le haut de page",
                "« Vous voyez votre nom, votre numéro, votre ville. »",
                "Il se reconnaît. C'est le moment où il comprend que ce n'est pas un modèle générique.",
              ],
              [
                "Le bouton d'appel",
                "« Là, votre client appuie une fois et vous sonnez. Sur votre site actuel, il doit recopier le numéro. »",
                "L'argument le plus concret du site pour un artisan : un appel gagné, tout de suite.",
              ],
              [
                "Les avis",
                "« Ce sont vos vrais avis Google, [note]/5. Vous les avez déjà — ils ne servaient simplement à personne. »",
                "On ne lui vend rien de nouveau : on met en valeur ce qu'il a construit.",
              ],
              [
                "Les chiffres et les qualifications",
                "« [X] ans, [Y] chantiers, [RGE]. C'est ce qui fait la différence quand il vous compare à un concurrent. »",
                "Rappelle que les chiffres sont un point de départ à corriger avec lui.",
              ],
              [
                "La vitesse",
                "« Ouvrez votre site actuel à côté. Comptez. »",
                "Ne commente pas le résultat, laisse-le le dire. C'est plus fort venant de lui.",
              ],
            ].map(([titre, phrase, note], i) => (
              <div key={titre} className="flex gap-3">
                <Badge
                  variant="secondary"
                  className="mt-0.5 h-6 min-w-6 shrink-0 justify-center rounded-full px-2"
                >
                  {i + 1}
                </Badge>
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-medium">{titre}</p>
                  <p className="text-sm italic text-muted-foreground">{phrase}</p>
                  <p className="text-xs text-muted-foreground">→ {note}</p>
                </div>
              </div>
            ))}
            <p className="rounded-md border px-3 py-2 text-xs text-muted-foreground">
              Tu t&apos;arrêtes là. S&apos;il commente, tu te tais et tu écoutes : ce qu&apos;il
              remarque tout seul vaut mieux que tout ce que tu pourrais ajouter.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">La question de closing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Replique>« Le site vous plaît ? »</Replique>
            <p className="text-xs text-muted-foreground">
              → Attends vraiment la réponse. Ne la remplis pas.
            </p>
            <Replique>
              « Il reste à mettre vos photos et à corriger les chiffres avec vous : on le fait
              ensemble en vingt minutes. Vous préférez <strong>[jour] matin</strong> ou{" "}
              <strong>[jour] après-midi</strong> ? »
            </Replique>
            <p className="text-xs text-muted-foreground">
              → Deux créneaux précis, jamais « quand ça vous arrange ». Puis note-le tout de suite
              dans le CRM.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Ce qui fait vraiment la vente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {[
              [
                "La plupart des ventes se font au 2e ou 3e contact",
                "J+1, J+3, J+7. Un prospect qui n'a pas dit non n'a pas dit non — il n'a pas encore ouvert le lien.",
              ],
              [
                "Jamais de date vague",
                "« Je vous rappelle jeudi à 9 h » vaut dix « je vous recontacte ». Une date floue est un refus poli.",
              ],
              [
                "Tout passe dans le CRM",
                "Statut, note d'appel, coordonnées vérifiées. Une relance qui n'est pas notée n'aura pas lieu.",
              ],
            ].map(([titre, texte]) => (
              <div key={titre} className="rounded-md border p-3">
                <p className="font-medium">{titre}</p>
                <p className="text-sm text-muted-foreground">{texte}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      {/* ─── OBJECTIONS ───────────────────────────────────────────────── */}
      <section className="space-y-4">
        <SectionTitle id="objections" eyebrow="Au téléphone" title="Les objections">
          Une objection n&apos;est pas un refus : c&apos;est la première vraie information de
          l&apos;appel. Réponds court, puis repose une question.
        </SectionTitle>
        <Card>
          <CardContent className="py-2">
            <Accordion type="single" collapsible>
              {OBJECTIONS.map((o, i) => (
                <AccordionItem key={o.q} value={`obj-${i}`} className="last:border-b-0">
                  <AccordionTrigger className="text-left">{o.q}</AccordionTrigger>
                  <AccordionContent className="space-y-2">
                    <Replique>{o.reponse}</Replique>
                    <p className="text-xs text-muted-foreground">→ {o.hint}</p>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>
      </section>

      {/* ─── RÈGLES ───────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <SectionTitle id="regles" eyebrow="Le cadre" title="Ce qu'on ne promet jamais">
          Une promesse intenable décroche un rendez-vous et perd un client. Ce qui suit n&apos;est
          pas négociable.
        </SectionTitle>
        <Card>
          <CardContent className="space-y-3 py-5">
            {REGLES.map((r) => (
              <div key={r.title} className="flex gap-3">
                <ShieldCheck
                  className="mt-0.5 h-4 w-4 shrink-0"
                  style={{ color: "var(--danger)" }}
                />
                <div>
                  <p className="text-sm font-medium">{r.title}</p>
                  <p className="text-sm text-muted-foreground">{r.text}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
