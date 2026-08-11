"use client";

/**
 * Ce que le client voit à la place du formulaire qu'on lui demandait de remplir.
 *
 * CE QUI A ÉTÉ RETIRÉ, ET POURQUOI. `SiteAdaptationCard` demandait à l'acheteur
 * de rédiger lui-même son brief d'adaptation — textes à changer, services à
 * mettre en avant, ton souhaité — puis de téléverser son logo et ses images. Un
 * artisan qui vient de payer 490 € n'a pas envie de faire ses devoirs : le champ
 * restait vide, la production attendait un brief qui n'arrivait jamais, et rien
 * dans le CRM ne nommait ce blocage. Tout cela se collecte maintenant pendant
 * l'appel de RDV, côté agent (`/espace-agent/brief/[siteId]`).
 *
 * CE QUI RESTE, ET POURQUOI SEULEMENT ÇA. Le dépôt de fichiers survit, mais
 * dépouillé de son obligation : ni titre impératif, ni bouton d'enregistrement,
 * et une phrase qui dit explicitement qu'on fait sans. C'est le seul apport que
 * le client seul peut fournir — les photos de ses propres chantiers sont sur son
 * téléphone, pas chez nous — et c'est un geste de dix secondes, pas une tâche.
 *
 * Le reste de la carte ne demande rien : elle informe. Un client qui a payé veut
 * savoir où en est son site, pas trouver une nouvelle case à remplir.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, ImagePlus, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { authedFetch } from "@/utils/authedFetch";

type Asset = { id: string; public_url: string; filename: string };

export type SuiviSiteRow = {
  id: string;
  build_stage?: string | null;
  is_published?: boolean | null;
};

/** Où en est la production, dit au client — pas en vocabulaire d'atelier. */
const ETAPES: Array<{ cle: string; titre: string; detail: string }> = [
  {
    cle: "a_faire",
    titre: "Votre site est dans la file",
    detail: "On a tout ce qu'il faut. La mise en route est imminente.",
  },
  {
    cle: "en_cours",
    titre: "Votre site est en cours d'adaptation",
    detail: "Vos textes, vos prestations et vos photos sont en train d'être intégrés.",
  },
  {
    cle: "a_verifier",
    titre: "Dernières vérifications",
    detail: "Le site est monté ; on repasse sur les détails avant de vous le montrer.",
  },
  { cle: "pret", titre: "Votre site est prêt", detail: "Il ne reste plus qu'à le mettre en ligne." },
];

export function SuiviSiteCard({ site }: { site: SuiviSiteRow | null }) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [envoi, setEnvoi] = useState(false);
  const champ = useRef<HTMLInputElement | null>(null);

  const siteId = site?.id ?? null;

  const charger = useCallback(async () => {
    if (!siteId) return;
    const res = await authedFetch(`/api/site-builder/assets?site=${siteId}`);
    if (res.ok) {
      const d = (await res.json()) as Asset[];
      setAssets(Array.isArray(d) ? d : []);
    }
  }, [siteId]);

  useEffect(() => {
    void charger();
  }, [charger]);

  const deposer = async (fichiers: FileList | null) => {
    if (!siteId || !fichiers || fichiers.length === 0) return;
    setEnvoi(true);
    let ok = 0;
    for (const f of Array.from(fichiers)) {
      const fd = new FormData();
      fd.append("file", f);
      const res = await authedFetch(`/api/site-builder/assets?site=${siteId}`, {
        method: "POST",
        body: fd,
      });
      if (res.ok) ok += 1;
    }
    await charger();
    setEnvoi(false);
    if (champ.current) champ.current.value = "";
    if (ok > 0) toast.success("Bien reçu, merci !");
    else toast.error("L'envoi a échoué — réessayez ou envoyez-les-nous par WhatsApp.");
  };

  if (!site) return null;

  const etape =
    ETAPES.find((e) => e.cle === (site.build_stage ?? "a_faire")) ?? ETAPES[0];
  const enLigne = !!site.is_published;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base">Où en est votre site</CardTitle>
        </div>
        <CardDescription>
          Vous n&apos;avez rien à remplir : tout ce dont on a besoin a été noté pendant votre appel.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <div>
            <div className="text-sm font-medium">
              {enLigne ? "Votre site est en ligne" : etape.titre}
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {enLigne
                ? "Il est publié et visible par vos clients. Une modification à demander ? Écrivez-nous, on s'en charge."
                : etape.detail}
            </p>
          </div>
        </div>

        {/* Le seul apport que le client seul peut fournir. Sans obligation. */}
        <div className="space-y-2">
          <div className="text-sm font-medium">
            Des photos de vos chantiers ?{" "}
            <span className="font-normal text-muted-foreground">Facultatif</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Si vous en avez sous la main, déposez-les ici — même prises au téléphone, elles valent
            mieux que des photos d&apos;illustration. Sinon on fait sans, ça marche aussi.
          </p>
          <input
            ref={champ}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => void deposer(e.target.files)}
          />
          <Button variant="outline" size="sm" onClick={() => champ.current?.click()} disabled={envoi}>
            {envoi ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Envoi…
              </>
            ) : (
              <>
                <ImagePlus className="mr-2 h-4 w-4" /> Ajouter des photos
              </>
            )}
          </Button>

          {assets.length > 0 && (
            <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6">
              {assets.map((a) => (
                <a
                  key={a.id}
                  href={a.public_url}
                  target="_blank"
                  rel="noreferrer"
                  title={a.filename}
                  className="aspect-square overflow-hidden rounded-md border bg-muted"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={a.public_url}
                    alt={a.filename}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </a>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
