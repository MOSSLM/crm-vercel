import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Collaboration freelance — SAMA",
  robots: { index: false, follow: false },
};

/**
 * Page non référencée, sans lien dans la navigation — à partager en direct
 * avec les freelances setters pour cadrer la collaboration.
 */
export default function CollaborationFreelancePage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <p className="text-xs uppercase tracking-widest text-muted-foreground">SAMA — Studio digital</p>

      <h1 className="mt-6 text-3xl font-light">Collaboration freelance — prise de rendez-vous</h1>

      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
        Cette page décrit le cadre de travail proposé aux freelances qui prennent des rendez-vous
        pour SAMA. Lisez-la entièrement avant de commencer : elle fait office de référence sur la
        rémunération, les règles de validation des rendez-vous et vos engagements.
      </p>

      <section className="mt-10 space-y-8 text-sm leading-relaxed text-muted-foreground">
        <div>
          <h2 className="text-foreground font-medium">Le contexte</h2>
          <p className="mt-2">
            SAMA est un studio digital qui vend des services web (sites, visibilité, outils) à des
            artisans du bâtiment : CVC, plomberie, solaire. Votre mission : décrocher des rendez-vous
            qualifiés avec ces artisans pour que SAMA leur présente ses offres.
          </p>
          <p className="mt-2">
            Contrairement aux plateformes classiques de prise de rendez-vous, vous n&apos;avez rien à
            constituer : la prospection est préparée en amont. Vous vous connectez au CRM, vous
            appelez, vous posez des rendez-vous.
          </p>
        </div>

        <div>
          <h2 className="text-foreground font-medium">Ce que SAMA fournit</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              Un accès personnel à l&apos;espace agent du CRM : base de prospects qualifiés
              (entreprises avec téléphone, contacts décisionnaires), pipeline et calendrier.
            </li>
            <li>Le catalogue des offres SAMA, avec les prix et les argumentaires.</li>
            <li>
              Des fiches prêtes à l&apos;emploi : pas de scraping, pas de fichier à acheter, pas de
              ciblage à faire. Il n&apos;y a qu&apos;à appeler.
            </li>
          </ul>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-foreground font-medium">Rémunération : 50 € par rendez-vous honoré</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <span className="text-foreground">50 € HT par rendez-vous honoré</span> — c&apos;est-à-dire
              un rendez-vous où le prospect se présente effectivement.
            </li>
            <li>
              Les plateformes équivalentes facturent environ 150 € le rendez-vous en mode avancé. Ici,
              SAMA fournit les prospects et tout l&apos;outillage : la différence vous revient en temps
              gagné, pas en travail en plus.
            </li>
            <li>
              Un <span className="text-foreground">no-show n&apos;est pas payé</span> : il doit être
              remplacé par un nouveau rendez-vous, sans facturation supplémentaire.
            </li>
            <li>
              La logique du modèle : chaque prospect fourni mérite d&apos;être travaillé à fond. La
              rémunération dépend du résultat, pas du volume d&apos;appels.
            </li>
          </ul>
        </div>

        <div>
          <h2 className="text-foreground font-medium">Ce qui fait un rendez-vous valide</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Pris avec un décisionnaire : gérant ou personne habilitée à engager l&apos;entreprise.</li>
            <li>
              Le prospect sait pourquoi il a rendez-vous : besoin ou intérêt confirmé pour les
              services SAMA, pas un créneau accepté pour raccrocher plus vite.
            </li>
            <li>Créneau confirmé avec le prospect et enregistré dans le calendrier du CRM.</li>
            <li>Honoré : le prospect est présent au créneau convenu.</li>
          </ul>
        </div>

        <div>
          <h2 className="text-foreground font-medium">Vos engagements</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <span className="text-foreground">Enregistrement des appels</span> de prise de
              rendez-vous, mis à disposition de SAMA pour le contrôle qualité et la validation.
            </li>
            <li>
              <span className="text-foreground">Rappel avant chaque rendez-vous</span> : confirmation
              par SMS ou e-mail au prospect avant l&apos;échéance, pour limiter les no-shows.
            </li>
            <li>
              <span className="text-foreground">Remplacement des no-shows</span> : tout rendez-vous
              non honoré est remplacé, sans facturation supplémentaire.
            </li>
            <li>
              CRM tenu à jour : statuts du pipeline, notes d&apos;appel, coordonnées vérifiées.
            </li>
          </ul>
        </div>

        <div>
          <h2 className="text-foreground font-medium">Facturation et paiement</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Statut indépendant requis : auto-entrepreneur ou société, avec SIRET.</li>
            <li>
              En fin de mois, vous envoyez une facture récapitulant les rendez-vous honorés du mois.
            </li>
            <li>
              SAMA valide la facture en croisant avec le calendrier et les enregistrements
              d&apos;appels, puis procède au règlement.
            </li>
          </ul>
        </div>

        <div>
          <h2 className="text-foreground font-medium">Déontologie</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Pas de promesses non tenables faites au prospect pour décrocher un créneau.</li>
            <li>Pas de pression abusive ni de relances déraisonnables.</li>
            <li>
              La base de prospects reste la propriété de SAMA : pas d&apos;export, pas de
              réutilisation, confidentialité des données.
            </li>
          </ul>
        </div>

        <div>
          <h2 className="text-foreground font-medium">Pour démarrer</h2>
          <p className="mt-2">
            Écrivez à{" "}
            <a href="mailto:contact@samadigitalstudio.fr" className="underline">
              contact@samadigitalstudio.fr
            </a>{" "}
            : un accès à l&apos;espace agent vous est créé, puis vous vous connectez et vous pouvez
            commencer à appeler.
          </p>
          <p className="mt-2">
            <Link href="/login" className="text-foreground underline">
              → Se connecter à l&apos;espace agent
            </Link>
          </p>
        </div>

        <p className="pt-6 text-xs italic">
          Conditions indicatives — elles peuvent être précisées ou ajustées dans le contrat de
          prestation conclu individuellement avec chaque freelance.
        </p>
      </section>
    </main>
  );
}
