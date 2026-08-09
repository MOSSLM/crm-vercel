import React from "react";
import type { Metadata } from "next";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { getAppUrl } from "@/lib/app-url";
import { marquerVu, resoudreRapport } from "@/lib/audit-site/rapport";
import { renderAuditMobile } from "@/utils/audit/htmlMobile";
import { AUDIT_MOBILE_CSS } from "@/utils/audit/mobileCss";

/**
 * Le rapport d'audit public : `rapport.{SITE_DOMAIN}/{token}`.
 *
 * Sert le rendu mobile porté du kit d'identité (`renderAuditMobile`), avec les
 * écrans de notes mesurées insérés dans la séquence. Le PDF A4 et cette page
 * lisent le MÊME `audits.content` — un audit retouché dans l'éditeur change des
 * deux côtés, sans synchronisation à écrire.
 *
 * `robots: noindex`. Ce n'est pas une précaution de façade : la page nomme une
 * entreprise et lui attribue une note. Elle doit être atteignable par qui a le
 * lien, et par personne d'autre. Le jeton n'est pas devinable, il est
 * révocable, et la page porte sa méthode de mesure en pied.
 *
 * Elle vit dans le groupe `(public)`, qui ne charge ni `globals.css` ni les
 * polices du CRM : le style est embarqué, comme pour les sites clients.
 */

interface RapportProps {
  params: Promise<{ token: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export const dynamic = "force-dynamic";

const POLICES =
  "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400&family=DM+Sans:wght@300;400;500&display=swap";

export async function generateMetadata({ params }: RapportProps): Promise<Metadata> {
  const { token } = await params;
  const noindex = { index: false, follow: false } as const;

  const res = await resoudreRapport(getServiceClient(), token).catch(() => null);
  if (!res?.ok) return { robots: noindex, title: "Rapport" };

  const { nomEntreprise, audit } = res.donnees;
  const note = audit?.note_globale;
  const titre = `${nomEntreprise} — analyse de votre site`;
  const description =
    note != null
      ? `Votre site obtient ${note}/100 sur notre analyse. Voici le détail, et ce qu'on peut y faire.`
      : `Analyse de votre présence en ligne, et ce qu'on peut y faire.`;

  return {
    robots: noindex,
    metadataBase: new URL(getAppUrl()),
    title: titre,
    description,
    openGraph: {
      type: "website",
      title: titre,
      description,
      images: [{ url: `${getAppUrl()}/api/og/rapport/${token}`, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: titre,
      description,
      images: [`${getAppUrl()}/api/og/rapport/${token}`],
    },
  };
}

export default async function RapportPublicPage({ params, searchParams }: RapportProps) {
  const { token } = await params;
  // Le lien qu'on ENVOIE est court : trois constats et un nombre. La version
  // complète se demande explicitement — c'est le document du rendez-vous, pas
  // celui du premier contact. Même jeton, même contenu, deux profondeurs.
  const variante = (await searchParams)?.complet !== undefined ? "complet" : "court";
  const sb = getServiceClient();
  const res = await resoudreRapport(sb, token);

  if (!res.ok) return <Indisponible raison={res.raison} />;

  // Best-effort et non attendu : le compteur de vues est un signal commercial,
  // pas une raison de retarder l'affichage.
  void marquerVu(sb, token);

  const d = res.donnees;
  const html = renderAuditMobile(d.content, {
    audit: d.audit,
    captureActuelle: d.captureActuelle,
    captureDemo: d.captureDemo,
    noteDemo: d.noteDemo,
    variante,
  });

  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link rel="stylesheet" href={POLICES} />
      <style dangerouslySetInnerHTML={{ __html: AUDIT_MOBILE_CSS }} />
      {/* Le rendu est produit serveur, à partir de données que nous contrôlons
          et qui passent toutes par `esc()` dans `htmlMobile.ts`. */}
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </>
  );
}

/**
 * Les trois façons dont un rapport peut ne pas s'ouvrir, distinguées — parce
 * qu'elles n'appellent pas la même réaction du prospect ni du commercial.
 */
function Indisponible({ raison }: { raison: "introuvable" | "revoque" | "indisponible" }) {
  const texte = {
    introuvable: {
      titre: "Ce rapport n'existe pas",
      corps: "Le lien est peut-être incomplet. Vérifiez qu'il a été copié en entier.",
    },
    revoque: {
      titre: "Ce rapport n'est plus accessible",
      corps: "Il a été retiré. Contactez votre interlocuteur pour en obtenir un nouveau.",
    },
    indisponible: {
      titre: "Rapport momentanément indisponible",
      corps: "Réessayez dans quelques minutes.",
    },
  }[raison];

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: AUDIT_MOBILE_CSS }} />
      <div className="doc">
        <div className="screen dark">
          <div className="m-sky" />
          <div className="m-in">
            <div className="m-body" style={{ justifyContent: "center", textAlign: "center" }}>
              <div className="m-title" style={{ fontSize: 30 }}>
                {texte.titre}
              </div>
              <div className="m-intro">{texte.corps}</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
